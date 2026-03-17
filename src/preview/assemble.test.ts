import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assemblePreviewData } from "./assemble.js";
import * as config from "../shared/config.js";
import * as snapshot from "../diff-engine/snapshot.js";
import * as fs from "node:fs";
import type { ComponentSchema } from "../schema/types.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../shared/config.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../diff-engine/snapshot.js", () => ({
  loadSnapshot: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockComponent: ComponentSchema = {
  name: "Badge",
  props: [{ name: "label", type: "string", required: true }],
  variants: [{ name: "size", values: ["sm", "md", "lg"] }],
  slots: [],
  states: [],
  tokenRefs: [],
};

const mockVariablesFile = JSON.stringify({
  variables: [
    {
      id: "v1",
      name: "Primary/primary500",
      key: "k1",
      resolvedType: "COLOR",
      description: "",
      valuesByMode: {
        m1: { type: "COLOR", value: { r: 0.2, g: 0.2, b: 0.2, a: 1 } },
      },
      variableCollectionId: "c1",
    },
  ],
  collections: [
    {
      id: "c1",
      name: "Colors",
      key: "ck1",
      modes: [{ modeId: "m1", name: "Light" }],
      variableIds: ["v1"],
    },
  ],
});

const mockPreviewHTML = `<style>
.badge { display: inline-flex; padding: 4px 8px; border-radius: 2px; }
</style>
<script>
function render(state) {
  return '<span class="badge">' + state.label + '</span>';
}
</script>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Configure fs mocks to respond to specific paths */
function setupFsMocks(opts: {
  hasVariables?: boolean;
  hasPreviews?: boolean;
  previewFiles?: string[];
}) {
  vi.mocked(fs.existsSync).mockImplementation((p) => {
    const path = String(p);
    if (path.includes("figma-variables.json")) return opts.hasVariables ?? false;
    if (path.includes("/previews")) return opts.hasPreviews ?? false;
    return false;
  });

  vi.mocked(fs.readFileSync).mockImplementation((p) => {
    const path = String(p);
    if (path.includes("figma-variables.json")) return mockVariablesFile;
    if (path.endsWith(".html")) return mockPreviewHTML;
    return "";
  });

  vi.mocked(fs.readdirSync).mockImplementation((() => {
    return opts.previewFiles ?? [];
  }) as typeof fs.readdirSync);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("assemblePreviewData", () => {
  beforeEach(() => {
    vi.mocked(config.loadConfig).mockReturnValue({
      componentGlobs: ["src/components/**/*.tsx"],
      tokenFormat: "css-vars",
      figmaFileKey: "abc123",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty data when no snapshots exist", () => {
    vi.mocked(snapshot.loadSnapshot).mockReturnValue(null);
    setupFsMocks({});

    const result = assemblePreviewData("/project");

    expect(result.components).toEqual([]);
    expect(result.tokens).toEqual({});
    expect(result.previews).toEqual({});
    expect(result.inspect.hasComponents).toBe(false);
    expect(result.inspect.hasVariables).toBe(false);
    expect(result.meta.figmaFileKey).toBe("abc123");
  });

  it("loads components from figma snapshot", () => {
    vi.mocked(snapshot.loadSnapshot).mockReturnValue([mockComponent]);
    setupFsMocks({});

    const result = assemblePreviewData("/project");

    expect(result.components).toEqual([mockComponent]);
    expect(result.inspect.hasComponents).toBe(true);
    expect(result.inspect.componentCount).toBe(1);
  });

  it("loads tokens from figma-variables.json", () => {
    vi.mocked(snapshot.loadSnapshot).mockReturnValue(null);
    setupFsMocks({ hasVariables: true });

    const result = assemblePreviewData("/project");

    expect(result.inspect.hasVariables).toBe(true);
    expect(result.inspect.variableCount).toBe(1);
    expect(result.inspect.collectionCount).toBe(1);
    expect(result.inspect.modeNames).toEqual(["Light"]);
    expect(result.tokens["Colors"]).toBeDefined();
    expect(result.tokens["Colors"].categories["Primary"]).toHaveLength(1);
  });

  it("loads both components and tokens", () => {
    vi.mocked(snapshot.loadSnapshot).mockReturnValue([mockComponent]);
    setupFsMocks({ hasVariables: true });

    const result = assemblePreviewData("/project");

    expect(result.inspect.hasComponents).toBe(true);
    expect(result.inspect.hasVariables).toBe(true);
    expect(result.components).toHaveLength(1);
    expect(Object.keys(result.tokens)).toHaveLength(1);
  });

  it("includes generatedAt timestamp in meta", () => {
    vi.mocked(snapshot.loadSnapshot).mockReturnValue(null);
    setupFsMocks({});

    const before = new Date().toISOString();
    const result = assemblePreviewData("/project");
    const after = new Date().toISOString();

    expect(result.meta.generatedAt >= before).toBe(true);
    expect(result.meta.generatedAt <= after).toBe(true);
  });

  it("collects mode names from all collections", () => {
    const multiModeFile = JSON.stringify({
      variables: [
        {
          id: "v1",
          name: "Color/bg",
          key: "k1",
          resolvedType: "COLOR",
          description: "",
          valuesByMode: { m1: { type: "COLOR", value: { r: 1, g: 1, b: 1, a: 1 } }, m2: { type: "COLOR", value: { r: 0, g: 0, b: 0, a: 1 } } },
          variableCollectionId: "c1",
        },
      ],
      collections: [
        {
          id: "c1",
          name: "Theme",
          key: "ck1",
          modes: [
            { modeId: "m1", name: "Light" },
            { modeId: "m2", name: "Dark" },
          ],
          variableIds: ["v1"],
        },
      ],
    });

    vi.mocked(snapshot.loadSnapshot).mockReturnValue(null);
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (String(p).includes("figma-variables.json")) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(multiModeFile);
    vi.mocked(fs.readdirSync).mockImplementation((() => []) as typeof fs.readdirSync);

    const result = assemblePreviewData("/project");

    expect(result.inspect.modeNames).toContain("Light");
    expect(result.inspect.modeNames).toContain("Dark");
  });

  // --- Component preview tests ---

  it("loads component previews from .gitma/previews/", () => {
    vi.mocked(snapshot.loadSnapshot).mockReturnValue([mockComponent]);
    setupFsMocks({ hasPreviews: true, previewFiles: ["Badge.html"] });

    const result = assemblePreviewData("/project");

    expect(result.previews["Badge"]).toBeDefined();
    expect(result.previews["Badge"].name).toBe("Badge");
    expect(result.previews["Badge"].css).toContain(".badge");
    expect(result.previews["Badge"].renderFn).toContain("function render");
  });

  it("returns empty previews when directory does not exist", () => {
    vi.mocked(snapshot.loadSnapshot).mockReturnValue([mockComponent]);
    setupFsMocks({});

    const result = assemblePreviewData("/project");

    expect(result.previews).toEqual({});
  });

  it("ignores non-HTML files in previews directory", () => {
    vi.mocked(snapshot.loadSnapshot).mockReturnValue(null);
    setupFsMocks({ hasPreviews: true, previewFiles: ["README.md", "Badge.html"] });

    const result = assemblePreviewData("/project");

    expect(Object.keys(result.previews)).toEqual(["Badge"]);
  });
});
