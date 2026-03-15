/**
 * Canonical component schema — the abstraction layer between Figma and code.
 *
 * Every type carries an optional `metadata` escape hatch for domain-specific
 * data that doesn't map cleanly to the shared model.
 */

// ---------------------------------------------------------------------------
// Prop types — constrained set that both Figma and React can represent
// ---------------------------------------------------------------------------

export type PropType =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "node" // ReactNode / Figma instance swap
  | "callback" // event handlers — code-only, ignored by Figma adapter
  | "object"; // complex objects — stored as metadata, not synced to Figma

export interface Prop {
  name: string;
  type: PropType;
  /** For enum props: the set of allowed values */
  values?: string[];
  required: boolean;
  defaultValue?: string | number | boolean;
  description?: string;
  /** Raw TypeScript type string for lossless round-trips */
  rawType?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Variant — a constrained prop that both Figma and code understand natively
// ---------------------------------------------------------------------------

export interface Variant {
  name: string;
  values: string[];
  defaultValue?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Slot — composition points (children, icons, etc.)
// ---------------------------------------------------------------------------

export interface Slot {
  name: string;
  description?: string;
  /** Component names allowed in this slot (empty = any) */
  allowedComponents?: string[];
  required: boolean;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// State — interactive states (hover, focus, disabled, loading, etc.)
// ---------------------------------------------------------------------------

export interface State {
  name: string;
  description?: string;
  /** Token overrides when this state is active */
  tokenOverrides?: TokenRef[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Token reference — links a component property to a design token
// ---------------------------------------------------------------------------

export interface TokenRef {
  /** Dot-separated W3C token path, e.g. "color.primary.500" */
  path: string;
  /** CSS / Figma property this token maps to, e.g. "background-color" */
  property: string;
  /** Conditional application, e.g. "state:hover", "variant:size=lg" */
  condition?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Component schema — the core abstraction
// ---------------------------------------------------------------------------

export interface ComponentSchema {
  name: string;
  description?: string;
  /** Grouping category, e.g. "inputs", "layout", "feedback" */
  category?: string;
  props: Prop[];
  variants: Variant[];
  slots: Slot[];
  states: State[];
  tokenRefs: TokenRef[];
  /** File path in codebase (relative to project root) */
  codePath?: string;
  /** Figma node ID */
  figmaNodeId?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Schema file — the top-level container persisted to disk
// ---------------------------------------------------------------------------

export type SchemaSource = "figma" | "code" | "manual" | "merge";

export interface ComponentSchemaFile {
  version: "1.0";
  components: ComponentSchema[];
  lastModified: string; // ISO 8601
  source: SchemaSource;
}
