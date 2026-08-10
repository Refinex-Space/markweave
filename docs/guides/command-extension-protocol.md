---
owner: refinex
updated: 2026-08-10
status: active
referenced_by: docs/README.md#knowledge-map
---

# Command Registry And Host Extension Protocol

Language: English | [中文](./command-extension-protocol-zh-cn.md)

Markweave 0.6.0 lets a host register business commands for both the Slash menu and external controls. The same framework-neutral `MarkweaveCommandController` executes both paths. Trusted hosts may also append Tiptap extensions when the editor is created. Markweave never receives host credentials, cookies, current-user objects, request clients, or authorization rules.

## Editor Props

| Prop | Contract |
| --- | --- |
| `commandGroups` | Host groups with lower-case dotted namespace IDs. |
| `commands` | Host command metadata and handlers. |
| `builtinCommands` | Either `include` or `exclude`; never both. |
| `editorExtensions` | Creation-time, additive-only Tiptap extensions. |
| `onCommandControllerChange` | Receives one stable controller and `null` before teardown. |
| `onCommandError` | Receives stable codes and safe messages. |

React uses camelCase. Vue 2 and Vue 3 keep callback props, for example `:command-groups`, `:commands`, `:editor-extensions`, and `:on-command-controller-change`; there is no separate emit protocol.

```ts
import type { MarkweaveCommandGroupSpec, MarkweaveCommandSpec } from "@markweave/react";

export const commandGroups: readonly MarkweaveCommandGroupSpec[] = [
  { id: "trm.decision", label: "Decision fields", order: 250 },
];

export const commands: readonly MarkweaveCommandSpec[] = [{
  id: "trm.decision.insert-field",
  label: "Insert decision field",
  groupId: "trm.decision",
  icon: { kind: "text", text: "Fld" },
  payloadSchemaId: "trm.decision.field.v1",
  async execute({ source, payload, query, context, signal }) {
    const field = await selectField({ payload, query, context, signal });
    if (!field) return { kind: "cancel" };
    return {
      kind: "apply",
      content: { format: "markdown", value: `**${field.label}**` },
      placement: source === "slash" ? "replace-trigger" : "insert-at-cursor",
    };
  },
}];
```

Host IDs must use lower-case dotted namespaces such as `trm.decision.insert-field`. Duplicate IDs, builtin overrides, unknown groups, invalid surfaces/icons, and simultaneous include/exclude configuration fail closed. Text icons contain 1–4 trimmed Unicode characters. All metadata is rendered as text; HTML, SVG, and URL icons are not accepted.

`surfaces` defaults to `['slash', 'api']`. `payloadSchemaId` is a host typing/diagnostic identifier; Markweave does not interpret business payloads. `isVisible`, `isEnabled`, and `getDisabledReason` receive a readonly context and must be synchronous, fast, and side-effect free. They are not an authorization boundary.

## Controller And Results

`getCommands()` returns the current sorted resolved view. `execute()` always resolves to a structured result. `getState()` and `subscribe()` expose `idle | running | applying`; `cancel()` aborts the active execution. Success returns `outcome: 'applied'`; an explicit `{ kind: 'cancel' }` returns `outcome: 'cancelled'`.

Stable failure codes are `COMMAND_NOT_FOUND`, `COMMAND_DISABLED`, `COMMAND_BUSY`, `COMMAND_ABORTED`, `COMMAND_CONFLICT`, `INVALID_RESULT`, `HANDLER_FAILED`, and `EDITOR_UNAVAILABLE`. Handler exception details are not exposed in safe messages.

Only `cancel` and `apply` are supported. Applied content must be `text`, `markdown`, or `json`; HTML, empty content, cyclic JSON, unknown result kinds, schema-invalid JSON, and a single result larger than 1 MiB return `INVALID_RESULT`. The limit applies per command result, not to the document and not to the existing 200 KB large-document scheduling threshold.

Slash defaults to `replace-trigger`; API defaults to `insert-at-cursor`, and API `replace-trigger` falls back to cursor insertion. `replace-selection` and cursor placement use the captured, continuously mapped invocation target. Selection defaults after inserted content. `preserve` maps the original selection and falls back after content when its target was replaced.

Only one command runs per editor. Outside edits map the target; target edits, touched point anchors, or whole-document replacement cause `COMMAND_CONFLICT`. View/read-only changes, registry replacement, teardown, and explicit cancellation abort the signal. Late results are ignored. A successful apply uses one ProseMirror transaction and one undo step; failure, cancel, and conflict do not modify the document or history.

## Advanced `editorExtensions`

```tsx
<MarkweaveEditor key={schemaVersion} editorExtensions={[DecisionFieldNode, DecisionBlockNode]} />
```

Host extensions are appended after builtin and framework media/LinkCard extensions. Markweave flattens StarterKit children before editor creation and rejects every duplicate Node, Mark, Extension, or internal-plugin name. Builtins cannot be replaced.

The array is not hot-swapped. Change the component key to rebuild the editor when the schema changes. Test custom nodes across Markdown tokenizer/parse/render, HTML parse/render, JSON schema, Markdown round trips, and View mode. The host must resolve the same Tiptap 3.27.x instance as the installed Markweave packages; cross-major compatibility is not promised. Extensions are trusted build-time code and must never be loaded from untrusted input.
