import { describe, it, expect } from "vitest";
import type { DesignTokenFile } from "./tokens.js";
import {
  isValidTokenName,
  isAliasValue,
  parseAliasPath,
  isToken,
  isReservedKey,
  flattenTokens,
} from "./tokens.js";

// ---------------------------------------------------------------------------
// Utility tests
// ---------------------------------------------------------------------------

describe("isReservedKey", () => {
  it.each([
    ["$value", true],
    ["$type", true],
    ["$description", true],
    ["$extensions", true],
    ["color", false],
    ["primary", false],
  ])('isReservedKey("%s") = %s', (key, expected) => {
    expect(isReservedKey(key)).toBe(expected);
  });
});

describe("isValidTokenName", () => {
  it.each([
    ["primary", true],
    ["color-primary", true],
    ["color_primary", true],
    ["$value", false],
    ["my.token", false],
    ["my{token", false],
    ["my}token", false],
  ])('isValidTokenName("%s") = %s', (name, expected) => {
    expect(isValidTokenName(name)).toBe(expected);
  });
});

describe("isAliasValue", () => {
  it.each([
    ["{color.primary}", true],
    ["{a}", true],
    ["color.primary", false],
    ["{incomplete", false],
    ["incomplete}", false],
    [42, false],
    [null, false],
  ])('isAliasValue(%s) = %s', (value, expected) => {
    expect(isAliasValue(value)).toBe(expected);
  });
});

describe("parseAliasPath", () => {
  it("extracts path from alias", () => {
    expect(parseAliasPath("{color.primary.500}")).toBe("color.primary.500");
  });
});

describe("isToken", () => {
  it("returns true for objects with $value", () => {
    expect(isToken({ $value: "#ff0000" })).toBe(true);
  });

  it("returns false for groups", () => {
    expect(isToken({ $type: "color" })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isToken("string")).toBe(false);
    expect(isToken(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// flattenTokens tests
// ---------------------------------------------------------------------------

describe("flattenTokens", () => {
  it("flattens a simple token file", () => {
    const file: DesignTokenFile = {
      color: {
        $type: "color",
        primary: {
          $value: { colorSpace: "srgb", components: [0, 0.4, 0.8] },
        },
        secondary: {
          $value: { colorSpace: "srgb", components: [1, 0.6, 0] },
        },
      },
    };

    const tokens = flattenTokens(file);
    expect(tokens).toHaveLength(2);

    const primary = tokens.find((t) => t.path === "color.primary");
    expect(primary).toBeDefined();
    expect(primary!.type).toBe("color");
    expect(primary!.value).toEqual({
      colorSpace: "srgb",
      components: [0, 0.4, 0.8],
    });
  });

  it("inherits $type from parent group", () => {
    const file: DesignTokenFile = {
      spacing: {
        $type: "dimension",
        sm: { $value: { value: 4, unit: "px" } },
        md: { $value: { value: 8, unit: "px" } },
        lg: { $value: { value: 16, unit: "px" } },
      },
    };

    const tokens = flattenTokens(file);
    expect(tokens).toHaveLength(3);
    expect(tokens.every((t) => t.type === "dimension")).toBe(true);
  });

  it("resolves alias references", () => {
    const file: DesignTokenFile = {
      color: {
        $type: "color",
        blue: {
          500: {
            $value: { colorSpace: "srgb", components: [0, 0.4, 0.8] },
          },
        },
        primary: {
          $value: "{color.blue.500}",
        },
      },
    };

    const tokens = flattenTokens(file);
    const primary = tokens.find((t) => t.path === "color.primary");
    expect(primary).toBeDefined();
    expect(primary!.value).toEqual({
      colorSpace: "srgb",
      components: [0, 0.4, 0.8],
    });
    expect(primary!.type).toBe("color");
  });

  it("resolves chained aliases", () => {
    const file: DesignTokenFile = {
      color: {
        $type: "color",
        blue: {
          $value: { colorSpace: "srgb", components: [0, 0, 1] },
        },
        primary: {
          $value: "{color.blue}",
        },
        action: {
          $value: "{color.primary}",
        },
      },
    };

    const tokens = flattenTokens(file);
    const action = tokens.find((t) => t.path === "color.action");
    expect(action).toBeDefined();
    expect(action!.value).toEqual({
      colorSpace: "srgb",
      components: [0, 0, 1],
    });
  });

  it("throws on circular references", () => {
    const file: DesignTokenFile = {
      color: {
        $type: "color",
        a: { $value: "{color.b}" },
        b: { $value: "{color.a}" },
      },
    };

    expect(() => flattenTokens(file)).toThrow("Circular token reference");
  });

  it("throws on missing referenced token", () => {
    const file: DesignTokenFile = {
      color: {
        $type: "color",
        primary: { $value: "{color.nonexistent}" },
      },
    };

    expect(() => flattenTokens(file)).toThrow("Token not found");
  });

  it("preserves description and extensions", () => {
    const file: DesignTokenFile = {
      color: {
        $type: "color",
        primary: {
          $value: { colorSpace: "srgb", components: [0, 0.4, 0.8] },
          $description: "Main brand color",
          $extensions: { "com.figma": { variableId: "123" } },
        },
      },
    };

    const tokens = flattenTokens(file);
    expect(tokens[0].description).toBe("Main brand color");
    expect(tokens[0].extensions).toEqual({
      "com.figma": { variableId: "123" },
    });
  });

  it("handles deeply nested groups", () => {
    const file: DesignTokenFile = {
      color: {
        $type: "color",
        brand: {
          primary: {
            100: {
              $value: { colorSpace: "srgb", components: [0.9, 0.95, 1] },
            },
            500: {
              $value: { colorSpace: "srgb", components: [0, 0.4, 0.8] },
            },
            900: {
              $value: { colorSpace: "srgb", components: [0, 0.15, 0.35] },
            },
          },
        },
      },
    };

    const tokens = flattenTokens(file);
    expect(tokens).toHaveLength(3);
    expect(tokens.map((t) => t.path).sort()).toEqual([
      "color.brand.primary.100",
      "color.brand.primary.500",
      "color.brand.primary.900",
    ]);
  });

  it("handles deprecated tokens", () => {
    const file: DesignTokenFile = {
      color: {
        $type: "color",
        old: {
          $value: { colorSpace: "srgb", components: [1, 0, 0] },
          $deprecated: "Use {color.new} instead",
        },
      },
    };

    const tokens = flattenTokens(file);
    expect(tokens[0].deprecated).toBe("Use {color.new} instead");
  });

  it("explicit $type overrides inherited type on alias", () => {
    const file: DesignTokenFile = {
      base: {
        $type: "number",
        scale: { $value: 1.5 },
      },
      custom: {
        ratio: {
          $value: "{base.scale}",
          $type: "number",
        },
      },
    };

    const tokens = flattenTokens(file);
    const ratio = tokens.find((t) => t.path === "custom.ratio");
    expect(ratio!.type).toBe("number");
  });
});
