```
        _____ _ _
       / ____(_) |
      | |  __ _| |_ _ __ ___   __ _
      | | |_ | | __| '_ ` _ \ / _` |
      | |__| | | |_| | | | | | (_| |
       \_____|_|\__|_| |_| |_|\__,_|

       figma ↔ code. zero drift.
```

Gitma keeps your Figma components and your React codebase in perfect sync. Designer changes a variant? You see the diff. Developer adds a prop? Gitma writes it to Figma. No copy-paste, no "did you update the component?", no drift.

## 3 steps to start

```bash
# 1. Install
pnpm add -D gitma

# 2. Init
npx gitma init

# 3. Sync
/gitma
```

That's it. Type `/gitma` in Claude Code and it handles the rest — reads Figma, compares with your code, shows what's different, and asks what you want to do.

## What you need

- [Claude Code](https://claude.ai/claude-code) with figma-console MCP server
- Figma Desktop with the [bridge plugin](https://github.com/nicholascooke/figma-console-mcp)
- A React/TypeScript codebase

No API tokens. No config files to maintain. No CLI to memorize.

## What it does

```
/gitma

  gitma status

  ✓ 12 component(s) in sync
  ↓ 3 component(s) with Figma drift:
    ↓ Button (2 changes)
    ↓ Badge (1 change)
    ↓ Input (1 change)
  ↑ 1 component(s) with code drift:
    ↑ Modal (1 change)
```

Then you say what you want:

- **"pull from Figma"** — updates your TypeScript interfaces, function params, and types to match Figma
- **"push to Figma"** — writes new props, states, and variant values directly to your Figma file
- **"show me the diff"** — detailed view of what changed and where
- **"resolve conflicts"** — when both sides changed the same thing

### What Gitma writes to your code

Surgical AST edits — no file rewrites:

- Adds/removes props in the TypeScript interface
- Adds/removes params in function destructuring (with defaults)
- Updates variant union types
- Adds `ReactNode` import for slots

Never touches your JSX or component logic. If a prop is removed, TypeScript shows you where to clean up.

### What Gitma writes to Figma

Via Claude Code's figma-console:

- Add/remove boolean, text, and instance swap properties
- Add variant values (clones from nearest existing, repositions correctly)
- Remove variant values
- Create/update/delete design token variables

## How it works under the hood

```
Figma Desktop
    ↕ bridge plugin
Claude Code (figma-console)
    ↕ figma_execute
/gitma skill
    ↕ stdin/files
Gitma CLI
    ↕ AST edits
Your code
```

Gitma itself never connects to Figma. It's a pure data processor. Claude Code reads Figma, passes the data to Gitma, and applies write-back operations. This means:

- No port conflicts, no WebSocket servers, no auth tokens
- Works with unpublished components
- Reads and writes in real-time to the open Figma file

## Configuration

`npx gitma init` creates `.gitma/config.json`:

```json
{
  "figmaFileKey": "your-figma-file-key",
  "componentGlobs": ["src/components/**/*.tsx"],
  "tokenFile": "tokens.tokens.json",
  "tokenFormat": "css-vars"
}
```

### Name mapping

When Figma and code name things differently:

```json
{
  "componentNameMap": {
    "Button ": "Button",
    "Fab test": "FloatingActionButton"
  }
}
```

### Property mapping

When Figma properties don't match code props 1:1:

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

## Design tokens

W3C Design Tokens format (`.tokens.json`). Syncs colors, dimensions, numbers, font families, font weights, and durations to Figma variables. Composite types (shadow, border, typography) are preserved but not synced.

## All commands

```bash
gitma init                        # interactive setup
gitma status                      # what's in sync, what's drifted
gitma diff --code                 # detailed code changes
gitma diff --figma                # detailed Figma changes
gitma pull figma --apply          # Figma → schema
gitma pull code --apply           # schema → code files
gitma push figma-to-code --apply  # Figma → schema → code
gitma push code-to-figma --apply  # code → schema → Figma write ops
gitma stage Button                # stage one component
gitma commit -m "message"         # commit baseline
gitma resolve                     # handle conflicts
gitma tokens pull figma --apply   # Figma variables → .tokens.json
gitma tokens push figma --apply   # .tokens.json → Figma write ops
gitma figma refresh               # import Figma data (used by /gitma skill)
gitma figma status                # show Figma snapshot info
```

## License

ISC
