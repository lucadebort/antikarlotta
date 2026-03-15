/**
 * Snapshot storage — persist schema states in .antikarlotta/snapshots/.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ComponentSchema } from "../schema/types.js";
import { serializeSchema, deserializeSchema } from "../schema/serialize.js";
import type { ComponentSchemaFile, SchemaSource } from "../schema/types.js";

const SNAPSHOTS_DIR = ".antikarlotta/snapshots";

export type SnapshotName = "figma" | "code" | "committed";

function snapshotPath(projectRoot: string, name: SnapshotName): string {
  return join(projectRoot, SNAPSHOTS_DIR, `${name}.json`);
}

function ensureDir(projectRoot: string): void {
  const dir = join(projectRoot, SNAPSHOTS_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Save a schema snapshot */
export function saveSnapshot(
  projectRoot: string,
  name: SnapshotName,
  components: ComponentSchema[],
  source: SchemaSource,
): void {
  ensureDir(projectRoot);
  const file: ComponentSchemaFile = {
    version: "1.0",
    components,
    lastModified: new Date().toISOString(),
    source,
  };
  writeFileSync(snapshotPath(projectRoot, name), serializeSchema(file), "utf-8");
}

/** Load a schema snapshot. Returns null if it doesn't exist. */
export function loadSnapshot(
  projectRoot: string,
  name: SnapshotName,
): ComponentSchema[] | null {
  const path = snapshotPath(projectRoot, name);
  if (!existsSync(path)) return null;
  const json = readFileSync(path, "utf-8");
  return deserializeSchema(json).components;
}

/** Check if a snapshot exists */
export function snapshotExists(projectRoot: string, name: SnapshotName): boolean {
  return existsSync(snapshotPath(projectRoot, name));
}
