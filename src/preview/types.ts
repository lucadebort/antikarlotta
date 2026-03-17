/**
 * Preview types — data contract between assembler and template renderer.
 */

import type { ComponentSchema } from "../schema/types.js";

// ---------------------------------------------------------------------------
// Token data shape (matches GITMA_TOKEN_DATA in preview HTML)
// ---------------------------------------------------------------------------

export interface PreviewTokenValue {
  type: "COLOR" | "FLOAT";
  hex?: string;
  value?: number;
  ref?: string;
}

export interface PreviewTokenEntry {
  name: string;
  fullName: string;
  resolvedType: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
  description?: string;
  /** Values keyed by mode name, e.g. { Light: {...}, Dark: {...} } */
  values: Record<string, PreviewTokenValue>;
}

export interface PreviewTokenCollection {
  modes: Array<{ id: string; name: string }>;
  categories: Record<string, PreviewTokenEntry[]>;
}

/** Top-level token data: collection name → collection */
export type PreviewTokenData = Record<string, PreviewTokenCollection>;

// ---------------------------------------------------------------------------
// Figma inspect result
// ---------------------------------------------------------------------------

export interface FigmaInspectResult {
  hasComponents: boolean;
  hasVariables: boolean;
  componentCount: number;
  variableCount: number;
  collectionCount: number;
  modeNames: string[];
}

// ---------------------------------------------------------------------------
// Component preview — per-component render with real CSS/HTML
// ---------------------------------------------------------------------------

/**
 * A per-component preview file (.gitma/previews/ComponentName.html).
 *
 * Contains CSS for the component and a JS render function that
 * takes the current state (props, variants, states) and returns HTML.
 *
 * Example file:
 * ```html
 * <style>
 * .badge { display: inline-flex; ... }
 * .badge--sm { font-size: 10px; }
 * </style>
 * <script>
 * function render(state) {
 *   return `<span class="badge badge--${state['variant:size']}">
 *     ${state.label}
 *   </span>`;
 * }
 * </script>
 * ```
 */
export interface ComponentPreview {
  /** Component name (matches ComponentSchema.name) */
  name: string;
  /** CSS styles for the component */
  css: string;
  /** JS function body: receives `state` object, returns HTML string */
  renderFn: string;
}

// ---------------------------------------------------------------------------
// Preview data — everything needed to render a preview
// ---------------------------------------------------------------------------

export interface PreviewData {
  components: ComponentSchema[];
  tokens: PreviewTokenData;
  /** Per-component real previews, keyed by component name */
  previews: Record<string, ComponentPreview>;
  inspect: FigmaInspectResult;
  meta: {
    figmaFileKey?: string;
    generatedAt: string;
    projectName?: string;
  };
}
