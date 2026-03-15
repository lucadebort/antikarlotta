/**
 * Token bridge — bidirectional mapping between W3C Design Tokens and Figma Variables.
 */

import type {
  DesignTokenFile,
  TokenGroup,
  Token,
  TokenType,
  ColorValue,
  DimensionValue,
  ResolvedToken,
} from "../schema/tokens.js";
import { flattenTokens, isReservedKey } from "../schema/tokens.js";
import type {
  FigmaVariable,
  FigmaVariableCollection,
  FigmaColor,
  FigmaVariableValue,
} from "./types.js";

// ---------------------------------------------------------------------------
// W3C → Figma
// ---------------------------------------------------------------------------

export interface FigmaVariableInput {
  name: string;
  resolvedType: "BOOLEAN" | "FLOAT" | "STRING" | "COLOR";
  value: boolean | number | string | FigmaColor;
  description?: string;
  collectionName: string;
}

/**
 * Convert a W3C Design Token file to Figma variable inputs.
 * Only token types that map to Figma variable types are included.
 */
export function tokensToFigmaVariables(tokenFile: DesignTokenFile): FigmaVariableInput[] {
  const resolved = flattenTokens(tokenFile);
  const variables: FigmaVariableInput[] = [];

  for (const token of resolved) {
    const figmaVar = resolvedTokenToFigmaVariable(token);
    if (figmaVar) {
      variables.push(figmaVar);
    }
  }

  return variables;
}

function resolvedTokenToFigmaVariable(token: ResolvedToken): FigmaVariableInput | null {
  // Use the first path segment as collection name
  const pathParts = token.path.split(".");
  const collectionName = pathParts[0];
  // Use the full path as the variable name (Figma uses / as separator)
  const name = pathParts.join("/");

  switch (token.type) {
    case "color": {
      const color = token.value as ColorValue;
      if (!color.components || color.components.length < 3) return null;
      return {
        name,
        resolvedType: "COLOR",
        value: {
          r: color.components[0],
          g: color.components[1],
          b: color.components[2],
          a: color.components[3] ?? 1,
        },
        description: token.description,
        collectionName,
      };
    }

    case "dimension": {
      const dim = token.value as DimensionValue;
      return {
        name,
        resolvedType: "FLOAT",
        value: dim.value,
        description: token.description,
        collectionName,
      };
    }

    case "number": {
      return {
        name,
        resolvedType: "FLOAT",
        value: token.value as number,
        description: token.description,
        collectionName,
      };
    }

    case "fontFamily": {
      const family = Array.isArray(token.value)
        ? (token.value as string[]).join(", ")
        : token.value as string;
      return {
        name,
        resolvedType: "STRING",
        value: family,
        description: token.description,
        collectionName,
      };
    }

    case "fontWeight": {
      const weight = typeof token.value === "number"
        ? token.value
        : fontWeightToNumber(token.value as string);
      return {
        name,
        resolvedType: "FLOAT",
        value: weight,
        description: token.description,
        collectionName,
      };
    }

    case "duration": {
      // Store as milliseconds
      const dur = token.value as { value: number; unit: string };
      const ms = dur.unit === "s" ? dur.value * 1000 : dur.value;
      return {
        name,
        resolvedType: "FLOAT",
        value: ms,
        description: token.description,
        collectionName,
      };
    }

    // Composite types (shadow, border, typography, gradient) don't map 1:1 to Figma variables
    // They're stored in $extensions for round-trip preservation
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Figma → W3C
// ---------------------------------------------------------------------------

/**
 * Convert Figma variables back to a W3C Design Token file.
 */
export function figmaVariablesToTokens(
  variables: FigmaVariable[],
  collections: FigmaVariableCollection[],
): DesignTokenFile {
  const tokenFile: DesignTokenFile = {};

  for (const variable of variables) {
    const collection = collections.find((c) => c.id === variable.variableCollectionId);
    const defaultModeId = collection?.modes[0]?.modeId;
    if (!defaultModeId) continue;

    const value = variable.valuesByMode[defaultModeId];
    if (!value) continue;

    // Convert Figma path separators (/) to nested token groups
    const pathParts = variable.name.split("/");
    const tokenName = pathParts.pop()!;

    // Navigate/create nested groups
    let current: TokenGroup = tokenFile;
    for (const part of pathParts) {
      if (!current[part] || typeof current[part] !== "object" || "$value" in (current[part] as object)) {
        current[part] = {} as TokenGroup;
      }
      current = current[part] as TokenGroup;
    }

    // Create token
    const token = figmaValueToToken(value, variable);
    if (token) {
      current[tokenName] = token;
    }
  }

  return tokenFile;
}

function figmaValueToToken(
  value: FigmaVariableValue,
  variable: FigmaVariable,
): Token | null {
  switch (value.type) {
    case "COLOR": {
      const color = value.value as FigmaColor;
      return {
        $value: {
          colorSpace: "srgb",
          components: [color.r, color.g, color.b, color.a],
        },
        $type: "color",
        ...(variable.description && { $description: variable.description }),
      };
    }

    case "FLOAT": {
      // Determine if this is a dimension or plain number based on name heuristics
      const name = variable.name.toLowerCase();
      const isDimension = name.includes("size") || name.includes("spacing") ||
        name.includes("radius") || name.includes("width") || name.includes("height") ||
        name.includes("padding") || name.includes("margin") || name.includes("gap");

      if (isDimension) {
        return {
          $value: { value: value.value, unit: "px" as const },
          $type: "dimension",
          ...(variable.description && { $description: variable.description }),
        };
      }

      return {
        $value: value.value,
        $type: "number",
        ...(variable.description && { $description: variable.description }),
      };
    }

    case "STRING": {
      return {
        $value: value.value,
        $type: "fontFamily",
        ...(variable.description && { $description: variable.description }),
      };
    }

    case "BOOLEAN": {
      // Booleans don't have a direct W3C token type — store as number (0/1)
      return {
        $value: value.value ? 1 : 0,
        $type: "number",
        ...(variable.description && { $description: variable.description }),
      };
    }

    case "VARIABLE_ALIAS": {
      // Store as alias reference — will need resolution
      return {
        $value: `{${value.id}}`,
        ...(variable.description && { $description: variable.description }),
      };
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fontWeightToNumber(weight: string): number {
  const map: Record<string, number> = {
    thin: 100, hairline: 100,
    "extra-light": 200, "ultra-light": 200,
    light: 300,
    normal: 400, regular: 400,
    medium: 500,
    "semi-bold": 600, "demi-bold": 600,
    bold: 700,
    "extra-bold": 800, "ultra-bold": 800,
    black: 900, heavy: 900,
    "extra-black": 950, "ultra-black": 950,
  };
  return map[weight.toLowerCase()] ?? 400;
}
