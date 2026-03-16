import { describe, it, expect } from "vitest";
import type { SchemaChange } from "../diff-engine/types.js";
import { schemaChangesToWriteOps, writeOpsToInstructions } from "./writer.js";

/** Helper: changes → instructions, auto-adds figmaNodeId */
function toInstructions(changes: SchemaChange[]) {
  const withNodeId = changes.map((c) => ({ ...c, figmaNodeId: "test:1" }));
  const ops = schemaChangesToWriteOps(withNodeId);
  return writeOpsToInstructions(ops);
}

/** Helper: changes → write ops, auto-adds figmaNodeId */
function toOps(changes: SchemaChange[]) {
  const withNodeId = changes.map((c) => ({ ...c, figmaNodeId: "test:1" }));
  return schemaChangesToWriteOps(withNodeId);
}

// ---------------------------------------------------------------------------
// schemaChangesToWriteOps tests
// ---------------------------------------------------------------------------

describe("schemaChangesToWriteOps", () => {
  it("generates executable code for added prop", () => {
    const ops = toOps([
      {
        componentName: "Button",
        target: "prop",
        changeType: "added",
        fieldPath: "props.tooltip",
        after: { name: "tooltip", type: "string" },
        severity: "additive",
        description: 'Added prop "tooltip"',
      },
    ]);

    expect(ops).toHaveLength(1);
    expect(ops[0].code).toContain("addComponentProperty");
    expect(ops[0].code).toContain('"tooltip"');
    expect(ops[0].code).toContain('"TEXT"');
    expect(ops[0].description).toContain("TEXT property");
  });

  it("generates executable code for deleted prop", () => {
    const ops = toOps([
      {
        componentName: "Button",
        target: "prop",
        changeType: "removed",
        fieldPath: "props.tooltip",
        severity: "breaking",
        description: 'Removed prop "tooltip"',
      },
    ]);

    expect(ops).toHaveLength(1);
    expect(ops[0].code).toContain("deleteComponentProperty");
    expect(ops[0].code).toContain('"tooltip"');
  });

  it("generates clone code for added variant value", () => {
    const ops = toOps([
      {
        componentName: "Badge",
        target: "variant",
        changeType: "modified",
        fieldPath: "variants.size.values",
        before: ["sm", "md", "lg"],
        after: ["sm", "md", "lg", "xl"],
        severity: "additive",
        description: "Added variant values: xl",
      },
    ]);

    expect(ops).toHaveLength(1);
    expect(ops[0].description).toContain('clone from "lg"');
    expect(ops[0].code).toContain("clone");
    expect(ops[0].code).toContain("appendChild");
    expect(ops[0].code).toContain("resize");
  });

  it("generates remove code for removed variant value", () => {
    const ops = toOps([
      {
        componentName: "Badge",
        target: "variant",
        changeType: "modified",
        fieldPath: "variants.size.values",
        before: ["sm", "md", "lg", "xl"],
        after: ["sm", "md", "lg"],
        severity: "breaking",
        description: "Removed variant values: xl",
      },
    ]);

    expect(ops).toHaveLength(1);
    expect(ops[0].description).toContain('Remove variant value "size=xl"');
    expect(ops[0].code).toContain("remove()");
  });

  it("generates code for added state", () => {
    const ops = toOps([
      {
        componentName: "Button",
        target: "state",
        changeType: "added",
        fieldPath: "states.loading",
        severity: "additive",
        description: 'Added state "loading"',
      },
    ]);

    expect(ops[0].code).toContain("addComponentProperty");
    expect(ops[0].code).toContain('"BOOLEAN"');
    expect(ops[0].code).toContain('"loading"');
  });

  it("generates code for added slot", () => {
    const ops = toOps([
      {
        componentName: "Button",
        target: "slot",
        changeType: "added",
        fieldPath: "slots.icon",
        severity: "additive",
        description: 'Added slot "icon"',
      },
    ]);

    expect(ops[0].code).toContain("addComponentProperty");
    expect(ops[0].code).toContain('"INSTANCE_SWAP"');
  });

  it("skips changes without figmaNodeId", () => {
    const ops = schemaChangesToWriteOps([
      {
        componentName: "Button",
        target: "prop",
        changeType: "added",
        fieldPath: "props.tooltip",
        after: { name: "tooltip", type: "string" },
        severity: "additive",
        description: 'Added prop "tooltip"',
      },
    ]);

    expect(ops).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// writeOpsToInstructions tests
// ---------------------------------------------------------------------------

describe("writeOpsToInstructions", () => {
  it("generates instruction for added variant", () => {
    const instructions = toInstructions([
      {
        componentName: "Button",
        target: "variant",
        changeType: "added",
        fieldPath: "variants.size",
        after: { name: "size", values: ["sm", "md", "lg"] },
        severity: "additive",
        description: 'Added variant "size"',
      },
    ]);

    expect(instructions).toHaveLength(1);
    expect(instructions[0].componentName).toBe("Button");
    expect(instructions[0].instructions[0]).toContain("variant");
    expect(instructions[0].instructions[0]).toContain("sm, md, lg");
  });

  it("generates instruction for removed variant", () => {
    const instructions = toInstructions([
      {
        componentName: "Button",
        target: "variant",
        changeType: "removed",
        fieldPath: "variants.color",
        severity: "breaking",
        description: 'Removed variant "color"',
      },
    ]);

    expect(instructions[0].instructions[0]).toContain("Remove variant");
  });

  it("generates instruction for modified variant values", () => {
    const instructions = toInstructions([
      {
        componentName: "Button",
        target: "variant",
        changeType: "modified",
        fieldPath: "variants.size.values",
        before: ["sm", "md", "lg"],
        after: ["sm", "md", "lg", "xl"],
        severity: "additive",
        description: "Added variant values: xl",
      },
    ]);

    expect(instructions[0].instructions[0]).toContain("xl");
    expect(instructions[0].instructions[0]).toContain("clone");
  });

  it("groups instructions by component", () => {
    const instructions = toInstructions([
      {
        componentName: "Button",
        target: "state",
        changeType: "added",
        fieldPath: "states.loading",
        severity: "additive",
        description: 'Added state "loading"',
      },
      {
        componentName: "Button",
        target: "prop",
        changeType: "added",
        fieldPath: "props.tooltip",
        after: { name: "tooltip", type: "string" },
        severity: "additive",
        description: 'Added prop "tooltip"',
      },
      {
        componentName: "Card",
        target: "slot",
        changeType: "added",
        fieldPath: "slots.header",
        severity: "additive",
        description: 'Added slot "header"',
      },
    ]);

    expect(instructions).toHaveLength(2);
    expect(instructions[0].componentName).toBe("Button");
    expect(instructions[0].instructions).toHaveLength(2);
    expect(instructions[1].componentName).toBe("Card");
    expect(instructions[1].instructions).toHaveLength(1);
  });

  it("returns empty for no relevant changes", () => {
    const instructions = toInstructions([
      {
        componentName: "Button",
        target: "metadata",
        changeType: "modified",
        fieldPath: "description",
        before: "old",
        after: "new",
        severity: "additive",
        description: "Changed description",
      },
    ]);

    expect(instructions).toHaveLength(0);
  });
});
