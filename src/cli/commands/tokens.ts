/**
 * tokens command — sync W3C Design Tokens between .tokens.json and Figma variables.
 *
 * gitma tokens status             → show token drift
 * gitma tokens pull figma         → Figma variables → .tokens.json
 * gitma tokens push figma         → .tokens.json → Figma variables
 * gitma tokens validate           → validate .tokens.json against W3C spec
 */

import { Command } from "commander";
import chalk from "chalk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../../shared/config.js";
import type { DesignTokenFile } from "../../schema/tokens.js";
import { flattenTokens } from "../../schema/tokens.js";
import { tokensToFigmaVariables, figmaVariablesToTokens } from "../../figma-adapter/token-bridge.js";
import { fetchVariables } from "../../figma-adapter/client.js";
import { writeVariablesToFigma } from "../../figma-adapter/writer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadTokenFile(projectRoot: string, tokenPath: string): DesignTokenFile | null {
  const absPath = resolve(projectRoot, tokenPath);
  if (!existsSync(absPath)) return null;
  const json = readFileSync(absPath, "utf-8");
  return JSON.parse(json) as DesignTokenFile;
}

function saveTokenFile(projectRoot: string, tokenPath: string, tokens: DesignTokenFile): void {
  const absPath = resolve(projectRoot, tokenPath);
  writeFileSync(absPath, JSON.stringify(tokens, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const tokensCommand = new Command("tokens")
  .description("Sync design tokens between .tokens.json and Figma variables");

// --- tokens status ---

tokensCommand
  .command("status")
  .description("Show token file status")
  .action(async () => {
    const projectRoot = process.cwd();
    const config = loadConfig(projectRoot);
    const tokenPath = config.tokenFile ?? "tokens.tokens.json";

    const tokenFile = loadTokenFile(projectRoot, tokenPath);

    if (!tokenFile) {
      console.log(chalk.dim(`\n  No token file found at ${tokenPath}.`));
      console.log(chalk.dim(`  Create one or set tokenFile in .gitma/config.json.\n`));
      return;
    }

    try {
      const resolved = flattenTokens(tokenFile);
      console.log(chalk.bold(`\n  Token file: ${tokenPath}`));
      console.log(chalk.green(`  ${resolved.length} token(s) resolved successfully.\n`));

      // Group by type
      const byType = new Map<string, number>();
      for (const token of resolved) {
        byType.set(token.type, (byType.get(token.type) ?? 0) + 1);
      }

      for (const [type, count] of [...byType.entries()].sort()) {
        console.log(chalk.dim(`    ${type}: ${count}`));
      }
      console.log();
    } catch (err) {
      console.log(chalk.red(`\n  Error resolving tokens: ${err instanceof Error ? err.message : String(err)}\n`));
    }
  });

// --- tokens validate ---

tokensCommand
  .command("validate")
  .description("Validate .tokens.json against W3C spec")
  .action(async () => {
    const projectRoot = process.cwd();
    const config = loadConfig(projectRoot);
    const tokenPath = config.tokenFile ?? "tokens.tokens.json";

    const tokenFile = loadTokenFile(projectRoot, tokenPath);

    if (!tokenFile) {
      console.log(chalk.red(`\n  Token file not found: ${tokenPath}\n`));
      return;
    }

    const errors: string[] = [];

    try {
      const resolved = flattenTokens(tokenFile);
      console.log(chalk.green(`\n  Valid: ${resolved.length} token(s) resolved.\n`));

      // Check for tokens without explicit types
      for (const token of resolved) {
        if (!token.type) {
          errors.push(`Token "${token.path}" has no type`);
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    if (errors.length > 0) {
      console.log(chalk.red(`  ${errors.length} issue(s):\n`));
      for (const error of errors) {
        console.log(chalk.red(`    - ${error}`));
      }
      console.log();
    }
  });

// --- tokens pull figma ---

tokensCommand
  .command("pull")
  .argument("<source>", "Source: 'figma'")
  .option("--apply", "Write to .tokens.json (default is dry-run)")
  .description("Pull tokens from Figma variables into .tokens.json")
  .action(async (source: string, opts) => {
    if (source !== "figma") {
      console.log(chalk.red(`  Unknown source: ${source}. Use 'figma'.\n`));
      return;
    }

    const projectRoot = process.cwd();
    const config = loadConfig(projectRoot);
    const tokenPath = config.tokenFile ?? "tokens.tokens.json";

    if (!config.figmaFileKey) {
      console.log(chalk.red("  No Figma file key configured.\n"));
      return;
    }

    console.log(chalk.dim("  Reading Figma variables..."));

    const { variables, collections } = await fetchVariables({
      fileKey: config.figmaFileKey,
    });

    if (variables.length === 0) {
      console.log(chalk.dim("\n  No variables found in Figma file.\n"));
      return;
    }

    const tokenFile = figmaVariablesToTokens(variables, collections);
    const resolved = flattenTokens(tokenFile);

    console.log(chalk.bold(`\n  Found ${variables.length} Figma variable(s) → ${resolved.length} token(s).\n`));

    // Group by type
    const byType = new Map<string, number>();
    for (const token of resolved) {
      byType.set(token.type, (byType.get(token.type) ?? 0) + 1);
    }
    for (const [type, count] of [...byType.entries()].sort()) {
      console.log(chalk.dim(`    ${type}: ${count}`));
    }

    if (opts.apply) {
      saveTokenFile(projectRoot, tokenPath, tokenFile);
      console.log(chalk.green(`\n  Written to ${tokenPath}.\n`));
    } else {
      console.log(chalk.dim(`\n  Dry run. Use --apply to write to ${tokenPath}.\n`));
    }
  });

// --- tokens push figma ---

tokensCommand
  .command("push")
  .argument("<target>", "Target: 'figma'")
  .option("--apply", "Push to Figma (default is dry-run)")
  .description("Push .tokens.json to Figma variables")
  .action(async (target: string, opts) => {
    if (target !== "figma") {
      console.log(chalk.red(`  Unknown target: ${target}. Use 'figma'.\n`));
      return;
    }

    const projectRoot = process.cwd();
    const config = loadConfig(projectRoot);
    const tokenPath = config.tokenFile ?? "tokens.tokens.json";

    if (!config.figmaFileKey) {
      console.log(chalk.red("  No Figma file key configured.\n"));
      return;
    }

    const tokenFile = loadTokenFile(projectRoot, tokenPath);
    if (!tokenFile) {
      console.log(chalk.red(`\n  Token file not found: ${tokenPath}\n`));
      return;
    }

    const figmaVars = tokensToFigmaVariables(tokenFile);

    if (figmaVars.length === 0) {
      console.log(chalk.dim("\n  No tokens to push (composite types are skipped).\n"));
      return;
    }

    console.log(chalk.bold(`\n  ${figmaVars.length} variable(s) to push to Figma:\n`));

    // Group by collection
    const byCollection = new Map<string, number>();
    for (const v of figmaVars) {
      byCollection.set(v.collectionName, (byCollection.get(v.collectionName) ?? 0) + 1);
    }
    for (const [collection, count] of [...byCollection.entries()].sort()) {
      console.log(chalk.dim(`    ${collection}: ${count} variable(s)`));
    }

    if (!opts.apply) {
      console.log(chalk.dim("\n  Dry run. Use --apply to push to Figma.\n"));
      return;
    }

    console.log(chalk.dim("\n  Pushing to Figma..."));

    // Read existing variables to determine create vs update
    const { variables: existing, collections: existingCollections } = await fetchVariables({
      fileKey: config.figmaFileKey,
    });

    const existingCollMap = new Map(existingCollections.map((c) => [c.name, c.id]));
    const existingVarMap = new Map(existing.map((v) => [v.name, v.id]));

    const result = await writeVariablesToFigma(
      { fileKey: config.figmaFileKey },
      figmaVars,
      existingCollMap,
      existingVarMap,
    );

    if (result.errors.length > 0) {
      console.log(chalk.red(`\n  Errors:`));
      for (const err of result.errors) {
        console.log(chalk.red(`    - ${err}`));
      }
    }

    console.log(chalk.green(`\n  Done: ${result.created} created, ${result.updated} updated.\n`));
  });
