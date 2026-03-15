/**
 * init command — set up .antikarlotta/ in a project.
 */

import { Command } from "commander";
import chalk from "chalk";
import { saveConfig, type ProjectConfig } from "../../shared/config.js";
import { saveSnapshot } from "../../diff-engine/snapshot.js";

export const initCommand = new Command("init")
  .description("Initialize antikarlotta in the current project")
  .option("--figma-key <key>", "Figma file key")
  .option("--globs <patterns...>", "Component file glob patterns", ["src/components/**/*.tsx"])
  .option("--token-file <path>", "Path to .tokens.json file")
  .option("--token-format <format>", "Token format in code", "css-vars")
  .action(async (opts) => {
    const projectRoot = process.cwd();

    const config: ProjectConfig = {
      figmaFileKey: opts.figmaKey,
      componentGlobs: opts.globs,
      tokenFile: opts.tokenFile,
      tokenFormat: opts.tokenFormat,
    };

    saveConfig(projectRoot, config);

    // Create empty committed snapshot as baseline
    saveSnapshot(projectRoot, "committed", [], "manual");

    console.log(chalk.green("\n  Initialized antikarlotta.\n"));
    console.log(chalk.dim("  Created .antikarlotta/config.json"));
    console.log(chalk.dim("  Created .antikarlotta/snapshots/committed.json\n"));
    console.log(`  Next: run ${chalk.bold("antikarlotta status")} to see component drift.\n`);
  });
