import { describe, it, expect } from "vitest";
import type { ComponentSchema } from "../schema/types.js";
import { diffSchemas } from "./differ.js";

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
      { name: "variant", values: ["primary", "secondary"], defaultValue: "primary" },
    ],
    slots: [
      { name: "icon", required: false, allowedComponents: ["Icon"] },
    ],
    states: [
      { name: "hover" },
      { name: "disabled" },
    ],
    tokenRefs: [
      { path: "color.primary", property: "background-color" },
    ],
    ...overrides,
  };
}

function makeCard(overrides: Partial<ComponentSchema> = {}): ComponentSchema {
  return {
    name: "Card",
    category: "layout",
    props: [],
    variants: [],
    slots: [{ name: "children", required: true }],
    states: [],
    tokenRefs: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("diffSchemas", () => {
  it("returns empty array for identical schemas", () => {
    const base = [makeButton()];
    const target = [makeButton()];
    expect(diffSchemas(base, target)).toEqual([]);
  });

  it("detects added component", () => {
    const base = [makeButton()];
    const target = [makeButton(), makeCard()];
    const changes = diffSchemas(base, target);

    expect(changes).toHaveLength(1);
    expect(changes[0].componentName).toBe("Card");
    expect(changes[0].changeType).toBe("added");
    expect(changes[0].target).toBe("component");
    expect(changes[0].severity).toBe("additive");
  });

  it("detects removed component", () => {
    const base = [makeButton(), makeCard()];
    const target = [makeButton()];
    const changes = diffSchemas(base, target);

    expect(changes).toHaveLength(1);
    expect(changes[0].componentName).toBe("Card");
    expect(changes[0].changeType).toBe("removed");
    expect(changes[0].severity).toBe("breaking");
  });

  // -- Prop changes --

  it("detects added prop", () => {
    const base = [makeButton()];
    const target = [makeButton({
      props: [
        ...makeButton().props,
        { name: "loading", type: "boolean", required: false },
      ],
    })];
    const changes = diffSchemas(base, target);

    const added = changes.find((c) => c.fieldPath === "props.loading");
    expect(added).toBeDefined();
    expect(added!.changeType).toBe("added");
    expect(added!.severity).toBe("additive");
  });

  it("detects removed prop", () => {
    const base = [makeButton()];
    const target = [makeButton({
      props: [{ name: "label", type: "string", required: true }],
    })];
    const changes = diffSchemas(base, target);

    const removed = changes.find((c) => c.fieldPath === "props.disabled");
    expect(removed).toBeDefined();
    expect(removed!.changeType).toBe("removed");
    expect(removed!.severity).toBe("breaking");
  });

  it("detects prop type change", () => {
    const base = [makeButton()];
    const target = [makeButton({
      props: [
        { name: "label", type: "node", required: true },
        { name: "disabled", type: "boolean", required: false, defaultValue: false },
      ],
    })];
    const changes = diffSchemas(base, target);

    const typeChange = changes.find((c) => c.fieldPath === "props.label.type");
    expect(typeChange).toBeDefined();
    expect(typeChange!.before).toBe("string");
    expect(typeChange!.after).toBe("node");
    expect(typeChange!.severity).toBe("breaking");
  });

  it("detects prop required change (false → true = breaking)", () => {
    const base = [makeButton()];
    const target = [makeButton({
      props: [
        { name: "label", type: "string", required: true },
        { name: "disabled", type: "boolean", required: true, defaultValue: false },
      ],
    })];
    const changes = diffSchemas(base, target);

    const reqChange = changes.find((c) => c.fieldPath === "props.disabled.required");
    expect(reqChange).toBeDefined();
    expect(reqChange!.severity).toBe("breaking");
  });

  it("detects prop required change (true → false = additive)", () => {
    const base = [makeButton()];
    const target = [makeButton({
      props: [
        { name: "label", type: "string", required: false },
        { name: "disabled", type: "boolean", required: false, defaultValue: false },
      ],
    })];
    const changes = diffSchemas(base, target);

    const reqChange = changes.find((c) => c.fieldPath === "props.label.required");
    expect(reqChange).toBeDefined();
    expect(reqChange!.severity).toBe("additive");
  });

  it("detects default value change", () => {
    const base = [makeButton()];
    const target = [makeButton({
      props: [
        { name: "label", type: "string", required: true },
        { name: "disabled", type: "boolean", required: false, defaultValue: true },
      ],
    })];
    const changes = diffSchemas(base, target);

    const defChange = changes.find((c) => c.fieldPath === "props.disabled.defaultValue");
    expect(defChange).toBeDefined();
    expect(defChange!.before).toBe(false);
    expect(defChange!.after).toBe(true);
  });

  // -- Variant changes --

  it("detects added variant", () => {
    const base = [makeButton()];
    const target = [makeButton({
      variants: [
        ...makeButton().variants,
        { name: "color", values: ["red", "blue", "green"] },
      ],
    })];
    const changes = diffSchemas(base, target);

    const added = changes.find((c) => c.fieldPath === "variants.color");
    expect(added).toBeDefined();
    expect(added!.changeType).toBe("added");
  });

  it("detects added variant value", () => {
    const base = [makeButton()];
    const target = [makeButton({
      variants: [
        { name: "size", values: ["sm", "md", "lg", "xl"], defaultValue: "md" },
        { name: "variant", values: ["primary", "secondary"], defaultValue: "primary" },
      ],
    })];
    const changes = diffSchemas(base, target);

    const valChange = changes.find((c) => c.fieldPath === "variants.size.values");
    expect(valChange).toBeDefined();
    expect(valChange!.description).toContain("xl");
    expect(valChange!.severity).toBe("additive");
  });

  it("detects removed variant value (breaking)", () => {
    const base = [makeButton()];
    const target = [makeButton({
      variants: [
        { name: "size", values: ["sm", "md"], defaultValue: "md" },
        { name: "variant", values: ["primary", "secondary"], defaultValue: "primary" },
      ],
    })];
    const changes = diffSchemas(base, target);

    const valChange = changes.find((c) => c.description?.includes("Removed variant"));
    expect(valChange).toBeDefined();
    expect(valChange!.severity).toBe("breaking");
  });

  // -- Slot changes --

  it("detects added slot", () => {
    const base = [makeButton()];
    const target = [makeButton({
      slots: [
        ...makeButton().slots,
        { name: "badge", required: false },
      ],
    })];
    const changes = diffSchemas(base, target);

    const added = changes.find((c) => c.fieldPath === "slots.badge");
    expect(added).toBeDefined();
    expect(added!.changeType).toBe("added");
  });

  it("detects removed slot (breaking)", () => {
    const base = [makeButton()];
    const target = [makeButton({ slots: [] })];
    const changes = diffSchemas(base, target);

    const removed = changes.find((c) => c.fieldPath === "slots.icon");
    expect(removed).toBeDefined();
    expect(removed!.severity).toBe("breaking");
  });

  // -- State changes --

  it("detects added state", () => {
    const base = [makeButton()];
    const target = [makeButton({
      states: [...makeButton().states, { name: "loading" }],
    })];
    const changes = diffSchemas(base, target);

    const added = changes.find((c) => c.fieldPath === "states.loading");
    expect(added).toBeDefined();
    expect(added!.changeType).toBe("added");
  });

  it("detects removed state", () => {
    const base = [makeButton()];
    const target = [makeButton({ states: [{ name: "hover" }] })];
    const changes = diffSchemas(base, target);

    const removed = changes.find((c) => c.fieldPath === "states.disabled");
    expect(removed).toBeDefined();
    expect(removed!.changeType).toBe("removed");
  });

  // -- Token ref changes --

  it("detects added token ref", () => {
    const base = [makeButton()];
    const target = [makeButton({
      tokenRefs: [
        ...makeButton().tokenRefs,
        { path: "spacing.md", property: "padding" },
      ],
    })];
    const changes = diffSchemas(base, target);

    const added = changes.find((c) => c.target === "tokenRef" && c.changeType === "added");
    expect(added).toBeDefined();
  });

  it("detects removed token ref", () => {
    const base = [makeButton()];
    const target = [makeButton({ tokenRefs: [] })];
    const changes = diffSchemas(base, target);

    const removed = changes.find((c) => c.target === "tokenRef" && c.changeType === "removed");
    expect(removed).toBeDefined();
  });

  // -- Metadata changes --

  it("detects description change", () => {
    const base = [makeButton()];
    const target = [makeButton({ description: "Updated description" })];
    const changes = diffSchemas(base, target);

    const descChange = changes.find((c) => c.fieldPath === "description");
    expect(descChange).toBeDefined();
    expect(descChange!.severity).toBe("additive");
  });

  it("detects category change", () => {
    const base = [makeButton()];
    const target = [makeButton({ category: "actions" })];
    const changes = diffSchemas(base, target);

    const catChange = changes.find((c) => c.fieldPath === "category");
    expect(catChange).toBeDefined();
  });

  // -- Multiple components --

  it("handles changes across multiple components", () => {
    const base = [makeButton(), makeCard()];
    const target = [
      makeButton({
        props: [
          ...makeButton().props,
          { name: "loading", type: "boolean", required: false },
        ],
      }),
      makeCard({
        slots: [
          { name: "children", required: true },
          { name: "header", required: false },
        ],
      }),
    ];
    const changes = diffSchemas(base, target);

    const buttonChanges = changes.filter((c) => c.componentName === "Button");
    const cardChanges = changes.filter((c) => c.componentName === "Card");
    expect(buttonChanges.length).toBeGreaterThan(0);
    expect(cardChanges.length).toBeGreaterThan(0);
  });
});
