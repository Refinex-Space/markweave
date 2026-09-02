---
owner: refinex
updated: 2026-09-02
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
| `build:vue2-legacy` | core build, Vue 2 adapter build, then `scripts/build-vue2-legacy-playground.mjs` | Builds the physical ES2019 entries, consumes them through the workspace Vue CLI 4 fixture, and rejects duplicate runtime roots or size-budget regressions from Webpack stats. |
| `verify:vue2-packed` | `scripts/verify-vue2-packed-consumer.mjs` | Packs real core/Vue 2 tarballs, installs them in temporary strict-pnpm consumers for the minimum and final Vue 2 matrices, then runs stats and browser smoke checks. |
| `release:verify` | legacy workspace build, packed-consumer matrix, then artifact verification | Runs the complete Vue 2/Webpack 4 and publish-artifact release gate. |
| `release:pack` | sequential package `pack --dry-run`, then `pnpm release:verify` | Rebuilds every publishable package through `prepack`, checks tarball contents, then runs the complete release gate. |
| `release:dry-run` | sequential package `publish --dry-run`, then `pnpm release:verify` | Exercises the publish lifecycle without publishing, then runs the complete release gate. |
| `release:verify-artifacts` | `node scripts/verify-publish-artifacts.mjs` | Rejects missing or stale build output, mismatched package versions, incomplete core module emission, and missing Madora image-reference support. |
| `typecheck` | `pnpm -r typecheck` | Runs TypeScript checks across workspace projects. |
| `test` | `vitest run` | Runs all Vitest tests. |
| `test:watch` | `vitest` | Starts Vitest watch mode. |
| `benchmark:large-document` | `node scripts/benchmark-large-document.mjs` | Builds and serves the production React playground, runs each fixture three times, then reports median load, input, search, navigation, scroll, DOM, heap, and long-task measurements plus raw samples. Set `MARKWEAVE_BENCHMARK_RUNS` to override repetition count or `MARKWEAVE_BENCHMARK_DEV=1` for source profiling. |
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

`markweave/legacy` and `@markweave/vue2/legacy` are additive ES2019 library builds. They prebundle Markweave-owned code and heavy non-singleton dependencies, including Tiptap extensions, Emoji, KaTeX, Lowlight, and Mermaid. Vue, `@tiptap/vue-2`, `@tiptap/core`, `@tiptap/pm`, and direct ProseMirror runtimes stay external so trusted host `editorExtensions` share the same constructors and plugin state as the editor. The Webpack 4 helper resolves dependencies from the real package location used by strict pnpm layouts, aliases Vue/Tiptap/ProseMirror and the shared stylesheet to physical files, and throws when a required target is absent. Mermaid remains split behind its dynamic import; the legacy build resolves that import to Mermaid's official single-file browser artifact so Webpack 4 never reinterprets Mermaid's internal ESM chunk graph. Physical root `legacy.js` files are included for Webpack 4 resolvers that do not understand package `exports`.

Adapter packages externalize `markweave`, `markweave/internal/*`, their Tiptap framework adapter, and the host framework runtime.

### Tiptap Runtime Alignment

All published `@tiptap/*` runtime dependencies are pinned to the same exact version (`3.29.2` for Markweave `0.10.2`). Markweave's direct `prosemirror-model`, `prosemirror-state`, and `prosemirror-view` dependencies are also pinned to the versions resolved by that Tiptap suite. This prevents consumers from installing multiple Tiptap or ProseMirror versions when an adapter package and `markweave` are installed together; the Webpack stats gate separately proves that one version is bundled from only one runtime root.

The workspace root enforces those ProseMirror versions through `pnpm-workspace.yaml` `overrides`. This is a test/build invariant, not permission to bundle ProseMirror into a legacy artifact; published manifests still declare the exact runtime versions so npm consumers can deduplicate the same graph.

Framework adapter builds bundle their Tiptap `*/menus` subpath while keeping the main framework adapter external. This preserves one host-owned Tiptap runtime and avoids exposing package `exports` subpaths to legacy bundlers such as Webpack 4.

Hosts that define custom editor extensions must import `@tiptap/core` and `@tiptap/pm` from the same resolved runtime version. The package-boundary test rejects release metadata that introduces a different Tiptap version or a semver range in any publishable package.

The Vue 2 package declares the pinned direct ProseMirror runtimes used by its legacy output. npm/pnpm should deduplicate these against `markweave` and `@tiptap/pm`; bundling a second ProseMirror runtime into the legacy artifact is forbidden.

Every publishable package defines `prepack: pnpm run build`. `pnpm pack` and `pnpm publish` therefore remove and regenerate that package's ignored `dist` directory before npm reads `files`; publishing a previously generated `dist` without rebuilding is not a supported path.

## Exports

All publishable packages set npm metadata for the GitHub repository, issues page, discoverability keywords, and npm registry. Scoped adapter packages set `publishConfig.access` to `public`; the unscoped core package only pins `publishConfig.registry`.

The public package exports are:

| Export | Target |
| --- | --- |
| `markweave` | `./dist/index.js` with `./dist/types/index.d.ts` |
| `markweave/legacy` | physical `./legacy.js`, forwarding to the ES2019 `./dist/legacy/index.js` bundle |
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
| `@markweave/vue2/legacy` | physical `legacy.js`, forwarding to the full ES2019 Vue 2 bundle |
| `@markweave/vue2/webpack4` | CommonJS webpack-chain helper that aliases the legacy entry and narrowly transpiles shared runtimes |
| `@markweave/vue2/styles.css` | `packages/markweave-vue2/styles.css`, importing `markweave/styles.css` |
| `@markweave/vue3` | `packages/markweave-vue3/dist/index.js` with `dist/types/index.d.ts` |
| `@markweave/vue3/styles.css` | `packages/markweave-vue3/styles.css`, importing `markweave/styles.css` |

## Playground

All three private playgrounds expose the same development-only Ask AI endpoint at `/api/markweave/ask-ai`. Their dev-server middleware reads the workspace-root `.env` and streams OpenRouter output back as plain UTF-8 text. The browser-side shared fixture implements the public `MarkweaveAskAiHandler` contract, forwards the optional text/table target discriminator, and never receives the provider credential. Table prompts require either a single-cell Markdown fragment or an exact-shape GFM table; the proxy does not send document content outside the selected target.

Supported local variables are documented in `.env.example`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | yes | none | Server-side OpenRouter credential used only by playground dev middleware. |
| `OPENROUTER_MODEL` | no | `openrouter/free` | Model or router identifier sent to OpenRouter. |
| `OPENROUTER_APP_URL` | no | none | Optional OpenRouter attribution URL. |
| `OPENROUTER_APP_NAME` | no | none | Optional OpenRouter attribution name. |

Do not rename `OPENROUTER_API_KEY` to a `VITE_*` or `VUE_APP_*` variable: those prefixes make the value available to browser bundles. Production integrations must implement `askAi.handler` through their own authenticated backend; the playground proxy is not a published package API or deployment surface.

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

With `MARKWEAVE_VUE2_LEGACY=1`, the playground removes the source-package aliases, applies `@markweave/vue2/webpack4`, consumes the generated physical package artifacts, and writes the reusable Babel cache under its project-local `.cache`. `pnpm build:vue2-legacy` verifies this workspace boundary and emits Webpack stats. `pnpm verify:vue2-packed` separately packs and installs real tarballs under Vue `2.6.12` / Vue CLI `4.4.6` and Vue `2.7.16` / Vue CLI `4.5.19`, both with Webpack `4.47.0`, then runs deterministic browser smoke checks.

The stats gate allows at most one runtime root for Vue, `@tiptap/core`, `@tiptap/vue-2`, `@tiptap/pm`, `prosemirror-model`, `prosemirror-state`, and `prosemirror-view`. Current hard budgets are 2.3 MiB for the app entrypoint, 6 MiB for emitted JavaScript, 4 MiB for the largest asset, and 1.75 MiB for the packed Vue 2 tarball.

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

The default package output remains ES2022. Only the explicit `markweave/legacy` and `@markweave/vue2/legacy` artifacts target ES2019.
