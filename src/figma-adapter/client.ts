/**
 * Figma client — reads components and variables via the bridge plugin.
 *
 * Uses the WebSocketConnector to execute plugin code directly in
 * Figma Desktop. No auth token needed.
 */

import type {
  FigmaComponent,
  FigmaComponentSet,
  FigmaVariable,
  FigmaVariableCollection,
  FigmaComponentProperty,
} from "./types.js";
import type { FigmaConnection } from "./mcp-connection.js";
import { executeInFigma } from "./mcp-connection.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all components from the open Figma file.
 *
 * Scans all pages for component sets and standalone components,
 * then reads their componentPropertyDefinitions.
 */
export async function fetchComponents(
  conn: FigmaConnection,
): Promise<{ componentSets: FigmaComponentSet[]; components: FigmaComponent[] }> {
  // Step 1: Find all component sets and standalone components across all pages
  const allItems = await executeInFigma<Array<{
    name: string;
    key: string;
    nodeId: string;
    type: "COMPONENT_SET" | "COMPONENT";
  }>>(
    conn,
    `
    await figma.loadAllPagesAsync();
    const items = [];
    for (const page of figma.root.children) {
      const sets = page.findAllWithCriteria({ types: ["COMPONENT_SET"] });
      for (const s of sets) {
        items.push({ name: s.name, key: s.key, nodeId: s.id, type: "COMPONENT_SET" });
      }
      const comps = page.findAllWithCriteria({ types: ["COMPONENT"] });
      for (const c of comps) {
        if (c.parent?.type !== "COMPONENT_SET") {
          items.push({ name: c.name, key: c.key, nodeId: c.id, type: "COMPONENT" });
        }
      }
    }
    return items;
    `,
    30_000,
  );

  // Step 2: For each component set, fetch property definitions
  const componentSets: FigmaComponentSet[] = [];
  const standaloneComponents: FigmaComponent[] = [];

  for (const item of allItems) {
    if (item.type === "COMPONENT_SET") {
      const data = await executeInFigma<{
        propDefs: Record<string, FigmaComponentProperty>;
        variants: FigmaComponent[];
      }>(
        conn,
        `
        const node = await figma.getNodeByIdAsync(${JSON.stringify(item.nodeId)});
        if (!node || node.type !== "COMPONENT_SET") return { propDefs: {}, variants: [] };
        const propDefs = {};
        for (const [key, def] of Object.entries(node.componentPropertyDefinitions)) {
          propDefs[key] = {
            type: def.type,
            defaultValue: def.defaultValue,
            variantOptions: def.variantOptions || undefined,
            preferredValues: def.preferredValues?.map(v => ({ type: v.type, key: v.key })) || undefined,
          };
        }
        const variants = node.children.map(c => ({
          key: c.key,
          name: c.name,
          description: c.description || "",
          nodeId: c.id,
          componentSetId: ${JSON.stringify(item.nodeId)},
        }));
        return { propDefs, variants };
        `,
      );

      componentSets.push({
        key: item.key,
        name: item.name,
        description: "",
        nodeId: item.nodeId,
        componentPropertyDefinitions: data.propDefs,
        variantComponents: data.variants,
      });
    } else {
      const propDefs = await executeInFigma<Record<string, FigmaComponentProperty>>(
        conn,
        `
        const node = await figma.getNodeByIdAsync(${JSON.stringify(item.nodeId)});
        if (!node || node.type !== "COMPONENT") return {};
        const result = {};
        for (const [key, def] of Object.entries(node.componentPropertyDefinitions || {})) {
          result[key] = {
            type: def.type,
            defaultValue: def.defaultValue,
            variantOptions: def.variantOptions || undefined,
            preferredValues: def.preferredValues?.map(v => ({ type: v.type, key: v.key })) || undefined,
          };
        }
        return result;
        `,
      );

      standaloneComponents.push({
        key: item.key,
        name: item.name,
        description: "",
        nodeId: item.nodeId,
        componentPropertyDefinitions: propDefs,
      });
    }
  }

  return { componentSets, components: standaloneComponents };
}

/**
 * Fetch all variables and collections from the open Figma file.
 */
export async function fetchVariables(
  conn: FigmaConnection,
): Promise<{ variables: FigmaVariable[]; collections: FigmaVariableCollection[] }> {
  const data = await executeInFigma<{
    variables: FigmaVariable[];
    collections: FigmaVariableCollection[];
  }>(
    conn,
    `
    const variables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    return {
      variables: variables.map(v => ({
        id: v.id,
        name: v.name,
        key: v.key,
        resolvedType: v.resolvedType,
        description: v.description || "",
        valuesByMode: v.valuesByMode,
        variableCollectionId: v.variableCollectionId,
      })),
      collections: collections.map(c => ({
        id: c.id,
        name: c.name,
        key: c.key,
        modes: c.modes,
        variableIds: c.variableIds,
      })),
    };
    `,
    15_000,
  );

  return data;
}
