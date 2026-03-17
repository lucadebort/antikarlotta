/**
 * Token data builder — converts raw Figma variables into PreviewTokenData.
 *
 * This formalizes the conversion that was previously done ad hoc
 * when generating token-data.js files.
 */

import type {
  FigmaVariable,
  FigmaVariableCollection,
  FigmaColor,
} from "../figma-adapter/types.js";
import type {
  PreviewTokenData,
  PreviewTokenCollection,
  PreviewTokenEntry,
  PreviewTokenValue,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build PreviewTokenData from Figma variables and collections.
 * Groups tokens by collection → category, with values per mode.
 */
export function buildPreviewTokenData(
  variables: FigmaVariable[],
  collections: FigmaVariableCollection[],
): PreviewTokenData {
  const result: PreviewTokenData = {};

  // Index collections by ID for fast lookup
  const collectionMap = new Map(collections.map((c) => [c.id, c]));

  // Index variables by ID for alias resolution
  const variableMap = new Map(variables.map((v) => [v.id, v]));

  // Group variables by collection
  const byCollection = new Map<string, FigmaVariable[]>();
  for (const variable of variables) {
    const group = byCollection.get(variable.variableCollectionId) ?? [];
    group.push(variable);
    byCollection.set(variable.variableCollectionId, group);
  }

  for (const [collectionId, vars] of byCollection) {
    const collection = collectionMap.get(collectionId);
    if (!collection) continue;

    const tokenCollection: PreviewTokenCollection = {
      modes: collection.modes.map((m) => ({ id: m.modeId, name: m.name })),
      categories: {},
    };

    for (const variable of vars) {
      const { category, name } = parsePath(variable.name);
      const entry = buildTokenEntry(variable, collection, variableMap);

      if (!tokenCollection.categories[category]) {
        tokenCollection.categories[category] = [];
      }
      tokenCollection.categories[category].push(entry);
    }

    result[collection.name] = tokenCollection;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Parse a Figma variable name like "Primary/primary500" into
 * category ("Primary") and name ("primary500").
 * Variables without a slash go into "Other" category.
 */
function parsePath(variableName: string): { category: string; name: string } {
  const slashIdx = variableName.indexOf("/");
  if (slashIdx === -1) {
    return { category: "Other", name: variableName };
  }
  return {
    category: variableName.slice(0, slashIdx),
    name: variableName.slice(slashIdx + 1),
  };
}

function buildTokenEntry(
  variable: FigmaVariable,
  collection: FigmaVariableCollection,
  variableMap: Map<string, FigmaVariable>,
): PreviewTokenEntry {
  const values: Record<string, PreviewTokenValue> = {};

  for (const mode of collection.modes) {
    const raw = variable.valuesByMode[mode.modeId];
    if (!raw) continue;
    values[mode.name] = resolveValue(raw, variableMap);
  }

  return {
    name: parsePath(variable.name).name,
    fullName: variable.name,
    resolvedType: variable.resolvedType,
    ...(variable.description && { description: variable.description }),
    values,
  };
}

function resolveValue(
  raw: unknown,
  variableMap: Map<string, FigmaVariable>,
): PreviewTokenValue {
  if (!raw || typeof raw !== "object") {
    return { type: "FLOAT", value: 0 };
  }

  const val = raw as Record<string, unknown>;

  switch (val.type) {
    case "COLOR": {
      const color = val.value as FigmaColor;
      return { type: "COLOR", hex: figmaColorToHex(color) };
    }

    case "FLOAT": {
      return { type: "FLOAT", value: val.value as number };
    }

    case "VARIABLE_ALIAS": {
      const aliasVar = variableMap.get(val.id as string);
      if (aliasVar) {
        return { type: "FLOAT", ref: aliasVar.name };
      }
      return { type: "FLOAT", ref: val.id as string };
    }

    default:
      return { type: "FLOAT", value: 0 };
  }
}

/**
 * Convert Figma RGBA (0-1 range) to hex string.
 */
function figmaColorToHex(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, "0").toUpperCase()}${g.toString(16).padStart(2, "0").toUpperCase()}${b.toString(16).padStart(2, "0").toUpperCase()}`;
}
