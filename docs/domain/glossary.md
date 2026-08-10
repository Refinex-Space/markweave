---
owner: refinex
updated: 2026-08-10
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Domain Glossary

| Term | Meaning |
| --- | --- |
| Markweave | The editor package and workspace name. |
| Markdown-first WYSIWYG | Editing model that preserves Markdown-oriented input behavior while rendering rich editor UI. |
| Publishable package | `packages/markweave`, `packages/markweave-react`, `packages/markweave-vue2`, and `packages/markweave-vue3`, published as `markweave`, `@markweave/react`, `@markweave/vue2`, and `@markweave/vue3`. |
| Playground | `apps/playground-react`, `apps/playground-vue2`, and `apps/playground-vue3`, the private local demo apps used for development checks. |
| Playground fixture | `apps/playground-fixtures`, the private shared Markdown fixture package used by all playground apps. |
| Editor core | Shared extension and behavior setup under `packages/markweave/src/editor-core/`. |
| Framework adapter | React, Vue 2, or Vue 3 binding under `packages/markweave-react/`, `packages/markweave-vue2/`, or `packages/markweave-vue3/`. |
| Extension boundary | The explicit Tiptap/ProseMirror extension set returned by `createMarkweaveEditorExtensions`. |
| Runtime snapshot | The state payload from `MarkweaveEditorRuntimeSnapshot`, including selection, slash command, table, code block, Mermaid, and debug state. |
| Behavior contract | Source-level list of expected behaviors used to guide tests and prevent regressions. |
| Slash command | The `/` command menu flow handled by slash-command plugins and UI. |
| Command Registry | Immutable merged snapshot of builtin and host command groups/specs, validated and resolved against the current readonly editor context. |
| Command Controller | Stable per-editor API for discovering, executing, subscribing to, and cancelling commands across Slash and host UI surfaces. |
| Command target | Captured selection, cursor, or Slash trigger range that is mapped through outside transactions and fails closed when directly modified. |
| Host Extension | Trusted creation-time Tiptap Node, Mark, or Extension appended through `editorExtensions`; it is additive-only and requires keyed remount for schema changes. |
| Upload handler | Host-owned `MarkweaveSlashCommandUploadHandler` that receives `MarkweaveUploadRequest` and returns `MarkweaveUploadResult` metadata for image, video, or attachment sources. |
| Attachment | The `markweaveAttachment` block node that persists host-owned file metadata (`src`, `name`, `mimeType`, `size`) without Markweave storing the binary. |
| Attachment download handler | Host-owned `MarkweaveAttachmentDownloadHandler` that performs authenticated download UX when a user activates an attachment. |
| Table interaction layer | Table focus, selection, keyboard, clipboard, command, and overlay behavior. |
| Floating toolbar | Selection-based toolbar UI for formatting and assistant actions. |
| Ask AI session | An ephemeral, host-handled Markdown generation session that maps a text or table target, renders a target-local in-place proposal without mutating the document, and applies content only after explicit acceptance. |
| Ask AI table target | A cell, row, column, rectangular cell selection, or whole table represented as target-only Markdown/HTML plus an exact result shape; accepting it replaces cell contents while preserving table structure and attributes. |
| AI edit context | An in-memory, host-owned snapshot of one supported text selection containing only its mapped range, text, HTML, Markdown, language, metadata, and cancellation signal. |
| AI edit proposal | Complete or cumulative-stream Markdown supplied by the host and rendered as an ephemeral in-place diff until it is accepted, discarded, partially accepted through staged hunk decisions, or invalidated by a conflict. |
| Mermaid preview | Code-block preview behavior for Mermaid source. |
