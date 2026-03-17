#!/usr/bin/env node

/**
 * gitma CLI — bidirectional Figma-code sync.
 */

import { config } from "dotenv";
config(); // loads .env from cwd

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { diffCommand } from "./commands/diff.js";
import { commitCommand } from "./commands/commit.js";
import { pullCommand } from "./commands/pull.js";
import { pushCommand } from "./commands/push.js";
import { stageCommand } from "./commands/stage.js";
import { resolveCommand } from "./commands/resolve.js";
import { tokensCommand } from "./commands/tokens.js";
import { figmaCommand } from "./commands/figma.js";
import { previewCommand } from "./commands/preview.js";
import { updateCommand } from "./commands/update.js";
import { printBanner, checkForUpdates } from "./banner.js";

const VERSION = "0.1.0";

const program = new Command()
  .name("gitma")
  .description("Bidirectional Figma-code sync with a canonical component schema")
  .version(VERSION);

program.addCommand(initCommand);
program.addCommand(statusCommand);
program.addCommand(diffCommand);
program.addCommand(stageCommand);
program.addCommand(commitCommand);
program.addCommand(pullCommand);
program.addCommand(pushCommand);
program.addCommand(resolveCommand);
program.addCommand(tokensCommand);
program.addCommand(figmaCommand);
program.addCommand(previewCommand);
program.addCommand(updateCommand);

// Show banner on any command (not on --help or --version)
const args = process.argv.slice(2);
const isSilent = args.includes("--help") || args.includes("-h") ||
  args.includes("--version") || args.includes("-V");

if (!isSilent) {
  printBanner(VERSION);
  // Non-blocking: check for updates in background, don't await
  checkForUpdates(VERSION);
}

program.parse();
