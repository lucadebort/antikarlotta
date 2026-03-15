/**
 * Three-way merge — resolve changes from both Figma and code against a base.
 *
 * Base = last committed schema
 * If only one side changed a field → take that change
 * If both sides changed to the same value → take it (no conflict)
 * If both sides changed to different values → mark as conflict
 */

import type { ComponentSchema } from "../schema/types.js";
import type { SchemaChange, Conflict, MergeResult } from "./types.js";
import { diffSchemas } from "./differ.js";

/**
 * Three-way merge of schema changes.
 *
 * @param base - Last committed schema (the common ancestor)
 * @param figma - Current Figma state
 * @param code - Current code state
 */
export function mergeSchemas(
  base: ComponentSchema[],
  figma: ComponentSchema[],
  code: ComponentSchema[],
): MergeResult {
  const figmaChanges = diffSchemas(base, figma);
  const codeChanges = diffSchemas(base, code);

  const merged: SchemaChange[] = [];
  const conflicts: Conflict[] = [];

  // Index changes by component + fieldPath for conflict detection
  const figmaIndex = indexChanges(figmaChanges);
  const codeIndex = indexChanges(codeChanges);

  // All unique change keys
  const allKeys = new Set([...figmaIndex.keys(), ...codeIndex.keys()]);

  for (const key of allKeys) {
    const figmaChange = figmaIndex.get(key);
    const codeChange = codeIndex.get(key);

    if (figmaChange && !codeChange) {
      // Only Figma changed — take it
      merged.push(figmaChange);
    } else if (!figmaChange && codeChange) {
      // Only code changed — take it
      merged.push(codeChange);
    } else if (figmaChange && codeChange) {
      // Both changed — check if they agree
      if (deepEqual(figmaChange.after, codeChange.after)) {
        // Same change on both sides — no conflict, take either
        merged.push(figmaChange);
      } else {
        // Genuine conflict
        conflicts.push({
          componentName: figmaChange.componentName,
          fieldPath: figmaChange.fieldPath,
          base: figmaChange.before,
          figma: figmaChange.after,
          code: codeChange.after,
        });
      }
    }
  }

  return { merged, conflicts };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function changeKey(change: SchemaChange): string {
  return `${change.componentName}::${change.fieldPath}`;
}

function indexChanges(changes: SchemaChange[]): Map<string, SchemaChange> {
  const map = new Map<string, SchemaChange>();
  for (const change of changes) {
    map.set(changeKey(change), change);
  }
  return map;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();
    if (!deepEqual(aKeys, bKeys)) return false;
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }

  return false;
}
