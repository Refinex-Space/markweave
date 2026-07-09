---
owner: refinex
updated: 2026-07-09
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Architecture Overview

Markweave is a Markdown-first WYSIWYG editor package family. The workspace has eight active projects:

| Path | Role |
| --- | --- |
| `packages/markweave` | Publishable framework-neutral npm package named `markweave`. |
| `packages/markweave-react` | Publishable React adapter package named `@markweave/react`. |
| `packages/markweave-vue2` | Publishable Vue 2 adapter package named `@markweave/vue2`. |
| `packages/markweave-vue3` | Publishable Vue 3 adapter package named `@markweave/vue3`. |
| `apps/playground-react` | Private Vite/React demo app for local development and verification. |
| `apps/playground-vue2` | Private Vue CLI 4 / Webpack 4 / Vue 2 demo app for legacy adapter verification. |
| `apps/playground-vue3` | Private Vite/Vue 3 demo app for local development and adapter verification. |
| `apps/playground-fixtures` | Private shared Markdown fixture package for playground parity. |

## Public Surface

The core package root exports from `packages/markweave/src/index.ts` are framework-neutral:

- `createMarkweaveEditorExtensions`
- public update payload, editor mode, content format, lang, upload, TOC, and table-copy types

Framework adapters are exposed through adapter packages:

- `@markweave/react`: React `MarkweaveEditor`, controller hook, React extension factory, React adapter props, and `@markweave/react/styles.css`.
- `@markweave/vue2`: Vue 2 `MarkweaveEditor`, controller helper, Vue 2 extension factory, Vue adapter props, and `@markweave/vue2/styles.css`.
- `@markweave/vue3`: Vue 3 `MarkweaveEditor`, composable, Vue 3 extension factory, Vue adapter props, and `@markweave/vue3/styles.css`.

The core package exports `markweave`, `markweave/styles.css`, and the internal `markweave/internal/*` subpath consumed by adapter packages. `markweave/react`, `markweave/vue2`, and `markweave/vue3` remain legacy compatibility shims for one release cycle and forward to the adapter packages. Package-boundary changes should keep `packages/markweave/test/editor-entrypoint-boundary.test.ts` current.

`MarkweaveEditor` is Markdown-first at the content API boundary. `defaultContent` and controlled `content` default to Markdown parsing, `onUpdate.markdown` is the recommended storage output, and legacy HTML/JSON inputs must declare `defaultContentFormat` or `contentFormat` explicitly. `mode="live"` and `mode="view"` are UI-only rendering modes and do not change the serialized document output.

The built-in document outline is enabled by default with `innerToc={true}`. It derives heading data from the current Tiptap document, exposes that data through `runtimeSnapshot.toc` and `onTocChange`, and does not write heading ids or TOC metadata into serialized Markdown/HTML. Hosts can pass `innerToc={false}` to hide the default Octarine-style side outline while rendering their own TOC from the same state.

## Editor Core

`packages/markweave/src/editor-core/create-editor-extensions.ts` composes the framework-neutral Tiptap/ProseMirror extension set and accepts framework-specific media extensions from React, Vue 2, or Vue 3 adapters. The current extension boundary includes:

- core editing: StarterKit, composition guard, mark boundary, indent, text style, color, underline, highlight, links, math, emoji
- blocks and media: code blocks through lowlight, callouts, images, videos, attachments, horizontal rules, task lists
- Markdown behavior: official Markdown parse/serialize support, Markdown input transforms, and markdown-table input
- interaction layers: slash command runtime, table clipboard, table arrow navigation, table keyboard, table interaction state
- previews and controls: Mermaid inline preview, floating toolbar, slash menu, table controls, table selection overlay, code block controls
- link editing: the floating toolbar opens an inline link popover for selected text, with apply, open, and remove actions
- math editing: inline and block math render through the shared mathematics extension, while Live mode adapters expose the shared in-place LaTeX editor and View mode remains read-only
- image editing: the image node renders an inline upload placeholder for empty images, then exposes align, caption, download, replace, delete, and width-resize controls through framework-specific NodeViews
- video insertion: the video node renders an inline upload placeholder for empty videos, supports local-file host uploads and direct video URLs, and automatically embeds YouTube and Bilibili links or whitelisted platform embed sources through framework-specific NodeViews
- editor modes: `mode="live"` keeps the full editable surface, while `mode="view"` is a UI-only read mode that reuses the same document rendering and keeps serialization output unchanged
- inner TOC: framework adapters render the right-side hover outline by default and keep the TOC state available even when the built-in UI is disabled

Shared adapter behavior belongs in small framework-neutral helpers before it reaches framework components:

- `packages/markweave/src/editor-core/editor-content.ts` owns content format normalization, current-content comparison, Markdown fallback extraction, and `onUpdate` payload shaping.
- `packages/markweave/src/editor-core/floating-toolbar-model.ts` owns floating toolbar menu data, color values, link commands, assistant request payloads, and text/block command helpers.
- `packages/markweave/src/editor-core/readonly-link.ts` owns safe View mode link-opening behavior.
- `packages/markweave/src/editor-core/runtime-snapshot.ts` owns the runtime snapshot field contract.
- `packages/markweave/src/plugins/media/media-extension-factory.ts` owns shared image/video extension configuration while adapters still supply their framework NodeViews.

Framework-specific rendering must stay outside the core boundary. React `.tsx` files and React-only imports belong under `packages/markweave-react/src/**`; Vue 2 render functions belong under `packages/markweave-vue2/src/**`; Vue 3 render functions belong under `packages/markweave-vue3/src/**`. The `packages/markweave/src/core`, `src/editor-core`, and `src/plugins` layers must remain framework-neutral TypeScript and must not import React, Vue, Tiptap framework adapters, or framework-specific lucide packages.

User-visible behavior must not fork by adapter. Markdown parsing and serialization, content format normalization, mode/read-only decisions, slash/table/codeblock/Mermaid/TOC state, media attrs/upload mapping, link handling, floating toolbar models, and behavior contracts belong in `packages/markweave/src/core`, `src/editor-core`, or `src/plugins`. Adapter packages may wrap that behavior with framework lifecycle, render functions or JSX, NodeView DOM/event binding, and framework-specific icon components.

When one adapter needs a behavior fix, first look for the smallest framework-neutral helper that React, Vue 2, and Vue 3 can share. Copying logic between adapter files is a temporary containment only when an explicit compatibility limitation prevents sharing; document that limitation and cover the divergence with parity tests.

## Behavior Contracts

Behavior contract files list expected editor capabilities and should guide tests when changing related modules:

- `packages/markweave/src/plugins/markdown/behavior-contract.ts`
- `packages/markweave/src/plugins/slash-command/behavior-contract.ts`
- `packages/markweave/src/plugins/table/behavior-contract.ts`
- `packages/markweave-react/src/ui/floating-toolbar/behavior-contract.ts`

## Playground Contracts

Each private playground has its own README and uses the shared fixture package:

- `apps/playground-react/README.md`
- `apps/playground-vue2/README.md`
- `apps/playground-vue3/README.md`

The shared fixture package owns `initialPlaygroundDocument`, `mergedTablePlaygroundDocument`, upload mock helpers, and the playground capability/debug contracts. Playground apps can render those contracts in framework-native code, but should not redefine fixture semantics or upload result mapping locally.

## Non-Goals In This Repo

- No backend service is present in this repository.
- No CI workflow is present as of the 2026-07-05 scan.
- The playground apps and shared fixture package are not part of the published npm package.
