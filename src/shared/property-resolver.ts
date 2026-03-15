/**
 * Property resolver — maps Figma property names to code property names
 * and converts Figma variants to code states.
 *
 * Applied after the Figma reader produces a ComponentSchema, before diffing.
 */

import type { ComponentSchema, Prop, Variant, State } from "../schema/types.js";
import type { ComponentPropertyMap } from "./config.js";

/**
 * Apply property mapping to a single component schema.
 * Mutates nothing — returns a new schema.
 */
export function resolveProperties(
  schema: ComponentSchema,
  map: ComponentPropertyMap,
): ComponentSchema {
  const ignored = new Set(map.ignore ?? []);

  // Process props: rename or remove
  const props: Prop[] = [];
  for (const prop of schema.props) {
    if (ignored.has(prop.name)) continue;

    if (map.props?.[prop.name] === null) continue; // explicitly ignored

    const newName = map.props?.[prop.name];
    props.push(newName ? { ...prop, name: newName } : prop);
  }

  // Process variants: rename, convert to states, or keep
  const variants: Variant[] = [];
  const extraStates: State[] = [];

  for (const variant of schema.variants) {
    if (ignored.has(variant.name)) continue;

    // Check if this variant should become states
    const stateMap = map.variantToState?.[variant.name];
    if (stateMap) {
      // Convert variant values to boolean states
      for (const [figmaValue, codeName] of Object.entries(stateMap)) {
        if (codeName === null) continue; // ignore this value
        extraStates.push({ name: codeName });
      }
      continue; // don't add as variant
    }

    // Check if variant name should be renamed
    if (map.props?.[variant.name] === null) continue; // explicitly ignored
    const newName = map.props?.[variant.name];
    variants.push(newName ? { ...variant, name: newName } : variant);
  }

  // Process slots: rename or remove
  const slots = schema.slots
    .filter((s) => !ignored.has(s.name))
    .filter((s) => map.props?.[s.name] !== null)
    .map((s) => {
      const newName = map.props?.[s.name];
      return newName ? { ...s, name: newName } : s;
    });

  // Merge existing states with extracted states, deduplicate
  const stateNames = new Set(schema.states.map((s) => s.name));
  const states = [...schema.states];
  for (const state of extraStates) {
    if (!stateNames.has(state.name)) {
      states.push(state);
      stateNames.add(state.name);
    }
  }

  return {
    ...schema,
    props,
    variants,
    slots,
    states,
  };
}

/**
 * Apply property mapping to an array of schemas.
 * Only applies to components that have a mapping configured.
 */
export function resolveAllProperties(
  schemas: ComponentSchema[],
  propertyMap?: Record<string, ComponentPropertyMap>,
): ComponentSchema[] {
  if (!propertyMap) return schemas;

  return schemas.map((schema) => {
    const map = propertyMap[schema.name];
    if (!map) return schema;
    return resolveProperties(schema, map);
  });
}
