import { describe, it, expect } from "vitest";
import { buildPreviewTokenData } from "./token-data-builder.js";
import type { FigmaVariable, FigmaVariableCollection } from "../figma-adapter/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCollection(overrides: Partial<FigmaVariableCollection> = {}): FigmaVariableCollection {
  return {
    id: "col-1",
    name: "Semantic colors",
    key: "key-1",
    modes: [
      { modeId: "m1", name: "Light" },
      { modeId: "m2", name: "Dark" },
    ],
    variableIds: [],
    ...overrides,
  };
}

function makeColorVariable(overrides: Partial<FigmaVariable> = {}): FigmaVariable {
  return {
    id: "var-1",
    name: "Primary/primary500",
    key: "vk-1",
    resolvedType: "COLOR",
    description: "used for default",
    valuesByMode: {
      m1: { type: "COLOR", value: { r: 0.2, g: 0.2, b: 0.2, a: 1 } },
      m2: { type: "COLOR", value: { r: 0.9, g: 0.9, b: 0.9, a: 1 } },
    },
    variableCollectionId: "col-1",
    ...overrides,
  };
}

function makeFloatVariable(overrides: Partial<FigmaVariable> = {}): FigmaVariable {
  return {
    id: "var-2",
    name: "Spacing/4",
    key: "vk-2",
    resolvedType: "FLOAT",
    description: "",
    valuesByMode: {
      m1: { type: "FLOAT", value: 16 },
      m2: { type: "FLOAT", value: 16 },
    },
    variableCollectionId: "col-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildPreviewTokenData", () => {
  it("returns empty object when no variables", () => {
    const result = buildPreviewTokenData([], []);
    expect(result).toEqual({});
  });

  it("groups color variables by collection and category", () => {
    const collection = makeCollection();
    const variable = makeColorVariable();

    const result = buildPreviewTokenData([variable], [collection]);

    expect(result["Semantic colors"]).toBeDefined();
    expect(result["Semantic colors"].modes).toEqual([
      { id: "m1", name: "Light" },
      { id: "m2", name: "Dark" },
    ]);
    expect(result["Semantic colors"].categories["Primary"]).toHaveLength(1);

    const token = result["Semantic colors"].categories["Primary"][0];
    expect(token.name).toBe("primary500");
    expect(token.fullName).toBe("Primary/primary500");
    expect(token.resolvedType).toBe("COLOR");
    expect(token.description).toBe("used for default");
    expect(token.values["Light"]).toEqual({ type: "COLOR", hex: "#333333" });
    expect(token.values["Dark"]).toEqual({ type: "COLOR", hex: "#E6E6E6" });
  });

  it("groups float variables correctly", () => {
    const collection = makeCollection();
    const variable = makeFloatVariable();

    const result = buildPreviewTokenData([variable], [collection]);

    const token = result["Semantic colors"].categories["Spacing"][0];
    expect(token.name).toBe("4");
    expect(token.fullName).toBe("Spacing/4");
    expect(token.resolvedType).toBe("FLOAT");
    expect(token.values["Light"]).toEqual({ type: "FLOAT", value: 16 });
    expect(token.values["Dark"]).toEqual({ type: "FLOAT", value: 16 });
  });

  it("puts variables without slash in 'Other' category", () => {
    const collection = makeCollection();
    const variable = makeColorVariable({
      name: "brand-color",
      valuesByMode: {
        m1: { type: "COLOR", value: { r: 1, g: 0, b: 0, a: 1 } },
      },
    });

    const result = buildPreviewTokenData([variable], [collection]);

    expect(result["Semantic colors"].categories["Other"]).toHaveLength(1);
    expect(result["Semantic colors"].categories["Other"][0].name).toBe("brand-color");
    expect(result["Semantic colors"].categories["Other"][0].fullName).toBe("brand-color");
  });

  it("handles multiple collections", () => {
    const col1 = makeCollection({ id: "col-1", name: "Semantic" });
    const col2 = makeCollection({ id: "col-2", name: "Fixed Colors" });

    const var1 = makeColorVariable({ variableCollectionId: "col-1" });
    const var2 = makeColorVariable({
      id: "var-3",
      name: "Text/white",
      variableCollectionId: "col-2",
      valuesByMode: {
        m1: { type: "COLOR", value: { r: 1, g: 1, b: 1, a: 1 } },
      },
    });

    const result = buildPreviewTokenData([var1, var2], [col1, col2]);

    expect(Object.keys(result)).toEqual(["Semantic", "Fixed Colors"]);
    expect(result["Semantic"].categories["Primary"]).toHaveLength(1);
    expect(result["Fixed Colors"].categories["Text"]).toHaveLength(1);
  });

  it("resolves variable aliases to variable names", () => {
    const collection = makeCollection();
    const sourceVar = makeColorVariable({
      id: "var-source",
      name: "Core/blue500",
    });
    const aliasVar: FigmaVariable = {
      id: "var-alias",
      name: "Brand/primary",
      key: "vk-alias",
      resolvedType: "COLOR",
      description: "",
      valuesByMode: {
        m1: { type: "VARIABLE_ALIAS", id: "var-source" },
      },
      variableCollectionId: "col-1",
    };

    const result = buildPreviewTokenData([sourceVar, aliasVar], [collection]);

    const aliasToken = result["Semantic colors"].categories["Brand"][0];
    expect(aliasToken.values["Light"]).toEqual({ type: "FLOAT", ref: "Core/blue500" });
  });

  it("omits description when empty", () => {
    const collection = makeCollection();
    const variable = makeColorVariable({ description: "" });

    const result = buildPreviewTokenData([variable], [collection]);

    const token = result["Semantic colors"].categories["Primary"][0];
    expect(token).not.toHaveProperty("description");
  });

  it("converts Figma RGBA to uppercase hex correctly", () => {
    const collection = makeCollection({
      modes: [{ modeId: "m1", name: "Light" }],
    });
    const variable = makeColorVariable({
      valuesByMode: {
        m1: { type: "COLOR", value: { r: 0.996, g: 0.945, b: 0.957, a: 1 } },
      },
    });

    const result = buildPreviewTokenData([variable], [collection]);
    const hex = result["Semantic colors"].categories["Primary"][0].values["Light"].hex;

    // Should be uppercase hex
    expect(hex).toMatch(/^#[0-9A-F]{6}$/);
  });
});
