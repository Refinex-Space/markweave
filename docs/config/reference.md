---
owner: refinex
updated: 2026-07-05
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Config Reference

## Package Manager And Workspace

| Setting | Value |
| --- | --- |
| Package manager | `pnpm@11.7.0` from root `package.json` |
| Workspace manifest | `pnpm-workspace.yaml` |
| Workspace packages | `packages/*`, `apps/*` |
| Root package | private workspace package `markweave-workspace` |

Do not introduce additional lockfiles or package-manager workflows without a separate migration decision.

## Root Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `pnpm --filter @markweave/playground dev` | Starts the private playground. |
| `build` | `pnpm --filter markweave build && pnpm --filter @markweave/playground build` | Builds package first, then playground. |
| `typecheck` | `pnpm -r typecheck` | Runs TypeScript checks across workspace projects. |
| `test` | `vitest run` | Runs all Vitest tests. |
| `test:watch` | `vitest` | Starts Vitest watch mode. |
| `harness:check` | `python3 ops/harness/check-harness.py` | Runs the local Harness knowledge gate. |

No root lint script is configured as of the 2026-07-05 scan.

## Package Build

`packages/markweave` builds with Vite library mode and TypeScript declarations:

- entry: `packages/markweave/src/index.ts`
- JavaScript output: `packages/markweave/dist/index.js`
- declaration output: `packages/markweave/dist/types/index.d.ts`
- stylesheet output: `packages/markweave/dist/styles.css`

The package externalizes React, Tiptap, ProseMirror, lowlight, lucide-react, Mermaid, and related peer/runtime dependencies in `packages/markweave/vite.config.ts`.

## Exports

The public package exports are:

| Export | Target |
| --- | --- |
| `markweave` | `./dist/index.js` with `./dist/types/index.d.ts` |
| `markweave/styles.css` | `./dist/styles.css` |

## Playground

`apps/playground` is private. Its Vite config aliases:

- `markweave` -> `packages/markweave/src/index.ts`
- `markweave/styles.css` -> `packages/markweave/src/editor-core/markweave-editor.css`

The dev server is bound to `127.0.0.1:5173`.

## TypeScript

The root `tsconfig.base.json` uses:

- `target: ES2022`
- `module: ESNext`
- `moduleResolution: Bundler`
- `jsx: react-jsx`
- `strict: true`
- `isolatedModules: true`
- `skipLibCheck: true`
