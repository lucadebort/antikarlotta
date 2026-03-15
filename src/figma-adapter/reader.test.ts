import { describe, it, expect } from "vitest";
import type { FigmaComponentSet, FigmaComponent } from "./types.js";
import { figmaComponentSetToSchema, figmaComponentToSchema, figmaToSchemas } from "./reader.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const buttonComponentSet: FigmaComponentSet = {
  key: "btn-key",
  name: "Button",
  description: "Primary action trigger",
  nodeId: "1:100",
  componentPropertyDefinitions: {
    "Size": {
      type: "VARIANT",
      defaultValue: "md",
      variantOptions: ["sm", "md", "lg"],
    },
    "Variant": {
      type: "VARIANT",
      defaultValue: "primary",
      variantOptions: ["primary", "secondary", "ghost"],
    },
    "Label": {
      type: "TEXT",
      defaultValue: "Button",
    },
    "Disabled": {
      type: "BOOLEAN",
      defaultValue: false,
    },
    "Loading": {
      type: "BOOLEAN",
      defaultValue: false,
    },
    "Has Icon": {
      type: "BOOLEAN",
      defaultValue: true,
    },
    "Icon": {
      type: "INSTANCE_SWAP",
      defaultValue: "",
      preferredValues: [
        { type: "COMPONENT", key: "icon-arrow" },
        { type: "COMPONENT", key: "icon-check" },
      ],
    },
  },
  variantComponents: [],
};

const dividerComponent: FigmaComponent = {
  key: "div-key",
  name: "Divider",
  description: "Horizontal separator",
  nodeId: "2:200",
  componentPropertyDefinitions: {
    "Orientation": {
      type: "VARIANT",
      defaultValue: "horizontal",
      variantOptions: ["horizontal", "vertical"],
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("figmaComponentSetToSchema", () => {
  it("extracts component set name and description", () => {
    const schema = figmaComponentSetToSchema(buttonComponentSet);
    expect(schema.name).toBe("Button");
    expect(schema.description).toBe("Primary action trigger");
    expect(schema.figmaNodeId).toBe("1:100");
  });

  it("extracts variant properties", () => {
    const schema = figmaComponentSetToSchema(buttonComponentSet);
    expect(schema.variants).toHaveLength(2);

    const size = schema.variants.find((v) => v.name === "Size");
    expect(size).toBeDefined();
    expect(size!.values).toEqual(["sm", "md", "lg"]);
    expect(size!.defaultValue).toBe("md");

    const variant = schema.variants.find((v) => v.name === "Variant");
    expect(variant).toBeDefined();
    expect(variant!.values).toEqual(["primary", "secondary", "ghost"]);
  });

  it("extracts text properties as string props", () => {
    const schema = figmaComponentSetToSchema(buttonComponentSet);
    const label = schema.props.find((p) => p.name === "Label");
    expect(label).toBeDefined();
    expect(label!.type).toBe("string");
    expect(label!.defaultValue).toBe("Button");
  });

  it("extracts boolean state props as states", () => {
    const schema = figmaComponentSetToSchema(buttonComponentSet);
    expect(schema.states.map((s) => s.name).sort()).toEqual(["disabled", "loading"]);
  });

  it("extracts non-state boolean props as props", () => {
    const schema = figmaComponentSetToSchema(buttonComponentSet);
    const hasIcon = schema.props.find((p) => p.name === "Has Icon");
    expect(hasIcon).toBeDefined();
    expect(hasIcon!.type).toBe("boolean");
    expect(hasIcon!.defaultValue).toBe(true);
  });

  it("extracts instance swap properties as slots", () => {
    const schema = figmaComponentSetToSchema(buttonComponentSet);
    expect(schema.slots).toHaveLength(1);
    expect(schema.slots[0].name).toBe("Icon");
    expect(schema.slots[0].allowedComponents).toEqual(["icon-arrow", "icon-check"]);
  });
});

describe("figmaComponentToSchema", () => {
  it("extracts standalone component", () => {
    const schema = figmaComponentToSchema(dividerComponent);
    expect(schema.name).toBe("Divider");
    expect(schema.description).toBe("Horizontal separator");
    expect(schema.figmaNodeId).toBe("2:200");
    // Standalone components don't have VARIANT type in Figma REST API
    // This tests that the reader handles it gracefully
  });
});

describe("figmaToSchemas", () => {
  it("combines component sets and standalone components", () => {
    const schemas = figmaToSchemas([buttonComponentSet], [dividerComponent]);
    expect(schemas).toHaveLength(2);
    expect(schemas.map((s) => s.name).sort()).toEqual(["Button", "Divider"]);
  });

  it("skips components that belong to a component set", () => {
    const variantComponent: FigmaComponent = {
      key: "variant-key",
      name: "Button/Size=sm",
      description: "",
      nodeId: "3:300",
      componentSetId: "btn-key",
    };
    const schemas = figmaToSchemas([buttonComponentSet], [variantComponent, dividerComponent]);
    // Should only have Button (from set) and Divider (standalone)
    expect(schemas).toHaveLength(2);
    expect(schemas.map((s) => s.name).sort()).toEqual(["Button", "Divider"]);
  });

  it("handles empty inputs", () => {
    const schemas = figmaToSchemas([], []);
    expect(schemas).toHaveLength(0);
  });
});
