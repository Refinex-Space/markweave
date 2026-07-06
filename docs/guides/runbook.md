---
owner: refinex
updated: 2026-07-06
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Runbook

## Local Development

```sh
pnpm install
pnpm dev
```

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

## Focused Verification

Use focused Vitest commands for the first check. Example:

```sh
pnpm exec vitest run packages/markweave/test/editor-entrypoint-boundary.test.ts
```

Choose the focused file that owns the changed behavior before running the full suite.

## Full Verification

```sh
pnpm test
pnpm typecheck
pnpm build
```

For control-plane or documentation changes:

```sh
pnpm harness:check
python3 ~/.codex/skills/harness-init/scripts/harness_audit.py .
```

## Build Notes

`pnpm build` builds `markweave` first and then `@markweave/playground-react` and `@markweave/playground-vue3`. The package build removes `packages/markweave/dist`, runs Vite library build for the framework-neutral root plus React and Vue 3 subpaths, emits TypeScript declarations, and copies the editor stylesheet to `dist/styles.css`.

The playground production build can emit Vite large-chunk warnings because Mermaid and diagram assets are bundled into the demo app. Treat those warnings as a package-size signal, not as a Harness failure.

## Release Prep

No publish script is configured as of the 2026-07-05 scan. Before publishing, verify:

- package exports still match `packages/markweave/package.json`
- `packages/markweave/dist/index.js`, `dist/react.js`, `dist/vue3.js`, `dist/types/index.d.ts`, and `dist/styles.css` are produced by `pnpm build`
- playground-only files are not included in package `files`
- README usage examples match the exported API

## Rollback

For normal source changes, use `git diff` to identify the touched files and `git restore <path>` only for files you own in the current task. Do not revert unrelated user changes.
