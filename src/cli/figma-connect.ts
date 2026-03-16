/**
 * Shared Figma connection helper for CLI commands.
 *
 * Connects to Figma Desktop via figma-console MCP and validates
 * the open file matches the configured fileKey (if set).
 */

import chalk from "chalk";
import { connectToFigma, disconnect, type FigmaConnection } from "../figma-adapter/mcp-connection.js";

/**
 * Connect to Figma Desktop and validate the connection.
 *
 * If expectedFileKey is provided, warns if the open file doesn't match
 * (but still continues — the user may have renamed the file).
 */
export async function connectFigma(expectedFileKey?: string): Promise<FigmaConnection> {
  try {
    const conn = await connectToFigma();

    if (expectedFileKey && conn.fileKey !== expectedFileKey) {
      console.log(
        chalk.yellow(
          `  Warning: expected file ${expectedFileKey} but Figma has "${conn.fileName}" (${conn.fileKey}) open.`,
        ),
      );
    }

    return conn;
  } catch (err) {
    console.log(chalk.red(`\n  ${err instanceof Error ? err.message : String(err)}`));
    console.log(chalk.dim("  Make sure Figma Desktop is running with the bridge plugin.\n"));
    process.exit(1);
  }
}

export { disconnect };
