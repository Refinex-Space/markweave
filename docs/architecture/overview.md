---
owner: refinex
updated: 2026-07-06
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Architecture Overview

Markweave is a Markdown-first WYSIWYG editor package. The workspace has two active projects:

| Path | Role |
| --- | --- |
| `packages/markweave` | Publishable npm package named `markweave`. |
| `apps/playground` | Private Vite/React demo app for local development and verification. |

## Public Surface

The package root exports from `packages/markweave/src/index.ts`:

- `MarkweaveEditor`
- `useMarkweaveEditorController`
- `createMarkweaveEditorExtensions`
- public controller, overlay, update payload, editor mode, upload, toolbar, and table-copy types

The package exports `markweave` and `markweave/styles.css`; package-boundary changes should keep `packages/markweave/test/editor-entrypoint-boundary.test.ts` current.

## Editor Core

`packages/markweave/src/editor-core/create-editor-extensions.ts` composes the Tiptap/ProseMirror extension set. The current extension boundary includes:

- core editing: StarterKit, composition guard, mark boundary, indent, text style, color, underline, highlight, links, math, emoji
- blocks and media: code blocks through lowlight, callouts, images, videos, attachments, horizontal rules, task lists
- Markdown behavior: Markdown input transforms and markdown-table input
- interaction layers: slash command runtime, table clipboard, table arrow navigation, table keyboard, table interaction state
- previews and controls: Mermaid inline preview, floating toolbar, slash menu, table controls, table selection overlay, code block controls
- link editing: the floating toolbar opens an inline link popover for selected text, with apply, open, and remove actions
- image editing: the image node renders an inline upload placeholder for empty images, then exposes align, caption, download, replace, delete, and width-resize controls through a React NodeView
- video insertion: the video node renders an inline upload placeholder for empty videos, supports local-file host uploads and direct video URLs, and automatically embeds YouTube and Bilibili links or whitelisted platform embed sources through a React NodeView
- editor modes: `mode="live"` keeps the full editable surface, while `mode="view"` is a UI-only read mode that reuses the same document rendering and keeps serialization output unchanged

## Behavior Contracts

Behavior contract files list expected editor capabilities and should guide tests when changing related modules:

- `packages/markweave/src/plugins/markdown/behavior-contract.ts`
- `packages/markweave/src/plugins/slash-command/behavior-contract.ts`
- `packages/markweave/src/plugins/table/behavior-contract.ts`
- `packages/markweave/src/ui/floating-toolbar/behavior-contract.ts`

## Non-Goals In This Repo

- No backend service is present in this repository.
- No CI workflow is present as of the 2026-07-05 scan.
- The playground is not part of the published npm package.
