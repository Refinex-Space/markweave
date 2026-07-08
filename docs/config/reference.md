---
owner: refinex
updated: 2026-07-06
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
| `dev` | `pnpm --filter @markweave/playground-react dev` | Starts the private React playground. |
| `dev:react` | `pnpm --filter @markweave/playground-react dev` | Starts the private React playground explicitly. |
| `dev:vue2` | `pnpm --filter @markweave/playground-vue2 dev` | Starts the private Vue 2 playground. |
| `dev:vue3` | `pnpm --filter @markweave/playground-vue3 dev` | Starts the private Vue 3 playground. |
| `build` | `pnpm --filter markweave build && pnpm --filter @markweave/playground-react build && pnpm --filter @markweave/playground-vue2 build && pnpm --filter @markweave/playground-vue3 build` | Builds package first, then all playground apps. |
| `build:vue2` | `pnpm --filter @markweave/playground-vue2 build` | Builds the private Vue 2 playground. |
| `typecheck` | `pnpm -r typecheck` | Runs TypeScript checks across workspace projects. |
| `test` | `vitest run` | Runs all Vitest tests. |
| `test:watch` | `vitest` | Starts Vitest watch mode. |
| `harness:check` | `python3 ops/harness/check-harness.py` | Runs the local Harness knowledge gate. |

No root lint script is configured as of the 2026-07-05 scan.

## Package Build

`packages/markweave` builds with Vite library mode and TypeScript declarations:

- entries: `packages/markweave/src/index.ts`, `packages/markweave/src/react/index.ts`, `packages/markweave/src/vue2/index.ts`, `packages/markweave/src/vue3/index.ts`
- JavaScript output: `packages/markweave/dist/index.js`, `dist/react.js`, `dist/vue2.js`, `dist/vue3.js`
- declaration output: `packages/markweave/dist/types/index.d.ts`, `dist/types/react/index.d.ts`, `dist/types/vue2/index.d.ts`, `dist/types/vue3/index.d.ts`
- stylesheet output: `packages/markweave/dist/styles.css`

The package externalizes React, Vue 3, Tiptap adapter packages, ProseMirror, lowlight, lucide icons, Mermaid, and related peer/runtime dependencies in `packages/markweave/vite.config.ts`.

## Exports

The public package exports are:

| Export | Target |
| --- | --- |
| `markweave` | `./dist/index.js` with `./dist/types/index.d.ts` |
| `markweave/react` | `./dist/react.js` with `./dist/types/react/index.d.ts` |
| `markweave/vue2` | `./dist/vue2.js` with `./dist/types/vue2/index.d.ts` |
| `markweave/vue3` | `./dist/vue3.js` with `./dist/types/vue3/index.d.ts` |
| `markweave/styles.css` | `./dist/styles.css` |

## Playground

`apps/playground-react` is private. Its Vite config aliases:

- `markweave` -> `packages/markweave/src/index.ts`
- `markweave/react` -> `packages/markweave/src/react/index.ts`
- `markweave/styles.css` -> `packages/markweave/src/editor-core/markweave-editor.css`
- `@markweave/playground-fixtures` -> `apps/playground-fixtures/src/index.ts`

The React dev server is bound to `127.0.0.1:5173`.

`apps/playground-vue3` is private. Its Vite config aliases:

- `markweave` -> `packages/markweave/src/index.ts`
- `markweave/vue3` -> `packages/markweave/src/vue3/index.ts`
- `markweave/styles.css` -> `packages/markweave/src/editor-core/markweave-editor.css`
- `@markweave/playground-fixtures` -> `apps/playground-fixtures/src/index.ts`

The Vue 3 dev server is bound to `127.0.0.1:5174`.

`apps/playground-vue2` is private. It uses Vue CLI 4 and Webpack 4 with Vue `2.6.12`, and aliases:

- `markweave` -> `packages/markweave/src/index.ts`
- `markweave/vue2` -> `packages/markweave/src/vue2/index.ts`
- `markweave/styles.css` -> `packages/markweave/src/editor-core/markweave-editor.css`
- `@markweave/playground-fixtures` -> `apps/playground-fixtures/src/index.ts`

The Vue 2 dev server is bound to `127.0.0.1:5175`.

## TypeScript

The root `tsconfig.base.json` uses:

- `target: ES2022`
- `module: ESNext`
- `moduleResolution: Bundler`
- `jsx: react-jsx`
- `strict: true`
- `isolatedModules: true`
- `skipLibCheck: true`
