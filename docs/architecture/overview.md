---
owner: refinex
updated: 2026-07-07
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Architecture Overview

Markweave is a Markdown-first WYSIWYG editor package. The workspace has four active projects:

| Path | Role |
| --- | --- |
| `packages/markweave` | Publishable npm package named `markweave`. |
| `apps/playground-react` | Private Vite/React demo app for local development and verification. |
| `apps/playground-vue2` | Private Vue CLI 4 / Webpack 4 / Vue 2 demo app for legacy adapter verification. |
| `apps/playground-vue3` | Private Vite/Vue 3 demo app for local development and adapter verification. |
| `apps/playground-fixtures` | Private shared Markdown fixture package for playground parity. |

## Public Surface

The package root exports from `packages/markweave/src/index.ts` are framework-neutral:

- `createMarkweaveEditorExtensions`
- public update payload, editor mode, content format, lang, upload, TOC, and table-copy types

Framework adapters are exposed through subpaths:

- `markweave/react`: React `MarkweaveEditor`, controller hook, React extension factory, and React adapter props.
- `markweave/vue2`: Vue 2 `MarkweaveEditor`, controller helper, Vue 2 extension factory, and Vue adapter props.
- `markweave/vue3`: Vue 3 `MarkweaveEditor`, composable, Vue 3 extension factory, and Vue adapter props.

The package exports `markweave`, `markweave/react`, `markweave/vue2`, `markweave/vue3`, and `markweave/styles.css`; package-boundary changes should keep `packages/markweave/test/editor-entrypoint-boundary.test.ts` current.

`MarkweaveEditor` is Markdown-first at the content API boundary. `defaultContent` and controlled `content` default to Markdown parsing, `onUpdate.markdown` is the recommended storage output, and legacy HTML/JSON inputs must declare `defaultContentFormat` or `contentFormat` explicitly. `mode="live"` and `mode="view"` are UI-only rendering modes and do not change the serialized document output.

The built-in document outline is enabled by default with `innerToc={true}`. It derives heading data from the current Tiptap document, exposes that data through `runtimeSnapshot.toc` and `onTocChange`, and does not write heading ids or TOC metadata into serialized Markdown/HTML. Hosts can pass `innerToc={false}` to hide the default Octarine-style side outline while rendering their own TOC from the same state.

## Editor Core

`packages/markweave/src/editor-core/create-editor-extensions.ts` composes the framework-neutral Tiptap/ProseMirror extension set and accepts framework-specific media extensions from React or Vue 3 adapters. The current extension boundary includes:

- core editing: StarterKit, composition guard, mark boundary, indent, text style, color, underline, highlight, links, math, emoji
- blocks and media: code blocks through lowlight, callouts, images, videos, attachments, horizontal rules, task lists
- Markdown behavior: official Markdown parse/serialize support, Markdown input transforms, and markdown-table input
- interaction layers: slash command runtime, table clipboard, table arrow navigation, table keyboard, table interaction state
- previews and controls: Mermaid inline preview, floating toolbar, slash menu, table controls, table selection overlay, code block controls
- link editing: the floating toolbar opens an inline link popover for selected text, with apply, open, and remove actions
- image editing: the image node renders an inline upload placeholder for empty images, then exposes align, caption, download, replace, delete, and width-resize controls through framework-specific NodeViews
- video insertion: the video node renders an inline upload placeholder for empty videos, supports local-file host uploads and direct video URLs, and automatically embeds YouTube and Bilibili links or whitelisted platform embed sources through framework-specific NodeViews
- editor modes: `mode="live"` keeps the full editable surface, while `mode="view"` is a UI-only read mode that reuses the same document rendering and keeps serialization output unchanged
- inner TOC: framework adapters render the right-side hover outline by default and keep the TOC state available even when the built-in UI is disabled

Framework-specific rendering must stay outside the core boundary. React `.tsx` files and React-only imports belong under `packages/markweave/src/react/**`; Vue 2 render functions belong under `packages/markweave/src/vue2/**`; Vue 3 render functions belong under `packages/markweave/src/vue3/**`. The `src/core`, `src/editor-core`, and `src/plugins` layers must remain framework-neutral TypeScript and must not import React, Vue, Tiptap framework adapters, or framework-specific lucide packages.

## Behavior Contracts

Behavior contract files list expected editor capabilities and should guide tests when changing related modules:

- `packages/markweave/src/plugins/markdown/behavior-contract.ts`
- `packages/markweave/src/plugins/slash-command/behavior-contract.ts`
- `packages/markweave/src/plugins/table/behavior-contract.ts`
- `packages/markweave/src/react/ui/floating-toolbar/behavior-contract.ts`

## Non-Goals In This Repo

- No backend service is present in this repository.
- No CI workflow is present as of the 2026-07-05 scan.
- The playground apps and shared fixture package are not part of the published npm package.
