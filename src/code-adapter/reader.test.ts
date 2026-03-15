import { describe, it, expect } from "vitest";
import { readComponentsFromSource } from "./reader.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function readOne(source: string) {
  const schemas = readComponentsFromSource(source);
  expect(schemas).toHaveLength(1);
  return schemas[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("readComponentsFromSource", () => {
  it("extracts a simple function component", () => {
    const schema = readOne(`
      interface ButtonProps {
        label: string;
      }
      export function Button({ label }: ButtonProps) {
        return <button>{label}</button>;
      }
    `);

    expect(schema.name).toBe("Button");
    expect(schema.props).toHaveLength(1);
    expect(schema.props[0].name).toBe("label");
    expect(schema.props[0].type).toBe("string");
    expect(schema.props[0].required).toBe(true);
  });

  it("extracts props with types", () => {
    const schema = readOne(`
      interface InputProps {
        value: string;
        count: number;
        visible: boolean;
      }
      export function Input({ value, count, visible }: InputProps) {
        return <input />;
      }
    `);

    expect(schema.props.find((p) => p.name === "value")?.type).toBe("string");
    expect(schema.props.find((p) => p.name === "count")?.type).toBe("number");
    expect(schema.props.find((p) => p.name === "visible")?.type).toBe("boolean");
  });

  it("detects optional props", () => {
    const schema = readOne(`
      interface Props {
        label: string;
        hint?: string;
      }
      export function Field({ label, hint }: Props) {
        return <div>{label}{hint}</div>;
      }
    `);

    expect(schema.props.find((p) => p.name === "label")?.required).toBe(true);
    expect(schema.props.find((p) => p.name === "hint")?.required).toBe(false);
  });

  it("extracts default values from destructuring", () => {
    const schema = readOne(`
      interface Props {
        size?: "sm" | "md" | "lg";
        count?: number;
      }
      export function Widget({ size = "md", count = 0 }: Props) {
        return <div />;
      }
    `);

    const sizeVariant = schema.variants.find((v) => v.name === "size");
    expect(sizeVariant).toBeDefined();
    expect(sizeVariant!.defaultValue).toBe("md");
  });

  it("detects string literal union as variant", () => {
    const schema = readOne(`
      interface ButtonProps {
        variant: "primary" | "secondary" | "ghost";
        size?: "sm" | "md" | "lg";
      }
      export function Button({ variant, size }: ButtonProps) {
        return <button />;
      }
    `);

    expect(schema.variants).toHaveLength(2);

    const variantProp = schema.variants.find((v) => v.name === "variant");
    expect(variantProp).toBeDefined();
    expect(variantProp!.values).toEqual(["primary", "secondary", "ghost"]);

    const sizeProp = schema.variants.find((v) => v.name === "size");
    expect(sizeProp).toBeDefined();
    expect(sizeProp!.values).toEqual(["sm", "md", "lg"]);
  });

  it("detects ReactNode props as slots", () => {
    const schema = readOne(`
      import { ReactNode } from "react";
      interface CardProps {
        children: ReactNode;
        header?: ReactNode;
        footer?: ReactNode;
      }
      export function Card({ children, header, footer }: CardProps) {
        return <div>{header}{children}{footer}</div>;
      }
    `);

    expect(schema.slots).toHaveLength(3);
    expect(schema.slots.find((s) => s.name === "children")?.required).toBe(true);
    expect(schema.slots.find((s) => s.name === "header")?.required).toBe(false);
    expect(schema.slots.find((s) => s.name === "footer")?.required).toBe(false);
  });

  it("detects boolean state props", () => {
    const schema = readOne(`
      interface ButtonProps {
        label: string;
        disabled?: boolean;
        loading?: boolean;
      }
      export function Button({ label, disabled, loading }: ButtonProps) {
        return <button disabled={disabled}>{label}</button>;
      }
    `);

    expect(schema.states).toHaveLength(2);
    expect(schema.states.map((s) => s.name).sort()).toEqual(["disabled", "loading"]);
  });

  it("detects callback props", () => {
    const schema = readOne(`
      interface ButtonProps {
        label: string;
        onClick?: () => void;
        onHover?: (event: MouseEvent) => void;
      }
      export function Button({ label, onClick, onHover }: ButtonProps) {
        return <button onClick={onClick}>{label}</button>;
      }
    `);

    const callbacks = schema.props.filter((p) => p.type === "callback");
    expect(callbacks).toHaveLength(2);
    expect(callbacks[0].rawType).toBeDefined();
  });

  it("extracts arrow function component", () => {
    const schema = readOne(`
      interface TagProps {
        label: string;
        color?: "red" | "blue" | "green";
      }
      export const Tag = ({ label, color }: TagProps) => {
        return <span>{label}</span>;
      };
    `);

    expect(schema.name).toBe("Tag");
    expect(schema.props.find((p) => p.name === "label")?.type).toBe("string");
    expect(schema.variants.find((v) => v.name === "color")).toBeDefined();
  });

  it("skips non-component exports (lowercase names)", () => {
    const schemas = readComponentsFromSource(`
      export function helper() { return 42; }
      export const utils = { foo: 1 };
      export function Button() { return <button />; }
    `);

    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe("Button");
  });

  it("extracts multiple components from one file", () => {
    const schemas = readComponentsFromSource(`
      export function Button() { return <button />; }
      export function Input() { return <input />; }
    `);

    expect(schemas).toHaveLength(2);
    expect(schemas.map((s) => s.name).sort()).toEqual(["Button", "Input"]);
  });

  it("handles component with no props", () => {
    const schema = readOne(`
      export function Divider() {
        return <hr />;
      }
    `);

    expect(schema.name).toBe("Divider");
    expect(schema.props).toHaveLength(0);
    expect(schema.variants).toHaveLength(0);
    expect(schema.slots).toHaveLength(0);
  });

  it("sets codePath from filename", () => {
    const schemas = readComponentsFromSource(
      `export function Button() { return <button />; }`,
      "src/components/Button.tsx",
    );

    expect(schemas[0].codePath).toBe("src/components/Button.tsx");
  });

  it("preserves metadata about forwardRef and memo", () => {
    // Note: ts-morph in-memory detection of forwardRef depends on the initializer text
    const schemas = readComponentsFromSource(`
      export const Button = ({ label }: { label: string }) => {
        return <button>{label}</button>;
      };
    `);

    expect(schemas).toHaveLength(1);
    expect(schemas[0].metadata?.forwardRef).toBeUndefined();
  });
});
