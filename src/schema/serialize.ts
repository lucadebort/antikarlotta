/**
 * Schema serialization — deterministic JSON round-trips for stable diffs.
 */

import type { ComponentSchemaFile } from "./types.js";

/** Key ordering for deterministic serialization */
function sortKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[k] = (value as Record<string, unknown>)[k];
  }
  return sorted;
}

/** Serialize a schema file to deterministic JSON */
export function serializeSchema(schema: ComponentSchemaFile): string {
  return JSON.stringify(schema, sortKeys, 2) + "\n";
}

/** Deserialize a JSON string to a schema file */
export function deserializeSchema(json: string): ComponentSchemaFile {
  return JSON.parse(json) as ComponentSchemaFile;
}
