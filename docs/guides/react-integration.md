---
owner: refinex
updated: 2026-08-04
status: active
referenced_by: docs/README.md#knowledge-map
---

# React Integration Guide

Language: [中文](./react-integration-zh-cn.md) | English

This guide is the complete React integration path for Markweave. It covers installation, content storage, Live/View mode, uploads, callbacks, table and AI hooks, TOC, and production boundaries. The private reference implementation is `apps/playground-react`.

For documents above roughly 200 KB, prefer uncontrolled `defaultContent`. Keep the latest `onUpdate` payload without reading `payload.markdown` on every transaction, then serialize once at the host's idle/manual-save/navigation flush boundary. Pass `resolveMediaSource` when stored media URLs require a display-only URL; the resolver receives `visible | nearby | background` priority plus an `AbortSignal`, and may return intrinsic `width`/`height`. The stored node source is never replaced by the resolved display URL.

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

`defaultContent` is Markdown by default. Store `payload.markdown` as the canonical product value. Markweave keeps standard Markdown where possible and emits native HTML fallback only for rich state that Markdown cannot express, including colored text/highlights, block alignment, and merged table cells. `payload.html`, `payload.json`, and `payload.text` remain integration outputs. Payload fields serialize lazily and cache their result, so reading Markdown does not also create HTML, JSON, and plain text; a controlled Markdown echo also avoids a duplicate content comparison.

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

To build a host document find/replace UI, store the shared search controller from `onSearchControllerChange`. Use `subscribe` for result counts, `setQuery`/`setOptions` for matching, `findNext`/`findPrevious` for navigation, and `replaceCurrent`/`replaceAll` in editable mode. Call `clear` when the search surface closes to remove all search decorations.

## Modes, Language, And TOC

```tsx
<MarkweaveEditor
  defaultContent="# Spec\n\n## Goals"
  mode="live"
  theme="dark"
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
| `theme` | `"light"` | `"light"` or `"dark"`. The theme is scoped to this editor frame and can change at runtime without recreating document content. |
| `canvasColor` | theme default | Optional CSS color/value for the editor canvas only. The defaults are `transparent` in light mode and `#181A1F` in dark mode. For example, pass `"#000"` or `"var(--app-canvas)"`. Runtime changes do not recreate the editor. |
| `editable` | `true` | Compatibility lock. Effective editable state is `mode === "live" && editable !== false`. |
| `lang` | `"zh"` | UI language. Supported values are `"zh"` and `"en"`. Re-mount the editor when switching language dynamically. |
| `innerToc` | `true` | Renders the built-in right-side outline. Set `false` to render your own TOC from `onTocChange` or `runtimeSnapshot.toc`. |
| `innerTocPlacement` | `"container"` | The default keeps the outline vertically centered in the visual viewport and centers the writing column with symmetric TOC gutters. It hides the built-in outline when the actual editor container is narrow, preserving readable content width. Set `"viewport"` only when a fixed viewport-side outline is required. |
| `autoFocusFirstTableBodyCell` | `false` | Useful for playground or table-first documents. |

## Upload API

Images and videos support URL, absolute path, relative path, Base64, and local file input. URL/path/Base64 values can be used directly by Markweave. Local files must be uploaded by the host app through `onSlashCommandUpload`.

In Live mode, pasting local `image/*` clipboard files inserts every image in order and sends each file through the same `onSlashCommandUpload` handler with `kind: "image"` and `trigger: "image-insert"`. Image-only HTML `<img>` clipboard content is inserted directly when its source is HTTP(S). A standalone HTTP(S) URL is converted to an image only when its path has a common image extension; Markweave does not fetch the URL. When files and HTML/URL representations coexist, files take precedence to avoid duplicate images.

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

## Ask AI

Ask AI is fail-closed and invisible by default. Enable it explicitly and provide the host-owned handler:

```tsx
<MarkweaveEditor
  askAi={{
    enabled: true,
    handler: async ({ signal, ...request }) => {
      const response = await fetch("/api/markweave/ask-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal,
      });
      if (!response.ok) throw new Error("Ask AI failed");
      return response.text(); // Markdown, or return AsyncIterable<string>
    },
  }}
/>
```

The same handler serves text and table targets. `request.target` is `{ kind: "text" }` for ordinary selections, or a target-local table payload containing `scope`, exact `rows`/`columns`, Markdown, HTML, and cell metadata. The existing `selection` field remains a flat compatibility projection and the request never includes the surrounding document. A single-cell target expects a Markdown fragment; row, column, multi-cell, and whole-table targets expect an exact-shape GFM table.

Generated Markdown stays in an ephemeral preview until the user accepts it. Acceptance replaces text or only the targeted table-cell contents in one undoable transaction; table node types, spans, widths, colors, and alignment attributes remain intact. Editing the target while generation is pending aborts the request and prevents overwrite. Code blocks, atom/media nodes, View mode, empty text selections, and multi-cell targets containing merged cells remain fail-closed. A single merged cell is supported.

`onRewriteSelection` and `onExtractToNote` remain compatibility callbacks for existing integrations; new custom-prompt writing flows should use `askAi`.

## Host-Driven AI Edit Review

When the host already owns an AI command, agent, or chat surface, use `MarkweaveAiEditController` without enabling built-in `askAi`. The host reads a supported selection, calls any provider, and returns Markdown; Markweave owns only target mapping, in-place review, acceptance, discard, and conflict protection. It never sends a request or receives provider credentials.

### Controller lifecycle and complete response

`onAiEditControllerChange` receives one controller after the editor is created and `null` before that editor is destroyed or recreated. Replace the stored reference on every callback and never reuse a controller after `null`.

```tsx
import { useState } from "react";
import {
  MarkweaveEditor,
  type MarkweaveAiEditController,
  type MarkweaveAiEditContext,
} from "@markweave/react";

export function AiDocumentEditor() {
  const [aiEdit, setAiEdit] = useState<MarkweaveAiEditController | null>(null);

  async function reviseSelection() {
    const controller = aiEdit;
    if (!controller) return;

    const captured = controller.captureSelection({ metadata: { action: "revise" } });
    if (!captured.ok) {
      console.warn(captured.code, captured.message);
      return;
    }
    const { id, lang, selection, signal } = captured.value;

    try {
      const response = await fetch("/api/document-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, lang, selection, instruction: "Make this clearer" }),
        signal,
      });
      if (!response.ok) throw new Error("AI edit failed");
      const markdown = await response.text();

      const completed = controller.updateProposal({ contextId: id, markdown, status: "complete" });
      if (!completed.ok) console.warn(completed.code, completed.message);
    } catch (error) {
      if (!signal.aborted) {
        controller.failProposal(id, error instanceof Error ? error.message : undefined);
      }
    }
  }

  return <MarkweaveEditor onAiEditControllerChange={setAiEdit} />;
}
```

`captureSelection()` remains an exact ordinary-text capture. `getSelection()` / `subscribeSelection()` lazily expose content and a one-based block-precision `lineRange` in normalized Markdown without placing content in runtime snapshots. For selected blocks or document-wide multi-edit review, explicitly call `capture({ scope: "blocks" | "document" })` and return the complete revised Markdown for that target. Markweave computes and previews at most 200 structural hunks after `complete`. Per-hunk accept/discard decisions stay staged until review settlement, then the accepted subset applies in one transaction. Never patch with captured ProseMirror positions.

### Cumulative streaming

For streaming integrations, pass the complete accumulated Markdown on every update, not an individual token. A `complete` update is mandatory before acceptance:

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

Exact selections retain their last valid local preview while streaming. Block/document diffs appear only after `complete`, so an unreceived suffix never looks deleted. The final Markdown must parse against the current schema or the original document remains unchanged.

### Default and headless controls

`captureSelection()` uses `controls: "default"`: Markweave renders one compact bottom-center decision dock inside the editor's currently visible boundary. Review shows the current/total hunk count, cyclic previous/next navigation, and discard-all/accept-all actions; the active or hovered hunk exposes local discard/accept controls. The dock is portaled to `body`, remains visible through long-document scrolling, and repositions after clipping-container scroll, resize, focus, and page reactivation. `controls: "none"` hides both built-in global and local controls while preserving proposal and headless state.

For a custom action surface, read the initial snapshot with `getState()` and then subscribe to later changes. `subscribe()` does not replay the current state. Unsubscribe both listeners when the host surface unmounts:

```ts
const captured = controller.captureSelection({ controls: "none" });
if (captured.ok) {
  renderAiEditState(controller.getState());
  const unsubscribeState = controller.subscribe(renderAiEditState);
  const unsubscribeDecision = controller.onDecision((decision) => {
    console.log(decision.decision, decision.appliedRange, decision.metadata);
  });

  // On host-surface teardown:
  // unsubscribeState();
  // unsubscribeDecision();
}
```

Accept only after phase `review`. `previousHunk`, `nextHunk`, and `activateHunk` control the active review item. `acceptHunk` and `discardHunk` stage local decisions; resolving every hunk settles as `accepted`, `discarded`, or `partially-accepted`. `acceptAll` and `discardAll` are explicit global actions, while existing `accept` and `discard` remain compatibility aliases. `failProposal` enters `error` without replacing the document.

### State, errors, and safety rules

Phases are `idle`, `captured`, `streaming`, `review`, `error`, and `conflict`. Only one context may be active per editor:

| Error code | Meaning |
| --- | --- |
| `readonly` | The editor is not in editable Live mode. |
| `no-selection` | The selection is empty. |
| `unsupported-selection` | The target is a code block, table/cell, media/atom node, `NodeSelection`, or `CellSelection`. |
| `unsupported-scope` | The requested capture scope could not be established. |
| `active-review` | Another captured, streaming, review, or error context must be accepted or discarded first. |
| `stale-context` | The context was discarded, accepted, replaced, or destroyed; ignore the late result. |
| `invalid-markdown` | Complete output could not be parsed as Markdown. |
| `schema-incompatible` | Parsed output cannot be represented by the current editor schema. |
| `incomplete-proposal` | Complete output is empty, or acceptance was requested before review. |
| `proposal-too-complex` | A multi-scope diff exceeds the safe complexity or hunk budget. |
| `conflict` | The captured target changed while the host was working. |

Edits outside the target remap its live range. Editing inside the target aborts the context and fails closed. Exact `selection` still rejects code, table, and media targets; `blocks/document` may carry unchanged complex structures and validate the complete proposal. Preview, error, conflict, and discard never change the document; acceptance is one transaction and one undo step, with multi-scope ranges reported in `appliedRanges`.

## Tables, Compatibility AI, And Copy Callbacks

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

- `onEditWithAi` remains a deprecated compatibility prop but is no longer rendered by the built-in table menus. Use the shared `askAi` handler for new integrations.
- `onRewriteSelection` and `onExtractToNote` are legacy compatibility callbacks.
- `onTableCopyPayload` mirrors table copy actions for row, column, or table payloads.
- `onTableCommandResult` reports table command outcomes and before/after snapshots.

The built-in table controls use Notion-like row, column, and selection handles. When `askAi` is enabled, `Ask AI` is the first item in row, column, cell/selection, and whole-table menus. Row and column menus also cover moving, inserting, sorting, color, alignment, clearing, duplication, and deletion; selection controls retain merge, split, copy, and delete. Hovering the last row or column reveals a full-edge add control, while dragging a row or column handle reorders it. All labels follow `lang` (`zh` or `en`).

## External Link Cards

Only a paragraph containing exactly one HTTP(S) link can become a card; inline, mixed-text, and `markweave:` links remain normal links. Provide `linkCardResolver` to enrich a card after the user explicitly embeds or edits it:

```tsx
<MarkweaveEditor linkCardResolver={async ({ href, title, signal }) => {
  const response = await fetch(`/api/link-preview?url=${encodeURIComponent(href)}`, { signal });
  return response.ok ? response.json() : null;
}} />
```

The resolver is never called during load, scrolling, or an ordinary link click. It receives an already validated HTTP(S) URL and must be backed by a server-side fetcher that enforces URL/DNS allowlists, redirect and timeout limits, response-size limits, and image URL validation. Markweave does not fetch external URLs itself.

## Feature Coverage

React receives the complete Markweave UI: floating toolbar, link popover, slash command menu, table handles and selection overlay, code block language/copy controls, Mermaid Code/Preview/fullscreen/download, image/video NodeViews, math editing, Live/View mode, built-in TOC, and Chinese/English UI.

## Production Notes

- Save Markdown from `onUpdate.markdown`; its supported HTML fallback is part of the lossless Markdown format, not a separate document mode.
- Debounce persistence in the host app. Markweave emits updates as the editor changes.
- Import `@markweave/react/styles.css` once.
- Inline emphasis remains visible for CJK fallback fonts even when the host system has no native italic face.
- Keep uploads authenticated and validate file size, MIME type, and returned URLs on your server.
- Do not allow arbitrary iframe hosts. Markweave only handles direct video plus supported YouTube/Bilibili embed forms.
- Markweave is browser-oriented. In SSR frameworks, render the editor on the client side.
- Safe View-mode links reject unsafe protocols such as `javascript:`, `data:`, and `vbscript:`.
