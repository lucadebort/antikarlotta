/**
 * W3C Design Tokens Community Group format (2025.10 spec).
 *
 * Files: .tokens.json
 * MIME: application/design-tokens+json
 *
 * @see https://www.designtokens.org/tr/2025.10/format/
 */

// ---------------------------------------------------------------------------
// Token value types
// ---------------------------------------------------------------------------

export interface ColorValue {
  colorSpace: string;
  components: number[];
}

export interface DimensionValue {
  value: number;
  unit: "px" | "rem";
}

export interface DurationValue {
  value: number;
  unit: "ms" | "s";
}

export type FontFamilyValue = string | string[];

/** 1–1000 or named weight */
export type FontWeightValue =
  | number
  | "thin"
  | "hairline"
  | "extra-light"
  | "ultra-light"
  | "light"
  | "normal"
  | "regular"
  | "medium"
  | "semi-bold"
  | "demi-bold"
  | "bold"
  | "extra-bold"
  | "ultra-bold"
  | "black"
  | "heavy"
  | "extra-black"
  | "ultra-black";

export type CubicBezierValue = [number, number, number, number];

export type NumberValue = number;

// ---------------------------------------------------------------------------
// Composite token values
// ---------------------------------------------------------------------------

export interface ShadowValue {
  color: ColorValue | string;
  offsetX: DimensionValue | string;
  offsetY: DimensionValue | string;
  blur: DimensionValue | string;
  spread: DimensionValue | string;
}

export interface BorderValue {
  color: ColorValue | string;
  width: DimensionValue | string;
  style: "solid" | "dashed" | "dotted" | "double" | "groove" | "ridge" | "outset" | "inset";
}

export interface TypographyValue {
  fontFamily: FontFamilyValue | string;
  fontSize: DimensionValue | string;
  fontWeight: FontWeightValue | string;
  letterSpacing: DimensionValue | string;
  lineHeight: DimensionValue | number | string;
}

export interface GradientStop {
  color: ColorValue | string;
  position: number;
}

export type GradientValue = GradientStop[];

// ---------------------------------------------------------------------------
// Token type identifiers
// ---------------------------------------------------------------------------

export type TokenType =
  | "color"
  | "dimension"
  | "fontFamily"
  | "fontWeight"
  | "duration"
  | "cubicBezier"
  | "number"
  | "shadow"
  | "border"
  | "typography"
  | "gradient";

// ---------------------------------------------------------------------------
// Token value union — all possible $value shapes
// ---------------------------------------------------------------------------

export type TokenValue =
  | ColorValue
  | DimensionValue
  | DurationValue
  | FontFamilyValue
  | FontWeightValue
  | CubicBezierValue
  | NumberValue
  | ShadowValue
  | BorderValue
  | TypographyValue
  | GradientValue
  | string; // alias reference: "{path.to.token}"

// ---------------------------------------------------------------------------
// Token and group definitions
// ---------------------------------------------------------------------------

export interface Token {
  $value: TokenValue;
  $type?: TokenType;
  $description?: string;
  $deprecated?: boolean | string;
  $extensions?: Record<string, unknown>;
}

export interface TokenGroup {
  $type?: TokenType;
  $description?: string;
  $deprecated?: boolean | string;
  $extensions?: Record<string, unknown>;
  $extends?: string;
  [key: string]: Token | TokenGroup | TokenType | string | boolean | Record<string, unknown> | undefined;
}

/** Top-level .tokens.json file — a TokenGroup at root level */
export type DesignTokenFile = TokenGroup;

// ---------------------------------------------------------------------------
// Parsed / resolved token (after alias resolution)
// ---------------------------------------------------------------------------

export interface ResolvedToken {
  path: string; // dot-separated: "color.primary.500"
  value: TokenValue;
  type: TokenType;
  description?: string;
  deprecated?: boolean | string;
  extensions?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const RESERVED_PREFIXES = ["$"];
const FORBIDDEN_CHARS = ["{", "}", "."];

/** Check if a key is a reserved property (starts with $) */
export function isReservedKey(key: string): boolean {
  return RESERVED_PREFIXES.some((p) => key.startsWith(p));
}

/** Check if a key is a valid token/group name */
export function isValidTokenName(name: string): boolean {
  if (name.startsWith("$")) return false;
  return !FORBIDDEN_CHARS.some((c) => name.includes(c));
}

/** Check if a value is an alias reference */
export function isAliasValue(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("{") && value.endsWith("}");
}

/** Extract the token path from an alias reference */
export function parseAliasPath(alias: string): string {
  return alias.slice(1, -1);
}

/** Check if a JSON object is a Token (has $value) vs a TokenGroup */
export function isToken(obj: unknown): obj is Token {
  return typeof obj === "object" && obj !== null && "$value" in obj;
}

/**
 * Flatten a DesignTokenFile into resolved tokens.
 * Resolves aliases and type inheritance.
 */
export function flattenTokens(file: DesignTokenFile): ResolvedToken[] {
  const tokens: ResolvedToken[] = [];
  const rawTokens = new Map<string, Token>();

  // First pass: collect all tokens with their paths
  function collect(group: TokenGroup, path: string[], inheritedType?: TokenType): void {
    const groupType = group.$type ?? inheritedType;

    for (const [key, val] of Object.entries(group)) {
      if (isReservedKey(key)) continue;
      if (val === undefined || val === null) continue;

      if (typeof val === "object" && !Array.isArray(val)) {
        const obj = val as Record<string, unknown>;
        if ("$value" in obj) {
          // It's a token
          const token = obj as unknown as Token;
          const tokenPath = [...path, key].join(".");
          rawTokens.set(tokenPath, { ...token, $type: token.$type ?? groupType });
        } else {
          // It's a group
          collect(obj as TokenGroup, [...path, key], groupType);
        }
      }
    }
  }

  collect(file, []);

  // Second pass: resolve aliases
  function resolve(tokenPath: string, seen: Set<string>): ResolvedToken {
    if (seen.has(tokenPath)) {
      throw new Error(`Circular token reference detected: ${[...seen, tokenPath].join(" -> ")}`);
    }

    const token = rawTokens.get(tokenPath);
    if (!token) {
      throw new Error(`Token not found: ${tokenPath}`);
    }

    if (isAliasValue(token.$value)) {
      const aliasPath = parseAliasPath(token.$value);
      seen.add(tokenPath);
      const resolved = resolve(aliasPath, seen);
      return {
        ...resolved,
        path: tokenPath,
        type: token.$type ?? resolved.type,
        description: token.$description ?? resolved.description,
        deprecated: token.$deprecated ?? resolved.deprecated,
        extensions: token.$extensions ?? resolved.extensions,
      };
    }

    if (!token.$type) {
      throw new Error(`Token "${tokenPath}" has no type (neither explicit nor inherited)`);
    }

    return {
      path: tokenPath,
      value: token.$value,
      type: token.$type,
      description: token.$description,
      deprecated: token.$deprecated,
      extensions: token.$extensions,
    };
  }

  for (const tokenPath of rawTokens.keys()) {
    tokens.push(resolve(tokenPath, new Set()));
  }

  return tokens;
}
