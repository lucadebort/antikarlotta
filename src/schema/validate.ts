/**
 * Schema validation using Zod.
 */

import { z } from "zod/v4";
import type { ComponentSchemaFile } from "./types.js";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const PropTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "enum",
  "node",
  "callback",
  "object",
]);

const MetadataSchema = z.record(z.string(), z.unknown()).optional();

const PropSchema = z
  .object({
    name: z.string().min(1),
    type: PropTypeSchema,
    values: z.array(z.string()).optional(),
    required: z.boolean(),
    defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
    description: z.string().optional(),
    rawType: z.string().optional(),
    metadata: MetadataSchema,
  })
  .refine(
    (prop) => {
      // enum props must have values
      if (prop.type === "enum" && (!prop.values || prop.values.length === 0)) {
        return false;
      }
      return true;
    },
    { message: "Enum props must have at least one value" },
  );

const VariantSchema = z.object({
  name: z.string().min(1),
  values: z.array(z.string()).min(1),
  defaultValue: z.string().optional(),
  description: z.string().optional(),
  metadata: MetadataSchema,
});

const SlotSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  allowedComponents: z.array(z.string()).optional(),
  required: z.boolean(),
  metadata: MetadataSchema,
});

const TokenRefSchema = z.object({
  path: z.string().min(1),
  property: z.string().min(1),
  condition: z.string().optional(),
  metadata: MetadataSchema,
});

const StateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tokenOverrides: z.array(TokenRefSchema).optional(),
  metadata: MetadataSchema,
});

const ComponentSchemaSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  props: z.array(PropSchema),
  variants: z.array(VariantSchema),
  slots: z.array(SlotSchema),
  states: z.array(StateSchema),
  tokenRefs: z.array(TokenRefSchema),
  codePath: z.string().optional(),
  figmaNodeId: z.string().optional(),
  metadata: MetadataSchema,
});

const SchemaSourceSchema = z.enum(["figma", "code", "manual", "merge"]);

const ComponentSchemaFileSchema = z.object({
  version: z.literal("1.0"),
  components: z.array(ComponentSchemaSchema),
  lastModified: z.iso.datetime(),
  source: SchemaSourceSchema,
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  success: boolean;
  errors: ValidationError[];
}

export function validateSchema(data: unknown): ValidationResult {
  const result = ComponentSchemaFileSchema.safeParse(data);

  if (result.success) {
    // Additional semantic validations
    const errors: ValidationError[] = [];
    const schema = result.data as ComponentSchemaFile;

    for (const component of schema.components) {
      // Check variant defaultValue is in values
      for (const variant of component.variants) {
        if (
          variant.defaultValue &&
          !variant.values.includes(variant.defaultValue)
        ) {
          errors.push({
            path: `${component.name}.variants.${variant.name}.defaultValue`,
            message: `Default value "${variant.defaultValue}" is not in values: [${variant.values.join(", ")}]`,
          });
        }
      }

      // Check for duplicate prop/variant/slot names
      const names = new Set<string>();
      for (const prop of component.props) {
        if (names.has(prop.name)) {
          errors.push({
            path: `${component.name}.props.${prop.name}`,
            message: `Duplicate prop name "${prop.name}"`,
          });
        }
        names.add(prop.name);
      }
      for (const variant of component.variants) {
        if (names.has(variant.name)) {
          errors.push({
            path: `${component.name}.variants.${variant.name}`,
            message: `Duplicate name "${variant.name}" (conflicts with prop)`,
          });
        }
        names.add(variant.name);
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true, errors: [] };
  }

  const errors: ValidationError[] = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

  return { success: false, errors };
}

/** Validate a single component (without file wrapper) */
export function validateComponent(data: unknown): ValidationResult {
  const result = ComponentSchemaSchema.safeParse(data);

  if (result.success) {
    return { success: true, errors: [] };
  }

  const errors: ValidationError[] = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

  return { success: false, errors };
}
