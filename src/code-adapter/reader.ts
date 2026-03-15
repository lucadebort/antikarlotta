/**
 * Code reader — extract component schemas from React/TypeScript source files.
 *
 * Uses ts-morph to parse AST and extract props, variants, slots, and states.
 */

import { Project, SyntaxKind, type SourceFile, type Type, type Symbol as TsSymbol } from "ts-morph";
import type { ComponentSchema, Prop, Variant, Slot, State, PropType } from "../schema/types.js";
import type { ExtractedComponent, ExtractedProp } from "./types.js";

// ---------------------------------------------------------------------------
// Project setup
// ---------------------------------------------------------------------------

export function createProject(tsConfigPath?: string): Project {
  if (tsConfigPath) {
    return new Project({ tsConfigFilePath: tsConfigPath });
  }
  return new Project({
    compilerOptions: {
      jsx: 4, // JsxEmit.ReactJSX
      esModuleInterop: true,
      strict: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Component detection
// ---------------------------------------------------------------------------

const REACT_NODE_TYPES = new Set([
  "ReactNode",
  "React.ReactNode",
  "ReactElement",
  "React.ReactElement",
  "JSX.Element",
]);

const CALLBACK_PATTERNS = [
  /^\(.*\)\s*=>\s*/,
  /^Function$/,
  /^EventHandler/,
  /^MouseEventHandler/,
  /^ChangeEventHandler/,
  /^FormEventHandler/,
  /^KeyboardEventHandler/,
];

const STATE_PROP_NAMES = new Set([
  "disabled",
  "loading",
  "error",
  "active",
  "selected",
  "checked",
  "focused",
  "open",
  "expanded",
  "pressed",
  "readOnly",
]);

function isReactNodeType(typeText: string): boolean {
  const trimmed = typeText.trim();
  if (REACT_NODE_TYPES.has(trimmed)) return true;
  // Handle unions containing ReactNode
  if (trimmed.includes("ReactNode") || trimmed.includes("ReactElement")) return true;
  return false;
}

function isCallbackType(typeText: string): boolean {
  return CALLBACK_PATTERNS.some((p) => p.test(typeText));
}

/**
 * Extract string literal values from a union type.
 * e.g., "sm" | "md" | "lg" → ["sm", "md", "lg"]
 */
function extractUnionLiterals(type: Type): string[] | undefined {
  if (!type.isUnion()) return undefined;

  const literals: string[] = [];
  for (const unionType of type.getUnionTypes()) {
    if (unionType.isStringLiteral()) {
      literals.push(unionType.getLiteralValueOrThrow() as string);
    }
  }

  // Only return if ALL non-undefined union members are string literals
  const nonUndefined = type.getUnionTypes().filter((t) => !t.isUndefined());
  if (literals.length > 0 && literals.length === nonUndefined.length) {
    return literals;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Prop extraction from type/interface
// ---------------------------------------------------------------------------

function extractPropsFromSymbols(symbols: TsSymbol[]): ExtractedProp[] {
  const props: ExtractedProp[] = [];

  for (const symbol of symbols) {
    const name = symbol.getName();
    const declarations = symbol.getDeclarations();
    if (declarations.length === 0) continue;

    const decl = declarations[0];
    const type = decl.getType();
    let typeText = type.getText(decl);

    // When types can't be resolved (e.g. missing @types/react in in-memory FS),
    // fall back to the source-level type annotation text
    if (typeText === "any") {
      const typeNode = decl.getChildrenOfKind(SyntaxKind.TypeReference)[0]
        ?? decl.getChildrenOfKind(SyntaxKind.TypeKeyword)[0];
      if (typeNode) {
        typeText = typeNode.getText();
      }
    }

    // Check for JSDoc
    const jsDocs = decl.getChildrenOfKind(SyntaxKind.JSDoc);
    const description = jsDocs.length > 0
      ? jsDocs[0].getDescription()?.trim()
      : undefined;

    // Check optionality
    const optional = symbol.isOptional();

    // Check for union literals (variant candidates)
    const unionValues = extractUnionLiterals(type);

    props.push({
      name,
      rawType: typeText,
      optional,
      description,
      unionValues,
      isReactNode: isReactNodeType(typeText),
      isCallback: isCallbackType(typeText),
    });
  }

  return props;
}

// ---------------------------------------------------------------------------
// Component extraction from source file
// ---------------------------------------------------------------------------

function extractComponentsFromFile(sourceFile: SourceFile, projectRoot: string): ExtractedComponent[] {
  const components: ExtractedComponent[] = [];
  const filePath = sourceFile.getFilePath().replace(projectRoot + "/", "");

  // Find exported function declarations that return JSX
  for (const func of sourceFile.getFunctions()) {
    if (!func.isExported()) continue;
    const name = func.getName();
    if (!name || !isComponentName(name)) continue;

    const propsParam = func.getParameters()[0];
    if (!propsParam) {
      components.push({
        name,
        filePath,
        props: [],
        isForwardRef: false,
        isMemo: false,
        description: getLeadingComment(func),
      });
      continue;
    }

    const propsType = propsParam.getType();
    const propsTypeName = propsParam.getTypeNode()?.getText();
    const symbols = propsType.getProperties();
    const props = extractPropsFromSymbols(symbols);

    // Extract default values from destructuring
    const bindingPattern = propsParam.getFirstChildByKind(SyntaxKind.ObjectBindingPattern);
    if (bindingPattern) {
      for (const element of bindingPattern.getElements()) {
        const propName = element.getName();
        const initializer = element.getInitializer();
        if (initializer) {
          const prop = props.find((p) => p.name === propName);
          if (prop) {
            prop.defaultValue = initializer.getText();
          }
        }
      }
    }

    components.push({
      name,
      filePath,
      propsTypeName,
      props,
      isForwardRef: false,
      isMemo: false,
      description: getLeadingComment(func),
    });
  }

  // Find exported arrow function components (const X = (...) => ...)
  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const varStatement = varDecl.getVariableStatement();
    if (!varStatement?.isExported()) continue;

    const name = varDecl.getName();
    if (!isComponentName(name)) continue;

    const initializer = varDecl.getInitializer();
    if (!initializer) continue;

    const initText = initializer.getText();
    const isForwardRef = initText.includes("forwardRef");
    const isMemo = initText.includes("memo(");

    // Try to find the props type from the arrow function or forwardRef
    const type = varDecl.getType();
    const callSignatures = type.getCallSignatures();

    if (callSignatures.length > 0) {
      const params = callSignatures[0].getParameters();
      if (params.length > 0) {
        const propsType = params[0].getValueDeclaration()?.getType() ?? params[0].getDeclaredType();
        const propsTypeName = propsType.getSymbol()?.getName();
        const symbols = propsType.getProperties();
        const props = extractPropsFromSymbols(symbols);

        components.push({
          name,
          filePath,
          propsTypeName: propsTypeName !== "__type" ? propsTypeName : undefined,
          props,
          isForwardRef,
          isMemo,
          description: getLeadingComment(varStatement),
        });
        continue;
      }
    }

    // Fallback: component with no props
    components.push({
      name,
      filePath,
      props: [],
      isForwardRef,
      isMemo,
      description: getLeadingComment(varStatement),
    });
  }

  return components;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function getLeadingComment(node: { getLeadingCommentRanges(): Array<{ getText(): string }> }): string | undefined {
  const comments = node.getLeadingCommentRanges();
  if (comments.length === 0) return undefined;

  const text = comments[comments.length - 1].getText();
  // Strip comment delimiters
  return text
    .replace(/^\/\*\*?\s*/, "")
    .replace(/\s*\*\/$/, "")
    .replace(/^\s*\*\s?/gm, "")
    .trim() || undefined;
}

// ---------------------------------------------------------------------------
// Schema conversion
// ---------------------------------------------------------------------------

function extractedToSchema(extracted: ExtractedComponent): ComponentSchema {
  const props: Prop[] = [];
  const variants: Variant[] = [];
  const slots: Slot[] = [];
  const states: State[] = [];

  for (const ep of extracted.props) {
    // Skip internal React props
    if (ep.name === "ref" || ep.name === "key" || ep.name === "children" && ep.isReactNode) {
      if (ep.name === "children") {
        slots.push({
          name: "children",
          required: !ep.optional,
          description: ep.description,
        });
      }
      continue;
    }

    // Slots: ReactNode props
    if (ep.isReactNode) {
      slots.push({
        name: ep.name,
        required: !ep.optional,
        description: ep.description,
      });
      continue;
    }

    // Callbacks: skip for Figma sync (code-only)
    if (ep.isCallback) {
      props.push({
        name: ep.name,
        type: "callback",
        required: !ep.optional,
        description: ep.description,
        rawType: ep.rawType,
      });
      continue;
    }

    // States: boolean props with known state names
    if (STATE_PROP_NAMES.has(ep.name) && (ep.rawType === "boolean" || ep.rawType === "boolean | undefined")) {
      states.push({
        name: ep.name,
        description: ep.description,
      });
      continue;
    }

    // Variants: string literal union props
    if (ep.unionValues && ep.unionValues.length > 1) {
      variants.push({
        name: ep.name,
        values: ep.unionValues,
        defaultValue: ep.defaultValue?.replace(/['"]/g, ""),
        description: ep.description,
      });
      continue;
    }

    // Regular props
    const type = mapPropType(ep.rawType);
    const prop: Prop = {
      name: ep.name,
      type,
      required: !ep.optional,
      description: ep.description,
      rawType: ep.rawType,
    };

    if (ep.defaultValue !== undefined) {
      prop.defaultValue = parseDefaultValue(ep.defaultValue, type);
    }

    if (type === "enum" && ep.unionValues) {
      prop.values = ep.unionValues;
    }

    props.push(prop);
  }

  return {
    name: extracted.name,
    description: extracted.description,
    props,
    variants,
    slots,
    states,
    tokenRefs: [],
    codePath: extracted.filePath,
    metadata: {
      ...(extracted.isForwardRef && { forwardRef: true }),
      ...(extracted.isMemo && { memo: true }),
      ...(extracted.propsTypeName && { propsTypeName: extracted.propsTypeName }),
    },
  };
}

function mapPropType(rawType: string): PropType {
  const t = rawType.replace(/\s*\|\s*undefined$/, "").trim();
  if (t === "string") return "string";
  if (t === "number") return "number";
  if (t === "boolean") return "boolean";
  if (t.includes("|") && !t.includes("=>")) return "enum";
  if (t.includes("=>") || t === "Function") return "callback";
  return "object";
}

function parseDefaultValue(raw: string, type: PropType): string | number | boolean | undefined {
  if (type === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
  }
  if (type === "number") {
    const n = Number(raw);
    if (!isNaN(n)) return n;
  }
  if (type === "string") {
    return raw.replace(/^['"]|['"]$/g, "");
  }
  return raw.replace(/^['"]|['"]$/g, "");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read React components from source files and convert to schema.
 *
 * @param projectRoot - Absolute path to project root
 * @param globs - Glob patterns to find component files, e.g. ["src/components/**\/*.tsx"]
 * @param tsConfigPath - Optional path to tsconfig.json
 */
export function readCodeComponents(
  projectRoot: string,
  globs: string[],
  tsConfigPath?: string,
): ComponentSchema[] {
  const project = createProject(tsConfigPath);

  for (const glob of globs) {
    project.addSourceFilesAtPaths(`${projectRoot}/${glob}`);
  }

  const schemas: ComponentSchema[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const extracted = extractComponentsFromFile(sourceFile, projectRoot);
    for (const component of extracted) {
      schemas.push(extractedToSchema(component));
    }
  }

  return schemas;
}

/**
 * Read components from source text (for testing without filesystem).
 */
export function readComponentsFromSource(
  source: string,
  fileName: string = "Component.tsx",
): ComponentSchema[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      jsx: 4,
      esModuleInterop: true,
      strict: true,
    },
  });

  project.createSourceFile(fileName, source);

  const schemas: ComponentSchema[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    const extracted = extractComponentsFromFile(sourceFile, "");
    for (const component of extracted) {
      schemas.push(extractedToSchema(component));
    }
  }

  return schemas;
}
