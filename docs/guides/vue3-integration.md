---
owner: refinex
updated: 2026-08-27
status: active
referenced_by: docs/README.md#knowledge-map
---

# Vue 3 Integration Guide

Language: [中文](./vue3-integration-zh-cn.md) | English

This guide is the complete Vue 3 integration path for Markweave. It covers installation, content storage, Live/View mode, upload handling, framework props, callbacks, TOC, and production boundaries. The private reference implementation is `apps/playground-vue3`.

For large documents, use `defaultContent` instead of a per-keystroke controlled `content` loop, retain the lazy update payload, and read `payload.markdown` only at the host save/flush boundary. The optional `resolveMediaSource` prop accepts the same cancellable priority request as React and Vue 2; returning a display URL plus optional intrinsic dimensions activates the shared lightweight image NodeView without changing serialized Markdown.

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

`default-content` is Markdown by default. Store `payload.markdown` as the canonical product value. Markweave keeps standard Markdown where possible and emits native HTML fallback only for rich state that Markdown cannot express, including colored text/highlights, block alignment, paragraph or heading indentation, subscript/superscript, and merged or styled table cells. The fallback uses the complete Schema including `editor-extensions`, so host nodes with a lossless `renderHTML/parseHTML` contract are not silently discarded. `payload.html`, `payload.json`, and `payload.text` remain integration outputs. Payload fields serialize lazily and cache their result, so reading Markdown does not also create HTML, JSON, and plain text; a controlled Markdown echo also avoids a duplicate content comparison.

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
    theme="dark"
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
| `theme` | `"light"` | `"light"` or `"dark"`. The theme is scoped to this editor frame and can change at runtime without recreating document content. |
| `canvasColor` | theme default | Optional CSS color/value for the editor canvas only. The defaults are `transparent` in light mode and `#181A1F` in dark mode. For example, pass `"#000"` or `"var(--app-canvas)"`. Runtime changes do not recreate the editor. |
| `editable` | `true` | Compatibility lock. Effective editable state is `mode === "live" && editable !== false`. |
| `reveal-link-markdown` | `true` | In editable Live mode, clicking or moving the caret into an inline link reveals normalized `[label](target "title")` source. Enter or blur commits a safe target edit, Escape discards it, and Ctrl/Cmd-click opens the link. The projection is canonical, not byte-exact original Markdown. |
| `lang` | `"zh"` | UI language. Supported values are `"zh"` and `"en"`. Re-mount the editor when switching language dynamically. |
| `inner-toc` | `true` | Renders the built-in right-side outline. Set `:inner-toc="false"` to render your own TOC from `on-toc-change` or `runtimeSnapshot.toc`. |
| `inner-toc-placement` | `"container"` | The default keeps the outline vertically centered in the visual viewport and centers the writing column with symmetric TOC gutters. It hides the built-in outline when the actual editor container is narrow, preserving readable content width. Set `inner-toc-placement="viewport"` only when a fixed viewport-side outline is required. |
| `auto-focus-first-table-body-cell` | `false` | Useful for playground or table-first documents. |

## Upload API

Images and videos support URL, absolute path, relative path, Base64, and local file input. URL/path/Base64 values can be used directly by Markweave. Local files must be uploaded by the host app through `on-slash-command-upload`.

In Live mode, pasting local `image/*` clipboard files inserts every image in order and sends each file through the same `on-slash-command-upload` handler with `kind: "image"` and `trigger: "image-insert"`. Image-only HTML `<img>` clipboard content is inserted directly when its source is HTTP(S). A standalone HTTP(S) URL is converted to an image only when its path has a common image extension; Markweave does not fetch the URL. When files and HTML/URL representations coexist, files take precedence to avoid duplicate images.

The normative upload/download field contract for attachments (and shared request/result shapes) lives in [`attachment-upload-protocol.md`](./attachment-upload-protocol.md). Keep Vue 3 wiring here; keep metadata and download-handler semantics there.

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

Images render with preview, align, caption, resize, replace, download, and delete controls in Live mode. In View mode, hovering an image reveals a top-right preview action that opens the same fullscreen zoom and pan reader. Videos accept local upload, direct video URLs, YouTube embed URLs, Bilibili player URLs, and normal YouTube/Bilibili share links. File videos and platform embeds do not autoplay. Attachments round-trip through `markweaveAttachment`. Slash Attachment inserts an empty inline placeholder; click to pick a local file (optional `onProgress` for percentage). Filled chips show download and delete on hover and call `onAttachmentDownload` when activated. Without that host handler, only safe `http(s)` sources open in a new tab.

## Ask AI

Ask AI is disabled by default. Vue templates enable it with `:ask-ai`:

```vue
<MarkweaveEditor :ask-ai="{ enabled: true, handler: handleAskAi }" />
```

`handleAskAi(request)` returns Markdown or `AsyncIterable<string>`. The same handler receives ordinary text targets and table cell, row, column, selection, or whole-table targets through `request.target`; the legacy `selection` field remains a flat compatibility projection. Only target-local content is sent. Single cells expect a Markdown fragment, while multi-cell targets expect an exact-shape GFM table. Markweave previews without changing the document and applies only accepted cell contents in one undoable transaction while preserving table structure and attributes. Multi-cell targets containing merged cells and View mode remain fail-closed.

`on-rewrite-selection` and `on-extract-to-note` remain legacy compatibility callbacks.

## Host-Driven AI Edit Review

When the host already owns an AI command, agent, or chat surface, use `MarkweaveAiEditController` without enabling built-in `ask-ai`. The host reads a supported selection, calls any provider, and returns Markdown; Markweave owns target mapping, in-place review, acceptance, discard, and conflict protection. It never sends a provider request or receives credentials.

### Controller lifecycle and complete response

`:on-ai-edit-controller-change` receives a controller after editor creation and `null` before destruction or recreation. Replace the stored reference on every controller lifecycle callback and never reuse it after `null`.

```vue
<script setup lang="ts">
import { shallowRef } from "vue";
import {
  MarkweaveEditor,
  type MarkweaveAiEditController,
  type MarkweaveAiEditContext,
} from "@markweave/vue3";

const aiEdit = shallowRef<MarkweaveAiEditController | null>(null);

function setAiEditController(controller: MarkweaveAiEditController | null) {
  aiEdit.value = controller;
}

async function reviseSelection() {
  const controller = aiEdit.value;
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
    if (!signal.aborted) {
      controller.failProposal(id, error instanceof Error ? error.message : undefined);
    }
  }
}
</script>

<template>
  <MarkweaveEditor :on-ai-edit-controller-change="setAiEditController" />
</template>
```

`captureSelection()` remains an exact ordinary-text capture. `getSelection()` / `subscribeSelection()` lazily expose content and a one-based block-precision `lineRange` in normalized Markdown. For selected blocks or document-wide multi-edit review, explicitly call `capture({ scope: "blocks" | "document" })` and return the complete revised target Markdown. Markweave computes and previews at most 200 structural hunks after `complete`, stages per-hunk decisions, and applies the accepted subset in one transaction; never patch with captured positions.

### Cumulative streaming and headless controls

Every streaming update must contain the complete accumulated Markdown, not one token, followed by a mandatory `complete` update:

```ts
async function submitStream(
  controller: MarkweaveAiEditController,
  context: MarkweaveAiEditContext,
  stream: AsyncIterable<string>,
) {
  let markdown = "";
  try {
    for await (const chunk of stream) {
      if (context.signal.aborted) return;
      markdown += chunk;
      const updated = controller.updateProposal({
        contextId: context.id,
        markdown,
        status: "streaming",
      });
      if (!updated.ok) return;
    }
    controller.updateProposal({ contextId: context.id, markdown, status: "complete" });
  } catch (error) {
    if (!context.signal.aborted) {
      controller.failProposal(context.id, error instanceof Error ? error.message : undefined);
    }
  }
}
```

`captureSelection()` renders a bottom-center global dock with hunk count, cyclic navigation, and global decisions; the active or hovered hunk exposes local decisions. `controls: "none"` hides both built-in control surfaces. Exact selections may preview while streaming, while block/document diffs appear only after `complete`. Headless hosts can use `previousHunk`, `nextHunk`, `acceptHunk`, `discardHunk`, `acceptAll`, and `discardAll`. Read `getState()` before state `subscribe()` and dispose every listener on unmount.

### State, errors, and safety

Phases are `idle`, `captured`, `streaming`, `review`, `error`, and `conflict`. Errors include `active-review`, `stale-context`, `incomplete-proposal`, `unsupported-scope`, and `proposal-too-complex`. Only one context may be active per editor. Subscribe to accepted, discarded, and conflict decisions with `onDecision`. Editing inside the target, switching to View mode, or teardown aborts the context `AbortSignal`.

Exact `selection` still rejects code, table, and media targets. `blocks/document` may carry unchanged complex structures and validate the complete proposal with a bounded multi-hunk diff. Edits outside the target remap it; edits inside fail closed. Preview, error, conflict, and discard never change the document; acceptance is one transaction and one undo step, with multi-scope ranges available as `appliedRanges`.

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

Only a paragraph containing exactly one HTTP(S) link can become a card; inline, mixed-text, and `markweave:` links remain normal links. Use `link-card-resolver` to enrich a card after an explicit user embed or edit:

```vue
<MarkweaveEditor :link-card-resolver="resolveLinkCard" />
```

The resolver receives `{ href, title, signal }` and is never invoked on document load, scrolling, or an ordinary link click. Keep fetching in a controlled backend that applies URL/DNS allowlists, redirect, timeout, response-size, and image URL checks; Markweave never fetches external URLs itself.

## Feature Coverage

Vue 3 receives the complete Markweave UI: floating toolbar, link popover, slash command menu, collapsible details blocks, table handles and selection overlay, code block language/copy controls, Mermaid Code/Preview/fullscreen/download, image/video NodeViews, math editing, Live/View mode, built-in TOC, and Chinese/English UI.

## Production Notes

- Save Markdown from `on-update` payloads; its supported HTML fallback is part of the lossless Markdown format, not a separate document mode.
- Debounce persistence in the host app. Markweave emits updates as the editor changes.
- Import `@markweave/vue3/styles.css` once.
- Inline emphasis remains visible for CJK fallback fonts even when the host system has no native italic face.
- Keep uploads authenticated and validate file size, MIME type, and returned URLs on your server.
- Do not allow arbitrary iframe hosts. Markweave only handles direct video plus supported YouTube/Bilibili embed forms.
- Markweave is browser-oriented. In SSR frameworks such as Nuxt, render the editor on the client side.
- Safe View-mode links reject unsafe protocols such as `javascript:`, `data:`, and `vbscript:`.
## Command Registry And Host Extensions

Vue 3 keeps callback props for the 0.6.0 command protocol. Bind `:command-groups`, `:commands`, `:builtin-commands`, `:editor-extensions`, `:on-command-controller-change`, and `:on-command-error`; no separate emit protocol is added. Registry props update without recreating the Editor. Extension schema changes require a keyed remount.

See [Command Registry And Host Extension Protocol](./command-extension-protocol.md) for validated IDs, structured results, cancellation/conflicts, the 1 MiB cap, and Tiptap compatibility.

## Protected Native Tables

Markweave 0.7.0 adds the `:table-capabilities` callback prop. The synchronous resolver receives readonly table and ancestor descriptors and can disable Markweave-owned structure, formatting, copy, or table-AI paths for the active native table. Resolver failures fail closed. See [Host Table Capability Protocol](./table-capability-protocol.md).
