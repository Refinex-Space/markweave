---
owner: refinex
updated: 2026-08-11
status: active
referenced_by: docs/README.md#knowledge-map
---

# Host Table Capability Protocol

Language: English | [中文](./table-capability-protocol-zh-cn.md)

Markweave 0.7.0 lets a host constrain Markweave-owned table operations for the table at the current selection. This is intended for native Markweave tables nested inside trusted host nodes, such as a repeat-row template whose columns are business schema rather than free-form document structure.

The editor remains business-agnostic. The host identifies its own container from readonly node descriptors and returns capabilities. Markweave does not know field definitions, row data, workflow rules, authorization, or backend APIs.

## Editor Property

```ts
import type { MarkweaveTableCapabilityResolver } from "@markweave/vue2";

export const tableCapabilities: MarkweaveTableCapabilityResolver = ({ ancestors }) => {
  const insideRepeatTemplate = ancestors.some(
    (node) => node.type === "decisionRepeatContainer",
  );

  return insideRepeatTemplate
    ? { structure: false, askAi: false }
    : undefined;
};
```

React uses `tableCapabilities={tableCapabilities}`. Vue 2 and Vue 3 use the callback prop `:table-capabilities="tableCapabilities"`. The same option is available on all three adapter extension factories and on the framework-neutral `createMarkweaveEditorExtensions` factory.

The callback receives no `Editor`, transaction, DOM node, credentials, or request client:

```ts
interface MarkweaveTableCapabilityContext {
  readonly table: {
    readonly type: string;
    readonly attrs: Readonly<Record<string, unknown>>;
  };
  readonly ancestors: readonly {
    readonly type: string;
    readonly attrs: Readonly<Record<string, unknown>>;
  }[];
}
```

`ancestors` is ordered from the outermost document child to the immediate table parent. Descriptors and attribute maps are shallow readonly snapshots; ProseMirror nodes are never exposed.

## Capabilities

All omitted capabilities default to `true`:

| Capability | Controls |
| --- | --- |
| `structure` | Markweave menu commands that insert, move, sort, clear, duplicate, delete, merge, or split; row/column drag; edge add controls; final-cell `Tab` row growth; standalone table paste while the selection is already inside that table. Direct editing inside cells remains available. |
| `formatting` | Markweave row/column color and alignment submenus and their runtime actions. |
| `copy` | Markweave table/row/column copy menu actions and Markweave cell-selection copy handling. This is a UX capability, not a data-loss-prevention boundary. |
| `askAi` | Markweave table Ask AI menu availability and target capture. |

Returning `undefined` or `null` uses the default capabilities. If the resolver throws or returns a non-object value at runtime, all capabilities fail closed for the active table. The resolver must be synchronous, fast, and side-effect free because UI availability, keyboard handling, and command execution may query it repeatedly.

## Enforcement Boundary

The policy is evaluated both when controls are presented and again when Markweave executes an operation. A hidden or stale control therefore cannot bypass the current policy. The shared core owns command, keyboard, clipboard, and table-action guards; React, Vue 2, and Vue 3 only render the resulting state.

This protocol is not authorization and does not sandbox trusted host code. A host that receives the public editor controller can still call raw Tiptap commands, replace content, or remount a different schema. Backend authorization and business validation remain host responsibilities.

## Recommended Repeat-Table Integration

Use one non-atomic host container whose content is the native `table` node:

```text
decisionRepeatContainer
└── table
    ├── tableRow -> tableHeader...
    └── tableRow -> decisionRepeatField...
```

Keep repeat metadata on the host container, keep column field metadata on host field nodes, and let Markweave serialize and render the nested native table. A template host normally returns `{ structure: false, askAi: false }` for that ancestor. Runtime business rows, stable row IDs, validation, and export data must remain structured host data rather than inferred Markdown table rows.
