/**
 * Schema differ — deep comparison of two component schema arrays.
 *
 * Detects added, removed, and modified components, props, variants, slots,
 * states, and token references.
 */

import type { ComponentSchema, Prop, Variant, Slot, State, TokenRef } from "../schema/types.js";
import type { SchemaChange, ChangeTarget } from "./types.js";
import { classifyChange } from "./classifier.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeChange(
  componentName: string,
  target: ChangeTarget,
  changeType: "added" | "removed" | "modified",
  fieldPath: string,
  before: unknown,
  after: unknown,
  description: string,
): SchemaChange {
  return {
    componentName,
    target,
    changeType,
    fieldPath,
    before,
    after,
    severity: classifyChange(target, changeType, before, after),
    description,
  };
}

// ---------------------------------------------------------------------------
// Prop diffing
// ---------------------------------------------------------------------------

function diffProps(componentName: string, base: Prop[], target: Prop[]): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const baseMap = new Map(base.map((p) => [p.name, p]));
  const targetMap = new Map(target.map((p) => [p.name, p]));

  // Added props
  for (const [name, prop] of targetMap) {
    if (!baseMap.has(name)) {
      changes.push(
        makeChange(componentName, "prop", "added", `props.${name}`, undefined, prop, `Added prop "${name}"`),
      );
    }
  }

  // Removed props
  for (const [name, prop] of baseMap) {
    if (!targetMap.has(name)) {
      changes.push(
        makeChange(componentName, "prop", "removed", `props.${name}`, prop, undefined, `Removed prop "${name}"`),
      );
    }
  }

  // Modified props
  for (const [name, baseProp] of baseMap) {
    const targetProp = targetMap.get(name);
    if (!targetProp) continue;

    if (baseProp.type !== targetProp.type) {
      changes.push(
        makeChange(
          componentName, "prop", "modified", `props.${name}.type`,
          baseProp.type, targetProp.type,
          `Changed prop "${name}" type: ${baseProp.type} → ${targetProp.type}`,
        ),
      );
    }

    if (baseProp.required !== targetProp.required) {
      changes.push(
        makeChange(
          componentName, "prop", "modified", `props.${name}.required`,
          baseProp.required, targetProp.required,
          `Changed prop "${name}" required: ${baseProp.required} → ${targetProp.required}`,
        ),
      );
    }

    if (!deepEqual(baseProp.defaultValue, targetProp.defaultValue)) {
      changes.push(
        makeChange(
          componentName, "prop", "modified", `props.${name}.defaultValue`,
          baseProp.defaultValue, targetProp.defaultValue,
          `Changed prop "${name}" default: ${String(baseProp.defaultValue)} → ${String(targetProp.defaultValue)}`,
        ),
      );
    }

    if (!deepEqual(baseProp.values, targetProp.values)) {
      changes.push(
        makeChange(
          componentName, "prop", "modified", `props.${name}.values`,
          baseProp.values, targetProp.values,
          `Changed prop "${name}" values`,
        ),
      );
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Variant diffing
// ---------------------------------------------------------------------------

function diffVariants(componentName: string, base: Variant[], target: Variant[]): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const baseMap = new Map(base.map((v) => [v.name, v]));
  const targetMap = new Map(target.map((v) => [v.name, v]));

  for (const [name, variant] of targetMap) {
    if (!baseMap.has(name)) {
      changes.push(
        makeChange(componentName, "variant", "added", `variants.${name}`, undefined, variant, `Added variant "${name}"`),
      );
    }
  }

  for (const [name, variant] of baseMap) {
    if (!targetMap.has(name)) {
      changes.push(
        makeChange(componentName, "variant", "removed", `variants.${name}`, variant, undefined, `Removed variant "${name}"`),
      );
    }
  }

  for (const [name, baseVariant] of baseMap) {
    const targetVariant = targetMap.get(name);
    if (!targetVariant) continue;

    const addedValues = targetVariant.values.filter((v) => !baseVariant.values.includes(v));
    const removedValues = baseVariant.values.filter((v) => !targetVariant.values.includes(v));

    if (addedValues.length > 0) {
      changes.push(
        makeChange(
          componentName, "variant", "modified", `variants.${name}.values`,
          baseVariant.values, targetVariant.values,
          `Added variant "${name}" values: ${addedValues.join(", ")}`,
        ),
      );
    }

    if (removedValues.length > 0) {
      changes.push(
        makeChange(
          componentName, "variant", "modified", `variants.${name}.values`,
          baseVariant.values, targetVariant.values,
          `Removed variant "${name}" values: ${removedValues.join(", ")}`,
        ),
      );
    }

    if (baseVariant.defaultValue !== targetVariant.defaultValue) {
      changes.push(
        makeChange(
          componentName, "variant", "modified", `variants.${name}.defaultValue`,
          baseVariant.defaultValue, targetVariant.defaultValue,
          `Changed variant "${name}" default: ${baseVariant.defaultValue} → ${targetVariant.defaultValue}`,
        ),
      );
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Slot diffing
// ---------------------------------------------------------------------------

function diffSlots(componentName: string, base: Slot[], target: Slot[]): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const baseMap = new Map(base.map((s) => [s.name, s]));
  const targetMap = new Map(target.map((s) => [s.name, s]));

  for (const [name, slot] of targetMap) {
    if (!baseMap.has(name)) {
      changes.push(
        makeChange(componentName, "slot", "added", `slots.${name}`, undefined, slot, `Added slot "${name}"`),
      );
    }
  }

  for (const [name, slot] of baseMap) {
    if (!targetMap.has(name)) {
      changes.push(
        makeChange(componentName, "slot", "removed", `slots.${name}`, slot, undefined, `Removed slot "${name}"`),
      );
    }
  }

  for (const [name, baseSlot] of baseMap) {
    const targetSlot = targetMap.get(name);
    if (!targetSlot) continue;

    if (baseSlot.required !== targetSlot.required) {
      changes.push(
        makeChange(
          componentName, "slot", "modified", `slots.${name}.required`,
          baseSlot.required, targetSlot.required,
          `Changed slot "${name}" required: ${baseSlot.required} → ${targetSlot.required}`,
        ),
      );
    }

    if (!deepEqual(baseSlot.allowedComponents, targetSlot.allowedComponents)) {
      changes.push(
        makeChange(
          componentName, "slot", "modified", `slots.${name}.allowedComponents`,
          baseSlot.allowedComponents, targetSlot.allowedComponents,
          `Changed slot "${name}" allowed components`,
        ),
      );
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// State diffing
// ---------------------------------------------------------------------------

function diffStates(componentName: string, base: State[], target: State[]): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const baseMap = new Map(base.map((s) => [s.name, s]));
  const targetMap = new Map(target.map((s) => [s.name, s]));

  for (const [name, state] of targetMap) {
    if (!baseMap.has(name)) {
      changes.push(
        makeChange(componentName, "state", "added", `states.${name}`, undefined, state, `Added state "${name}"`),
      );
    }
  }

  for (const [name, state] of baseMap) {
    if (!targetMap.has(name)) {
      changes.push(
        makeChange(componentName, "state", "removed", `states.${name}`, state, undefined, `Removed state "${name}"`),
      );
    }
  }

  for (const [name, baseState] of baseMap) {
    const targetState = targetMap.get(name);
    if (!targetState) continue;

    if (!deepEqual(baseState.tokenOverrides, targetState.tokenOverrides)) {
      changes.push(
        makeChange(
          componentName, "state", "modified", `states.${name}.tokenOverrides`,
          baseState.tokenOverrides, targetState.tokenOverrides,
          `Changed state "${name}" token overrides`,
        ),
      );
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// TokenRef diffing
// ---------------------------------------------------------------------------

function tokenRefKey(ref: TokenRef): string {
  return `${ref.path}::${ref.property}::${ref.condition ?? ""}`;
}

function diffTokenRefs(componentName: string, base: TokenRef[], target: TokenRef[]): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const baseMap = new Map(base.map((r) => [tokenRefKey(r), r]));
  const targetMap = new Map(target.map((r) => [tokenRefKey(r), r]));

  for (const [key, ref] of targetMap) {
    if (!baseMap.has(key)) {
      changes.push(
        makeChange(
          componentName, "tokenRef", "added", `tokenRefs.${ref.path}`,
          undefined, ref, `Added token ref: ${ref.path} → ${ref.property}`,
        ),
      );
    }
  }

  for (const [key, ref] of baseMap) {
    if (!targetMap.has(key)) {
      changes.push(
        makeChange(
          componentName, "tokenRef", "removed", `tokenRefs.${ref.path}`,
          ref, undefined, `Removed token ref: ${ref.path} → ${ref.property}`,
        ),
      );
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Component diffing — top level
// ---------------------------------------------------------------------------

function diffComponent(base: ComponentSchema, target: ComponentSchema): SchemaChange[] {
  const changes: SchemaChange[] = [];

  changes.push(...diffProps(base.name, base.props, target.props));
  changes.push(...diffVariants(base.name, base.variants, target.variants));
  changes.push(...diffSlots(base.name, base.slots, target.slots));
  changes.push(...diffStates(base.name, base.states, target.states));
  changes.push(...diffTokenRefs(base.name, base.tokenRefs, target.tokenRefs));

  // Component-level field changes
  if (base.description !== target.description) {
    changes.push(
      makeChange(base.name, "metadata", "modified", "description", base.description, target.description, "Changed description"),
    );
  }

  if (base.category !== target.category) {
    changes.push(
      makeChange(base.name, "metadata", "modified", "category", base.category, target.category, "Changed category"),
    );
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compare two schema arrays and return all detected changes.
 * Components are matched by name.
 */
export function diffSchemas(base: ComponentSchema[], target: ComponentSchema[]): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const baseMap = new Map(base.map((c) => [c.name, c]));
  const targetMap = new Map(target.map((c) => [c.name, c]));

  // Added components
  for (const [name, component] of targetMap) {
    if (!baseMap.has(name)) {
      changes.push(
        makeChange(name, "component", "added", "", undefined, component, `Added component "${name}"`),
      );
    }
  }

  // Removed components
  for (const [name, component] of baseMap) {
    if (!targetMap.has(name)) {
      changes.push(
        makeChange(name, "component", "removed", "", component, undefined, `Removed component "${name}"`),
      );
    }
  }

  // Modified components
  for (const [name, baseComponent] of baseMap) {
    const targetComponent = targetMap.get(name);
    if (!targetComponent) continue;
    changes.push(...diffComponent(baseComponent, targetComponent));
  }

  return changes;
}
