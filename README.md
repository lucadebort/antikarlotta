```
 ______     __     ______   __    __     ______
/\  ___\   /\ \   /\__  _\ /\ "-./  \   /\  __ \
\ \ \__ \  \ \ \  \/_/\ \/ \ \ \-./\ \  \ \  __ \
 \ \_____\  \ \_\    \ \_\  \ \_\ \ \_\  \ \_\ \_\
  \/_____/   \/_/     \/_/   \/_/  \/_/   \/_/\/_/

  figma ↔ code. zero drift.
```

Gitma keeps your Figma components and your React codebase in perfect sync. Designer changes a variant? You see the diff. Developer adds a prop? Gitma writes it to Figma. No copy-paste, no "did you update the component?", no drift.

## Setup (once)

```bash
# 1. Add the figma-console MCP server to Claude Code
claude mcp add figma-console -- npx -y figma-console-mcp@latest

# 2. Install the bridge plugin in Figma Desktop
npx figma-console-mcp@latest --print-path
# → Import the manifest in Figma: Plugins → Development → Import plugin from manifest

# 3. Install the /gitma command (pick one)

# Per project (committed to git, shared with team):
mkdir -p .claude/commands
curl -o .claude/commands/gitma.md https://raw.githubusercontent.com/lucadebort/gitma/main/commands/gitma.md

# Or global (available in all projects):
curl -o ~/.claude/commands/gitma.md https://raw.githubusercontent.com/lucadebort/gitma/main/commands/gitma.md
```

## Use

Open Figma Desktop with your file. Run the bridge plugin. Then in Claude Code:

```
/gitma
```

Claude reads Figma, compares with your code, shows what's different, and asks what you want to do.

```
Figma file: "📖 Design System" (32 components)
Code: src/components/ (18 components)

✓ 15 in sync
↓ 2 with Figma drift:
  Button: +size=xl (Figma added variant value)
  Badge: +isLoading (Figma added boolean prop)
↑ 1 with code drift:
  Modal: +onClose callback (code added prop)

Want me to pull from Figma, push to Figma, or show details?
```

## Commands

```
/gitma                  → read both sides, show status, suggest actions
/gitma status           → show sync status
/gitma pull figma       → Figma changes → apply to code
/gitma push code        → code changes → apply to Figma
/gitma diff             → detailed diff both directions
/gitma generate Badge   → generate React component from Figma (with tokens)
/gitma preview          → generate interactive component documentation
```

## What it does

### Pull from Figma → Code

Claude updates your TypeScript interfaces, function params, and types to match Figma. Surgical edits, never touches your JSX.

### Push from Code → Figma

Claude writes new props, states, and variant values directly to your Figma file. Including cloning variant children with correct positioning.

### Generate from Figma

Claude reads a component's structure, visual properties, and token bindings, then generates a complete React component with token-based styling.

### Interactive preview

`/gitma preview` generates a self-contained HTML page with all your components:

- **Component list** with navigation
- **Live preview** with interactive controls (variant chips, boolean toggles, text inputs, icon swap grids)
- **Inspect panel** showing Design, Layout, and CSS with Figma token references
- **Code dock** with copyable React JSX
- **Figma link** per component to jump to the source

## What you need

- [Claude Code](https://claude.ai/claude-code) with figma-console MCP server
- Figma Desktop with the bridge plugin
- React/TypeScript components

No API tokens. No npm packages in your project. No CLI to learn.

## What it can sync

| From Figma | To Code |
|-----------|---------|
| Variant property (enum) | Union type + prop |
| Boolean property | `boolean` prop or state |
| Text property | `string` prop |
| Instance swap | `ReactNode` slot |
| Variant values (sm, md, lg) | Union type values |

| From Code | To Figma |
|-----------|---------|
| New boolean prop | `addComponentProperty("BOOLEAN")` |
| New string prop | `addComponentProperty("TEXT")` |
| New slot | `addComponentProperty("INSTANCE_SWAP")` |
| Removed prop | `deleteComponentProperty()` |
| New variant value | Clone + rename + reposition |

## How it works

### The schema: a shared contract between Figma and code

Gitma introduces a **canonical schema** as the single source of truth. Neither Figma nor code is "right" — they both get compared against this shared contract.

```
Figma ──reader──→ ComponentSchema[] ←──reader── Code
                        ↑
                    SNAPSHOT
                 (.gitma/snapshots/committed.json)
```

The schema is a neutral format that captures what both sides can represent: props, variants, slots, states, and token references. It lives in `.gitma/snapshots/` as JSON files.

| Snapshot | What it is |
|----------|-----------|
| `committed.json` | The last agreed-upon state — the **baseline** |
| `figma.json` | Current state read from Figma |
| `code.json` | Current state read from TypeScript |

The workflow mirrors git:

1. **status** — read both sides, convert to schema, compare against `committed`
2. **diff** — show additions, removals, modifications per component
3. **stage** — choose which changes to accept
4. **commit** — save the new `committed.json` as the new baseline
5. **pull/push** — apply accepted changes to the other side

When both sides change the same field (e.g., designer renames a variant while developer renames the same variant differently), Gitma detects a **conflict** and asks you to resolve it — just like git.

### What Figma owns vs. what code owns

Figma components are primarily **visual**: layout, colors, spacing, typography, variant options, slot structure. Code components own **behavior**: event handlers, validation logic, async state, business rules.

Gitma respects this boundary. The schema has explicit prop types that separate the two worlds:

| Prop type | Synced to Figma? | Example |
|-----------|-----------------|---------|
| `string` | Yes | `label`, `placeholder` |
| `number` | Yes | `maxLength`, `columns` |
| `boolean` | Yes | `disabled`, `loading` |
| `enum` | Yes | `size: "sm" \| "md" \| "lg"` |
| `node` | Yes (instance swap) | `icon`, `children` |
| `callback` | No — code only | `onClick`, `onSubmit` |
| `object` | No — code only | `style`, `config` |

When you add an `onClick` handler in code, Gitma records it in the schema but never tries to push it to Figma. When a designer adds a new variant value in Figma, Gitma proposes adding it to your TypeScript types — but never generates behavior logic.

The rule: **Figma decides how it looks. Code decides how it works. The schema tracks both.**

## FAQ

### What is the "source of truth"?

Neither Figma nor code. The source of truth is `committed.json` — the last version both sides agreed on. Think of it as the `main` branch in git. Figma and code are like two feature branches that get compared against it.

### What happens if I only have Figma, no code yet?

Gitma reads your Figma file, generates a schema, and that becomes your first `committed.json`. From there you can generate code (`/gitma generate ComponentName`) or just use the preview to explore your design system.

### What happens if I only have code, no Figma?

Same flow in reverse. Gitma reads your TypeScript components, generates a schema, and you can push to Figma when ready.

### Does Gitma generate my component's behavior?

No. Gitma syncs the **interface** (props, variants, slots, states, tokens) — not the implementation. Your `onClick` handlers, form validation, API calls, and business logic are yours. Gitma will never touch your JSX or component body.

### What if the designer and developer change the same thing?

Gitma detects it as a **conflict**. For example, if the designer changes `size` values from `sm/md/lg` to `xs/sm/md/lg/xl` while the developer changes them to `small/medium/large`, Gitma shows both versions and asks you to pick one (or merge manually).

### How are design tokens handled?

Gitma uses the [W3C Design Tokens Community Group format](https://www.designtokens.org/) (`.tokens.json`). Tokens are extracted from Figma variables and stored alongside the schema. Each component's schema includes `tokenRefs` — explicit links between a component property (e.g., `background-color`) and a token path (e.g., `color.primary.500`).

### Can I use this without React?

The schema is framework-agnostic. The code adapter currently reads React/TypeScript, but the schema format (props, variants, slots, states) maps to any component model — Vue, Svelte, Web Components. Adapters for other frameworks can be added.

### What if my Figma component names don't match my code names?

Use the `componentNameMap` in `.gitma/config.json` to map between them. Similarly, `propertyMap` handles prop name differences (e.g., Figma's `buttonLabel` maps to code's `children`).

### Is there a CI/CD integration?

Not yet. The current workflow is interactive via Claude Code. A future `gitma check` command could run in CI to fail builds when drift exceeds a threshold.

## Configuration

On first run, `/gitma` creates `.gitma/config.json`:

```json
{
  "figmaFileKey": "your-figma-file-key",
  "componentGlobs": ["src/components/**/*.tsx"]
}
```

### Name mapping

```json
{
  "componentNameMap": {
    "Button ": "Button",
    "Fab test": "FloatingActionButton"
  }
}
```

### Property mapping

```json
{
  "propertyMap": {
    "Button": {
      "props": { "buttonLabel": "children", "showLabel": null },
      "variantToState": {
        "state": { "isDisabled": "disabled", "isHovered": null }
      }
    }
  }
}
```

## License

ISC
