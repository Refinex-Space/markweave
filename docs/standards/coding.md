---
owner: refinex
updated: 2026-07-09
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Coding Standards

## General

- Use TypeScript and the framework patterns already present in the owning adapter.
- Keep framework-neutral public exports centralized through `packages/markweave/src/index.ts`; React, Vue 2, and Vue 3 adapter exports belong in `packages/markweave-react`, `packages/markweave-vue2`, and `packages/markweave-vue3`.
- Keep editor extension composition explicit in `packages/markweave/src/editor-core/create-editor-extensions.ts`.
- Keep `packages/markweave/src/core`, `packages/markweave/src/editor-core`, and `packages/markweave/src/plugins` framework-neutral. `.tsx` and React-only code are allowed only under `packages/markweave-react/src/**`; Vue 2 adapter code stays under `packages/markweave-vue2/src/**`; Vue 3 adapter code stays under `packages/markweave-vue3/src/**`.
- Avoid broad refactors when a behavior change can be made in the owning plugin or UI module.
- Add code comments only when they clarify non-obvious behavior. If an author marker is explicitly required, use `refinex`.

## Adapter Parity And Shared Behavior

- Treat React, Vue 2, and Vue 3 as three bindings over the same editor behavior, not three independent implementations.
- Put Markdown parse/serialize rules, content payload shaping, upload request/result mapping, slash command detection, table behavior, codeblock and Mermaid state, TOC state, and mode/read-only decisions in `src/core`, `src/editor-core`, or `src/plugins`.
- Keep floating toolbar menu data, color values, link commands, assistant request payloads, content comparison, update payload shaping, and read-only link opening in `src/editor-core` rather than in a framework adapter.
- Keep adapter files limited to lifecycle, prop wiring, framework NodeView rendering, DOM/event binding, framework-specific icons, and view composition.
- Before duplicating logic between adapters, extract the smallest framework-neutral helper that all three adapters can call. If a framework limitation blocks sharing, keep the duplicated code narrow and add parity coverage.
- For Vue 2, preserve Vue CLI 4 / Webpack 4 compatibility: do not rely on Vite behavior, Vue 3-only APIs, package `exports`-only resolution, or modern syntax that the Vue 2 playground cannot build.

## Editor Behavior Work

Before changing an editor behavior, identify the owning area:

| Area | Typical owner |
| --- | --- |
| Markdown transforms | `packages/markweave/src/plugins/markdown/` |
| Slash commands | `packages/markweave/src/plugins/slash-command/` plus adapter menu rendering in the adapter packages |
| Tables | `packages/markweave/src/plugins/table/` plus adapter table controls in the adapter packages |
| Code blocks | `packages/markweave/src/plugins/codeblock/` plus adapter codeblock controls in the adapter packages |
| Mermaid preview | `packages/markweave/src/plugins/mermaid/` plus adapter preview controls in the adapter packages |
| Floating toolbar | `packages/markweave/src/editor-core/floating-toolbar-model.ts` plus adapter rendering under the adapter packages |
| React shell/controller | `packages/markweave-react/src/MarkweaveEditor.tsx` |
| Vue 2 shell/controller | `packages/markweave-vue2/src/MarkweaveEditor.ts` |
| Vue 3 shell/controller | `packages/markweave-vue3/src/MarkweaveEditor.ts` |

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
