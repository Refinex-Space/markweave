---
owner: refinex
updated: 2026-07-30
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
| Table interaction layer | Table focus, selection, keyboard, clipboard, command, and overlay behavior. |
| Floating toolbar | Selection-based toolbar UI for formatting and assistant actions. |
| Ask AI session | An ephemeral, host-handled Markdown generation session that maps a text or table target, renders a target-local in-place proposal without mutating the document, and applies content only after explicit acceptance. |
| Ask AI table target | A cell, row, column, rectangular cell selection, or whole table represented as target-only Markdown/HTML plus an exact result shape; accepting it replaces cell contents while preserving table structure and attributes. |
| Mermaid preview | Code-block preview behavior for Mermaid source. |
