/**
 * Preview data assembler — gathers Figma components and tokens into PreviewData.
 *
 * Reads from .gitma/ snapshots and raw Figma variable data.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { loadConfig } from "../shared/config.js";
import { loadSnapshot } from "../diff-engine/snapshot.js";
import { buildPreviewTokenData } from "./token-data-builder.js";
import type { FigmaVariable, FigmaVariableCollection } from "../figma-adapter/types.js";
import type { PreviewData, FigmaInspectResult, PreviewTokenData, ComponentPreview } from "./types.js";
import type { ComponentSchema } from "../schema/types.js";

const VARIABLES_PATH = ".gitma/figma-variables.json";
const PREVIEWS_DIR = ".gitma/previews";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assemble all preview data from .gitma/ snapshots.
 *
 * Loads component schemas from the Figma snapshot and token data
 * from the raw Figma variables file. Either or both may be absent —
 * the preview adapts to show what's available.
 */
export function assemblePreviewData(projectRoot: string): PreviewData {
  const config = loadConfig(projectRoot);

  // Load component schemas
  const components = loadSnapshot(projectRoot, "figma") ?? [];

  // Load raw Figma variables
  const { variables, collections } = loadFigmaVariables(projectRoot);

  // Build token data
  const tokens: PreviewTokenData = variables.length > 0
    ? buildPreviewTokenData(variables, collections)
    : {};

  // Build inspect result
  const modeNames = new Set<string>();
  for (const col of collections) {
    for (const mode of col.modes) {
      modeNames.add(mode.name);
    }
  }

  const inspect: FigmaInspectResult = {
    hasComponents: components.length > 0,
    hasVariables: variables.length > 0,
    componentCount: components.length,
    variableCount: variables.length,
    collectionCount: collections.length,
    modeNames: [...modeNames],
  };

  // Load per-component previews
  const previews = loadComponentPreviews(projectRoot);

  return {
    components,
    tokens,
    previews,
    inspect,
    meta: {
      figmaFileKey: config.figmaFileKey,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface FigmaVariablesFile {
  variables: FigmaVariable[];
  collections: FigmaVariableCollection[];
}

/**
 * Load per-component preview files from .gitma/previews/.
 *
 * Each file is named ComponentName.html and contains:
 * - <style> block with component CSS
 * - <script> block with a render(state) function
 */
function loadComponentPreviews(projectRoot: string): Record<string, ComponentPreview> {
  const dir = join(projectRoot, PREVIEWS_DIR);
  if (!existsSync(dir)) return {};

  const previews: Record<string, ComponentPreview> = {};

  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".html")) continue;

    const name = basename(file, ".html");
    const content = readFileSync(join(dir, file), "utf-8");
    const preview = parseComponentPreview(name, content);
    if (preview) {
      previews[name] = preview;
    }
  }

  return previews;
}

/**
 * Parse a component preview HTML file into CSS and render function.
 */
function parseComponentPreview(name: string, content: string): ComponentPreview | null {
  const styleMatch = content.match(/<style>([\s\S]*?)<\/style>/i);
  const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/i);

  if (!scriptMatch) return null;

  return {
    name,
    css: styleMatch?.[1]?.trim() ?? "",
    renderFn: scriptMatch[1].trim(),
  };
}

function loadFigmaVariables(projectRoot: string): FigmaVariablesFile {
  const path = join(projectRoot, VARIABLES_PATH);
  if (!existsSync(path)) {
    return { variables: [], collections: [] };
  }

  const json = readFileSync(path, "utf-8");
  const data = JSON.parse(json) as Partial<FigmaVariablesFile>;

  return {
    variables: data.variables ?? [],
    collections: data.collections ?? [],
  };
}
