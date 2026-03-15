/**
 * Change classifier — determines severity of schema changes.
 *
 * Rules:
 * - Additive (safe to auto-sync): new optional prop, new variant value, new slot, new state, new token ref
 * - Breaking (needs review): removed prop, removed variant value, type change, required false→true, removed slot
 */

import type { ChangeTarget, ChangeSeverity } from "./types.js";

export function classifyChange(
  target: ChangeTarget,
  changeType: "added" | "removed" | "modified",
  before: unknown,
  after: unknown,
): ChangeSeverity {
  // Component-level
  if (target === "component") {
    if (changeType === "added") return "additive";
    if (changeType === "removed") return "breaking";
  }

  // Added anything is generally additive
  if (changeType === "added") {
    return "additive";
  }

  // Removed anything is generally breaking
  if (changeType === "removed") {
    return "breaking";
  }

  // Modified — depends on what changed
  if (changeType === "modified") {
    return classifyModification(target, before, after);
  }

  return "breaking"; // default conservative
}

function classifyModification(
  target: ChangeTarget,
  before: unknown,
  after: unknown,
): ChangeSeverity {
  if (target === "prop") {
    // required: false → true is breaking
    if (before === false && after === true) return "breaking";
    // required: true → false is additive (relaxing)
    if (before === true && after === false) return "additive";
    // Type changes are always breaking
    if (typeof before === "string" && typeof after === "string" && before !== after) {
      return "breaking";
    }
    // Default value changes are additive
    return "additive";
  }

  if (target === "variant") {
    // Check if values were added (additive) or removed (breaking)
    if (Array.isArray(before) && Array.isArray(after)) {
      const beforeSet = new Set(before as string[]);
      const afterSet = new Set(after as string[]);
      const removed = [...beforeSet].filter((v) => !afterSet.has(v));
      if (removed.length > 0) return "breaking";
      return "additive";
    }
    // Default value changes are additive
    return "additive";
  }

  if (target === "slot") {
    // required: false → true is breaking
    if (before === false && after === true) return "breaking";
    // Narrowing allowed components is breaking
    if (Array.isArray(before) && Array.isArray(after)) {
      const beforeSet = new Set(before as string[]);
      const removed = (after as string[]).length < (before as string[]).length;
      if (removed) return "breaking";
    }
    return "additive";
  }

  if (target === "state" || target === "tokenRef") {
    return "additive";
  }

  if (target === "metadata") {
    return "additive";
  }

  return "breaking"; // conservative default
}
