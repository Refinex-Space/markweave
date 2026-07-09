---
owner: refinex
updated: 2026-07-09
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
| `build` | `pnpm --filter markweave build && pnpm --filter @markweave/react build && pnpm --filter @markweave/vue2 build && pnpm --filter @markweave/vue3 build && pnpm --filter @markweave/playground-react build && pnpm --filter @markweave/playground-vue2 build && pnpm --filter @markweave/playground-vue3 build` | Builds the core package, adapter packages, then all playground apps. |
| `build:vue2` | `pnpm --filter @markweave/playground-vue2 build` | Builds the private Vue 2 playground. |
| `release:pack` | `pnpm --filter markweave pack --dry-run && pnpm --filter @markweave/react pack --dry-run && pnpm --filter @markweave/vue2 pack --dry-run && pnpm --filter @markweave/vue3 pack --dry-run` | Checks npm tarball contents for all publishable packages without publishing. |
| `release:dry-run` | `pnpm --filter markweave publish --dry-run --no-git-checks && pnpm --filter @markweave/react publish --dry-run --access public --no-git-checks && pnpm --filter @markweave/vue2 publish --dry-run --access public --no-git-checks && pnpm --filter @markweave/vue3 publish --dry-run --access public --no-git-checks` | Exercises the publish command path for all publishable packages without publishing. |
| `typecheck` | `pnpm -r typecheck` | Runs TypeScript checks across workspace projects. |
| `test` | `vitest run` | Runs all Vitest tests. |
| `test:watch` | `vitest` | Starts Vitest watch mode. |
| `harness:check` | `python ops/harness/check-harness.py` | Runs the local Harness knowledge gate. |

No root lint script is configured as of the 2026-07-05 scan.

## Package Build

`packages/markweave` is the framework-neutral core package. It builds with TypeScript so `markweave/internal/*` keeps real JavaScript module files for adapter packages:

- entries: `packages/markweave/src/index.ts`, `src/core`, `src/editor-core`, `src/plugins`, and `src/i18n.ts`
- JavaScript output: `packages/markweave/dist/index.js` plus preserved module files such as `dist/editor-core/*` and `dist/plugins/*`
- declaration output: `packages/markweave/dist/types/index.d.ts` plus preserved declaration files such as `dist/types/editor-core/*`
- stylesheet output: `packages/markweave/dist/styles.css`

The adapter packages build with Vite library mode:

- `packages/markweave-react` outputs `@markweave/react` from `src/index.ts`.
- `packages/markweave-vue2` outputs `@markweave/vue2` from `src/index.ts`.
- `packages/markweave-vue3` outputs `@markweave/vue3` from `src/index.ts`.

Adapter packages externalize `markweave`, `markweave/internal/*`, their Tiptap framework adapter, and the host framework runtime.

## Exports

All publishable packages set npm metadata for the GitHub repository, issues page, discoverability keywords, and npm registry. Scoped adapter packages set `publishConfig.access` to `public`; the unscoped core package only pins `publishConfig.registry`.

The public package exports are:

| Export | Target |
| --- | --- |
| `markweave` | `./dist/index.js` with `./dist/types/index.d.ts` |
| `markweave/internal/*` | `./dist/*.js` with `./dist/types/*.d.ts` for adapter package internals |
| `markweave/react` | legacy shim `./react.js` / `./react.d.ts`, forwarding to `@markweave/react` |
| `markweave/vue2` | legacy shim `./vue2.js` / `./vue2.d.ts`, forwarding to `@markweave/vue2` |
| `markweave/vue3` | legacy shim `./vue3.js` / `./vue3.d.ts`, forwarding to `@markweave/vue3` |
| `markweave/styles.css` | `./dist/styles.css` |

The preferred public adapter package exports are:

| Export | Target |
| --- | --- |
| `@markweave/react` | `packages/markweave-react/dist/index.js` with `dist/types/index.d.ts` |
| `@markweave/react/styles.css` | `packages/markweave-react/styles.css`, importing `markweave/styles.css` |
| `@markweave/vue2` | `packages/markweave-vue2/dist/index.js` with `dist/types/index.d.ts` |
| `@markweave/vue2/styles.css` | `packages/markweave-vue2/styles.css`, importing `markweave/styles.css` |
| `@markweave/vue3` | `packages/markweave-vue3/dist/index.js` with `dist/types/index.d.ts` |
| `@markweave/vue3/styles.css` | `packages/markweave-vue3/styles.css`, importing `markweave/styles.css` |

## Playground

`apps/playground-react` is private. Its Vite config aliases:

- `markweave` -> `packages/markweave/src/index.ts`
- `@markweave/react` -> `packages/markweave-react/src/index.ts`
- `markweave/internal` -> `packages/markweave/src`
- `markweave/styles.css` -> `packages/markweave/src/editor-core/markweave-editor.css`
- `@markweave/playground-fixtures` -> `apps/playground-fixtures/src/index.ts`

The React dev server is bound to `127.0.0.1:5173`.

Local usage details live in `apps/playground-react/README.md`.

`apps/playground-vue3` is private. Its Vite config aliases:

- `markweave` -> `packages/markweave/src/index.ts`
- `@markweave/vue3` -> `packages/markweave-vue3/src/index.ts`
- `markweave/internal` -> `packages/markweave/src`
- `markweave/styles.css` -> `packages/markweave/src/editor-core/markweave-editor.css`
- `@markweave/playground-fixtures` -> `apps/playground-fixtures/src/index.ts`

The Vue 3 dev server is bound to `127.0.0.1:5174`.

Local usage details live in `apps/playground-vue3/README.md`.

`apps/playground-vue2` is private. It uses Vue CLI 4 and Webpack 4 with Vue `2.6.12`, and aliases:

- `markweave` -> `packages/markweave/src/index.ts`
- `@markweave/vue2` -> `packages/markweave-vue2/src/index.ts`
- `markweave/internal` -> `packages/markweave/src`
- `markweave/styles.css` -> `packages/markweave/src/editor-core/markweave-editor.css`
- `@markweave/playground-fixtures` -> `apps/playground-fixtures/src/index.ts`

The Vue 2 dev server is bound to `127.0.0.1:5175`.

Local usage details live in `apps/playground-vue2/README.md`.

## TypeScript

The root `tsconfig.base.json` uses:

- `target: ES2022`
- `module: ESNext`
- `moduleResolution: Bundler`
- `jsx: react-jsx`
- `strict: true`
- `isolatedModules: true`
- `skipLibCheck: true`
