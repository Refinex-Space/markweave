---
owner: refinex
updated: 2026-07-10
status: active
referenced_by: docs/README.md#knowledge-map
---

# Vue 3 Integration Guide

Language: [中文](./vue3-integration-zh-cn.md) | English

This guide is the complete Vue 3 integration path for Markweave. It covers installation, content storage, Live/View mode, upload handling, framework props, callbacks, TOC, and production boundaries. The private reference implementation is `apps/playground-vue3`.

## Install

Install the Vue 3 adapter in an existing Vue 3 app:

```sh
pnpm add @markweave/vue3
```

Vue is a peer dependency owned by the host app:

```sh
pnpm add vue
```

Import the stylesheet once in your app entry or editor component:

```ts
import "@markweave/vue3/styles.css";
```

## Minimal Editor

```vue
<script setup lang="ts">
import {
  MarkweaveEditor,
  type MarkweaveEditorUpdatePayload,
} from "@markweave/vue3";
import "@markweave/vue3/styles.css";

const initialMarkdown = `# Product Notes

Write in **Markdown**, edit visually, and store Markdown.`;

function handleUpdate(payload: MarkweaveEditorUpdatePayload) {
  saveDraft(payload.markdown);
}

function saveDraft(markdown: string) {
  console.log(markdown);
}
</script>

<template>
  <MarkweaveEditor
    aria-label="Product notes editor"
    :default-content="initialMarkdown"
    :on-update="handleUpdate"
  />
</template>
```

`default-content` is Markdown by default. Store `payload.markdown` as the canonical product value. `payload.html`, `payload.json`, and `payload.text` are integration outputs, not the recommended storage source.

## Content API

| Template prop | TypeScript prop | Default | Use |
| --- | --- | --- | --- |
| `default-content` | `defaultContent` | `""` | Initial uncontrolled content. Parsed as Markdown unless `default-content-format` is set. |
| `default-content-format` | `defaultContentFormat` | `"markdown"` | Use `"html"` for legacy HTML or `"json"` for Tiptap JSON. |
| `content` | `content` | `undefined` | Controlled content. Parsed as Markdown unless `content-format` is set. |
| `content-format` | `contentFormat` | `"markdown"` | Controlled content format. |
| `on-update` | `onUpdate` | `undefined` | Save `payload.markdown`; inspect `html`, `json`, or `text` when needed. |

Controlled Markdown example:

```vue
<script setup lang="ts">
import { ref } from "vue";
import {
  MarkweaveEditor,
  type MarkweaveEditorUpdatePayload,
} from "@markweave/vue3";

const markdown = ref("# Hello Markweave");

function handleUpdate(payload: MarkweaveEditorUpdatePayload) {
  markdown.value = payload.markdown;
}
</script>

<template>
  <MarkweaveEditor
    :content="markdown"
    content-format="markdown"
    :on-update="handleUpdate"
  />
</template>
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
<script setup lang="ts">
import { MarkweaveEditor } from "@markweave/vue3";

function handleTocChange({ items, activeId }) {
  console.log(items, activeId);
}

function handleRuntimeStateChange(snapshot) {
  console.log(snapshot.mode, snapshot.editable, snapshot.toc);
}
</script>

<template>
  <MarkweaveEditor
    default-content="# Spec\n\n## Goals"
    mode="live"
    lang="zh"
    inner-toc
    :on-toc-change="handleTocChange"
    :on-runtime-state-change="handleRuntimeStateChange"
  />
</template>
```

| Template prop | Default | Notes |
| --- | --- | --- |
| `mode` | `"live"` | `"live"` is editable; `"view"` is read-only and keeps reader actions such as safe links, code copy, Mermaid preview/fullscreen/download, media playback, and TOC navigation. |
| `editable` | `true` | Compatibility lock. Effective editable state is `mode === "live" && editable !== false`. |
| `lang` | `"zh"` | UI language. Supported values are `"zh"` and `"en"`. Re-mount the editor when switching language dynamically. |
| `inner-toc` | `true` | Renders the built-in right-side outline. Set `:inner-toc="false"` to render your own TOC from `on-toc-change` or `runtimeSnapshot.toc`. |
| `inner-toc-placement` | `"container"` | The default keeps the outline vertically centered in the visual viewport while aligning it to the editor edge and reserving its panel gutter, so it cannot cover document content. Set `inner-toc-placement="viewport"` only when a fixed viewport-side outline is required. |
| `auto-focus-first-table-body-cell` | `false` | Useful for playground or table-first documents. |

## Upload API

Images and videos support URL, absolute path, relative path, Base64, and local file input. URL/path/Base64 values can be used directly by Markweave. Local files must be uploaded by the host app through `on-slash-command-upload`.

```vue
<script setup lang="ts">
import {
  MarkweaveEditor,
  type MarkweaveSlashCommandUploadHandler,
  type MarkweaveUploadRequest,
  type MarkweaveUploadResult,
} from "@markweave/vue3";

const handleUpload: MarkweaveSlashCommandUploadHandler = async (
  request: MarkweaveUploadRequest,
): Promise<MarkweaveUploadResult> => {
  if (request.source.type !== "file") {
    return {
      src: request.source.value ?? "",
      name: request.source.value?.split("/").filter(Boolean).at(-1),
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

  return response.json() as Promise<MarkweaveUploadResult>;
};
</script>

<template>
  <MarkweaveEditor :on-slash-command-upload="handleUpload" />
</template>
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

## Feature Coverage

Vue 3 receives the complete Markweave UI: floating toolbar, link popover, slash command menu, table handles and selection overlay, code block language/copy controls, Mermaid Code/Preview/fullscreen/download, image/video NodeViews, math editing, Live/View mode, built-in TOC, and Chinese/English UI.

## Production Notes

- Save Markdown from `on-update` payloads; render HTML only as a derived output.
- Debounce persistence in the host app. Markweave emits updates as the editor changes.
- Import `@markweave/vue3/styles.css` once.
- Keep uploads authenticated and validate file size, MIME type, and returned URLs on your server.
- Do not allow arbitrary iframe hosts. Markweave only handles direct video plus supported YouTube/Bilibili embed forms.
- Markweave is browser-oriented. In SSR frameworks such as Nuxt, render the editor on the client side.
- Safe View-mode links reject unsafe protocols such as `javascript:`, `data:`, and `vbscript:`.
