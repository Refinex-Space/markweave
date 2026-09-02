---
owner: refinex
updated: 2026-09-02
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Runbook

## Local Development

```sh
pnpm install
cp .env.example .env
pnpm dev
```

To exercise real text or table Ask AI output, edit the ignored workspace-root `.env` and set `OPENROUTER_API_KEY`. The default `OPENROUTER_MODEL` is `openrouter/free`. Never use a `VITE_*` or `VUE_APP_*` variable for this credential: all playground browsers call the same-origin `/api/markweave/ask-ai` route and the dev server adds authorization upstream. For table checks, use any row/column/selection handle menu; the local proxy constrains the response to a single-cell fragment or an exact-shape GFM table.

If the key is missing, Ask AI remains visible but returns a localized error/retry flow through the existing editor UI. This fail-closed behavior is intentional and does not fall back silently to deterministic mock output.

Open the React playground:

```text
http://127.0.0.1:5173/
```

The dev command starts `@markweave/playground-react` through Vite on `127.0.0.1:5173`.

For the Vue 3 playground:

```sh
pnpm dev:vue3
```

Open:

```text
http://127.0.0.1:5174/
```

For the Vue 2 playground:

```sh
pnpm dev:vue2
```

Open:

```text
http://127.0.0.1:5175/
```

## Focused Verification

Use focused Vitest commands for the first check. Example:

```sh
pnpm exec vitest run packages/markweave/test/editor-entrypoint-boundary.test.ts
```

Choose the focused file that owns the changed behavior before running the full suite.

For adapter or playground parity work, useful focused checks are:

```sh
pnpm exec vitest run packages/markweave/test/floating-toolbar-model.test.ts packages/markweave/test/playground-contract.test.ts
pnpm exec vitest run packages/markweave/test/vue2-adapter-parity.test.ts packages/markweave/test/vue3-adapter-parity.test.ts
pnpm exec vitest run packages/markweave/test/webpack4-legacy-package.test.ts packages/markweave/test/vue2-compat.test.ts
pnpm exec vitest run apps/playground-react/test/playground-mode-toggle.test.ts apps/playground-vue3/test/playground-vue3-mode-toggle.test.ts
pnpm exec vitest run apps/playground-react/test/playground-openrouter.test.ts
```

## Full Verification

```sh
pnpm test
pnpm typecheck
pnpm build
```

## Large-document Benchmark

The shared playground exposes deterministic 250 KB text, 250 KB valid-media, 250 KB missing-media, and 1 MB stress fixtures. Run the real Chromium benchmark from the workspace root:

```sh
pnpm benchmark:large-document
MARKWEAVE_BENCHMARK_PROFILE=1 pnpm benchmark:large-document "250k Text Fixture"
```

By default the script builds and serves the production React playground, then uses Playwright with bundled Chromium or the installed stable Chrome fallback. Each fixture runs three consecutive times; `results` contains per-field medians and `samples` retains the raw runs. The report includes first-ready mount time, per-key input-to-paint P95/P99, long tasks, heap/DOM/media counts, exact search-ready and search-locate latency, projected search decorations, and a real top-to-end scroll with target visibility checks. Set `MARKWEAVE_BENCHMARK_RUNS` to override the repetition count and `MARKWEAVE_BENCHMARK_DEV=1` only for source-level profiling. This benchmark does not replace final WKWebView/WebView2 acceptance; rebuild `markweave` and `@markweave/react` before measuring package-source changes.

The core build regenerates the self-contained ES2019 Markdown lexer Worker string before TypeScript compilation. Large Markdown documents without host `editorExtensions` use that Worker on HTTP(S) pages; custom desktop protocols such as `tauri:` immediately use the canonical whole-document main-thread parser because WKWebView may construct a Blob Worker without completing or raising `error`. CSP or ordinary Worker startup failure still uses the timed fallback. When diagnosing the fallback path, keep the page protocol, host extension set, and document load-state timeline in the benchmark record.

## Media Resolution Recovery

Run the focused media reliability suites before broad verification:

```sh
pnpm exec vitest run packages/markweave/test/image-node-dom.test.ts packages/markweave/test/media-idle-backstop.test.ts packages/markweave/test/visual-work-scheduler.test.ts packages/markweave/test/document-output.test.ts
```

For a host `resolveMediaSource`, treat its returned URL as a display candidate rather than durable success. Verify resolver null/rejection/timeout, real image error/timeout, source replacement, background cancellation, a starved `requestIdleCallback`, selection, and `prepareMarkweaveEditorForOutput()`. The same stored source must recover on a later attempt, stale attempts must not mutate a replacement node, and successful Markdown serialization must retain the stored source. A host may use optional request `attempt` and `reason` fields to expire negative results or re-authorize a previously failed candidate URL.

For control-plane or documentation changes:

```sh
pnpm harness:check
```

`pnpm harness:check` wraps the bundled Harness audit and the repo-local required-docs gate. Prefer it over hardcoding the bundled audit path because Codex skill installs can use either a flat or nested `harness-init` directory layout.

## Build Notes

`pnpm build` builds `markweave` first, then `@markweave/react`, `@markweave/vue2`, `@markweave/vue3`, and finally `@markweave/playground-react`, `@markweave/playground-vue2`, and `@markweave/playground-vue3`. The core package build removes `packages/markweave/dist`, emits framework-neutral TypeScript JavaScript plus declarations with preserved module paths for `markweave/internal/*`, and copies the editor stylesheet to `dist/styles.css`. Each adapter package then runs its own Vite library build and declaration build.

Run `pnpm build:vue2-legacy` after package-boundary, Vite, dependency, or Vue 2 compatibility changes. It rebuilds `markweave/legacy` and `@markweave/vue2/legacy`, consumes the generated physical entries through the workspace Vue CLI 4 / Webpack 4 fixture, emits `report.json`, verifies one runtime root per Vue/Tiptap/ProseMirror package plus size budgets, and removes the report after success. The legacy bundle must also avoid a free browser `require()` and stay under the artifact limits enforced by `scripts/verify-publish-artifacts.mjs`.

Run `pnpm verify:vue2-packed` before release. It creates temporary tarballs and strict-pnpm consumers outside the workspace, verifies Vue 2.6.12 / Vue CLI 4.4.6 and Vue 2.7.16 / Vue CLI 4.5.19 against Webpack 4.47.0, and drives a deterministic browser smoke covering mount, Mermaid async rendering, input/update, and Live-to-View state. Successful temporary directories are removed; failed fixtures are preserved and printed for diagnosis.

The playground production build can emit Vite large-chunk warnings because Mermaid and diagram assets are bundled into the demo app. Treat those warnings as a package-size signal, not as a Harness failure.

## Release Prep

Markweave publishes four npm packages in this order:

1. `markweave`
2. `@markweave/react`
3. `@markweave/vue2`
4. `@markweave/vue3`

Before publishing, verify:

- package exports still match `packages/markweave/package.json` and adapter package manifests
- package metadata includes `repository`, `homepage`, `bugs`, `keywords`, and `publishConfig`
- scoped adapter packages keep `publishConfig.access` set to `public`
- `packages/markweave/dist/index.js`, `dist/types/index.d.ts`, `dist/editor-core/*`, `dist/plugins/*`, and `dist/styles.css` are produced by `pnpm build`
- `packages/markweave-react/dist/index.js`, `packages/markweave-vue2/dist/index.js`, and `packages/markweave-vue3/dist/index.js` are produced by `pnpm build`
- `packages/markweave/dist/legacy/index.js` and `packages/markweave-vue2/dist/legacy/index.js` exist, target ES2019, and keep only approved shared runtimes external
- `@markweave/vue2/webpack4` is present in the packed Vue 2 package and both `pnpm build:vue2-legacy` and `pnpm verify:vue2-packed` pass
- `pnpm --filter markweave pack --dry-run` includes only core package files such as `dist`, legacy adapter shims, `styles.css`, `README.md`, `LICENSE`, and package metadata
- `pnpm --filter @markweave/react pack --dry-run`, `pnpm --filter @markweave/vue2 pack --dry-run`, and `pnpm --filter @markweave/vue3 pack --dry-run` include only adapter package files
- packed adapter package metadata rewrites the local `markweave: workspace:^` dependency to the current publishable core version range
- playground-only files are not included in package `files`
- README usage examples match the exported API

Each publishable package runs `pnpm run build` from its `prepack` lifecycle. Do not bypass lifecycle scripts with `--ignore-scripts`: the generated `dist` directories are Git-ignored and are not release sources of truth. `pnpm release:pack` and `pnpm release:dry-run` finish through `pnpm release:verify`, which runs the legacy workspace build, packed-consumer matrix, browser smoke, stats budgets, and `scripts/verify-publish-artifacts.mjs` before authentication or registry writes are attempted.

Run the release checks from the workspace root:

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm build:vue2-legacy
pnpm verify:vue2-packed
pnpm release:pack
pnpm release:dry-run
pnpm harness:check
```

The dry-run script uses `--access public` only for scoped adapter packages. Do not use the dry-run result as proof of authentication; before a real release, `npm whoami --registry=https://registry.npmjs.org/` must succeed and the npm account must have permission to publish the `@markweave` scope.

The actual publish commands should be run from each package directory after the checks pass:

```sh
cd packages/markweave
pnpm publish --registry=https://registry.npmjs.org/ --no-git-checks

cd ../markweave-react
pnpm publish --registry=https://registry.npmjs.org/ --access public --no-git-checks

cd ../markweave-vue2
pnpm publish --registry=https://registry.npmjs.org/ --access public --no-git-checks

cd ../markweave-vue3
pnpm publish --registry=https://registry.npmjs.org/ --access public --no-git-checks
```

If the npm account requires 2FA for publish, add `--otp=<6-digit-code>` to each publish command. Never store npm tokens or OTP codes in the repository.

## Rollback

For normal source changes, use `git diff` to identify the touched files and `git restore <path>` only for files you own in the current task. Do not revert unrelated user changes.
