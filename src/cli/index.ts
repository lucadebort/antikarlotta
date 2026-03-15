#!/usr/bin/env node

/**
 * antikarlotta CLI — bidirectional Figma-code sync.
 */

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { diffCommand } from "./commands/diff.js";
import { commitCommand } from "./commands/commit.js";

const program = new Command()
  .name("antikarlotta")
  .description("Bidirectional Figma-code sync with a canonical component schema")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(statusCommand);
program.addCommand(diffCommand);
program.addCommand(commitCommand);

program.parse();
