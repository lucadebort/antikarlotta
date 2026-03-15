import { describe, it, expect } from "vitest";
import type { ComponentSchema } from "../schema/types.js";
import type { SchemaChange } from "../diff-engine/types.js";
import { applySchemaChangesToSource } from "./writer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChange(overrides: Partial<SchemaChange>): SchemaChange {
  return {
    componentName: "Button",
    target: "prop",
    changeType: "added",
    fieldPath: "props.test",
    severity: "additive",
    description: "test change",
    ...overrides,
  };
}

const baseButtonSource = `
interface ButtonProps {
  label: string;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}
export function Button({ label, disabled, variant }: ButtonProps) {
  return <button disabled={disabled}>{label}</button>;
}
`;

const baseButtonSchema: ComponentSchema = {
  name: "Button",
  props: [
    { name: "label", type: "string", required: true },
    { name: "disabled", type: "boolean", required: false },
  ],
  variants: [
    { name: "variant", values: ["primary", "secondary"], defaultValue: "primary" },
  ],
  slots: [],
  states: [],
  tokenRefs: [],
};

// ---------------------------------------------------------------------------
// Tests: Adding props
// ---------------------------------------------------------------------------

describe("applySchemaChangesToSource — add prop", () => {
  it("adds a string prop to the interface", () => {
    const schema: ComponentSchema = {
      ...baseButtonSchema,
      props: [
        ...baseButtonSchema.props,
        { name: "tooltip", type: "string", required: false, description: "Tooltip text" },
      ],
    };

    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "added",
          fieldPath: "props.tooltip",
          after: { name: "tooltip", type: "string", required: false },
          description: 'Added prop "tooltip"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    expect(result.newContent).toContain("tooltip?: string");
    // Also added to destructuring
    expect(result.newContent).toMatch(/\{[^}]*tooltip[^}]*\}/);
  });

  it("adds a required number prop", () => {
    const schema: ComponentSchema = {
      ...baseButtonSchema,
      props: [
        ...baseButtonSchema.props,
        { name: "count", type: "number", required: true },
      ],
    };

    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "added",
          fieldPath: "props.count",
          after: { name: "count", type: "number", required: true },
          description: 'Added prop "count"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    expect(result.newContent).toContain("count: number");
    // Should NOT have question mark (required)
    expect(result.newContent).not.toContain("count?: number");
    // Also added to destructuring
    expect(result.newContent).toMatch(/\{[^}]*count[^}]*\}/);
  });

  it("adds a boolean prop", () => {
    const schema: ComponentSchema = {
      ...baseButtonSchema,
      props: [
        ...baseButtonSchema.props,
        { name: "fullWidth", type: "boolean", required: false },
      ],
    };

    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "added",
          fieldPath: "props.fullWidth",
          description: 'Added prop "fullWidth"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    expect(result.newContent).toContain("fullWidth?: boolean");
  });

  it("skips adding a prop that already exists", () => {
    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: baseButtonSchema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "added",
          fieldPath: "props.label",
          description: 'Added prop "label"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(0);
    expect(result.skippedChanges).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: Removing props
// ---------------------------------------------------------------------------

describe("applySchemaChangesToSource — remove prop", () => {
  it("removes a prop from the interface", () => {
    const schema: ComponentSchema = {
      ...baseButtonSchema,
      props: [{ name: "label", type: "string", required: true }],
    };

    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "removed",
          fieldPath: "props.disabled",
          before: { name: "disabled", type: "boolean", required: false },
          description: 'Removed prop "disabled"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    // Removed from interface
    expect(result.newContent).not.toMatch(/disabled\??: boolean/);
    // Removed from destructuring (but may still be in JSX — developer cleans that up)
    expect(result.newContent).toMatch(/\{\s*label,\s*variant\s*\}/);
  });

  it("skips removing a prop that doesn't exist", () => {
    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: baseButtonSchema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "removed",
          fieldPath: "props.nonexistent",
          description: 'Removed prop "nonexistent"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(0);
    expect(result.skippedChanges).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: Modifying props
// ---------------------------------------------------------------------------

describe("applySchemaChangesToSource — modify prop", () => {
  it("changes prop type", () => {
    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: baseButtonSchema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "modified",
          fieldPath: "props.label.type",
          before: "string",
          after: "number",
          description: 'Changed prop "label" type',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    expect(result.newContent).toContain("label: number");
    expect(result.newContent).not.toContain("label: string");
  });

  it("changes prop from required to optional", () => {
    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: baseButtonSchema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "modified",
          fieldPath: "props.label.required",
          before: true,
          after: false,
          description: 'Changed prop "label" required',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    expect(result.newContent).toContain("label?: string");
  });

  it("changes prop from optional to required", () => {
    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: baseButtonSchema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "modified",
          fieldPath: "props.disabled.required",
          before: false,
          after: true,
          description: 'Changed prop "disabled" required',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    expect(result.newContent).toContain("disabled: boolean");
    expect(result.newContent).not.toContain("disabled?");
  });
});

// ---------------------------------------------------------------------------
// Tests: Variants
// ---------------------------------------------------------------------------

describe("applySchemaChangesToSource — variants", () => {
  it("adds a new variant", () => {
    const schema: ComponentSchema = {
      ...baseButtonSchema,
      variants: [
        ...baseButtonSchema.variants,
        { name: "size", values: ["sm", "md", "lg"] },
      ],
    };

    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          target: "variant",
          changeType: "added",
          fieldPath: "variants.size",
          description: 'Added variant "size"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    expect(result.newContent).toContain('"sm" | "md" | "lg"');
  });

  it("updates variant values (adds new value)", () => {
    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: baseButtonSchema,
      changes: [
        makeChange({
          target: "variant",
          changeType: "modified",
          fieldPath: "variants.variant.values",
          before: ["primary", "secondary"],
          after: ["primary", "secondary", "ghost"],
          description: 'Added variant "variant" values: ghost',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    expect(result.newContent).toContain('"primary" | "secondary" | "ghost"');
  });

  it("removes a variant", () => {
    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: baseButtonSchema,
      changes: [
        makeChange({
          target: "variant",
          changeType: "removed",
          fieldPath: "variants.variant",
          description: 'Removed variant "variant"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    expect(result.newContent).not.toContain("variant?");
  });
});

// ---------------------------------------------------------------------------
// Tests: Slots
// ---------------------------------------------------------------------------

describe("applySchemaChangesToSource — slots", () => {
  it("adds a slot (ReactNode prop)", () => {
    const schema: ComponentSchema = {
      ...baseButtonSchema,
      slots: [{ name: "icon", required: false, description: "Leading icon" }],
    };

    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          target: "slot",
          changeType: "added",
          fieldPath: "slots.icon",
          description: 'Added slot "icon"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    expect(result.newContent).toContain("icon?: ReactNode");
    // Should add ReactNode import
    expect(result.newContent).toContain("ReactNode");
  });

  it("removes a slot", () => {
    const sourceWithSlot = `
import { ReactNode } from "react";
interface ButtonProps {
  label: string;
  icon?: ReactNode;
}
export function Button({ label, icon }: ButtonProps) {
  return <button>{icon}{label}</button>;
}
`;

    const result = applySchemaChangesToSource(sourceWithSlot, {
      targetSchema: baseButtonSchema,
      changes: [
        makeChange({
          target: "slot",
          changeType: "removed",
          fieldPath: "slots.icon",
          description: 'Removed slot "icon"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    expect(result.newContent).not.toContain("icon?: ReactNode");
  });
});

// ---------------------------------------------------------------------------
// Tests: States
// ---------------------------------------------------------------------------

describe("applySchemaChangesToSource — states", () => {
  it("adds a state as a boolean prop", () => {
    const schema: ComponentSchema = {
      ...baseButtonSchema,
      states: [{ name: "loading", description: "Loading state" }],
    };

    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          target: "state",
          changeType: "added",
          fieldPath: "states.loading",
          description: 'Added state "loading"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    expect(result.newContent).toContain("loading?: boolean");
  });

  it("removes a state", () => {
    const sourceWithState = `
interface ButtonProps {
  label: string;
  loading?: boolean;
}
export function Button({ label, loading }: ButtonProps) {
  return <button>{label}</button>;
}
`;

    const result = applySchemaChangesToSource(sourceWithState, {
      targetSchema: baseButtonSchema,
      changes: [
        makeChange({
          target: "state",
          changeType: "removed",
          fieldPath: "states.loading",
          description: 'Removed state "loading"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    // Removed from interface
    expect(result.newContent).not.toMatch(/loading\??: boolean/);
    // Removed from destructuring
    expect(result.newContent).toMatch(/\{\s*label\s*\}/);
  });
});

// ---------------------------------------------------------------------------
// Tests: Multiple changes
// ---------------------------------------------------------------------------

describe("applySchemaChangesToSource — multiple changes", () => {
  it("applies multiple changes in one pass", () => {
    const schema: ComponentSchema = {
      ...baseButtonSchema,
      props: [
        ...baseButtonSchema.props,
        { name: "tooltip", type: "string", required: false },
      ],
      variants: [
        { name: "variant", values: ["primary", "secondary", "ghost", "danger"] },
        { name: "size", values: ["sm", "md", "lg"] },
      ],
      slots: [{ name: "icon", required: false }],
      states: [{ name: "loading" }],
    };

    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "added",
          fieldPath: "props.tooltip",
          description: 'Added prop "tooltip"',
        }),
        makeChange({
          target: "variant",
          changeType: "modified",
          fieldPath: "variants.variant.values",
          before: ["primary", "secondary"],
          after: ["primary", "secondary", "ghost", "danger"],
          description: 'Added variant values: ghost, danger',
        }),
        makeChange({
          target: "variant",
          changeType: "added",
          fieldPath: "variants.size",
          description: 'Added variant "size"',
        }),
        makeChange({
          target: "slot",
          changeType: "added",
          fieldPath: "slots.icon",
          description: 'Added slot "icon"',
        }),
        makeChange({
          target: "state",
          changeType: "added",
          fieldPath: "states.loading",
          description: 'Added state "loading"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(5);
    expect(result.skippedChanges).toHaveLength(0);
    expect(result.newContent).toContain("tooltip?: string");
    expect(result.newContent).toContain('"primary" | "secondary" | "ghost" | "danger"');
    expect(result.newContent).toContain('"sm" | "md" | "lg"');
    expect(result.newContent).toContain("icon?: ReactNode");
    expect(result.newContent).toContain("loading?: boolean");
  });

  it("preserves existing code structure", () => {
    const schema: ComponentSchema = {
      ...baseButtonSchema,
      props: [
        ...baseButtonSchema.props,
        { name: "tooltip", type: "string", required: false },
      ],
    };

    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "added",
          fieldPath: "props.tooltip",
          description: 'Added prop "tooltip"',
        }),
      ],
    });

    // Original code should still be there
    expect(result.newContent).toContain("export function Button");
    expect(result.newContent).toContain("return <button");
    expect(result.newContent).toContain("label: string");
  });
});

// ---------------------------------------------------------------------------
// Tests: Edge cases
// ---------------------------------------------------------------------------

describe("applySchemaChangesToSource — edge cases", () => {
  it("handles component with no props interface gracefully", () => {
    const source = `
export function Button() {
  return <button>Click</button>;
}
`;

    const result = applySchemaChangesToSource(source, {
      targetSchema: baseButtonSchema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "added",
          fieldPath: "props.label",
          description: 'Added prop "label"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(0);
    expect(result.skippedChanges).toHaveLength(1);
    expect(result.skippedChanges[0]).toContain("no props interface found");
  });

  it("returns original content when no changes applied", () => {
    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: baseButtonSchema,
      changes: [],
    });

    expect(result.originalContent).toBe(result.newContent);
    expect(result.appliedChanges).toHaveLength(0);
  });

  it("handles component-level changes (skips — requires file creation)", () => {
    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: baseButtonSchema,
      changes: [
        makeChange({
          target: "component",
          changeType: "added",
          fieldPath: "",
          description: 'Added component "NewComponent"',
        }),
      ],
    });

    expect(result.skippedChanges).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: Destructuring sync (Layer 2)
// ---------------------------------------------------------------------------

describe("applySchemaChangesToSource — destructuring", () => {
  it("adds new prop to destructuring", () => {
    const schema: ComponentSchema = {
      ...baseButtonSchema,
      props: [
        ...baseButtonSchema.props,
        { name: "tooltip", type: "string", required: false },
      ],
    };

    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "added",
          fieldPath: "props.tooltip",
          description: 'Added prop "tooltip"',
        }),
      ],
    });

    // Present in both interface and destructuring
    expect(result.newContent).toContain("tooltip?: string");
    expect(result.newContent).toMatch(/\{[^}]*label[^}]*tooltip[^}]*\}/);
  });

  it("adds variant with default value to destructuring", () => {
    const schema: ComponentSchema = {
      ...baseButtonSchema,
      variants: [
        ...baseButtonSchema.variants,
        { name: "size", values: ["sm", "md", "lg"], defaultValue: "md" },
      ],
    };

    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          target: "variant",
          changeType: "added",
          fieldPath: "variants.size",
          description: 'Added variant "size"',
        }),
      ],
    });

    // Variant in interface
    expect(result.newContent).toContain('"sm" | "md" | "lg"');
    // In destructuring with default
    expect(result.newContent).toContain('size = "md"');
  });

  it("adds slot to destructuring", () => {
    const schema: ComponentSchema = {
      ...baseButtonSchema,
      slots: [{ name: "icon", required: false }],
    };

    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          target: "slot",
          changeType: "added",
          fieldPath: "slots.icon",
          description: 'Added slot "icon"',
        }),
      ],
    });

    expect(result.newContent).toContain("icon?: ReactNode");
    expect(result.newContent).toMatch(/\{[^}]*icon[^}]*\}/);
  });

  it("removes prop from destructuring", () => {
    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: baseButtonSchema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "removed",
          fieldPath: "props.disabled",
          description: 'Removed prop "disabled"',
        }),
      ],
    });

    // Removed from destructuring — label and variant remain
    // The function params destructuring should NOT contain disabled
    expect(result.newContent).toMatch(/Button\(\{\s*label,\s*variant\s*\}/);
  });

  it("adds prop with boolean default to destructuring", () => {
    const schema: ComponentSchema = {
      ...baseButtonSchema,
      props: [
        ...baseButtonSchema.props,
        { name: "fullWidth", type: "boolean", required: false, defaultValue: false },
      ],
    };

    const result = applySchemaChangesToSource(baseButtonSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          target: "prop",
          changeType: "added",
          fieldPath: "props.fullWidth",
          description: 'Added prop "fullWidth"',
        }),
      ],
    });

    expect(result.newContent).toContain("fullWidth?: boolean");
    expect(result.newContent).toContain("fullWidth = false");
  });

  it("handles arrow function components", () => {
    const arrowSource = `
interface TagProps {
  label: string;
}
export const Tag = ({ label }: TagProps) => {
  return <span>{label}</span>;
};
`;
    const schema: ComponentSchema = {
      name: "Tag",
      props: [
        { name: "label", type: "string", required: true },
        { name: "color", type: "string", required: false },
      ],
      variants: [],
      slots: [],
      states: [],
      tokenRefs: [],
    };

    const result = applySchemaChangesToSource(arrowSource, {
      targetSchema: schema,
      changes: [
        makeChange({
          componentName: "Tag",
          target: "prop",
          changeType: "added",
          fieldPath: "props.color",
          description: 'Added prop "color"',
        }),
      ],
    });

    expect(result.appliedChanges).toHaveLength(1);
    expect(result.newContent).toContain("color?: string");
    expect(result.newContent).toMatch(/\{[^}]*label[^}]*color[^}]*\}/);
  });
});
