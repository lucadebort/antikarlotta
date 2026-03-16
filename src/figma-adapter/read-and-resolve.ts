/**
 * Convenience: fetch Figma components → convert to schemas → resolve names → resolve properties.
 */

import type { FigmaConnection } from "./mcp-connection.js";
import type { ComponentSchema } from "../schema/types.js";
import type { ComponentPropertyMap } from "../shared/config.js";
import { fetchComponents } from "./client.js";
import { figmaToSchemas } from "./reader.js";
import { resolveSchemaNames, type NameResolverConfig } from "../shared/name-resolver.js";
import { resolveAllProperties } from "../shared/property-resolver.js";

export interface ReadFigmaOptions {
  nameConfig: NameResolverConfig;
  propertyMap?: Record<string, ComponentPropertyMap>;
}

/**
 * Read Figma components and return resolved schemas.
 *
 * Pipeline: fetch (bridge) → convert → resolve names → resolve properties.
 */
export async function readFigmaSchemas(
  conn: FigmaConnection,
  options: ReadFigmaOptions,
): Promise<ComponentSchema[]> {
  const { componentSets, components } = await fetchComponents(conn);
  const schemas = figmaToSchemas(componentSets, components);
  const named = resolveSchemaNames(schemas, options.nameConfig);
  return resolveAllProperties(named, options.propertyMap);
}
