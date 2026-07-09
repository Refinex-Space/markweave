---
owner: refinex
updated: 2026-07-09
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
pnpm exec vitest run apps/playground-react/test/playground-mode-toggle.test.ts apps/playground-vue3/test/playground-vue3-mode-toggle.test.ts
```

## Full Verification

```sh
pnpm test
pnpm typecheck
pnpm build
```

For control-plane or documentation changes:

```sh
pnpm harness:check
```

`pnpm harness:check` wraps the bundled Harness audit and the repo-local required-docs gate. Prefer it over hardcoding the bundled audit path because Codex skill installs can use either a flat or nested `harness-init` directory layout.

## Build Notes

`pnpm build` builds `markweave` first, then `@markweave/react`, `@markweave/vue2`, `@markweave/vue3`, and finally `@markweave/playground-react`, `@markweave/playground-vue2`, and `@markweave/playground-vue3`. The core package build removes `packages/markweave/dist`, emits framework-neutral TypeScript JavaScript plus declarations with preserved module paths for `markweave/internal/*`, and copies the editor stylesheet to `dist/styles.css`. Each adapter package then runs its own Vite library build and declaration build.

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
- `pnpm --filter markweave pack --dry-run` includes only core package files such as `dist`, legacy adapter shims, `styles.css`, `README.md`, `LICENSE`, and package metadata
- `pnpm --filter @markweave/react pack --dry-run`, `pnpm --filter @markweave/vue2 pack --dry-run`, and `pnpm --filter @markweave/vue3 pack --dry-run` include only adapter package files
- packed adapter package metadata rewrites the local `markweave: workspace:^` dependency to the publishable `markweave: ^0.1.0` dependency
- playground-only files are not included in package `files`
- README usage examples match the exported API

Run the release checks from the workspace root:

```sh
pnpm test
pnpm typecheck
pnpm build
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
