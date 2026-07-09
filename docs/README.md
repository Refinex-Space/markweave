---
owner: refinex
updated: 2026-07-05
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Markweave Docs

This directory holds repository facts and evidence for agents. Keep `AGENTS.md` as the thin routing layer; put details here when a task needs them.

## Knowledge Map

| Task | Read |
| --- | --- |
| Architecture, package boundary, public editor surface, or cross-module refactor | `docs/architecture/overview.md` |
| Scripts, package manager, exports, build outputs, dev server, TypeScript, or Vite config | `docs/config/reference.md` |
| Implementation conventions, tests, public API changes, or UI behavior work | `docs/standards/coding.md` |
| Secrets, upload callbacks, media/link nodes, Mermaid rendering, or data handling | `docs/standards/security.md` |
| Naming editor concepts and behavior contracts | `docs/domain/glossary.md` |
| Local run, verification, build, release prep, or troubleshooting | `docs/guides/runbook.md` |
| React, Vue 3, or Vue 2 product integration, upload callback wiring, or framework-specific usage | `docs/guides/react-integration.md`, `docs/guides/react-integration-zh-cn.md`, `docs/guides/vue3-integration.md`, `docs/guides/vue3-integration-zh-cn.md`, `docs/guides/vue2-integration.md`, `docs/guides/vue2-integration-zh-cn.md` |

## Maintenance Rules

- Every active docs file must remain reachable from `AGENTS.md`, a `SKILL.md`, or this route map.
- Use lower-kebab-case Markdown filenames except `README.md` and ADR files under `docs/architecture/decisions/`.
- Update the front matter `updated` date when changing a doc.
- Prefer a new route only when future agents need to know when to read the file.
