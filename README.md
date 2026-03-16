```
  ______     __     ______   __    __     ______
 /\  ___\   /\ \   /\__  _\ /\ "-./  \   /\  __ \
 \ \ \__ \  \ \ \  \/_/\ \/ \ \ \-./\ \  \ \  __ \
  \ \_____\  \ \_\    \ \_\  \ \_\ \ \_\  \ \_\ \_\
   \/_____/   \/_/     \/_/   \/_/  \/_/   \/_/\/_/
```

Git-like bidirectional sync between Figma and code.

Gitma keeps your design system in Figma and your component library in code perfectly aligned. When the designer changes a component in Figma, the developer sees the diff and pulls it into code. When the developer adds a prop, Gitma writes it to Figma. One source of truth, two tools, zero drift.

## Who is this for

Designer-developer pairs working on component-based design systems. You need:

- [Claude Code](https://claude.ai/claude-code) with the figma-console MCP server
- A Figma file with components (variants, properties) — published or not
- A codebase with React/TypeScript components

## How it works

```
Figma ←→ Claude Code ←→ Gitma ←→ Code
```

Gitma is a pure CLI that works with files. It never connects to Figma directly — **Claude Code is the bridge**. Claude reads Figma via figma-console, passes the data to Gitma, and applies write-back operations.

Think of it like git, but between Figma and code:

- `/gitma` — Claude reads Figma, refreshes snapshots, runs status
- `gitma status` — what's out of sync?
- `gitma diff` — show me the details
- `gitma pull` — bring changes from one side
- `gitma push` — sync from one side to the other
- `gitma resolve` — handle conflicts when both sides changed

## Quick start

### 1. Install

```bash
# In your project
pnpm add -D gitma
```

### 2. Set up figma-console in Claude Code

Gitma reads Figma through Claude Code's figma-console MCP server. Make sure it's configured:

1. In Claude Code, verify figma-console is connected:
   ```
   claude mcp list
   ```
   You should see `figma-console: ✓ Connected`.

2. Open your design file in Figma Desktop and run the bridge plugin (**Plugins → Development → Figma Desktop Bridge**).

No Figma API token needed — figma-console connects directly to Figma Desktop.

### 3. Initialize

```bash
npx gitma init
```

Gitma will ask you:
- Your Figma file URL
- Where your components live (e.g., `src/components/**/*.tsx`)
- Whether you have a token file

This creates `.gitma/config.json` in your project.

### 4. First sync

In Claude Code, type `/gitma` — Claude will:
1. Read your Figma components via figma-console
2. Save them as a snapshot
3. Run `gitma status` to show what's in sync and what's drifted

Then:

```bash
# Commit your current code as the baseline
npx gitma commit -m "initial baseline"

# See what's different in Figma
npx gitma diff --figma

# Pull Figma changes into the schema
npx gitma pull figma --apply

# Apply schema changes to your code
npx gitma pull code --apply
```

## Commands

### Figma snapshots

```bash
gitma figma status        # show Figma snapshot info
gitma figma refresh       # import raw Figma data (from stdin, used by /gitma skill)
```

### Sync status

```bash
gitma status              # overview: what's in sync, what's drifted
gitma diff --code         # detailed code changes
gitma diff --figma        # detailed Figma changes
gitma diff --component Button  # diff for a specific component
```

### Syncing changes

```bash
# Designer changed Figma → update code
gitma push figma-to-code          # dry run (preview)
gitma push figma-to-code --apply  # do it

# Developer changed code → generate Figma write ops
gitma push code-to-figma          # dry run
gitma push code-to-figma --apply  # saves write ops for Claude to apply
```

### Granular control

```bash
gitma stage Button        # stage changes for one component
gitma stage --all         # stage everything
gitma stage --list        # see what's staged
gitma commit -m "message" # commit staged changes
gitma pull figma --apply  # update schema from Figma snapshot
gitma pull code --apply   # apply schema to code files
```

### Conflict resolution

```bash
gitma resolve                # show conflicts
gitma resolve --take figma   # resolve all: take Figma version
gitma resolve --take code    # resolve all: take code version
```

### Design tokens (W3C format)

```bash
gitma tokens status          # show token summary
gitma tokens validate        # check W3C spec compliance
gitma tokens pull figma --apply   # Figma variables → .tokens.json
gitma tokens push figma --apply   # .tokens.json → write ops for Claude
```

## Configuration

Gitma stores config in `.gitma/config.json`:

```json
{
  "figmaFileKey": "your-figma-file-key",
  "componentGlobs": ["src/components/**/*.tsx"],
  "tokenFile": "tokens.tokens.json",
  "tokenFormat": "css-vars",
  "formatCommand": "npx prettier --write",
  "componentNameMap": {},
  "propertyMap": {}
}
```

### Component name mapping

Figma and code don't always name things the same. Map them:

```json
{
  "componentNameMap": {
    "Button ": "Button",
    "Fab test": "FloatingActionButton"
  }
}
```

Names are auto-normalized (trimmed, whitespace collapsed). The map is for cases where the names are genuinely different.

### Property mapping

Figma properties often don't match code props 1:1. Configure per component:

```json
{
  "propertyMap": {
    "Button": {
      "props": {
        "buttonLabel": "children",
        "showLabel": null
      },
      "variantToState": {
        "state": {
          "isDisabled": "disabled",
          "isHovered": null,
          "default": null
        }
      },
      "ignore": ["internalProp"]
    }
  }
}
```

- **`props`** — rename Figma prop → code prop. `null` to ignore.
- **`variantToState`** — convert a Figma variant to boolean states. Figma's `state` variant with value `"isDisabled"` becomes code's `disabled: boolean`. `null` values are skipped (Figma-only states like hover).
- **`ignore`** — skip these Figma properties entirely.

## How Gitma talks to Figma

Gitma itself never connects to Figma. The architecture:

```
Figma Desktop
    ↕ (plugin bridge)
figma-console (Claude Code MCP server)
    ↕ (figma_execute)
/gitma skill (reads components, saves snapshot)
    ↕ (stdin/files)
Gitma CLI (pure data processor)
    ↕ (AST edits)
Your code
```

**Reading**: The `/gitma` skill in Claude Code runs `figma_execute` to read all component sets, properties, variants, and variables. It converts them to Gitma's schema format and saves as `.gitma/snapshots/figma.json`. Gitma CLI reads this file.

**Writing**: When `gitma push code-to-figma --apply` detects changes, it outputs structured write operations to `.gitma/figma-write-ops.json`. Claude Code reads these and applies them via `figma_execute`:

| Change | How it's applied |
|--------|-----------------|
| Add boolean/text/slot property | `node.addComponentProperty()` via figma_execute |
| Remove property | `node.deleteComponentProperty()` via figma_execute |
| Add/remove variant values | Manual — reported as instructions |
| Create/update/delete variables | `figma.variables.*` API via figma_execute |

## What Gitma changes in your code

When you run `gitma pull code --apply`, Gitma modifies your component files:

**What it does:**
- Adds/removes props in the TypeScript interface
- Adds/removes params in the function destructuring (with defaults)
- Updates variant union types when values change
- Updates default values in destructuring
- Adds `ReactNode` import when slots are created

**What it does NOT do:**
- Touch your JSX or component logic
- Rewrite files — it makes surgical AST edits
- Change anything without `--apply` flag

If a prop is removed, TypeScript will highlight every remaining usage. You clean up the logic — Gitma handles the contract.

## Design tokens

Gitma uses the [W3C Design Tokens](https://www.designtokens.org/tr/2025.10/) format (`.tokens.json`). Supported types:

| Type | Syncs to Figma |
|------|---------------|
| color | Yes (COLOR variable) |
| dimension | Yes (FLOAT variable) |
| number | Yes (FLOAT variable) |
| fontFamily | Yes (STRING variable) |
| fontWeight | Yes (FLOAT variable) |
| duration | Yes (FLOAT, in ms) |
| shadow | No (composite — preserved in `$extensions`) |
| border | No (composite) |
| typography | No (composite) |

Token aliases (`{color.primary.500}`) and group inheritance (`$type` on parent groups) are fully supported.

## Claude Code integration

Gitma is designed to be used with [Claude Code](https://claude.ai/claude-code). The `/gitma` skill handles the full workflow:

1. Reads Figma components and variables via figma-console
2. Saves snapshots for Gitma to consume
3. Runs Gitma commands and interprets the output
4. Applies write-back operations to Figma

To set up, copy `commands/gitma.md` to your Claude Code commands directory:

```bash
cp node_modules/gitma/commands/gitma.md ~/.claude/commands/gitma.md
```

Then type `/gitma` in any project with a `.gitma/config.json`.

## Project structure

```
your-project/
  .gitma/
    config.json              # project config (committed to git)
    snapshots/               # schema states (gitignored)
      committed.json         # baseline schema
      figma.json             # latest Figma read
    staging/                 # staged changes (gitignored)
    figma-write-ops.json     # pending Figma writes (gitignored)
  src/
    components/              # your React components
  tokens.tokens.json         # W3C design tokens (optional)
```

## License

ISC
