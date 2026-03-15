import { describe, it, expect } from "vitest";
import type { ComponentSchema } from "../schema/types.js";
import { mergeSchemas } from "./merge.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeButton(overrides: Partial<ComponentSchema> = {}): ComponentSchema {
  return {
    name: "Button",
    description: "A button",
    category: "inputs",
    props: [
      { name: "label", type: "string", required: true },
      { name: "disabled", type: "boolean", required: false, defaultValue: false },
    ],
    variants: [
      { name: "size", values: ["sm", "md", "lg"], defaultValue: "md" },
    ],
    slots: [],
    states: [{ name: "hover" }],
    tokenRefs: [{ path: "color.primary", property: "background-color" }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mergeSchemas", () => {
  it("returns empty when no changes on either side", () => {
    const base = [makeButton()];
    const figma = [makeButton()];
    const code = [makeButton()];
    const result = mergeSchemas(base, figma, code);

    expect(result.merged).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it("takes Figma-only changes", () => {
    const base = [makeButton()];
    const figma = [makeButton({
      variants: [{ name: "size", values: ["sm", "md", "lg", "xl"], defaultValue: "md" }],
    })];
    const code = [makeButton()];
    const result = mergeSchemas(base, figma, code);

    expect(result.merged.length).toBeGreaterThan(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.merged[0].description).toContain("xl");
  });

  it("takes code-only changes", () => {
    const base = [makeButton()];
    const figma = [makeButton()];
    const code = [makeButton({
      props: [
        ...makeButton().props,
        { name: "loading", type: "boolean", required: false },
      ],
    })];
    const result = mergeSchemas(base, figma, code);

    expect(result.merged.length).toBeGreaterThan(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it("merges non-conflicting changes from both sides", () => {
    const base = [makeButton()];
    // Figma adds a variant value
    const figma = [makeButton({
      variants: [{ name: "size", values: ["sm", "md", "lg", "xl"], defaultValue: "md" }],
    })];
    // Code adds a prop
    const code = [makeButton({
      props: [
        ...makeButton().props,
        { name: "loading", type: "boolean", required: false },
      ],
    })];
    const result = mergeSchemas(base, figma, code);

    expect(result.merged.length).toBe(2);
    expect(result.conflicts).toHaveLength(0);
  });

  it("no conflict when both sides make the same change", () => {
    const base = [makeButton()];
    const updated = makeButton({ description: "Updated by both" });
    const result = mergeSchemas(base, [updated], [updated]);

    expect(result.conflicts).toHaveLength(0);
    expect(result.merged.length).toBe(1);
  });

  it("detects conflict when both sides change the same field differently", () => {
    const base = [makeButton()];
    const figma = [makeButton({ description: "Figma version" })];
    const code = [makeButton({ description: "Code version" })];
    const result = mergeSchemas(base, figma, code);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].fieldPath).toBe("description");
    expect(result.conflicts[0].figma).toBe("Figma version");
    expect(result.conflicts[0].code).toBe("Code version");
    expect(result.conflicts[0].base).toBe("A button");
  });

  it("detects conflict on variant value changes", () => {
    const base = [makeButton()];
    const figma = [makeButton({
      variants: [{ name: "size", values: ["sm", "md", "lg", "xl"], defaultValue: "md" }],
    })];
    const code = [makeButton({
      variants: [{ name: "size", values: ["sm", "md", "lg", "2xl"], defaultValue: "md" }],
    })];
    const result = mergeSchemas(base, figma, code);

    // Both changed variants.size.values but to different things
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it("handles added component on one side", () => {
    const base = [makeButton()];
    const figma = [makeButton(), {
      name: "Badge",
      category: "feedback",
      props: [],
      variants: [],
      slots: [],
      states: [],
      tokenRefs: [],
    } satisfies ComponentSchema];
    const code = [makeButton()];
    const result = mergeSchemas(base, figma, code);

    expect(result.merged.length).toBe(1);
    expect(result.merged[0].componentName).toBe("Badge");
    expect(result.merged[0].changeType).toBe("added");
  });

  it("handles removed component on one side", () => {
    const base = [makeButton(), {
      name: "Badge",
      category: "feedback",
      props: [],
      variants: [],
      slots: [],
      states: [],
      tokenRefs: [],
    } satisfies ComponentSchema];
    const figma = [makeButton()];
    const code = [makeButton(), {
      name: "Badge",
      category: "feedback",
      props: [],
      variants: [],
      slots: [],
      states: [],
      tokenRefs: [],
    } satisfies ComponentSchema];
    const result = mergeSchemas(base, figma, code);

    expect(result.merged.length).toBe(1);
    expect(result.merged[0].componentName).toBe("Badge");
    expect(result.merged[0].changeType).toBe("removed");
  });
});
