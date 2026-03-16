/**
 * push command — read from one side, commit to schema, then apply to the other.
 *
 * gitma push figma-to-code  → read Figma → commit → apply to code
 * gitma push code-to-figma  → read code → commit → write to Figma via MCP
 */

import { Command } from "commander";
import chalk from "chalk";
import { resolve } from "node:path";
import { loadConfig } from "../../shared/config.js";
import { loadSnapshot, saveSnapshot } from "../../diff-engine/snapshot.js";
import { diffSchemas } from "../../diff-engine/differ.js";
import { readCodeComponents } from "../../code-adapter/reader.js";
import { applyAndSave } from "../../code-adapter/writer.js";
import { readFigmaSchemas } from "../../figma-adapter/read-and-resolve.js";
import { formatDiff } from "../formatters/diff-printer.js";
import { applySchemaChangesToFigma, generateDesignerInstructions } from "../../figma-adapter/writer.js";
import { connectFigma, disconnect } from "../figma-connect.js";
import type { ComponentSchema } from "../../schema/types.js";

export const pushCommand = new Command("push")
  .description("Read from source, commit to schema, apply to target")
  .argument("<direction>", "Direction: 'figma-to-code' or 'code-to-figma'")
  .option("--apply", "Apply changes (default is dry-run)")
  .option("--component <name>", "Only push changes for a specific component")
  .action(async (direction: string, opts) => {
    const projectRoot = process.cwd();
    const config = loadConfig(projectRoot);
    const committed = loadSnapshot(projectRoot, "committed") ?? [];

    if (direction === "figma-to-code") {
      await pushFigmaToCode(projectRoot, config, committed, opts);
    } else if (direction === "code-to-figma") {
      await pushCodeToFigma(projectRoot, config, committed, opts);
    } else {
      console.log(chalk.red(`  Unknown direction: ${direction}. Use 'figma-to-code' or 'code-to-figma'.`));
      process.exit(1);
    }
  });

async function pushFigmaToCode(
  projectRoot: string,
  config: ReturnType<typeof loadConfig>,
  committed: ComponentSchema[],
  opts: { apply?: boolean; component?: string },
) {
  // Step 1: Read Figma
  console.log(chalk.dim("  Step 1/3: Reading Figma components..."));
  const conn = await connectFigma(config.figmaFileKey);
  const figmaSchemas = await readFigmaSchemas(
    conn,
    { nameConfig: { nameMap: config.componentNameMap }, propertyMap: config.propertyMap },
  );
  await disconnect(conn);

  // Step 2: Diff Figma vs committed
  let figmaChanges = diffSchemas(committed, figmaSchemas);
  if (opts.component) {
    figmaChanges = figmaChanges.filter((c) => c.componentName === opts.component);
  }

  if (figmaChanges.length === 0) {
    console.log(chalk.green("\n  No changes in Figma. Everything is in sync.\n"));
    return;
  }

  console.log(chalk.bold("\n  Step 2/3: Figma changes detected:"));
  console.log(formatDiff(figmaChanges));

  if (!opts.apply) {
    console.log(chalk.dim("\n  Dry run. Use --apply to execute the full push.\n"));
    return;
  }

  // Step 3: Commit Figma state, then apply to code
  console.log(chalk.dim("\n  Step 3/3: Applying to code..."));
  saveSnapshot(projectRoot, "committed", figmaSchemas, "figma");

  const codeComponents = readCodeComponents(projectRoot, config.componentGlobs);

  // Now diff the NEW committed schema against current code
  let codeChanges = diffSchemas(codeComponents, figmaSchemas);
  if (opts.component) {
    codeChanges = codeChanges.filter((c) => c.componentName === opts.component);
  }

  if (codeChanges.length === 0) {
    console.log(chalk.green("  Code is already in sync with Figma. Schema updated.\n"));
    return;
  }

  let totalApplied = 0;

  const byComponent = new Map<string, typeof codeChanges>();
  for (const change of codeChanges) {
    const group = byComponent.get(change.componentName) ?? [];
    group.push(change);
    byComponent.set(change.componentName, group);
  }

  for (const [componentName, componentChanges] of byComponent) {
    const targetSchema = figmaSchemas.find((c) => c.name === componentName);
    if (!targetSchema) continue;

    const codeComponent = codeComponents.find((c) => c.name === componentName);
    const codePath = targetSchema.codePath ?? codeComponent?.codePath;
    if (!codePath) {
      console.log(chalk.yellow(`  Skipping ${componentName}: no code path found.`));
      continue;
    }

    const absolutePath = resolve(projectRoot, codePath);
    const result = applyAndSave(
      absolutePath,
      { targetSchema, changes: componentChanges },
      undefined,
      config.formatCommand,
    );

    totalApplied += result.appliedChanges.length;

    if (result.appliedChanges.length > 0) {
      console.log(chalk.green(`  ${componentName}: ${result.appliedChanges.length} change(s) → ${codePath}`));
    }
  }

  console.log(chalk.green(`\n  Push complete: schema updated, ${totalApplied} code change(s) applied.\n`));
}

async function pushCodeToFigma(
  projectRoot: string,
  config: ReturnType<typeof loadConfig>,
  committed: ComponentSchema[],
  opts: { apply?: boolean; component?: string },
) {
  // Step 1: Read code
  console.log(chalk.dim("  Step 1/3: Reading code components..."));
  const codeComponents = readCodeComponents(projectRoot, config.componentGlobs);

  // Step 2: Diff code vs committed
  let changes = diffSchemas(committed, codeComponents);
  if (opts.component) {
    changes = changes.filter((c) => c.componentName === opts.component);
  }

  if (changes.length === 0) {
    console.log(chalk.green("\n  No changes in code. Everything is in sync.\n"));
    return;
  }

  console.log(chalk.bold("\n  Step 2/3: Code changes detected:"));
  console.log(formatDiff(changes));

  if (!opts.apply) {
    console.log(chalk.dim("\n  Dry run. Use --apply to execute the full push.\n"));
    return;
  }

  // Step 3: Commit code state and write to Figma via MCP
  console.log(chalk.dim("\n  Step 3/3: Writing to Figma..."));
  saveSnapshot(projectRoot, "committed", codeComponents, "code");

  // Connect to Figma and apply changes directly
  const conn = await connectFigma(config.figmaFileKey);

  const writeResult = await applySchemaChangesToFigma(conn, changes);
  await disconnect(conn);

  if (writeResult.applied > 0) {
    console.log(chalk.green(`\n  ${writeResult.applied} change(s) written to Figma.`));
  }

  // Show any errors or fallback instructions
  if (writeResult.errors.length > 0) {
    const variantErrors = writeResult.errors.filter((e) => e.includes("variant"));
    const otherErrors = writeResult.errors.filter((e) => !e.includes("variant"));

    if (otherErrors.length > 0) {
      console.log(chalk.red("\n  Errors:"));
      for (const err of otherErrors) {
        console.log(chalk.red(`    - ${err}`));
      }
    }

    if (variantErrors.length > 0) {
      // Variant changes need manual intervention — generate instructions
      const instructions = generateDesignerInstructions(
        changes.filter((c) => c.target === "variant"),
      );
      if (instructions.length > 0) {
        console.log(chalk.bold("\n  Manual steps needed (variant changes):"));
        for (const inst of instructions) {
          console.log(chalk.blue(`    ${inst.componentName}:`));
          for (const line of inst.instructions) {
            console.log(chalk.dim(`      → ${line}`));
          }
        }
      }
    }
  }

  console.log();
}
