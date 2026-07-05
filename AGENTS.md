# AGENTS.md

## Project
Markweave is a pnpm workspace for a Markdown-first WYSIWYG React editor built on Tiptap and ProseMirror. The publishable npm package is `packages/markweave`; `apps/playground` is the private local demo app.

## Environment And Commands
- Install: `pnpm install`
- Develop: `pnpm dev` and open `http://127.0.0.1:5173/`
- Minimal package-boundary test: `pnpm exec vitest run packages/markweave/test/editor-entrypoint-boundary.test.ts`
- Test: `pnpm test`
- Typecheck: `pnpm typecheck`
- Build: `pnpm build`
- Harness docs check: `pnpm harness:check`
- Bundled Harness audit: `python3 ~/.codex/skills/harness-init/scripts/harness_audit.py .`

## Repository Boundaries
- Use pnpm workspace commands; do not introduce npm, yarn, or bun lockfiles.
- Keep playground-only code out of `packages/markweave`; the published package exposes `markweave` and `markweave/styles.css`.
- Treat `packages/markweave/src/index.ts` and `packages/markweave/src/editor-core/create-editor-extensions.ts` as public surface and extension-boundary files.
- Do not commit secrets, credentials, production tokens, or `.env*` contents.
- Do not change CI, infrastructure manifests, package publishing boundaries, or dependency policy without calling it out separately.
- For editor behavior changes, preserve or update the relevant behavior-contract tests before broad refactors.

## Definition Of Done
- Run the smallest relevant test first, then the broader checks required by the change.
- For code changes, run `pnpm test`, `pnpm typecheck`, and `pnpm build` unless the reason for skipping is explicit.
- For control-plane or docs changes, run `pnpm harness:check` and the bundled Harness audit.
- Update reachable docs when architecture, config, security, public API, or user-visible editor behavior changes.
- Delivery must include summary, verification, risks, rollback, and next steps.

## Knowledge Map
- Architecture and package boundaries -> read `docs/architecture/overview.md` before design, refactor, public API, or cross-module editor changes.
- Config, scripts, package exports, and dev server -> read `docs/config/reference.md` before changing manifests, Vite config, TypeScript config, exports, or build scripts.
- Coding standards -> read `docs/standards/coding.md` before implementation work.
- Security standards -> read `docs/standards/security.md` before secrets, uploads, media nodes, links, Mermaid rendering, or data-handling changes.
- Domain terms -> read `docs/domain/glossary.md` when naming editor concepts, behavior contracts, or user-facing capabilities.
- Runbook -> read `docs/guides/runbook.md` for local development, verification, release prep, or troubleshooting.
- Documentation routes -> read `docs/README.md` before adding, moving, or deprecating docs.

## Knowledge Maintenance
- Keep stable facts in the routed docs, not in this root file.
- Add a knowledge-map line only when a new task route is needed.
- Active docs must have front matter with `owner`, `updated`, `status`, and `referenced_by`.
- Do not create orphan docs, duplicate facts, or deeper doc chains.
