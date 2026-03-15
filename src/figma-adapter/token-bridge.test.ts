import { describe, it, expect } from "vitest";
import type { DesignTokenFile } from "../schema/tokens.js";
import type { FigmaVariable, FigmaVariableCollection } from "./types.js";
import { tokensToFigmaVariables, figmaVariablesToTokens } from "./token-bridge.js";

// ---------------------------------------------------------------------------
// W3C → Figma tests
// ---------------------------------------------------------------------------

describe("tokensToFigmaVariables", () => {
  it("converts color tokens", () => {
    const file: DesignTokenFile = {
      color: {
        $type: "color",
        primary: {
          $value: { colorSpace: "srgb", components: [0, 0.4, 0.8] },
        },
      },
    };

    const vars = tokensToFigmaVariables(file);
    expect(vars).toHaveLength(1);
    expect(vars[0].name).toBe("color/primary");
    expect(vars[0].resolvedType).toBe("COLOR");
    expect(vars[0].value).toEqual({ r: 0, g: 0.4, b: 0.8, a: 1 });
    expect(vars[0].collectionName).toBe("color");
  });

  it("converts dimension tokens", () => {
    const file: DesignTokenFile = {
      spacing: {
        $type: "dimension",
        md: { $value: { value: 16, unit: "px" } },
      },
    };

    const vars = tokensToFigmaVariables(file);
    expect(vars).toHaveLength(1);
    expect(vars[0].resolvedType).toBe("FLOAT");
    expect(vars[0].value).toBe(16);
  });

  it("converts number tokens", () => {
    const file: DesignTokenFile = {
      scale: {
        $type: "number",
        ratio: { $value: 1.5 },
      },
    };

    const vars = tokensToFigmaVariables(file);
    expect(vars[0].resolvedType).toBe("FLOAT");
    expect(vars[0].value).toBe(1.5);
  });

  it("converts fontFamily tokens", () => {
    const file: DesignTokenFile = {
      font: {
        $type: "fontFamily",
        body: { $value: ["Inter", "sans-serif"] },
      },
    };

    const vars = tokensToFigmaVariables(file);
    expect(vars[0].resolvedType).toBe("STRING");
    expect(vars[0].value).toBe("Inter, sans-serif");
  });

  it("converts duration tokens to milliseconds", () => {
    const file: DesignTokenFile = {
      animation: {
        $type: "duration",
        fast: { $value: { value: 0.2, unit: "s" } },
        slow: { $value: { value: 500, unit: "ms" } },
      },
    };

    const vars = tokensToFigmaVariables(file);
    const fast = vars.find((v) => v.name.includes("fast"));
    const slow = vars.find((v) => v.name.includes("slow"));
    expect(fast!.value).toBe(200);
    expect(slow!.value).toBe(500);
  });

  it("skips composite types (shadow, border, typography)", () => {
    const file: DesignTokenFile = {
      shadow: {
        $type: "shadow" as any,
        md: {
          $value: {
            color: { colorSpace: "srgb", components: [0, 0, 0, 0.1] },
            offsetX: { value: 0, unit: "px" },
            offsetY: { value: 4, unit: "px" },
            blur: { value: 8, unit: "px" },
            spread: { value: 0, unit: "px" },
          },
        },
      },
    };

    const vars = tokensToFigmaVariables(file);
    expect(vars).toHaveLength(0);
  });

  it("preserves descriptions", () => {
    const file: DesignTokenFile = {
      color: {
        $type: "color",
        primary: {
          $value: { colorSpace: "srgb", components: [0, 0.4, 0.8] },
          $description: "Main brand color",
        },
      },
    };

    const vars = tokensToFigmaVariables(file);
    expect(vars[0].description).toBe("Main brand color");
  });

  it("handles deeply nested tokens", () => {
    const file: DesignTokenFile = {
      color: {
        $type: "color",
        brand: {
          primary: {
            500: {
              $value: { colorSpace: "srgb", components: [0, 0.4, 0.8] },
            },
          },
        },
      },
    };

    const vars = tokensToFigmaVariables(file);
    expect(vars[0].name).toBe("color/brand/primary/500");
  });
});

// ---------------------------------------------------------------------------
// Figma → W3C tests
// ---------------------------------------------------------------------------

describe("figmaVariablesToTokens", () => {
  const collections: FigmaVariableCollection[] = [
    {
      id: "col-1",
      name: "Colors",
      key: "col-key-1",
      modes: [{ modeId: "mode-1", name: "Default" }],
      variableIds: ["var-1", "var-2"],
    },
  ];

  it("converts color variables", () => {
    const variables: FigmaVariable[] = [
      {
        id: "var-1",
        name: "color/primary",
        key: "var-key-1",
        resolvedType: "COLOR",
        description: "Brand color",
        variableCollectionId: "col-1",
        valuesByMode: {
          "mode-1": {
            type: "COLOR",
            value: { r: 0, g: 0.4, b: 0.8, a: 1 },
          },
        },
      },
    ];

    const tokens = figmaVariablesToTokens(variables, collections);
    expect(tokens.color).toBeDefined();
    const colorGroup = tokens.color as Record<string, any>;
    expect(colorGroup.primary.$value).toEqual({
      colorSpace: "srgb",
      components: [0, 0.4, 0.8, 1],
    });
    expect(colorGroup.primary.$type).toBe("color");
    expect(colorGroup.primary.$description).toBe("Brand color");
  });

  it("converts float variables with dimension heuristic", () => {
    const variables: FigmaVariable[] = [
      {
        id: "var-2",
        name: "spacing/md",
        key: "var-key-2",
        resolvedType: "FLOAT",
        description: "",
        variableCollectionId: "col-1",
        valuesByMode: {
          "mode-1": { type: "FLOAT", value: 16 },
        },
      },
    ];

    const tokens = figmaVariablesToTokens(variables, collections);
    const spacingGroup = tokens.spacing as Record<string, any>;
    expect(spacingGroup.md.$value).toEqual({ value: 16, unit: "px" });
    expect(spacingGroup.md.$type).toBe("dimension");
  });

  it("creates nested groups from path separators", () => {
    const variables: FigmaVariable[] = [
      {
        id: "var-3",
        name: "color/brand/primary/500",
        key: "var-key-3",
        resolvedType: "COLOR",
        description: "",
        variableCollectionId: "col-1",
        valuesByMode: {
          "mode-1": {
            type: "COLOR",
            value: { r: 0, g: 0.4, b: 0.8, a: 1 },
          },
        },
      },
    ];

    const tokens = figmaVariablesToTokens(variables, collections);
    const color = tokens.color as Record<string, any>;
    expect(color.brand.primary["500"].$type).toBe("color");
  });
});
