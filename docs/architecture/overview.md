---
owner: refinex
updated: 2026-09-01
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
- public update payload, editor mode, content format, lang, upload, TOC, table-copy, per-table capability resolver, Command Registry, Controller, command result/error, and host Extension types

Framework adapters are exposed through adapter packages:

- `@markweave/react`: React `MarkweaveEditor`, controller hook, React extension factory, React adapter props, and `@markweave/react/styles.css`.
- `@markweave/vue2`: Vue 2 `MarkweaveEditor`, controller helper, Vue 2 extension factory, Vue adapter props, and `@markweave/vue2/styles.css`.
- `@markweave/vue3`: Vue 3 `MarkweaveEditor`, composable, Vue 3 extension factory, Vue adapter props, and `@markweave/vue3/styles.css`.

The core package exports `markweave`, `markweave/styles.css`, and the internal `markweave/internal/*` subpath consumed by adapter packages. `markweave/react`, `markweave/vue2`, and `markweave/vue3` remain legacy compatibility shims for one release cycle and forward to the adapter packages. Package-boundary changes should keep `packages/markweave/test/editor-entrypoint-boundary.test.ts` current.

Webpack 4 consumers use additive physical entries rather than replacing the modern surface. `markweave/legacy` provides the framework-neutral ES2019 bundle; `@markweave/vue2/legacy` provides the complete Vue 2 shell; and `@markweave/vue2/webpack4` resolves the real installed package graph, applies physical package/style aliases, keeps Vue/Tiptap/ProseMirror on one runtime root, adds narrow shared-runtime Babel rules, and writes its cache outside `node_modules`. Required aliases fail closed when a package layout drifts. Legacy bundles may prebuild heavy feature dependencies, but Vue, the Tiptap Vue 2 adapter, Tiptap core/PM, and ProseMirror remain external singletons so host extensions cannot cross runtime identities. The workspace fixture validates the source/package boundary, while a separate temporary consumer installs real tarballs under both the Vue 2.6.12 / Vue CLI 4.4.6 minimum matrix and the Vue 2.7.16 / Vue CLI 4.5.19 final matrix; Webpack stats and browser smoke checks reject duplicate runtimes or non-runnable output.

`MarkweaveEditor` is Markdown-first at the content API boundary. `defaultContent` and controlled `content` default to Markdown parsing, and legacy HTML/JSON inputs must declare `defaultContentFormat` or `contentFormat` explicitly. Small controlled integrations may read `onUpdate.markdown` immediately; large-document hosts should use uncontrolled `defaultContent`, retain the lazy update payload, and read `payload.markdown` only at their debounce/flush boundary. Standard Markdown remains the preferred output; native HTML fallback preserves colored marks, block alignment, paragraph/heading indentation, subscript, superscript, merged or styled tables, and other state that standard Markdown cannot express. HTML fallback is serialized with the complete editor Schema, so trusted host nodes retain their `renderHTML` identity and attributes inside rich blocks and are reconstructed through `parseHTML`. `mode="live"` and `mode="view"` are UI-only rendering modes and do not change the serialized document output.

The built-in document outline is enabled by default with `innerToc={true}`. A ProseMirror plugin state maps unaffected heading positions through normal transactions and rescans only changed top-level ranges, with a full-scan fallback for complex replacements. The outline exposes that data through `runtimeSnapshot.toc` and `onTocChange`, uses logarithmic layout reads while scrolling, and does not write heading ids or TOC metadata into serialized Markdown/HTML. Container placement keeps the fixed outline outside CSS query-container semantics and uses the existing `ResizeObserver` positioning helper to mark narrow frames, avoiding Chromium 106 fixed-position containing-block drift. The collapsed rail keeps natural marker spacing, bounds its height to about 70% of the viewport, and fades overflow markers at the bottom for long outlines; the expanded panel remains independently scrollable. Hosts can pass `innerToc={false}` to hide the default Octarine-style side outline while rendering their own TOC from the same state.

## Editor Core

`packages/markweave/src/editor-core/create-editor-extensions.ts` composes the framework-neutral Tiptap/ProseMirror extension set and accepts framework-specific media extensions from React, Vue 2, or Vue 3 adapters. The current extension boundary includes:

The table capability policy is a synchronous, fail-closed host resolver that receives only readonly table and ancestor descriptors. The shared core applies it to Markweave-owned menu, keyboard, edge-add, drag, paste, formatting, copy, and table-AI paths; raw trusted-host Tiptap calls remain outside this UI contract.

- host command protocol: `packages/markweave/src/commands` owns immutable Registry snapshots, the 22-command builtin inventory, predicates/search/sorting, one-per-editor Controller, async execution cancellation/conflict mapping, safe result validation, the fixed 1 MiB result cap, and atomic result application; adapters only bridge props, DOM, icons, accessibility, and lifecycle callbacks
- advanced extension boundary: `editorExtensions` appends trusted host extensions after all builtins and framework media/LinkCard extensions; the core factory flattens StarterKit children and rejects duplicate names before Editor creation, while runtime array changes require a keyed remount

- core editing: StarterKit, composition guard, mark boundary, indent, text style, color, underline, highlight, links, math, emoji
- blocks and media: code blocks through lowlight, callouts, collapsible details blocks, images, videos, attachments, horizontal rules, task lists
- Markdown behavior: official Markdown parse/serialize support, Markdown input transforms, and markdown-table input. Serialization follows GFM intra-word underscore rules: identifiers such as `doc_review_agent` stay unescaped, while `_` that can open or close emphasis is still backslash-escaped. Over-escaped intra-word `\_` sequences are collapsed on serialize.
- interaction layers: slash command runtime with a localized, non-serialized hint on the active eligible empty paragraph and an in-document `/query` trigger that the menu anchors to directly (styled in place with a non-serialized decoration and an empty-query filter hint, with no floating overlay duplicating the slash), Ask AI target mapping and review state, host-driven AI edit contexts, table clipboard, table arrow navigation, table keyboard, table interaction state; Ask AI stays inert unless the host explicitly supplies an enabled handler, while `MarkweaveAiEditController` lets a host lazily inspect the current selection or explicitly capture an exact selection, the covering top-level blocks, or the full document without Markweave making a network request; exact selections keep cumulative-stream local preview, while block/document proposals are complete target Markdown snapshots that Markweave parses into bounded structural multi-hunk diffs only after completion; review navigation activates one hunk without moving the ProseMirror selection, per-hunk accept/discard decisions remain staged until every hunk is resolved, unrelated edits remap targets, target edits fail closed, and the accepted subset applies in one transaction and one undo step; table Ask AI additionally validates fragment versus exact-shape GFM table output and replaces cell contents without changing table structure or attributes; row and column handle selections keep the handle target cells authoritative, while a translucent visual-axis overlay covers only the requested row or column slice through spanning cells, keeps cell content readable, and suppresses broader native ProseMirror `selectedCell` paint
- previews and controls: Mermaid inline preview, floating toolbar, slash menu, table controls, table selection overlay, code block controls; Ask AI renders text, table-cell, code, and math results as target-local ephemeral proposals without changing the document before acceptance, uses Chromium 106-safe contrast tokens for proposal text and primary actions, and keeps Mermaid output as source instead of executing generated diagrams; host-driven AI edit renders one body-level bottom-center decision dock inside the editor's visible boundary with hunk count, cyclic previous/next navigation, and global actions, while the active or hovered hunk exposes local accept/discard controls; the body-level dock avoids Chromium 106 query-container fixed-position drift, and its hunk actions and tooltips stay on Chromium 106-compatible DOM/CSS primitives; long proposals retain visible controls through scroll, clipping containers, and window reactivation; table command menus reuse the same framework-neutral visible-boundary model that intersects the editor frame, browser viewport, and clipping ancestors, chooses a best-fit side for main/submenus, and scrolls oversized menu content internally; the code-block language menu stays anchored to its trigger while scrolling, supports Arrow Up/Down navigation with automatic option scrolling, and selects the highlighted language with Enter; Mermaid SVG downloads use the system save picker when supported and otherwise fall back to the browser download flow
- link editing: the floating toolbar opens an inline link popover for selected text, with apply, open, and remove actions; ordinary inline anchors omit a native `target="_blank"` so embedded WebViews cannot bypass the editor interaction contract; in editable Live mode the shared link plugin projects normalized `[label](target "title")` source only around the active inline link, keeps the projection outside document storage/history, commits safe target edits on Enter or blur, discards drafts on Escape, and opens links only through the existing safe View-mode or Ctrl/Cmd-click path
- math editing: inline and block math render through the shared mathematics extension, while Live mode adapters expose the shared in-place LaTeX editor and View mode remains read-only
- image editing: the shared core clipboard extension inserts remote HTTP(S) images directly and routes pasted local image files through the host upload handler; without a media resolver the existing framework NodeViews remain compatible, while `resolveMediaSource` switches populated images to a framework-neutral lightweight DOM NodeView with a pending placeholder, asynchronous decoding, a post-mount viewport probe, IntersectionObserver-based nearby source resolution, eager browser loading after candidate resolution, focus/pageshow recovery, and a per-document idle queue with a hard watchdog. A resolver URL is only a candidate: the NodeView commits success after the real `load` event. Resolver null/rejection/timeout, image error/timeout, source replacement, and cancelled visual work clear stale candidates and retain bounded retry or explicit recovery paths; visible selection and output preparation bypass background deferral. Requests expose optional attempt/reason diagnostics so a host can invalidate stale positive or negative caches without changing stored Markdown. Intrinsic sizing and selected-only controls preserve the framework NodeView's icon toolbar, alignment, caption, preview, download, replace, resize, and delete behavior; empty upload placeholders still use the adapter UI
- video insertion: the video node renders an inline upload placeholder for empty videos, supports local-file host uploads and direct video URLs, and automatically embeds YouTube and Bilibili links or whitelisted platform embed sources through framework-specific NodeViews. Direct `<video>` sources and platform embeds do not autoplay.
- editor modes: `mode="live"` keeps the full editable surface, while `mode="view"` is a UI-only read mode that reuses the same document rendering and keeps serialization output unchanged
- inner TOC: framework adapters render the right-side hover outline by default and keep the TOC state available even when the built-in UI is disabled
- document search: the shared ProseMirror search plugin owns Unicode-aware literal/regex matching, result decorations, cyclic navigation, and editable-only replacement; host adapters expose the controller while products own their search UI

Shared adapter behavior belongs in small framework-neutral helpers before it reaches framework components:

- `packages/markweave/src/editor-core/editor-content.ts` owns content format normalization, current-content comparison, Markdown fallback extraction, and `onUpdate` payload shaping.
- `packages/markweave/src/editor-core/floating-toolbar-model.ts` owns floating toolbar menu data, color values, link commands, assistant request payloads, and text/block command helpers.
- `packages/markweave/src/editor-core/link-click.ts` owns the single mode-aware link click path, while `readonly-link.ts` performs the safe View mode open after that shared decision.
- `packages/markweave/src/editor-core/runtime-snapshot.ts` owns the runtime snapshot field contract.
- `packages/markweave/src/plugins/search/search-controller.ts` owns document search state, decorations, navigation, replacement transactions, and the framework-neutral controller contract.
- `packages/markweave/src/plugins/ask-ai/ask-ai-session.ts` owns shared text/table target eligibility, mapped target conflict detection, Markdown/schema validation, target-local text/table/code/math proposal decorations, and the single acceptance transaction. `packages/markweave/src/plugins/ai-edit/ai-edit-controller.ts` layers the provider-neutral host controller, cumulative-stream coalescing, state/decision subscriptions, a body-level viewport-fixed default decision dock, and editor lifecycle cancellation on top of that engine; adapters only publish controller lifecycle callbacks.
- `packages/markweave/src/plugins/media/media-extension-factory.ts` owns shared image/video extension configuration; `media-source.ts` defines the cancellable display-only resolver contract and `lightweight-image-node-view.ts` owns the cross-framework large-document image path.

## Large-document Runtime

All adapters use the shared `DocumentLoadCoordinator`. A document is parsed exactly once into one canonical ProseMirror document; Markweave never parses independent Markdown chunks because doing so changes reference-link, blank-line, and custom-token semantics. For large built-in Markdown documents, a build-generated ES2019 Blob Worker lexes the complete source and the editor's canonical Markdown manager converts those tokens to the final ProseMirror JSON. Worker/CSP failure falls back to the same whole-document main-thread parser. Unknown host Markdown tokenizers always use that safe main-thread path. Standard documents mount atomically. Large and extreme documents with built-in extensions mount the already-parsed top-level nodes in bounded, history-disabled batches while the editor remains read-only. Unknown host `editorExtensions` stay atomic unless the host explicitly opts into `editorExtensionsLoadPolicy="transactional-safe"`.

`performancePolicy="auto"` derives a `standard | large | extreme` tier from source length and structural counts for top-level blocks, nodes, table cells, code, Mermaid, math, and media. The tier is recomputed after controlled replacement, imperative `setContent`, and idle document changes. React, Vue 2, and Vue 3 publish the same load phases, `aria-busy` state, runtime performance snapshot, search-controller lifecycle, cancellation, autofocus, and ready boundary.

Large surfaces keep one complete ProseMirror DOM and use type-specific top-level `content-visibility` estimates. `DocumentViewportCoordinator` coalesces scroll/layout work into one frame, detects rapid scrolling, pins selection/navigation/output targets, maintains end-of-document scrollbar jumps, and routes Search/TOC through cancellable position-based reveal with layout correction. It does not delete off-screen nodes or virtualize table rows, so selection, IME, clipboard, search, serialization, host nodes, and undo continue to use the complete document.

Search maintains a mapped text-segment index, stores every match, and projects at most 256 active/nearby DOM decorations. Small searches stay synchronous; large searches use a cancellable Worker with a cooperative main-thread fallback and exact final counts. Lowlight, Mermaid, code collapse, code controls, media, and output work use mapped indexes, cached `DecorationSet`s, viewport priority, stale-result validation, and bounded visual queues instead of per-transaction whole-document scans.

`prepareMarkweaveEditorForOutput()` materializes every block and waits for registered media, Mermaid, math, font, and layout work before print or DOM capture. Markdown/HTML/JSON serialization always reads the canonical ProseMirror document and never depends on visual readiness.

Custom Markdown tokenizers must not scan or `split` the entire remaining source for every block. Markweave bounds look-ahead for callout, link-card, attachment, details, ordered-list, table, and block-math tokenizers; the playground host-extension fixture follows the same contract. The adapters suppress editable-state update events, compute table debug snapshots only for an active runtime callback, and keep ordinary projections behind shared mapped state or frame scheduling.

Framework-specific rendering must stay outside the core boundary. React `.tsx` files and React-only imports belong under `packages/markweave-react/src/**`; Vue 2 render functions belong under `packages/markweave-vue2/src/**`; Vue 3 render functions belong under `packages/markweave-vue3/src/**`. The `packages/markweave/src/core`, `src/editor-core`, and `src/plugins` layers must remain framework-neutral TypeScript and must not import React, Vue, Tiptap framework adapters, or framework-specific lucide packages.

User-visible behavior must not fork by adapter. Markdown parsing and serialization, content format normalization, mode/read-only decisions, slash/table/codeblock/Mermaid/TOC state, media attrs/upload mapping, link handling, floating toolbar models, and behavior contracts belong in `packages/markweave/src/core`, `src/editor-core`, or `src/plugins`. Adapter packages may wrap that behavior with framework lifecycle, render functions or JSX, NodeView DOM/event binding, and framework-specific icon components.

When one adapter needs a behavior fix, first look for the smallest framework-neutral helper that React, Vue 2, and Vue 3 can share. Copying logic between adapter files is a temporary containment only when an explicit compatibility limitation prevents sharing; document that limitation and cover the divergence with parity tests.

## Behavior Contracts

Behavior contract files list expected editor capabilities and should guide tests when changing related modules:

- `packages/markweave/src/plugins/markdown/behavior-contract.ts`
- `packages/markweave/src/plugins/slash-command/behavior-contract.ts`
- `packages/markweave/src/plugins/details/behavior-contract.ts`
- `packages/markweave/src/plugins/table/behavior-contract.ts`
- `packages/markweave/src/plugins/ask-ai/behavior-contract.ts`
- `packages/markweave/src/plugins/ai-edit/behavior-contract.ts`
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
