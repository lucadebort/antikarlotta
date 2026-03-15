/**
 * Colorized diff output — inspired by git diff.
 */

import chalk from "chalk";
import type { SchemaChange, Conflict } from "../../diff-engine/types.js";

export function formatChange(change: SchemaChange): string {
  const icon = change.changeType === "added" ? "+"
    : change.changeType === "removed" ? "-"
    : "~";

  const color = change.changeType === "added" ? chalk.green
    : change.changeType === "removed" ? chalk.red
    : chalk.yellow;

  const severity = change.severity === "breaking" ? chalk.red(" [BREAKING]")
    : change.severity === "conflict" ? chalk.magenta(" [CONFLICT]")
    : "";

  return color(`  ${icon} ${change.description}${severity}`);
}

export function formatDiff(changes: SchemaChange[]): string {
  if (changes.length === 0) return chalk.green("  No changes detected.");

  // Group by component
  const grouped = new Map<string, SchemaChange[]>();
  for (const change of changes) {
    const group = grouped.get(change.componentName) ?? [];
    group.push(change);
    grouped.set(change.componentName, group);
  }

  const lines: string[] = [];
  for (const [componentName, componentChanges] of grouped) {
    lines.push(chalk.bold(`\n  ${componentName}`));
    for (const change of componentChanges) {
      lines.push(formatChange(change));
    }
  }

  return lines.join("\n");
}

export function formatConflict(conflict: Conflict): string {
  const lines: string[] = [];
  lines.push(chalk.magenta.bold(`  CONFLICT: ${conflict.componentName} → ${conflict.fieldPath}`));
  lines.push(chalk.dim(`    base:  ${JSON.stringify(conflict.base)}`));
  lines.push(chalk.blue(`    figma: ${JSON.stringify(conflict.figma)}`));
  lines.push(chalk.yellow(`    code:  ${JSON.stringify(conflict.code)}`));
  return lines.join("\n");
}

export function formatConflicts(conflicts: Conflict[]): string {
  if (conflicts.length === 0) return "";
  const lines = [chalk.magenta.bold(`\n  ${conflicts.length} conflict(s):\n`)];
  for (const conflict of conflicts) {
    lines.push(formatConflict(conflict));
    lines.push("");
  }
  return lines.join("\n");
}
