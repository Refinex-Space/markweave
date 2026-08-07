---
owner: refinex
updated: 2026-08-07
status: active
referenced_by: docs/README.md#knowledge-map
---

# Vue 2 Integration Guide

Language: [中文](./vue2-integration-zh-cn.md) | English

This guide is the complete Vue 2 integration path for Markweave. It covers installation, Vue 2.6 compiler requirements, Vue CLI 4 / Webpack 4 compatibility, content storage, Live/View mode, uploads, callbacks, TOC, and production boundaries. The private reference implementation is `apps/playground-vue2`.

For large documents, use `defaultContent` instead of a per-keystroke controlled `content` loop, retain the lazy update payload, and read `payload.markdown` only at the host save/flush boundary. The optional `resolveMediaSource` prop accepts the same cancellable priority request as React and Vue 3; returning a display URL plus optional intrinsic dimensions activates the shared lightweight image NodeView without changing serialized Markdown.

## Install

Install the Vue 2 adapter in an existing Vue 2.6 app:

```sh
pnpm add @markweave/vue2
```

Vue is a peer dependency owned by the host app. Vue 2 projects must keep `vue-template-compiler` on exactly the same `2.6.x` version as `vue`:

```sh
pnpm add vue@2.6.12 vue-template-compiler@2.6.12
```

Import the stylesheet once in your app entry or editor component:

```js
import "@markweave/vue2/styles.css";
```

You do not need to install `@vue/composition-api` just for Markweave. The Vue 2 adapter includes its own compatibility layer.

## Vue CLI 4 / Webpack 4 Notes

Older Vue 2 apps often need dependencies transpiled because Markweave and Tiptap ship modern ESM. Start with this `vue.config.js` shape if your project uses Vue CLI 4 / Webpack 4:

```js
module.exports = {
  transpileDependencies: [
    "markweave",
    "@markweave/vue2",
    "@tiptap",
    "prosemirror",
    "lowlight",
    "mermaid",
    "marked",
    "es-toolkit",
    "@iconify",
    "@mermaid-js",
    "uuid",
  ],
  configureWebpack: {
    resolve: {
      extensions: [".mjs", ".js", ".jsx", ".ts", ".tsx", ".vue", ".json"],
    },
    module: {
      rules: [
        {
          test: /\.mjs$/,
          include: /node_modules/,
          type: "javascript/auto",
        },
      ],
    },
  },
};
```

The playground has additional aliases because it consumes local source files. Published consumers should import from `@markweave/vue2` and normally do not need those workspace aliases.

## Minimal Editor

```vue
<template>
  <MarkweaveEditor
    aria-label="Product notes editor"
    :default-content="initialMarkdown"
    :on-update="handleUpdate"
  />
</template>

<script>
import { MarkweaveEditor } from "@markweave/vue2";
import "@markweave/vue2/styles.css";

export default {
  name: "ProductEditor",
  components: { MarkweaveEditor },
  data() {
    return {
      initialMarkdown: "# Product Notes\n\nWrite in **Markdown**, edit visually, and store Markdown.",
    };
  },
  methods: {
    handleUpdate(payload) {
      this.saveDraft(payload.markdown);
    },
    saveDraft(markdown) {
      console.log(markdown);
    },
  },
};
</script>
```

`default-content` is Markdown by default. Store `payload.markdown` as the canonical product value. Markweave keeps standard Markdown where possible and emits native HTML fallback only for rich state that Markdown cannot express, including colored text/highlights, block alignment, and merged table cells. `payload.html`, `payload.json`, and `payload.text` remain integration outputs. Payload fields serialize lazily and cache their result, so reading Markdown does not also create HTML, JSON, and plain text; a controlled Markdown echo also avoids a duplicate content comparison.

## Content API

| Template prop | JavaScript prop | Default | Use |
| --- | --- | --- | --- |
| `default-content` | `defaultContent` | `""` | Initial uncontrolled content. Parsed as Markdown unless `default-content-format` is set. |
| `default-content-format` | `defaultContentFormat` | `"markdown"` | Use `"html"` for legacy HTML or `"json"` for Tiptap JSON. |
| `content` | `content` | `undefined` | Controlled content. Parsed as Markdown unless `content-format` is set. |
| `content-format` | `contentFormat` | `"markdown"` | Controlled content format. |
| `on-update` | `onUpdate` | `undefined` | Save `payload.markdown`; inspect `html`, `json`, or `text` when needed. |

Controlled Markdown example:

```vue
<template>
  <MarkweaveEditor
    :content="markdown"
    content-format="markdown"
    :on-update="handleUpdate"
  />
</template>

<script>
import { MarkweaveEditor } from "@markweave/vue2";

export default {
  components: { MarkweaveEditor },
  data() {
    return {
      markdown: "# Hello Markweave",
    };
  },
  methods: {
    handleUpdate(payload) {
      this.markdown = payload.markdown;
    },
  },
};
</script>
```

Legacy HTML must be explicit:

```vue
<template>
  <MarkweaveEditor
    default-content="<h1>Hello Markweave</h1>"
    default-content-format="html"
  />
</template>
```

For advanced custom shells, `useMarkweaveEditorController` exposes `actions.setContent(content, { format, emitUpdate, focusFirstTableBodyCell })`. The stock `MarkweaveEditor` component is recommended for normal product integration because it renders the full toolbar, slash menu, table controls, code controls, math editor, media NodeViews, and TOC.

## Modes, Language, And TOC

```vue
<template>
  <MarkweaveEditor
    default-content="# Spec\n\n## Goals"
    mode="live"
    theme="dark"
    lang="zh"
    inner-toc
    :on-toc-change="handleTocChange"
    :on-runtime-state-change="handleRuntimeStateChange"
  />
</template>

<script>
export default {
  methods: {
    handleTocChange(state) {
      console.log(state.items, state.activeId);
    },
    handleRuntimeStateChange(snapshot) {
      console.log(snapshot.mode, snapshot.editable, snapshot.toc);
    },
  },
};
</script>
```

| Template prop | Default | Notes |
| --- | --- | --- |
| `mode` | `"live"` | `"live"` is editable; `"view"` is read-only and keeps reader actions such as safe links, code copy, Mermaid preview/fullscreen/download, media playback, and TOC navigation. |
| `theme` | `"light"` | `"light"` or `"dark"`. The theme is scoped to this editor frame and can change at runtime without recreating document content. |
| `canvasColor` | theme default | Optional CSS color/value for the editor canvas only. The defaults are `transparent` in light mode and `#181A1F` in dark mode. For example, pass `"#000"` or `"var(--app-canvas)"`. Runtime changes do not recreate the editor. |
| `editable` | `true` | Compatibility lock. Effective editable state is `mode === "live" && editable !== false`. |
| `lang` | `"zh"` | UI language. Supported values are `"zh"` and `"en"`. Re-mount the editor when switching language dynamically. |
| `inner-toc` | `true` | Renders the built-in right-side outline. Set `:inner-toc="false"` to render your own TOC from `on-toc-change` or `runtimeSnapshot.toc`. |
| `inner-toc-placement` | `"container"` | The default keeps the outline vertically centered in the visual viewport and centers the writing column with symmetric TOC gutters. It hides the built-in outline when the actual editor container is narrow, preserving readable content width. Set `inner-toc-placement="viewport"` only when a fixed viewport-side outline is required. |
| `auto-focus-first-table-body-cell` | `false` | Useful for playground or table-first documents. |

## Upload API

Images and videos support URL, absolute path, relative path, Base64, and local file input. URL/path/Base64 values can be used directly by Markweave. Local files must be uploaded by the host app through `on-slash-command-upload`.

In Live mode, pasting local `image/*` clipboard files inserts every image in order and sends each file through the same `on-slash-command-upload` handler with `kind: "image"` and `trigger: "image-insert"`. Image-only HTML `<img>` clipboard content is inserted directly when its source is HTTP(S). A standalone HTTP(S) URL is converted to an image only when its path has a common image extension; Markweave does not fetch the URL. When files and HTML/URL representations coexist, files take precedence to avoid duplicate images.

The normative upload/download field contract for attachments (and shared request/result shapes) lives in [`attachment-upload-protocol.md`](./attachment-upload-protocol.md). Keep Vue 2 wiring here; keep metadata and download-handler semantics there.

```vue
<template>
  <MarkweaveEditor :on-slash-command-upload="handleUpload" />
</template>

<script>
import { MarkweaveEditor } from "@markweave/vue2";

export default {
  components: { MarkweaveEditor },
  methods: {
    async handleUpload(request) {
      if (request.source.type !== "file") {
        return {
          src: request.source.value || "",
          name: request.source.value ? request.source.value.split("/").filter(Boolean).pop() : undefined,
          mimeType: request.source.mimeType,
        };
      }

      if (!request.source.file) {
        throw new Error("Missing upload file.");
      }

      const form = new FormData();
      form.append("file", request.source.file);
      form.append("kind", request.kind);
      form.append("trigger", request.trigger);

      const response = await fetch("/api/uploads", {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        throw new Error("Upload failed.");
      }

      return response.json();
    },
  },
};
</script>
```

Images render with preview, align, caption, resize, replace, download, and delete controls in Live mode. In View mode, hovering an image reveals a top-right preview action that opens the same fullscreen zoom and pan reader. Videos accept local upload, direct video URLs, YouTube embed URLs, Bilibili player URLs, and normal YouTube/Bilibili share links. Attachments round-trip through `markweaveAttachment`. Slash Attachment inserts an empty inline placeholder; click to pick a local file (optional `onProgress` for percentage). Filled chips show download and delete on hover and call `onAttachmentDownload` when activated. Without that host handler, only safe `http(s)` sources open in a new tab.

## Ask AI

Ask AI is disabled by default. Vue templates enable it with `:ask-ai`:

The Ask AI composer stays bound to the selection that opened it. When the user presses the mouse, pen, or touch surface inside the editor to start another selection, Markweave first closes and cancels the current Ask AI session, then restores the regular floating toolbar for the new selection. Interacting inside the composer or its panel does not dismiss it.

```vue
<MarkweaveEditor :ask-ai="{ enabled: true, handler: handleAskAi }" />
```

`handleAskAi(request)` returns Markdown or `AsyncIterable<string>`. The same handler receives ordinary text targets and table cell, row, column, selection, or whole-table targets through `request.target`; the legacy `selection` field remains a flat compatibility projection. Only target-local content is sent. Single cells expect a Markdown fragment, while multi-cell targets expect an exact-shape GFM table. Markweave previews without changing the document and applies only accepted cell contents in one undoable transaction while preserving table structure and attributes. Multi-cell targets containing merged cells and View mode remain fail-closed.

`on-rewrite-selection` and `on-extract-to-note` remain legacy compatibility callbacks.

## Host-Driven AI Edit Review

Vue 2 hosts obtain the same `MarkweaveAiEditController` as React and Vue 3 through `:on-ai-edit-controller-change`. This is independent from built-in `ask-ai`: the host calls any provider and returns Markdown, while Markweave owns mapping, in-place review, acceptance, discard, and conflict protection.

### Controller lifecycle and complete response

The callback receives a controller after editor creation and `null` on final destruction. A keyed Vue 2 replacement publishes its successor on the next tick so stale cleanup cannot overwrite the new reference with `null`. Replace the stored reference on every callback and never reuse it after `null`.

```vue
<MarkweaveEditor :on-ai-edit-controller-change="setAiEditController" />
```

```js
export default {
  data() {
    return { aiEditController: null };
  },
  methods: {
    setAiEditController(controller) {
      this.aiEditController = controller;
    },
    async reviseSelection() {
      const controller = this.aiEditController;
      if (!controller) return;
      const captured = controller.captureSelection({ metadata: { action: "revise" } });
      if (!captured.ok) {
        console.warn(captured.code, captured.message);
        return;
      }
      const { id, selection, signal } = captured.value;
      try {
        const markdown = await callHostAi(selection, signal);
        const completed = controller.updateProposal({ contextId: id, markdown, status: "complete" });
        if (!completed.ok) console.warn(completed.code, completed.message);
      } catch (error) {
        if (!signal.aborted) controller.failProposal(id, error instanceof Error ? error.message : undefined);
      }
    },
  },
};
```

`captureSelection()` remains an exact ordinary-text capture. `getSelection()` and `subscribeSelection()` lazily expose `text`, `html`, `markdown`, and a one-based block-precision `lineRange` in normalized Markdown. Selection content is intentionally absent from the high-frequency runtime snapshot.

### Selected blocks and document-wide multi-edit review

```js
const snapshot = controller.getSelection();
const unsubscribe = controller.subscribeSelection(renderSelectionHint);
// A "revise selected blocks" action; a collapsed cursor targets its top-level block.
const capturedBlocks = controller.capture({
  scope: "blocks",
  controls: "default",
});

// A separate, explicit "review and revise document" action.
const capturedDocument = controller.capture({
  scope: "document",
  controls: "default",
  metadata: { action: "revise-document" },
});
```

`selection` requires an eligible non-empty text range. `blocks` expands the range or cursor to covering top-level blocks. `document` explicitly captures the whole document without requiring a selection. For blocks and documents, return the complete revised Markdown for the captured target, never ProseMirror positions or a patch. Markweave waits for `complete`, computes and previews at most 200 structural hunks, stages per-hunk decisions, and applies the accepted subset in one transaction and one undo step. `onDecision.appliedRanges` reports the mapped ranges actually applied. Full-document capture must remain an explicit host action and must not be inferred merely from an empty selection.

### Cumulative streaming and headless controls

Every streaming call must pass the complete accumulated Markdown, not one token, and finish with `status: "complete"`. Exact selections may update their local preview while streaming; block/document diffs appear only after completion so an unreceived suffix never looks deleted. The default controls use one body-level bottom-center decision dock with hunk count, cyclic navigation, and global actions; the active or hovered hunk exposes local accept/discard controls. `controls: "none"` hides both built-in control surfaces. Headless hosts can use `previousHunk`, `nextHunk`, `acceptHunk`, `discardHunk`, `acceptAll`, and `discardAll`. Read `getState()` before state `subscribe()`; `subscribeSelection()` immediately replays the current selection. Dispose all listeners in `beforeDestroy`.

### State, errors, and safety

Phases are `idle`, `captured`, `streaming`, `review`, `error`, and `conflict`. Errors include `active-review`, `stale-context`, `incomplete-proposal`, `unsupported-scope`, and `proposal-too-complex`; one editor allows one active context.

Exact `selection` still rejects code blocks, tables/cells, media/atoms, `NodeSelection`, and `CellSelection`. `blocks/document` may safely carry unchanged structures and validate the complete proposal against the schema. External edits remap the range; editing inside the target, switching View, discarding, or editor teardown aborts the context `AbortSignal`. Ignore late work after abort or `stale-context`. Preview, failure, conflict, and discard do not change serialized content or undo history.

## Tables, Compatibility AI, And Copy Callbacks

```vue
<template>
  <MarkweaveEditor
    :on-edit-with-ai="handleEditWithAi"
    :on-rewrite-selection="handleRewriteSelection"
    :on-extract-to-note="handleExtractToNote"
    :on-table-copy-payload="handleTableCopyPayload"
    :on-table-command-result="handleTableCommandResult"
  />
</template>
```

- `on-edit-with-ai` remains a deprecated compatibility prop but is no longer rendered by the built-in menus; use `ask-ai` for new integrations.
- `on-rewrite-selection` and `on-extract-to-note` are legacy compatibility callbacks.
- `on-table-copy-payload` mirrors table copy actions for row, column, or table payloads.
- `on-table-command-result` reports table command outcomes and before/after snapshots.

The built-in table controls use Notion-like row, column, and selection handles. With `ask-ai` enabled, `Ask AI` is the first item in every table handle menu. Row and column menus also cover moving, inserting, sorting, color, alignment, clearing, duplication, and deletion; selection controls retain merge, split, copy, and delete. Hovering the last row or column reveals a full-edge add control, while dragging a row or column handle reorders it. All labels follow `lang` (`zh` or `en`).

## External Link Cards

Only a paragraph containing exactly one HTTP(S) link can become a card; inline, mixed-text, and `markweave:` links remain normal links. Use `:link-card-resolver="resolveLinkCard"` to enrich a card only after an explicit user embed or edit.

The resolver receives `{ href, title, signal }`; it is not called during load, scrolling, or ordinary link clicks. Keep metadata fetching in a backend that enforces URL/DNS allowlists, redirect and timeout limits, response-size limits, and image URL validation. Markweave does not fetch external URLs itself.

## Feature Coverage

Vue 2 receives the complete Markweave UI: floating toolbar, link popover, slash command menu, table handles and selection overlay, code block language/copy controls, Mermaid Code/Preview/fullscreen/download, image/video NodeViews, math editing, Live/View mode, built-in TOC, and Chinese/English UI.

## Production Notes

- Save Markdown from `on-update` payloads; its supported HTML fallback is part of the lossless Markdown format, not a separate document mode.
- Debounce persistence in the host app. Markweave emits updates as the editor changes.
- Import `@markweave/vue2/styles.css` once.
- Inline emphasis remains visible for CJK fallback fonts even when the host system has no native italic face.
- Keep `vue` and `vue-template-compiler` versions identical.
- Keep `transpileDependencies` for modern ESM dependencies when using Vue CLI 4 / Webpack 4.
- The host-driven multi-hunk AI review dock mounts directly under `body` instead of relying on a CSS query container; per-hunk actions and tooltips use DOM, selector, and layout primitives supported by Electron 21 / Chromium 106.
- Markweave 0.3.5 avoids CSS query-container fixed-position drift and actively probes pending first-screen images after mount, including when Electron 21 / Chromium 106 delays the initial `IntersectionObserver` callback.
- Keep uploads authenticated and validate file size, MIME type, and returned URLs on your server.
- Do not allow arbitrary iframe hosts. Markweave only handles direct video plus supported YouTube/Bilibili embed forms.
- Markweave is browser-oriented. In SSR setups, render the editor on the client side.
- Safe View-mode links reject unsafe protocols such as `javascript:`, `data:`, and `vbscript:`.
