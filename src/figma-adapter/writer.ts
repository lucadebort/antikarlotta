/**
 * Figma writer — produces structured change operations for Claude Code
 * to apply via figma_execute.
 *
 * Each operation includes ready-to-run figma_execute code that Claude
 * can execute directly. This includes variant value creation with
 * proper cloning, renaming, and repositioning.
 */

import type { SchemaChange } from "../diff-engine/types.js";

// ---------------------------------------------------------------------------
// Structured change output (for Claude Code to apply)
// ---------------------------------------------------------------------------

export interface FigmaWriteOperation {
  /** Target component's Figma node ID */
  nodeId: string;
  /** Component name (for display) */
  componentName: string;
  /** Human-readable description */
  description: string;
  /** Ready-to-run figma_execute code */
  code: string;
}

/**
 * Convert schema changes into executable write operations.
 *
 * Each operation contains figma_execute code that Claude Code can run
 * to apply the change. Variant value additions clone from the nearest
 * existing value, reposition with correct spacing, and resize the
 * component set to fit.
 */
export function schemaChangesToWriteOps(
  changes: SchemaChange[],
): FigmaWriteOperation[] {
  const ops: FigmaWriteOperation[] = [];

  for (const change of changes) {
    const nodeId = (change as any).figmaNodeId;
    if (!nodeId) continue;

    const fieldName = change.fieldPath.split(".")[1];
    const escapedNodeId = JSON.stringify(nodeId);

    switch (change.target) {
      case "prop": {
        if (change.changeType === "added") {
          const prop = change.after as { type: string; defaultValue?: unknown };
          const figmaType = mapPropTypeToFigma(prop.type);
          if (!figmaType) continue;
          const defaultVal = prop.defaultValue ?? getDefaultForType(figmaType);

          ops.push({
            nodeId,
            componentName: change.componentName,
            description: `Add ${figmaType} property "${fieldName}" (default: ${defaultVal})`,
            code: `
const node = await figma.getNodeByIdAsync(${escapedNodeId});
if (!node || (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT")) {
  throw new Error("Node not found or wrong type");
}
node.addComponentProperty(${JSON.stringify(fieldName)}, ${JSON.stringify(figmaType)}, ${JSON.stringify(defaultVal)});
return true;
`.trim(),
          });
        } else if (change.changeType === "removed") {
          ops.push({
            nodeId,
            componentName: change.componentName,
            description: `Remove property "${fieldName}"`,
            code: `
const node = await figma.getNodeByIdAsync(${escapedNodeId});
if (!node || (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT")) {
  throw new Error("Node not found or wrong type");
}
const key = Object.keys(node.componentPropertyDefinitions).find(k => k.startsWith(${JSON.stringify(fieldName)}));
if (!key) throw new Error("Property not found: ${fieldName}");
node.deleteComponentProperty(key);
return true;
`.trim(),
          });
        }
        break;
      }

      case "slot": {
        if (change.changeType === "added") {
          ops.push({
            nodeId,
            componentName: change.componentName,
            description: `Add instance swap property "${fieldName}"`,
            code: `
const node = await figma.getNodeByIdAsync(${escapedNodeId});
if (!node || (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT")) {
  throw new Error("Node not found or wrong type");
}
node.addComponentProperty(${JSON.stringify(fieldName)}, "INSTANCE_SWAP", node.children?.[0]?.id ?? "");
return true;
`.trim(),
          });
        } else if (change.changeType === "removed") {
          ops.push({
            nodeId,
            componentName: change.componentName,
            description: `Remove slot "${fieldName}"`,
            code: `
const node = await figma.getNodeByIdAsync(${escapedNodeId});
if (!node || (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT")) {
  throw new Error("Node not found or wrong type");
}
const key = Object.keys(node.componentPropertyDefinitions).find(k => k.startsWith(${JSON.stringify(fieldName)}));
if (!key) throw new Error("Property not found: ${fieldName}");
node.deleteComponentProperty(key);
return true;
`.trim(),
          });
        }
        break;
      }

      case "state": {
        if (change.changeType === "added") {
          ops.push({
            nodeId,
            componentName: change.componentName,
            description: `Add boolean state "${fieldName}"`,
            code: `
const node = await figma.getNodeByIdAsync(${escapedNodeId});
if (!node || (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT")) {
  throw new Error("Node not found or wrong type");
}
node.addComponentProperty(${JSON.stringify(fieldName)}, "BOOLEAN", false);
return true;
`.trim(),
          });
        } else if (change.changeType === "removed") {
          ops.push({
            nodeId,
            componentName: change.componentName,
            description: `Remove state "${fieldName}"`,
            code: `
const node = await figma.getNodeByIdAsync(${escapedNodeId});
if (!node || (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT")) {
  throw new Error("Node not found or wrong type");
}
const key = Object.keys(node.componentPropertyDefinitions).find(k => k.startsWith(${JSON.stringify(fieldName)}));
if (!key) throw new Error("Property not found: ${fieldName}");
node.deleteComponentProperty(key);
return true;
`.trim(),
          });
        }
        break;
      }

      case "variant": {
        if (change.changeType === "modified" && change.fieldPath.endsWith(".values")) {
          const before = new Set(change.before as string[]);
          const after = change.after as string[];
          const added = after.filter((v) => !before.has(v));
          const removed = [...before].filter((v) => !after.includes(v));

          if (added.length) {
            // Find the last existing value to clone from
            const templateValue = [...before].at(-1) ?? [...before][0];

            for (const newValue of added) {
              ops.push({
                nodeId,
                componentName: change.componentName,
                description: `Add variant value "${fieldName}=${newValue}" (clone from "${templateValue}")`,
                code: generateAddVariantValueCode(nodeId, fieldName, newValue, templateValue),
              });
            }
          }

          if (removed.length) {
            for (const value of removed) {
              ops.push({
                nodeId,
                componentName: change.componentName,
                description: `Remove variant value "${fieldName}=${value}"`,
                code: generateRemoveVariantValueCode(nodeId, fieldName, value),
              });
            }
          }
        } else if (change.changeType === "added") {
          const values = (change.after as any)?.values as string[] | undefined;
          ops.push({
            nodeId,
            componentName: change.componentName,
            description: `Add variant "${fieldName}" with values: ${values?.join(", ") ?? "unknown"} (requires manual setup in Figma)`,
            code: `return { manual: true, reason: "Adding a new variant axis requires restructuring all child components. Do this in Figma." };`,
          });
        } else if (change.changeType === "removed") {
          ops.push({
            nodeId,
            componentName: change.componentName,
            description: `Remove variant "${fieldName}" (requires manual cleanup in Figma)`,
            code: `return { manual: true, reason: "Removing a variant axis requires restructuring all child components. Do this in Figma." };`,
          });
        }
        break;
      }
    }
  }

  return ops;
}

// ---------------------------------------------------------------------------
// Variant value code generation
// ---------------------------------------------------------------------------

/**
 * Generate figma_execute code to add a variant value.
 *
 * Strategy:
 * 1. Find all children matching the template value
 * 2. Clone each one into the component set
 * 3. Rename to use the new value
 * 4. Reposition below existing variants with correct spacing
 * 5. Resize the component set to fit
 */
function generateAddVariantValueCode(
  nodeId: string,
  variantName: string,
  newValue: string,
  templateValue: string,
): string {
  return `
const setNode = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
if (!setNode || setNode.type !== "COMPONENT_SET") throw new Error("Component set not found");

const variantKey = ${JSON.stringify(variantName)};
const newVal = ${JSON.stringify(newValue)};
const templateVal = ${JSON.stringify(templateValue)};

// Find template children (matching the value to clone from)
const templateChildren = setNode.children.filter(c =>
  c.name.includes(variantKey + "=" + templateVal)
);

if (templateChildren.length === 0) {
  throw new Error("No template children found for " + variantKey + "=" + templateVal);
}

// Calculate spacing from existing layout
const allYs = setNode.children.map(c => c.y);
const uniqueYs = [...new Set(allYs)].sort((a, b) => a - b);
const rowGap = uniqueYs.length > 1 ? uniqueYs[1] - uniqueYs[0] : 32;

// Find the max Y of existing children (bottom of current layout)
const maxExistingY = Math.max(...setNode.children.map(c => c.y + c.height));

// Determine group gap by finding spacing between variant groups
const byValue = {};
for (const child of setNode.children) {
  const match = child.name.match(new RegExp(variantKey + "=(\\\\w+)"));
  if (match) {
    if (!byValue[match[1]]) byValue[match[1]] = [];
    byValue[match[1]].push(child);
  }
}
const valueGroups = Object.entries(byValue).map(([val, children]) => ({
  val,
  minY: Math.min(...children.map(c => c.y)),
  maxY: Math.max(...children.map(c => c.y + c.height)),
})).sort((a, b) => a.minY - b.minY);

let groupGap = 86;
if (valueGroups.length >= 2) {
  groupGap = valueGroups[1].minY - valueGroups[0].maxY;
}

// Starting Y for new variants
const startY = maxExistingY + groupGap;

// Sort templates by position
const sorted = [...templateChildren].sort((a, b) => a.y - b.y || a.x - b.x);
const templateMinY = Math.min(...sorted.map(c => c.y));

// Clone, rename, reposition
const created = [];
for (const template of sorted) {
  const clone = template.clone();
  clone.name = template.name.replace(
    variantKey + "=" + templateVal,
    variantKey + "=" + newVal
  );
  setNode.appendChild(clone);
  clone.x = template.x;
  clone.y = startY + (template.y - templateMinY);
  created.push(clone.name);
}

// Resize component set to fit all children
const allNodes = setNode.children;
const maxY2 = Math.max(...allNodes.map(c => c.y + c.height));
const maxX2 = Math.max(...allNodes.map(c => c.x + c.width));
setNode.resize(Math.max(setNode.width, maxX2 + 16), maxY2 + 16);

return { created: created.length, names: created };
`.trim();
}

/**
 * Generate figma_execute code to remove a variant value.
 *
 * Removes all children matching the value, then repositions
 * remaining children and resizes the component set.
 */
function generateRemoveVariantValueCode(
  nodeId: string,
  variantName: string,
  value: string,
): string {
  return `
const setNode = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
if (!setNode || setNode.type !== "COMPONENT_SET") throw new Error("Component set not found");

const variantKey = ${JSON.stringify(variantName)};
const removeVal = ${JSON.stringify(value)};

// Find and remove matching children
const toRemove = setNode.children.filter(c =>
  c.name.includes(variantKey + "=" + removeVal)
);

const removed = toRemove.map(c => c.name);
for (const child of toRemove) {
  child.remove();
}

// Resize component set to fit remaining children
if (setNode.children.length > 0) {
  const maxY = Math.max(...setNode.children.map(c => c.y + c.height));
  const maxX = Math.max(...setNode.children.map(c => c.x + c.width));
  setNode.resize(Math.max(maxX + 16, 100), maxY + 16);
}

return { removed: removed.length, names: removed };
`.trim();
}

// ---------------------------------------------------------------------------
// Human-readable instructions
// ---------------------------------------------------------------------------

export interface ComponentChangeInstruction {
  componentName: string;
  figmaNodeId?: string;
  instructions: string[];
}

/**
 * Convert write operations into human-readable instructions.
 */
export function writeOpsToInstructions(
  ops: FigmaWriteOperation[],
): ComponentChangeInstruction[] {
  const byComponent = new Map<string, { nodeId?: string; lines: string[] }>();

  for (const op of ops) {
    const entry = byComponent.get(op.componentName) ?? { nodeId: op.nodeId, lines: [] };
    entry.lines.push(op.description);
    byComponent.set(op.componentName, entry);
  }

  const instructions: ComponentChangeInstruction[] = [];
  for (const [componentName, { nodeId, lines }] of byComponent) {
    if (lines.length > 0) {
      instructions.push({ componentName, figmaNodeId: nodeId, instructions: lines });
    }
  }

  return instructions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapPropTypeToFigma(schemaType: string): "BOOLEAN" | "TEXT" | "INSTANCE_SWAP" | null {
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
