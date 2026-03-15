import { describe, it, expect } from "vitest";
import type {
  ComponentSchema,
  ComponentSchemaFile,
} from "./types.js";
import { serializeSchema, deserializeSchema } from "./serialize.js";
import { validateSchema, validateComponent } from "./validate.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const buttonComponent: ComponentSchema = {
  name: "Button",
  description: "Primary action trigger",
  category: "inputs",
  props: [
    {
      name: "label",
      type: "string",
      required: true,
      description: "Button text content",
    },
    {
      name: "disabled",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
    {
      name: "onClick",
      type: "callback",
      required: false,
      rawType: "() => void",
    },
  ],
  variants: [
    {
      name: "size",
      values: ["sm", "md", "lg"],
      defaultValue: "md",
    },
    {
      name: "variant",
      values: ["primary", "secondary", "ghost"],
      defaultValue: "primary",
    },
  ],
  slots: [
    {
      name: "icon",
      description: "Leading icon",
      allowedComponents: ["Icon"],
      required: false,
    },
  ],
  states: [
    { name: "hover" },
    { name: "focus" },
    { name: "disabled" },
    { name: "loading" },
  ],
  tokenRefs: [
    {
      path: "color.primary.500",
      property: "background-color",
    },
    {
      path: "color.primary.600",
      property: "background-color",
      condition: "state:hover",
    },
    {
      path: "spacing.md",
      property: "padding",
    },
  ],
  codePath: "src/components/Button.tsx",
  figmaNodeId: "1:234",
};

const cardComponent: ComponentSchema = {
  name: "Card",
  description: "Content container with optional header and footer",
  category: "layout",
  props: [
    {
      name: "elevated",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
  ],
  variants: [
    {
      name: "padding",
      values: ["none", "sm", "md", "lg"],
      defaultValue: "md",
    },
  ],
  slots: [
    { name: "children", required: true },
    { name: "header", required: false },
    { name: "footer", required: false },
  ],
  states: [],
  tokenRefs: [
    { path: "color.surface.card", property: "background-color" },
    { path: "shadow.md", property: "box-shadow", condition: "prop:elevated=true" },
  ],
};

function makeSchemaFile(
  components: ComponentSchema[] = [buttonComponent],
): ComponentSchemaFile {
  return {
    version: "1.0",
    components,
    lastModified: "2026-03-15T12:00:00Z",
    source: "manual",
  };
}

// ---------------------------------------------------------------------------
// Serialization tests
// ---------------------------------------------------------------------------

describe("serialize / deserialize", () => {
  it("round-trips a schema file", () => {
    const file = makeSchemaFile([buttonComponent, cardComponent]);
    const json = serializeSchema(file);
    const parsed = deserializeSchema(json);

    expect(parsed.version).toBe("1.0");
    expect(parsed.components).toHaveLength(2);
    expect(parsed.components[0].name).toBe("Button");
    expect(parsed.components[1].name).toBe("Card");
  });

  it("produces deterministic output (sorted keys)", () => {
    const file = makeSchemaFile();
    const json1 = serializeSchema(file);
    const json2 = serializeSchema(file);
    expect(json1).toBe(json2);
  });

  it("preserves all fields through round-trip", () => {
    const file = makeSchemaFile();
    const json = serializeSchema(file);
    const parsed = deserializeSchema(json);

    const btn = parsed.components[0];
    expect(btn.props).toHaveLength(3);
    expect(btn.variants).toHaveLength(2);
    expect(btn.slots).toHaveLength(1);
    expect(btn.states).toHaveLength(4);
    expect(btn.tokenRefs).toHaveLength(3);
    expect(btn.codePath).toBe("src/components/Button.tsx");
    expect(btn.figmaNodeId).toBe("1:234");
  });

  it("preserves metadata through round-trip", () => {
    const withMeta: ComponentSchema = {
      ...buttonComponent,
      metadata: { figmaUrl: "https://figma.com/file/abc" },
      props: [
        {
          name: "test",
          type: "string",
          required: false,
          metadata: { deprecated: true },
        },
      ],
    };
    const file = makeSchemaFile([withMeta]);
    const json = serializeSchema(file);
    const parsed = deserializeSchema(json);

    expect(parsed.components[0].metadata).toEqual({
      figmaUrl: "https://figma.com/file/abc",
    });
    expect(parsed.components[0].props[0].metadata).toEqual({
      deprecated: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

describe("validateSchema", () => {
  it("accepts a valid schema file", () => {
    const file = makeSchemaFile([buttonComponent, cardComponent]);
    const result = validateSchema(file);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects missing version", () => {
    const file = { components: [], lastModified: "2026-03-15T12:00:00Z", source: "manual" };
    const result = validateSchema(file);
    expect(result.success).toBe(false);
  });

  it("rejects invalid version", () => {
    const file = makeSchemaFile();
    (file as unknown as Record<string, unknown>).version = "2.0";
    const result = validateSchema(file);
    expect(result.success).toBe(false);
  });

  it("rejects invalid source", () => {
    const file = makeSchemaFile();
    (file as unknown as Record<string, unknown>).source = "unknown";
    const result = validateSchema(file);
    expect(result.success).toBe(false);
  });

  it("rejects component with empty name", () => {
    const bad: ComponentSchema = {
      ...buttonComponent,
      name: "",
    };
    const result = validateSchema(makeSchemaFile([bad]));
    expect(result.success).toBe(false);
  });

  it("rejects enum prop without values", () => {
    const bad: ComponentSchema = {
      ...buttonComponent,
      props: [{ name: "color", type: "enum", required: false }],
    };
    const result = validateSchema(makeSchemaFile([bad]));
    expect(result.success).toBe(false);
  });

  it("rejects variant with defaultValue not in values", () => {
    const bad: ComponentSchema = {
      ...buttonComponent,
      variants: [
        { name: "size", values: ["sm", "md", "lg"], defaultValue: "xl" },
      ],
    };
    const result = validateSchema(makeSchemaFile([bad]));
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain("xl");
  });

  it("rejects duplicate prop names", () => {
    const bad: ComponentSchema = {
      ...buttonComponent,
      props: [
        { name: "label", type: "string", required: true },
        { name: "label", type: "number", required: false },
      ],
    };
    const result = validateSchema(makeSchemaFile([bad]));
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain("Duplicate");
  });

  it("rejects variant name that conflicts with prop name", () => {
    const bad: ComponentSchema = {
      ...buttonComponent,
      props: [{ name: "size", type: "string", required: false }],
      variants: [{ name: "size", values: ["sm", "md"] }],
    };
    const result = validateSchema(makeSchemaFile([bad]));
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain("Duplicate");
  });

  it("rejects invalid lastModified", () => {
    const file = makeSchemaFile();
    file.lastModified = "not-a-date";
    const result = validateSchema(file);
    expect(result.success).toBe(false);
  });
});

describe("validateComponent", () => {
  it("accepts a valid component", () => {
    const result = validateComponent(buttonComponent);
    expect(result.success).toBe(true);
  });

  it("rejects a component missing required fields", () => {
    const result = validateComponent({ name: "Bad" });
    expect(result.success).toBe(false);
  });
});
