/**
 * Diff engine types — change detection, classification, and merge.
 */

// ---------------------------------------------------------------------------
// Change types
// ---------------------------------------------------------------------------

export type ChangeType = "added" | "removed" | "modified";

export type ChangeTarget =
  | "component"
  | "prop"
  | "variant"
  | "slot"
  | "state"
  | "tokenRef"
  | "metadata";

export type ChangeSeverity =
  | "additive"   // safe to auto-sync (new optional prop, new variant value)
  | "breaking"   // needs review (removed prop, type change, required change)
  | "conflict";  // both sides changed the same field

export interface SchemaChange {
  /** Component this change belongs to */
  componentName: string;
  /** What kind of thing changed */
  target: ChangeTarget;
  /** What happened */
  changeType: ChangeType;
  /** Specific field path within the component, e.g. "props.size" or "variants.size.values" */
  fieldPath: string;
  /** Value before the change (undefined for additions) */
  before?: unknown;
  /** Value after the change (undefined for removals) */
  after?: unknown;
  /** Severity classification */
  severity: ChangeSeverity;
  /** Human-readable description */
  description: string;
}

// ---------------------------------------------------------------------------
// Diff result
// ---------------------------------------------------------------------------

export interface SchemaDiff {
  /** Where the changes came from */
  source: "figma" | "code";
  /** When the diff was computed */
  timestamp: string; // ISO 8601
  /** All detected changes */
  changes: SchemaChange[];
}

// ---------------------------------------------------------------------------
// Conflict
// ---------------------------------------------------------------------------

export interface Conflict {
  /** Component this conflict belongs to */
  componentName: string;
  /** Field that both sides changed */
  fieldPath: string;
  /** The base value (before either side changed it) */
  base: unknown;
  /** What Figma changed it to */
  figma: unknown;
  /** What code changed it to */
  code: unknown;
}

// ---------------------------------------------------------------------------
// Merge result
// ---------------------------------------------------------------------------

export interface MergeResult {
  /** Successfully merged changes (no conflicts) */
  merged: SchemaChange[];
  /** Unresolved conflicts requiring human input */
  conflicts: Conflict[];
}
