/**
 * Figma adapter types — shapes from Figma REST API and MCP responses.
 */

// ---------------------------------------------------------------------------
// Figma component properties (from REST API / MCP)
// ---------------------------------------------------------------------------

export type FigmaPropertyType =
  | "BOOLEAN"
  | "TEXT"
  | "INSTANCE_SWAP"
  | "VARIANT";

export interface FigmaComponentProperty {
  type: FigmaPropertyType;
  defaultValue: string | boolean;
  /** For VARIANT type: allowed values */
  variantOptions?: string[];
  /** For INSTANCE_SWAP type: preferred values (component keys) */
  preferredValues?: Array<{ type: string; key: string }>;
}

export interface FigmaComponent {
  key: string;
  name: string;
  description: string;
  /** Node ID in the file */
  nodeId: string;
  /** Component set ID if this is a variant */
  componentSetId?: string;
  /** Component properties (for component sets) */
  componentPropertyDefinitions?: Record<string, FigmaComponentProperty>;
}

export interface FigmaComponentSet {
  key: string;
  name: string;
  description: string;
  nodeId: string;
  componentPropertyDefinitions: Record<string, FigmaComponentProperty>;
  /** Child variant component IDs */
  variantComponents: FigmaComponent[];
}

// ---------------------------------------------------------------------------
// Figma variables (for token sync)
// ---------------------------------------------------------------------------

export type FigmaVariableResolvedType =
  | "BOOLEAN"
  | "FLOAT"
  | "STRING"
  | "COLOR";

export interface FigmaVariable {
  id: string;
  name: string;
  key: string;
  resolvedType: FigmaVariableResolvedType;
  description: string;
  /** Values per mode */
  valuesByMode: Record<string, FigmaVariableValue>;
  /** Variable collection ID */
  variableCollectionId: string;
}

export type FigmaVariableValue =
  | { type: "BOOLEAN"; value: boolean }
  | { type: "FLOAT"; value: number }
  | { type: "STRING"; value: string }
  | { type: "COLOR"; value: FigmaColor }
  | { type: "VARIABLE_ALIAS"; id: string };

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaVariableCollection {
  id: string;
  name: string;
  key: string;
  modes: Array<{ modeId: string; name: string }>;
  variableIds: string[];
}

// ---------------------------------------------------------------------------
// Figma adapter config
// ---------------------------------------------------------------------------

export interface FigmaAdapterConfig {
  fileKey: string;
  accessToken?: string; // falls back to FIGMA_ACCESS_TOKEN env
}
