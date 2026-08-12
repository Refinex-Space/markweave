import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { TableCommandId } from "./table-command-spec";

export type MarkweaveTableCapability = "structure" | "formatting" | "copy" | "ask-ai";

export interface MarkweaveTableNodeDescriptor {
  readonly type: string;
  readonly attrs: Readonly<Record<string, unknown>>;
}

export interface MarkweaveTableCapabilityContext {
  readonly table: MarkweaveTableNodeDescriptor;
  readonly ancestors: readonly MarkweaveTableNodeDescriptor[];
}

export interface MarkweaveTableCapabilities {
  /**
   * Controls Markweave-owned structural and destructive table operations,
   * including insert, move, sort, clear, duplicate, delete, merge, split,
   * drag reordering, edge insertion, final-cell Tab growth, and table paste.
   * Direct editing inside a cell remains available.
   */
  readonly structure?: boolean;
  readonly formatting?: boolean;
  readonly copy?: boolean;
  readonly askAi?: boolean;
}

export type MarkweaveTableCapabilityResolver = (
  context: MarkweaveTableCapabilityContext,
) => MarkweaveTableCapabilities | null | undefined;

interface ResolvedMarkweaveTableCapabilities {
  readonly structure: boolean;
  readonly formatting: boolean;
  readonly copy: boolean;
  readonly askAi: boolean;
}

interface MarkweaveTableCapabilityPluginState {
  readonly resolver?: MarkweaveTableCapabilityResolver;
}

export const markweaveTableCapabilityPluginKey = new PluginKey<MarkweaveTableCapabilityPluginState>(
  "markweaveTableCapabilities",
);

const defaultTableCapabilities: ResolvedMarkweaveTableCapabilities = Object.freeze({
  structure: true,
  formatting: true,
  copy: true,
  askAi: true,
});

const deniedTableCapabilities: ResolvedMarkweaveTableCapabilities = Object.freeze({
  structure: false,
  formatting: false,
  copy: false,
  askAi: false,
});

function describeNode(node: ProseMirrorNode): MarkweaveTableNodeDescriptor {
  return Object.freeze({
    type: node.type.name,
    attrs: Object.freeze({ ...node.attrs }),
  });
}

export function getMarkweaveTableCapabilityContext(
  state: EditorState,
): MarkweaveTableCapabilityContext | null {
  const { $from } = state.selection;
  let tableDepth: number | null = null;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type.name === "table") {
      tableDepth = depth;
      break;
    }
  }

  if (tableDepth === null) {
    return null;
  }

  const ancestors: MarkweaveTableNodeDescriptor[] = [];
  for (let depth = 1; depth < tableDepth; depth += 1) {
    ancestors.push(describeNode($from.node(depth)));
  }

  return Object.freeze({
    table: describeNode($from.node(tableDepth)),
    ancestors: Object.freeze(ancestors),
  });
}

function normalizeCapabilities(value: MarkweaveTableCapabilities | null | undefined) {
  if (value === null || value === undefined) {
    return defaultTableCapabilities;
  }

  if (typeof value !== "object") {
    return deniedTableCapabilities;
  }

  return Object.freeze({
    structure: value.structure !== false,
    formatting: value.formatting !== false,
    copy: value.copy !== false,
    askAi: value.askAi !== false,
  });
}

export function resolveMarkweaveTableCapabilities(
  state: EditorState,
): ResolvedMarkweaveTableCapabilities | null {
  const context = getMarkweaveTableCapabilityContext(state);

  if (!context) {
    return null;
  }

  const resolver = markweaveTableCapabilityPluginKey.getState(state)?.resolver;

  if (!resolver) {
    return defaultTableCapabilities;
  }

  try {
    return normalizeCapabilities(resolver(context));
  } catch {
    return deniedTableCapabilities;
  }
}

export function isMarkweaveTableCapabilityAllowed(
  state: EditorState,
  capability: MarkweaveTableCapability,
) {
  const capabilities = resolveMarkweaveTableCapabilities(state);

  if (!capabilities) {
    return false;
  }

  return capability === "ask-ai" ? capabilities.askAi : capabilities[capability];
}

export function isMarkweaveTableCommandAllowed(
  state: EditorState,
  commandId: TableCommandId,
) {
  return isMarkweaveTableCapabilityAllowed(
    state,
    commandId === "copy-row" || commandId === "copy-column" || commandId === "copy-table"
      ? "copy"
      : "structure",
  );
}

export const MarkweaveTableCapabilities = Extension.create<{
  readonly resolver?: MarkweaveTableCapabilityResolver;
}>({
  name: "markweaveTableCapabilities",

  addOptions() {
    return { resolver: undefined };
  },

  addProseMirrorPlugins() {
    const resolver = this.options.resolver;

    return [
      new Plugin<MarkweaveTableCapabilityPluginState>({
        key: markweaveTableCapabilityPluginKey,
        state: {
          init: () => ({ resolver }),
          apply: (_transaction, pluginState) => pluginState,
        },
      }),
    ];
  },
});
