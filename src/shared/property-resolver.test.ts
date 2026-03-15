import { describe, it, expect } from "vitest";
import type { ComponentSchema } from "../schema/types.js";
import type { ComponentPropertyMap } from "./config.js";
import { resolveProperties, resolveAllProperties } from "./property-resolver.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFigmaButton(): ComponentSchema {
  return {
    name: "Button",
    props: [
      { name: "buttonLabel", type: "string", required: false, defaultValue: "Button" },
      { name: "showLabel", type: "boolean", required: false, defaultValue: true },
      { name: "rightIcon", type: "boolean", required: false, defaultValue: false },
      { name: "leftIcon", type: "boolean", required: false, defaultValue: false },
    ],
    variants: [
      { name: "state", values: ["default", "isHovered", "isFocusVisible", "isPressed", "isDisabled"] },
      { name: "action", values: ["primary", "secondary", "positive", "negative"] },
      { name: "size", values: ["lg", "md", "sm", "xl", "xs"] },
      { name: "variant", values: ["Solid", "Outlined", "Linked"] },
    ],
    slots: [],
    states: [],
    tokenRefs: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveProperties", () => {
  it("renames props", () => {
    const map: ComponentPropertyMap = {
      props: { "buttonLabel": "children" },
    };

    const result = resolveProperties(makeFigmaButton(), map);
    expect(result.props.find((p) => p.name === "children")).toBeDefined();
    expect(result.props.find((p) => p.name === "buttonLabel")).toBeUndefined();
  });

  it("ignores props set to null", () => {
    const map: ComponentPropertyMap = {
      props: { "showLabel": null },
    };

    const result = resolveProperties(makeFigmaButton(), map);
    expect(result.props.find((p) => p.name === "showLabel")).toBeUndefined();
  });

  it("ignores props in ignore list", () => {
    const map: ComponentPropertyMap = {
      ignore: ["showLabel", "rightIcon"],
    };

    const result = resolveProperties(makeFigmaButton(), map);
    expect(result.props.find((p) => p.name === "showLabel")).toBeUndefined();
    expect(result.props.find((p) => p.name === "rightIcon")).toBeUndefined();
    // Others remain
    expect(result.props.find((p) => p.name === "buttonLabel")).toBeDefined();
    expect(result.props.find((p) => p.name === "leftIcon")).toBeDefined();
  });

  it("converts variant to states via variantToState", () => {
    const map: ComponentPropertyMap = {
      variantToState: {
        "state": {
          "isDisabled": "disabled",
          "isPressed": "active",
          "isFocusVisible": "focused",
          "isHovered": null,  // ignore — Figma-only
          "default": null,    // ignore — not a state
        },
      },
    };

    const result = resolveProperties(makeFigmaButton(), map);

    // "state" variant should be removed
    expect(result.variants.find((v) => v.name === "state")).toBeUndefined();

    // States should be created
    expect(result.states.map((s) => s.name).sort()).toEqual(["active", "disabled", "focused"]);

    // Other variants untouched
    expect(result.variants.find((v) => v.name === "action")).toBeDefined();
    expect(result.variants.find((v) => v.name === "size")).toBeDefined();
  });

  it("renames variant via props map", () => {
    const map: ComponentPropertyMap = {
      props: { "variant": "appearance" },
    };

    const result = resolveProperties(makeFigmaButton(), map);
    expect(result.variants.find((v) => v.name === "appearance")).toBeDefined();
    expect(result.variants.find((v) => v.name === "variant")).toBeUndefined();
  });

  it("ignores variant via props map null", () => {
    const map: ComponentPropertyMap = {
      props: { "action": null },
    };

    const result = resolveProperties(makeFigmaButton(), map);
    expect(result.variants.find((v) => v.name === "action")).toBeUndefined();
  });

  it("combines multiple operations", () => {
    const map: ComponentPropertyMap = {
      props: {
        "buttonLabel": "children",
        "showLabel": null,
      },
      variantToState: {
        "state": {
          "isDisabled": "disabled",
          "isHovered": null,
          "isFocusVisible": null,
          "isPressed": null,
          "default": null,
        },
      },
      ignore: ["rightIcon"],
    };

    const result = resolveProperties(makeFigmaButton(), map);

    // Props
    expect(result.props.map((p) => p.name).sort()).toEqual(["children", "leftIcon"]);

    // Variants — "state" converted to states, others remain
    expect(result.variants.map((v) => v.name).sort()).toEqual(["action", "size", "variant"]);

    // States
    expect(result.states.map((s) => s.name)).toEqual(["disabled"]);
  });

  it("deduplicates states when both existing and extracted", () => {
    const schema = {
      ...makeFigmaButton(),
      states: [{ name: "disabled" }], // already exists
    };

    const map: ComponentPropertyMap = {
      variantToState: {
        "state": { "isDisabled": "disabled" },
      },
    };

    const result = resolveProperties(schema, map);
    const disabledStates = result.states.filter((s) => s.name === "disabled");
    expect(disabledStates).toHaveLength(1);
  });

  it("returns schema unchanged when map is empty", () => {
    const original = makeFigmaButton();
    const result = resolveProperties(original, {});

    expect(result.props).toEqual(original.props);
    expect(result.variants).toEqual(original.variants);
    expect(result.states).toEqual(original.states);
  });
});

describe("resolveAllProperties", () => {
  it("only applies to components with a mapping", () => {
    const schemas = [
      makeFigmaButton(),
      { name: "Input", props: [{ name: "placeholder", type: "string" as const, required: false }], variants: [], slots: [], states: [], tokenRefs: [] },
    ];

    const propertyMap = {
      "Button": { props: { "buttonLabel": "children" } },
    };

    const result = resolveAllProperties(schemas, propertyMap);

    // Button mapped
    expect(result[0].props.find((p) => p.name === "children")).toBeDefined();

    // Input untouched
    expect(result[1].props[0].name).toBe("placeholder");
  });

  it("returns schemas unchanged when no propertyMap", () => {
    const schemas = [makeFigmaButton()];
    const result = resolveAllProperties(schemas, undefined);
    expect(result).toEqual(schemas);
  });
});
