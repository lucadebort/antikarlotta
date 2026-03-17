import { describe, it, expect, vi, afterEach } from "vitest";
import { renderPreview } from "./render.js";
import * as fs from "node:fs";
import type { PreviewData } from "./types.js";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

const mockData: PreviewData = {
  components: [
    {
      name: "Badge",
      props: [{ name: "label", type: "string", required: true }],
      variants: [],
      slots: [],
      states: [],
      tokenRefs: [],
    },
  ],
  tokens: {
    Colors: {
      modes: [{ id: "m1", name: "Light" }],
      categories: {
        Primary: [
          {
            name: "p500",
            fullName: "Primary/p500",
            resolvedType: "COLOR",
            values: { Light: { type: "COLOR", hex: "#333333" } },
          },
        ],
      },
    },
  },
  inspect: {
    hasComponents: true,
    hasVariables: true,
    componentCount: 1,
    variableCount: 1,
    collectionCount: 1,
    modeNames: ["Light"],
  },
  previews: {},
  meta: {
    figmaFileKey: "abc",
    generatedAt: "2025-01-01T00:00:00.000Z",
  },
};

const mockDataWithPreview: PreviewData = {
  ...mockData,
  previews: {
    Badge: {
      name: "Badge",
      css: ".badge { display: inline-flex; }",
      renderFn: `function render(state) { return '<span class="badge">' + state.label + '</span>'; }`,
    },
  },
};

const templateWithMarker = `<!DOCTYPE html>
<html><head></head><body>
<!-- GITMA_DATA -->
<script>console.log(GITMA_COMPONENTS);</script>
</body></html>`;

const templateWithoutMarker = `<!DOCTYPE html>
<html><head></head><body>
<script>console.log("hello");</script>
</body></html>`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderPreview", () => {
  it("injects data at marker position", () => {
    // Load explicit template path
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return String(p) === "/templates/custom.html";
    });
    vi.mocked(fs.readFileSync).mockReturnValue(templateWithMarker);

    const result = renderPreview(mockData, "/project", "/templates/custom.html");

    expect(result).toContain("const GITMA_COMPONENTS =");
    expect(result).toContain("const GITMA_TOKEN_DATA =");
    expect(result).toContain("const GITMA_META =");
    expect(result).toContain("const GITMA_INSPECT =");
    expect(result).toContain('"Badge"');
    expect(result).not.toContain("<!-- GITMA_DATA -->");
  });

  it("falls back to injecting before </head> when no marker", () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return String(p) === "/templates/custom.html";
    });
    vi.mocked(fs.readFileSync).mockReturnValue(templateWithoutMarker);

    const result = renderPreview(mockData, "/project", "/templates/custom.html");

    expect(result).toContain("const GITMA_COMPONENTS =");
    // Data should appear before </head>
    const dataIdx = result.indexOf("GITMA_COMPONENTS");
    const headIdx = result.indexOf("</head>");
    expect(dataIdx).toBeLessThan(headIdx);
  });

  it("throws when explicit template path not found", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(() => renderPreview(mockData, "/project", "/missing.html")).toThrow(
      "Template not found: /missing.html",
    );
  });

  it("prefers user override over bundled template", () => {
    const calls: string[] = [];
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes(".gitma/preview-template.html")) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      calls.push(String(p));
      return templateWithMarker;
    });

    renderPreview(mockData, "/project");

    expect(calls[0]).toContain(".gitma/preview-template.html");
  });

  it("serializes component data as JSON", () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return String(p) === "/t.html";
    });
    vi.mocked(fs.readFileSync).mockReturnValue(templateWithMarker);

    const result = renderPreview(mockData, "/project", "/t.html");

    // Verify the JSON is parseable by extracting it
    const match = result.match(/const GITMA_COMPONENTS = (.+?);/);
    expect(match).toBeTruthy();
    const parsed = JSON.parse(match![1]);
    expect(parsed[0].name).toBe("Badge");
  });

  it("injects component preview CSS and render functions", () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return String(p) === "/t.html";
    });
    vi.mocked(fs.readFileSync).mockReturnValue(templateWithMarker);

    const result = renderPreview(mockDataWithPreview, "/project", "/t.html");

    // CSS should be injected
    expect(result).toContain(".badge { display: inline-flex; }");
    // GITMA_PREVIEWS should contain the render function
    expect(result).toContain("GITMA_PREVIEWS");
    expect(result).toContain('"Badge"');
  });

  it("does not inject preview CSS when no previews exist", () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return String(p) === "/t.html";
    });
    vi.mocked(fs.readFileSync).mockReturnValue(templateWithMarker);

    const result = renderPreview(mockData, "/project", "/t.html");

    // Should have GITMA_PREVIEWS but empty
    expect(result).toContain("GITMA_PREVIEWS");
    // Should NOT have a <style> block for previews
    expect(result).not.toContain("/* Badge */");
  });
});
