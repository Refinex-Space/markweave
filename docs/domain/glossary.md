---
owner: refinex
updated: 2026-07-06
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Domain Glossary

| Term | Meaning |
| --- | --- |
| Markweave | The editor package and workspace name. |
| Markdown-first WYSIWYG | Editing model that preserves Markdown-oriented input behavior while rendering rich editor UI. |
| Publishable package | `packages/markweave`, the npm package named `markweave`. |
| Playground | `apps/playground-react` and `apps/playground-vue3`, the private local demo apps used for development checks. |
| Playground fixture | `apps/playground-fixtures`, the private shared Markdown fixture package used by both playground apps. |
| Editor core | Shared extension and behavior setup under `packages/markweave/src/editor-core/`. |
| Framework adapter | React or Vue 3 binding under `packages/markweave/src/react/` or `packages/markweave/src/vue3/`. |
| Extension boundary | The explicit Tiptap/ProseMirror extension set returned by `createMarkweaveEditorExtensions`. |
| Runtime snapshot | The state payload from `MarkweaveEditorRuntimeSnapshot`, including selection, slash command, table, code block, Mermaid, and debug state. |
| Behavior contract | Source-level list of expected behaviors used to guide tests and prevent regressions. |
| Slash command | The `/` command menu flow handled by slash-command plugins and UI. |
| Table interaction layer | Table focus, selection, keyboard, clipboard, command, and overlay behavior. |
| Floating toolbar | Selection-based toolbar UI for formatting and assistant actions. |
| Mermaid preview | Code-block preview behavior for Mermaid source. |
