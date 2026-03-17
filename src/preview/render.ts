/**
 * Preview renderer — injects data into the template HTML.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PreviewData } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a complete preview HTML from PreviewData.
 *
 * Template resolution order:
 * 1. Explicit templatePath argument
 * 2. User override: .gitma/preview-template.html
 * 3. Bundled default template
 */
export function renderPreview(
  data: PreviewData,
  projectRoot: string,
  templatePath?: string,
): string {
  const template = loadTemplate(projectRoot, templatePath);

  // Inject data as JS constants
  const componentData = `const GITMA_COMPONENTS = ${JSON.stringify(data.components)};`;
  const tokenData = `const GITMA_TOKEN_DATA = ${JSON.stringify(data.tokens)};`;
  const metaData = `const GITMA_META = ${JSON.stringify(data.meta)};`;
  const inspectData = `const GITMA_INSPECT = ${JSON.stringify(data.inspect)};`;

  // Inject per-component previews: CSS and render functions
  const previewCSS = Object.values(data.previews)
    .map((p) => `/* ${p.name} */\n${p.css}`)
    .join("\n\n");

  const previewRenderers = Object.entries(data.previews)
    .map(([name, p]) => {
      // Wrap each component's render function in a namespace
      return `"${name}": (function() { ${p.renderFn}\n  return typeof render === "function" ? render : null; })()`;
    })
    .join(",\n  ");

  const previewData = `const GITMA_PREVIEWS = {\n  ${previewRenderers}\n};`;

  let injection = `<script>\n${componentData}\n${tokenData}\n${metaData}\n${inspectData}\n${previewData}\n</script>`;

  // Inject component CSS
  if (previewCSS) {
    injection = `<style>\n${previewCSS}\n</style>\n${injection}`;
  }

  // Replace the injection marker or inject before closing </head>
  if (template.includes("<!-- GITMA_DATA -->")) {
    return template.replace("<!-- GITMA_DATA -->", injection);
  }

  // Fallback: inject before </head>
  return template.replace("</head>", `${injection}\n</head>`);
}

// ---------------------------------------------------------------------------
// Template loading
// ---------------------------------------------------------------------------

function loadTemplate(projectRoot: string, explicitPath?: string): string {
  // 1. Explicit path
  if (explicitPath) {
    if (!existsSync(explicitPath)) {
      throw new Error(`Template not found: ${explicitPath}`);
    }
    return readFileSync(explicitPath, "utf-8");
  }

  // 2. User override in project
  const userOverride = join(projectRoot, ".gitma", "preview-template.html");
  if (existsSync(userOverride)) {
    return readFileSync(userOverride, "utf-8");
  }

  // 3. Bundled template
  const bundled = join(__dirname, "template.html");
  if (existsSync(bundled)) {
    return readFileSync(bundled, "utf-8");
  }

  // 4. Source template (dev mode)
  const source = join(__dirname, "..", "..", "src", "preview", "template.html");
  if (existsSync(source)) {
    return readFileSync(source, "utf-8");
  }

  throw new Error(
    "No preview template found. Expected bundled template at " + bundled,
  );
}
