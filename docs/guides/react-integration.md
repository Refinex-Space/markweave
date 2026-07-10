---
owner: refinex
updated: 2026-07-10
status: active
referenced_by: docs/README.md#knowledge-map
---

# React Integration Guide

Language: [中文](./react-integration-zh-cn.md) | English

This guide is the complete React integration path for Markweave. It covers installation, content storage, Live/View mode, uploads, callbacks, table and AI hooks, TOC, and production boundaries. The private reference implementation is `apps/playground-react`.

## Install

Install the React adapter in an existing React app:

```sh
pnpm add @markweave/react
```

React and React DOM are peer dependencies owned by the host app:

```sh
pnpm add react react-dom
```

Import the stylesheet once in your app entry or editor component:

```tsx
import "@markweave/react/styles.css";
```

## Minimal Editor

```tsx
import { MarkweaveEditor, type MarkweaveEditorUpdatePayload } from "@markweave/react";
import "@markweave/react/styles.css";

const initialMarkdown = `# Product Notes

Write in **Markdown**, edit visually, and store Markdown.`;

export function ProductEditor() {
  function handleUpdate(payload: MarkweaveEditorUpdatePayload) {
    saveDraft(payload.markdown);
  }

  return (
    <MarkweaveEditor
      ariaLabel="Product notes editor"
      defaultContent={initialMarkdown}
      onUpdate={handleUpdate}
    />
  );
}

function saveDraft(markdown: string) {
  console.log(markdown);
}
```

`defaultContent` is Markdown by default. Store `payload.markdown` as the canonical product value. Markweave keeps standard Markdown where possible and emits native HTML fallback only for rich state that Markdown cannot express, including colored text/highlights, block alignment, and merged table cells. `payload.html`, `payload.json`, and `payload.text` remain integration outputs.

## Content API

| Prop / API | Default | Use |
| --- | --- | --- |
| `defaultContent` | `""` | Initial uncontrolled content. Parsed as Markdown unless `defaultContentFormat` is set. |
| `defaultContentFormat` | `"markdown"` | Use `"html"` for legacy HTML or `"json"` for Tiptap JSON. |
| `content` | `undefined` | Controlled content. Parsed as Markdown unless `contentFormat` is set. |
| `contentFormat` | `"markdown"` | Controlled content format. |
| `onUpdate(payload)` | `undefined` | Save `payload.markdown`; inspect `html`, `json`, or `text` when needed. |

Controlled Markdown example:

```tsx
import { useState } from "react";
import { MarkweaveEditor, type MarkweaveEditorUpdatePayload } from "@markweave/react";

export function ControlledEditor({ value }: { value: string }) {
  const [markdown, setMarkdown] = useState(value);

  function handleUpdate(payload: MarkweaveEditorUpdatePayload) {
    setMarkdown(payload.markdown);
  }

  return (
    <MarkweaveEditor
      content={markdown}
      contentFormat="markdown"
      onUpdate={handleUpdate}
    />
  );
}
```

Legacy HTML must be explicit:

```tsx
<MarkweaveEditor
  defaultContent="<h1>Hello Markweave</h1>"
  defaultContentFormat="html"
/>
```

For advanced custom shells, `useMarkweaveEditorController` exposes `actions.setContent(content, { format, emitUpdate, focusFirstTableBodyCell })`. The stock `MarkweaveEditor` component is recommended for normal product integration because it renders the full toolbar, slash menu, table controls, code controls, math editor, media NodeViews, and TOC.

## Modes, Language, And TOC

```tsx
<MarkweaveEditor
  defaultContent="# Spec\n\n## Goals"
  mode="live"
  lang="zh"
  innerToc
  onTocChange={({ items, activeId }) => {
    console.log(items, activeId);
  }}
  onRuntimeStateChange={(snapshot) => {
    console.log(snapshot.mode, snapshot.editable, snapshot.toc);
  }}
/>
```

| Option | Default | Notes |
| --- | --- | --- |
| `mode` | `"live"` | `"live"` is editable; `"view"` is read-only and keeps reader actions such as safe links, code copy, Mermaid preview/fullscreen/download, media playback, and TOC navigation. |
| `editable` | `true` | Compatibility lock. Effective editable state is `mode === "live" && editable !== false`. |
| `lang` | `"zh"` | UI language. Supported values are `"zh"` and `"en"`. Re-mount the editor when switching language dynamically. |
| `innerToc` | `true` | Renders the built-in right-side outline. Set `false` to render your own TOC from `onTocChange` or `runtimeSnapshot.toc`. |
| `innerTocPlacement` | `"container"` | The default keeps the outline vertically centered in the visual viewport while aligning it to the editor edge and reserving its panel gutter, so it cannot cover document content. Set `"viewport"` only when a fixed viewport-side outline is required. |
| `autoFocusFirstTableBodyCell` | `false` | Useful for playground or table-first documents. |

## Upload API

Images and videos support URL, absolute path, relative path, Base64, and local file input. URL/path/Base64 values can be used directly by Markweave. Local files must be uploaded by the host app through `onSlashCommandUpload`.

```tsx
import {
  MarkweaveEditor,
  type MarkweaveSlashCommandUploadHandler,
  type MarkweaveUploadRequest,
  type MarkweaveUploadResult,
} from "@markweave/react";

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

export function EditorWithUploads() {
  return <MarkweaveEditor onSlashCommandUpload={handleUpload} />;
}
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

```tsx
<MarkweaveEditor
  onEditWithAi={(request) => {
    console.log(request.source, request.text, request.html);
  }}
  onRewriteSelection={(request) => {
    console.log(request.text);
  }}
  onExtractToNote={(request) => {
    console.log(request.html);
  }}
  onTableCopyPayload={(payload) => {
    console.log(payload.kind, payload.text, payload.html);
  }}
  onTableCommandResult={(result) => {
    console.log(result.commandId, result.success, result.before, result.after);
  }}
/>
```

- `onEditWithAi` receives row, column, or selection context from table menus.
- `onRewriteSelection` and `onExtractToNote` receive selected text and HTML from the floating toolbar.
- `onTableCopyPayload` mirrors table copy actions for row, column, or table payloads.
- `onTableCommandResult` reports table command outcomes and before/after snapshots.

## Feature Coverage

React receives the complete Markweave UI: floating toolbar, link popover, slash command menu, table handles and selection overlay, code block language/copy controls, Mermaid Code/Preview/fullscreen/download, image/video NodeViews, math editing, Live/View mode, built-in TOC, and Chinese/English UI.

## Production Notes

- Save Markdown from `onUpdate.markdown`; its supported HTML fallback is part of the lossless Markdown format, not a separate document mode.
- Debounce persistence in the host app. Markweave emits updates as the editor changes.
- Import `@markweave/react/styles.css` once.
- Keep uploads authenticated and validate file size, MIME type, and returned URLs on your server.
- Do not allow arbitrary iframe hosts. Markweave only handles direct video plus supported YouTube/Bilibili embed forms.
- Markweave is browser-oriented. In SSR frameworks, render the editor on the client side.
- Safe View-mode links reject unsafe protocols such as `javascript:`, `data:`, and `vbscript:`.
