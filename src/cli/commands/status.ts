/**
 * status command — show drift between Figma, code, and committed schema.
 */

import { Command } from "commander";
import { loadConfig } from "../../shared/config.js";
import { loadSnapshot } from "../../diff-engine/snapshot.js";
import { diffSchemas } from "../../diff-engine/differ.js";
import { readCodeComponents } from "../../code-adapter/reader.js";
import { formatStatus } from "../formatters/status-printer.js";

export const statusCommand = new Command("status")
  .description("Show component sync status")
  .action(async () => {
    const projectRoot = process.cwd();
    const config = loadConfig(projectRoot);

    // Load committed baseline
    const committed = loadSnapshot(projectRoot, "committed") ?? [];

    // Read current code state
    const codeComponents = readCodeComponents(
      projectRoot,
      config.componentGlobs,
    );

    // Diff code vs committed
    const codeChanges = diffSchemas(committed, codeComponents);

    // TODO: Read Figma state via MCP when available
    const figmaChanges = diffSchemas(committed, []); // placeholder

    // Find synced components
    const committedNames = new Set(committed.map((c) => c.name));
    const codeNames = new Set(codeComponents.map((c) => c.name));
    const changedNames = new Set([
      ...codeChanges.map((c) => c.componentName),
      ...figmaChanges.map((c) => c.componentName),
    ]);
    const allNames = new Set([...committedNames, ...codeNames]);
    const synced = [...allNames].filter((n) => !changedNames.has(n));

    console.log(formatStatus({
      figmaChanges,
      codeChanges,
      synced,
    }));
  });
