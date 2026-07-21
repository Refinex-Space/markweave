---
owner: refinex
updated: 2026-07-21
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

Upload request contract:

| Field | Values |
| --- | --- |
| `kind` | `"image"`, `"video"`, `"attachment"` |
| `trigger` | `"slash-command"`, `"image-insert"`, `"image-replace"`, `"video-insert"` |
| `source.type` | `"url"`, `"absolute-path"`, `"relative-path"`, `"base64"`, `"file"` |
| `source.value` | Present for URL/path/Base64 input. |
| `source.file` | Present for local file input. |
| `source.mimeType` | Browser-provided MIME type when available. |

Upload result contract:

```ts
interface MarkweaveUploadResult {
  src: string;
  name?: string;
  alt?: string;
  title?: string;
  mimeType?: string;
  size?: number;
}
```

Images render with preview, align, caption, resize, replace, download, and delete controls in Live mode. In View mode, hovering an image reveals a top-right preview action that opens the same fullscreen zoom and pan reader. Videos accept local upload, direct video URLs, YouTube embed URLs, Bilibili player URLs, and normal YouTube/Bilibili share links. Attachments render from existing attachment HTML fallback; the slash Attachment command is currently disabled in the default UI, but the upload type remains part of the public contract for host extensions.

## Tables, AI, And Copy Callbacks

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

- `on-edit-with-ai` receives row, column, or selection context from table menus.
- `on-rewrite-selection` and `on-extract-to-note` receive selected text and HTML from the floating toolbar.
- `on-table-copy-payload` mirrors table copy actions for row, column, or table payloads.
- `on-table-command-result` reports table command outcomes and before/after snapshots.

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
- Keep uploads authenticated and validate file size, MIME type, and returned URLs on your server.
- Do not allow arbitrary iframe hosts. Markweave only handles direct video plus supported YouTube/Bilibili embed forms.
- Markweave is browser-oriented. In SSR setups, render the editor on the client side.
- Safe View-mode links reject unsafe protocols such as `javascript:`, `data:`, and `vbscript:`.
