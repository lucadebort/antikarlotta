# Antikarlotta

## Business
**Team:** 1 designer + 1 developer
**Goal:** 1:1 alignment between Figma and codebase — a bidirectional sync workflow, AI-powered

## User
**End user:** Designer-developer pairs working on component-based design systems
**Need:** Any change to design or code is detected, compared against a shared truth, and either synced or flagged for review — drift becomes impossible

## Stack
Node.js + TypeScript (CLI tool), ts-morph (AST), Figma MCP + REST API, Vitest

## EIID

### Enrichment (collect)
**Have:** Figma MCP (read/write components, variants, tokens, slots), TypeScript AST parsing (props, types), git change detection
**Human input:** Designer works in Figma, developer works in code — no behavior change
**Missing:** Figma change polling, slot structure extraction
**Connect:** Figma MCP ↔ schema, ts-morph ↔ schema
**Approach:** Automate — MCP and AST parsing are commodity

### Inference (patterns)
**Detect:** Schema ↔ Figma drift, schema ↔ code drift, conflicts when both sides changed
**Predict:** Additive changes (auto-sync safe) vs. breaking changes (need review)
**Flag:** Conflicts, orphaned components, token mismatches
**Approach:** Innovate — cross-representation diff engine is core IP

### Interpretation (insights)
**Surface:** "Button: designer added size=xl in Figma, not in code. Stage it?"
**Frame as:** Git-style diffs per component — additions, deletions, modifications, conflicts
**Approach:** Differentiate — humans approve, system presents

### Delivery (reach)
**Channels:** CLI (developer), Figma MCP write-back (designer), git (schema versioning)
**Triggers:** On-demand (status, pull, push) or watch mode
**Timing:** Before handoff, after design review, before PR
**Approach:** Automate transport, Differentiate CLI UX

## Token Standard
W3C Design Tokens Community Group format (2025.10 spec).
- Files: `.tokens.json` extension, MIME `application/design-tokens+json`
- Types: color, dimension, fontFamily, fontWeight, duration, cubicBezier, number, plus composites (shadow, border, typography, gradient)
- Aliases via `{path.to.token}` syntax, JSON Pointer `$ref` for property-level references
- Groups with `$type` inheritance, `$extends` for group composition
- `$extensions` preserved through read/write for custom metadata
- No Style Dictionary, no Token Studio — the W3C spec IS the token layer

## Technology Constraints
Use TypeScript, NOT JavaScript.
Use Vitest, NOT Jest, Mocha.
Use pnpm, NOT npm, yarn, bun.
Use ts-morph, NOT babel, jscodeshift.
Use W3C Design Tokens format (.tokens.json), NOT Style Dictionary, Token Studio.

## Code Architecture
- Split files by responsibility, not by line count.
- One module per concern: schema, figma-adapter, code-adapter, diff-engine, cli.
- Colocation: tests next to source, types next to usage.
- Schema format is the contract — adapters never talk to each other, only through schema.
