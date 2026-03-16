/**
 * Figma writer — push schema changes back to Figma via MCP.
 *
 * Capabilities:
 * - Component properties: add/delete via Plugin API (figma_execute)
 * - Variables (tokens): full CRUD via Plugin API
 */

import type { FigmaVariableInput } from "./token-bridge.js";
import type { SchemaChange } from "../diff-engine/types.js";
import { executeInFigma, type FigmaConnection } from "./mcp-connection.js";

// ---------------------------------------------------------------------------
// Variable write-back via MCP
// ---------------------------------------------------------------------------

export interface WriteVariablesResult {
  created: number;
  updated: number;
  errors: string[];
}

/**
 * Push token variables to Figma via the Plugin API.
 *
 * Creates or updates variables in the open Figma file.
 */
export async function writeVariablesToFigma(
  conn: FigmaConnection,
  variables: FigmaVariableInput[],
  existingCollections?: Map<string, string>, // name → id
  existingVariables?: Map<string, string>,   // name → id
): Promise<WriteVariablesResult> {
  const result: WriteVariablesResult = { created: 0, updated: 0, errors: [] };

  // Group variables by collection
  const byCollection = new Map<string, FigmaVariableInput[]>();
  for (const v of variables) {
    const group = byCollection.get(v.collectionName) ?? [];
    group.push(v);
    byCollection.set(v.collectionName, group);
  }

  for (const [collectionName, vars] of byCollection) {
    try {
      const batchResult = await executeInFigma<{
        created: number;
        updated: number;
        errors: string[];
      }>(
        conn,
        `
        const collectionName = ${JSON.stringify(collectionName)};
        const existingCollectionId = ${JSON.stringify(existingCollections?.get(collectionName) ?? null)};
        const vars = ${JSON.stringify(vars)};
        const existingVarMap = ${JSON.stringify(Object.fromEntries(existingVariables ?? new Map()))};

        const result = { created: 0, updated: 0, errors: [] };

        // Find or create collection
        let collection;
        if (existingCollectionId) {
          collection = await figma.variables.getVariableCollectionByIdAsync(existingCollectionId);
        }
        if (!collection) {
          const collections = await figma.variables.getLocalVariableCollectionsAsync();
          collection = collections.find(c => c.name === collectionName);
        }
        if (!collection) {
          collection = figma.variables.createVariableCollection(collectionName);
        }

        const defaultModeId = collection.modes[0].modeId;

        for (const v of vars) {
          try {
            const existingId = existingVarMap[v.name];
            if (existingId) {
              const existing = await figma.variables.getVariableByIdAsync(existingId);
              if (existing && v.value !== undefined) {
                existing.setValueForMode(defaultModeId, v.value);
                result.updated++;
              }
            } else {
              const newVar = figma.variables.createVariable(v.name, collection, v.resolvedType);
              if (v.description) newVar.description = v.description;
              if (v.value !== undefined) newVar.setValueForMode(defaultModeId, v.value);
              result.created++;
            }
          } catch (e) {
            result.errors.push(v.name + ": " + e.message);
          }
        }

        return result;
        `,
        15_000,
      );

      result.created += batchResult.created;
      result.updated += batchResult.updated;
      result.errors.push(...batchResult.errors);
    } catch (err) {
      result.errors.push(
        `Collection "${collectionName}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Component property write-back via MCP
// ---------------------------------------------------------------------------

export interface WriteComponentResult {
  applied: number;
  errors: string[];
}

/**
 * Apply schema changes to Figma component properties.
 *
 * Handles adding/removing boolean, text, and instance swap properties.
 * Variant changes are more complex (require creating child components)
 * and are reported as instructions.
 */
export async function applySchemaChangesToFigma(
  conn: FigmaConnection,
  changes: SchemaChange[],
): Promise<WriteComponentResult> {
  const result: WriteComponentResult = { applied: 0, errors: [] };

  for (const change of changes) {
    // Need a figmaNodeId to target the component
    const nodeId = (change as any).figmaNodeId;
    if (!nodeId) {
      result.errors.push(`${change.componentName}: no figmaNodeId — cannot write`);
      continue;
    }

    try {
      switch (change.target) {
        case "prop": {
          if (change.changeType === "added") {
            const prop = change.after as { type: string; defaultValue?: unknown };
            const figmaType = mapPropTypeToFigma(prop.type);
            if (!figmaType) {
              result.errors.push(`${change.componentName}.${change.fieldPath}: unsupported type "${prop.type}"`);
              continue;
            }
            await executeInFigma(
              conn,
              `
              const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
              if (!node || (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT")) {
                throw new Error("Node not found or wrong type");
              }
              node.addComponentProperty(
                ${JSON.stringify(change.fieldPath.split(".")[1])},
                ${JSON.stringify(figmaType)},
                ${JSON.stringify(prop.defaultValue ?? getDefaultForType(figmaType))},
              );
              return true;
              `,
            );
            result.applied++;
          } else if (change.changeType === "removed") {
            const propName = change.fieldPath.split(".")[1];
            await executeInFigma(
              conn,
              `
              const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
              if (!node || (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT")) {
                throw new Error("Node not found or wrong type");
              }
              const key = Object.keys(node.componentPropertyDefinitions)
                .find(k => k.startsWith(${JSON.stringify(propName)}));
              if (!key) throw new Error("Property not found: " + ${JSON.stringify(propName)});
              node.deleteComponentProperty(key);
              return true;
              `,
            );
            result.applied++;
          }
          break;
        }

        case "slot": {
          if (change.changeType === "added") {
            await executeInFigma(
              conn,
              `
              const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
              if (!node || (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT")) {
                throw new Error("Node not found or wrong type");
              }
              node.addComponentProperty(
                ${JSON.stringify(change.fieldPath.split(".")[1])},
                "INSTANCE_SWAP",
                node.children?.[0]?.id ?? "",
              );
              return true;
              `,
            );
            result.applied++;
          } else if (change.changeType === "removed") {
            const slotName = change.fieldPath.split(".")[1];
            await executeInFigma(
              conn,
              `
              const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
              if (!node || (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT")) {
                throw new Error("Node not found or wrong type");
              }
              const key = Object.keys(node.componentPropertyDefinitions)
                .find(k => k.startsWith(${JSON.stringify(slotName)}));
              if (!key) throw new Error("Property not found: " + ${JSON.stringify(slotName)});
              node.deleteComponentProperty(key);
              return true;
              `,
            );
            result.applied++;
          }
          break;
        }

        case "state": {
          if (change.changeType === "added") {
            await executeInFigma(
              conn,
              `
              const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
              if (!node || (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT")) {
                throw new Error("Node not found or wrong type");
              }
              node.addComponentProperty(
                ${JSON.stringify(change.fieldPath.split(".")[1])},
                "BOOLEAN",
                false,
              );
              return true;
              `,
            );
            result.applied++;
          } else if (change.changeType === "removed") {
            const stateName = change.fieldPath.split(".")[1];
            await executeInFigma(
              conn,
              `
              const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
              if (!node || (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT")) {
                throw new Error("Node not found or wrong type");
              }
              const key = Object.keys(node.componentPropertyDefinitions)
                .find(k => k.startsWith(${JSON.stringify(stateName)}));
              if (!key) throw new Error("Property not found: " + ${JSON.stringify(stateName)});
              node.deleteComponentProperty(key);
              return true;
              `,
            );
            result.applied++;
          }
          break;
        }

        case "variant": {
          // Variant changes require creating/removing child components —
          // too complex for automated write-back. Report as instruction.
          result.errors.push(
            `${change.componentName}: variant "${change.fieldPath}" change requires manual update in Figma`,
          );
          break;
        }
      }
    } catch (err) {
      result.errors.push(
        `${change.componentName}.${change.fieldPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Designer instructions (fallback when MCP is unavailable)
// ---------------------------------------------------------------------------

export interface ComponentChangeInstruction {
  componentName: string;
  figmaNodeId?: string;
  instructions: string[];
}

/**
 * Convert schema changes into designer-readable instructions.
 * Used as fallback when Figma Desktop is not available.
 */
export function generateDesignerInstructions(
  changes: SchemaChange[],
): ComponentChangeInstruction[] {
  const byComponent = new Map<string, SchemaChange[]>();
  for (const change of changes) {
    const group = byComponent.get(change.componentName) ?? [];
    group.push(change);
    byComponent.set(change.componentName, group);
  }

  const instructions: ComponentChangeInstruction[] = [];

  for (const [componentName, componentChanges] of byComponent) {
    const lines: string[] = [];

    for (const change of componentChanges) {
      const path = change.fieldPath.split(".");
      const fieldName = path[1];

      switch (change.target) {
        case "variant":
          if (change.changeType === "added") {
            const values = (change.after as any)?.values;
            lines.push(
              `Add variant property "${fieldName}" with values: ${values?.join(", ") ?? "unknown"}`,
            );
          } else if (change.changeType === "removed") {
            lines.push(`Remove variant property "${fieldName}"`);
          } else if (change.changeType === "modified") {
            if (path[2] === "values") {
              const before = new Set(change.before as string[]);
              const after = change.after as string[];
              const added = after.filter((v) => !before.has(v));
              const removed = [...before].filter((v) => !after.includes(v));
              if (added.length) lines.push(`Add variant values to "${fieldName}": ${added.join(", ")}`);
              if (removed.length) lines.push(`Remove variant values from "${fieldName}": ${removed.join(", ")}`);
            }
          }
          break;

        case "prop":
          if (change.changeType === "added") {
            lines.push(`Add ${(change.after as any)?.type ?? "text"} property "${fieldName}"`);
          } else if (change.changeType === "removed") {
            lines.push(`Remove property "${fieldName}"`);
          }
          break;

        case "slot":
          if (change.changeType === "added") {
            lines.push(`Add instance swap property "${fieldName}"`);
          } else if (change.changeType === "removed") {
            lines.push(`Remove instance swap property "${fieldName}"`);
          }
          break;

        case "state":
          if (change.changeType === "added") {
            lines.push(`Add boolean property "${fieldName}" (interactive state)`);
          } else if (change.changeType === "removed") {
            lines.push(`Remove boolean property "${fieldName}"`);
          }
          break;
      }
    }

    if (lines.length > 0) {
      instructions.push({ componentName, instructions: lines });
    }
  }

  return instructions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapPropTypeToFigma(schemaType: string): string | null {
  switch (schemaType) {
    case "boolean": return "BOOLEAN";
    case "string": return "TEXT";
    case "node": return "INSTANCE_SWAP";
    default: return null;
  }
}

function getDefaultForType(figmaType: string): unknown {
  switch (figmaType) {
    case "BOOLEAN": return false;
    case "TEXT": return "";
    default: return "";
  }
}
