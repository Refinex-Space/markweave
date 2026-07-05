---
owner: refinex
updated: 2026-07-05
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Coding Standards

## General

- Use TypeScript and React patterns already present in `packages/markweave`.
- Keep public exports centralized through `packages/markweave/src/index.ts`.
- Keep editor extension composition explicit in `packages/markweave/src/editor-core/create-editor-extensions.ts`.
- Avoid broad refactors when a behavior change can be made in the owning plugin or UI module.
- Add code comments only when they clarify non-obvious behavior. If an author marker is explicitly required, use `refinex`.

## Editor Behavior Work

Before changing an editor behavior, identify the owning area:

| Area | Typical owner |
| --- | --- |
| Markdown transforms | `packages/markweave/src/plugins/markdown/` |
| Slash commands | `packages/markweave/src/plugins/slash-command/` and `packages/markweave/src/ui/slash-command/` |
| Tables | `packages/markweave/src/plugins/table/` and `packages/markweave/src/ui/table/` |
| Code blocks | `packages/markweave/src/plugins/codeblock/` and `packages/markweave/src/ui/codeblock/` |
| Mermaid preview | `packages/markweave/src/plugins/mermaid/` and `packages/markweave/src/ui/mermaid/` |
| Floating toolbar | `packages/markweave/src/ui/floating-toolbar/` |
| React shell/controller | `packages/markweave/src/react/MarkweaveEditor.tsx` |

Use behavior-contract files as the checklist for related tests.

## Testing Expectations

- Run the smallest relevant Vitest file first.
- Run `pnpm test` for any editor behavior, public API, or package-boundary change.
- Run `pnpm typecheck` for TypeScript or public type changes.
- Run `pnpm build` for package export, CSS, Vite, or playground changes.

The root script `pnpm test -- <file>` currently still runs the root `vitest run` command broadly. Use `pnpm exec vitest run <path>` for a true focused test.

## Public API And Package Boundary

- Keep playground-only fixtures, components, and demo logic out of `packages/markweave`.
- When changing package exports, update package-boundary tests and package docs together.
- Keep `markweave/styles.css` aligned with `packages/markweave/src/editor-core/markweave-editor.css`.
