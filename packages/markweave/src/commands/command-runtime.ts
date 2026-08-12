import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, Selection, type Transaction } from "@tiptap/pm/state";
import {
  getMarkweaveEditorModeState,
  isMarkweaveEditorLiveEditable,
  subscribeToMarkweaveEditorMode,
} from "../core/editor-mode-state";
import type { MarkweaveContentFormat } from "../core/public-types";
import type { SlashCommandContext } from "../plugins/slash-command/slash-runtime";
import { executeMarkweaveBuiltinCommand, type MarkweaveBuiltinCommandPayload } from "./builtin-command-runtime";
import {
  createMarkweaveCommandRegistry,
  getRegisteredMarkweaveCommand,
  isMarkweaveBuiltinCommandId,
} from "./command-registry";
import type {
  MarkweaveCommandContent,
  MarkweaveCommandContext,
  MarkweaveCommandController,
  MarkweaveCommandErrorHandler,
  MarkweaveCommandExecutionError,
  MarkweaveCommandExecutionResult,
  MarkweaveCommandRegistry,
  MarkweaveCommandResult,
  MarkweaveCommandRuntimeState,
  MarkweaveCommandSource,
} from "./command-types";
import type { MarkweaveLang } from "../i18n";

const commandPluginKey = new PluginKey<number>("markweaveCommands");
const commandResultMaxBytes = 1024 * 1024;
const abortedHandlerResult = Symbol("abortedHandlerResult");
const runtimes = new WeakMap<Editor, CommandRuntime>();
const editorIds = new WeakMap<Editor, string>();

interface CommandTarget {
  from: number;
  to: number;
  head: number;
  readonly originalContent: Fragment;
  originalSelection: Selection;
  conflict: boolean;
}

interface ActiveExecution {
  readonly commandId: string;
  readonly executionId: string;
  readonly source: MarkweaveCommandSource;
  readonly query?: string;
  readonly payload?: unknown;
  readonly abortController: AbortController;
  readonly target: CommandTarget;
  applying: boolean;
}

interface CommandRuntime {
  registry: MarkweaveCommandRegistry;
  format: MarkweaveContentFormat;
  onError?: MarkweaveCommandErrorHandler;
  readonly listeners: Set<(state: MarkweaveCommandRuntimeState) => void>;
  readonly controller: MarkweaveCommandController;
  unsubscribeMode: () => void;
  state: MarkweaveCommandRuntimeState;
  active: ActiveExecution | null;
  disposed: boolean;
}

export interface MarkweaveCommandsOptions {
  readonly lang: MarkweaveLang;
}

function createId(prefix: string) {
  return globalThis.crypto?.randomUUID?.()
    ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getEditorId(editor: Editor) {
  const existing = editorIds.get(editor);
  if (existing) return existing;
  const id = createId("markweave-editor");
  editorIds.set(editor, id);
  return id;
}

function createCommandContext(editor: Editor, runtime: CommandRuntime): MarkweaveCommandContext {
  const modeState = getMarkweaveEditorModeState(editor);
  const { selection } = editor.state;
  let activeBlock: MarkweaveCommandContext["activeBlock"] = null;
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (node.isBlock) {
      activeBlock = { type: node.type.name, depth, text: node.textContent };
      break;
    }
  }
  return {
    editorId: getEditorId(editor),
    editable: editor.isEditable && isMarkweaveEditorLiveEditable(modeState),
    mode: modeState.mode,
    format: runtime.format,
    selection: {
      empty: selection.empty,
      from: selection.from,
      to: selection.to,
      text: editor.state.doc.textBetween(selection.from, selection.to, "\n\n", "\n"),
    },
    activeBlock,
  };
}

function emitState(runtime: CommandRuntime, next: MarkweaveCommandRuntimeState) {
  runtime.state = next;
  runtime.listeners.forEach((listener) => {
    try {
      listener(next);
    } catch {
      // Host observers cannot break command settlement.
    }
  });
}

function activeState(active: ActiveExecution, phase: "running" | "applying", lastResult: MarkweaveCommandExecutionResult | null) {
  return {
    phase,
    activeExecution: {
      commandId: active.commandId,
      executionId: active.executionId,
      source: active.source,
    },
    lastResult,
  } satisfies MarkweaveCommandRuntimeState;
}

function settle(runtime: CommandRuntime, result: MarkweaveCommandExecutionResult) {
  runtime.active = null;
  emitState(runtime, { phase: "idle", activeExecution: null, lastResult: result });
  if (!result.ok) {
    try {
      runtime.onError?.(result);
    } catch {
      // Host error reporting cannot turn a structured result into a rejection.
    }
  }
  return result;
}

function failure(
  commandId: string,
  code: MarkweaveCommandExecutionError["code"],
  message: string,
  executionId?: string,
): MarkweaveCommandExecutionResult {
  return { ok: false, code, message, commandId, executionId };
}

function success(active: ActiveExecution, outcome: "applied" | "cancelled"): MarkweaveCommandExecutionResult {
  return { ok: true, commandId: active.commandId, executionId: active.executionId, outcome };
}

function abortActive(runtime: CommandRuntime, reason: string) {
  const active = runtime.active;
  if (!active || active.abortController.signal.aborted) return;
  active.abortController.abort(reason);
}

function transactionTouchesPoint(transaction: Transaction, initialPoint: number) {
  let point = initialPoint;
  for (const map of transaction.mapping.maps) {
    let touched = false;
    map.forEach((oldStart, oldEnd) => {
      if ((oldStart === oldEnd && oldStart === point) || (oldStart <= point && point <= oldEnd)) {
        touched = true;
      }
    });
    if (touched) return true;
    point = map.map(point, 1);
  }
  return false;
}

function mapActiveExecution(editor: Editor, transaction: Transaction) {
  const runtime = runtimes.get(editor);
  const active = runtime?.active;
  if (!runtime || !active || active.applying || !transaction.docChanged || active.target.conflict) return;
  const target = active.target;
  if (target.from === target.to && transactionTouchesPoint(transaction, target.head)) {
    target.conflict = true;
    abortActive(runtime, "conflict");
    return;
  }
  const mappedFrom = transaction.mapping.mapResult(target.from, 1);
  const mappedTo = transaction.mapping.mapResult(target.to, -1);
  const from = Math.max(0, Math.min(mappedFrom.pos, transaction.doc.content.size));
  const to = Math.max(from, Math.min(mappedTo.pos, transaction.doc.content.size));
  target.from = from;
  target.to = to;
  target.head = Math.max(0, Math.min(transaction.mapping.map(target.head, 1), transaction.doc.content.size));
  target.originalSelection = target.originalSelection.map(transaction.doc, transaction.mapping);
  if (mappedFrom.deletedAcross || mappedTo.deletedAcross
    || !transaction.doc.slice(from, to).content.eq(target.originalContent)) {
    target.conflict = true;
    abortActive(runtime, "conflict");
  }
}

function contentByteLength(content: MarkweaveCommandContent) {
  let serialized: string;
  if (content.format === "json") {
    const json = JSON.stringify(content.value);
    if (typeof json !== "string") throw new TypeError("Command JSON content is not serializable.");
    serialized = json;
  } else {
    serialized = content.value;
  }
  return new TextEncoder().encode(serialized).byteLength;
}

function validateContent(content: MarkweaveCommandContent) {
  if (!content || !["text", "markdown", "json"].includes(content.format)) return false;
  if (content.format === "text") return typeof content.value === "string" && content.value.length > 0 && contentByteLength(content) <= commandResultMaxBytes;
  if (content.format === "markdown") return typeof content.value === "string" && content.value.trim().length > 0 && contentByteLength(content) <= commandResultMaxBytes;
  if (Array.isArray(content.value) && content.value.length === 0) return false;
  try {
    return contentByteLength(content) <= commandResultMaxBytes;
  } catch {
    return false;
  }
}

function jsonContentToFragment(editor: Editor, value: JSONContent | readonly JSONContent[]) {
  const values = Array.isArray(value) ? value : [value];
  const nodes = values.flatMap((item) => {
    const node = editor.schema.nodeFromJSON(item);
    if (node.type.name !== "doc") return [node];
    const children: typeof node[] = [];
    node.content.forEach((child) => children.push(child));
    return children;
  });
  return Fragment.fromArray(nodes);
}

function applyCommandResult(editor: Editor, active: ActiveExecution, result: Extract<MarkweaveCommandResult, { kind: "apply" }>) {
  if (!validateContent(result.content)) return false;
  let from: number;
  let to: number;
  const placement = result.placement ?? (active.source === "slash" ? "replace-trigger" : "insert-at-cursor");
  if (placement === "replace-selection") {
    from = active.target.from;
    to = active.target.to;
  } else if (placement === "replace-trigger" && active.source === "slash") {
    from = active.target.from;
    to = active.target.to;
  } else {
    from = active.target.head;
    to = active.target.head;
  }
  const originalSelection = active.target.originalSelection;
  try {
    let transaction = editor.state.tr;
    if (result.content.format === "text") {
      transaction = transaction.insertText(result.content.value, from, to);
    } else {
      const fragment = result.content.format === "markdown"
        ? editor.schema.nodeFromJSON(editor.markdown!.parse(result.content.value)).content
        : jsonContentToFragment(editor, result.content.value);
      transaction = transaction.replaceRange(from, to, new Slice(fragment, 0, 0));
    }
    const nextSelection = result.selection === "preserve" && from === to
      ? originalSelection.map(transaction.doc, transaction.mapping)
      : Selection.near(transaction.doc.resolve(Math.max(0, Math.min(transaction.mapping.map(to, 1), transaction.doc.content.size))), 1);
    transaction.setSelection(nextSelection).scrollIntoView();
    editor.view.dispatch(transaction);
    return true;
  } catch {
    return false;
  }
}

function ensureRuntime(editor: Editor, lang: MarkweaveLang = "zh") {
  const existing = runtimes.get(editor);
  if (existing) return existing;
  let runtime!: CommandRuntime;
  const listeners = new Set<(state: MarkweaveCommandRuntimeState) => void>();
  const controller: MarkweaveCommandController = {
    getCommands(options) {
      if (runtime.disposed || editor.isDestroyed) return [];
      return runtime.registry.resolve(createCommandContext(editor, runtime), options);
    },
    execute(commandId, options) {
      return executeCommand(editor, commandId, "api", options?.payload);
    },
    getState: () => runtime.state,
    subscribe(listener) {
      listeners.add(listener);
      try {
        listener(runtime.state);
      } catch {
        // Subscription remains active even if the first host projection fails.
      }
      return () => listeners.delete(listener);
    },
    cancel(executionId) {
      if (!runtime.active || (executionId && runtime.active.executionId !== executionId)) return;
      abortActive(runtime, "cancelled");
    },
  };
  runtime = {
    registry: createMarkweaveCommandRegistry({ lang }),
    format: "markdown",
    listeners,
    controller,
    unsubscribeMode: () => undefined,
    state: { phase: "idle", activeExecution: null, lastResult: null },
    active: null,
    disposed: false,
  };
  runtime.unsubscribeMode = subscribeToMarkweaveEditorMode(editor, () => {
    if (runtime.active && !isMarkweaveEditorLiveEditable(getMarkweaveEditorModeState(editor))) {
      abortActive(runtime, "readonly");
    }
  });
  runtimes.set(editor, runtime);
  return runtime;
}

async function executeCommand(
  editor: Editor,
  commandId: string,
  source: MarkweaveCommandSource,
  payload?: unknown,
  slashContext?: SlashCommandContext,
): Promise<MarkweaveCommandExecutionResult> {
  if (editor.isDestroyed) return failure(commandId, "EDITOR_UNAVAILABLE", "The editor is unavailable.");
  const runtime = ensureRuntime(editor);
  if (runtime.disposed) return failure(commandId, "EDITOR_UNAVAILABLE", "The editor is unavailable.");
  if (runtime.active) return failure(commandId, "COMMAND_BUSY", "Another command is already running.");
  const context = createCommandContext(editor, runtime);
  const resolved = runtime.registry.resolve(context, { surface: source === "slash" ? "slash" : "api" })
    .find((command) => command.id === commandId);
  if (!resolved) return failure(commandId, "COMMAND_NOT_FOUND", "The command is not registered for this surface.");
  if (!resolved.enabled) return failure(commandId, "COMMAND_DISABLED", resolved.disabledReason ?? "The command is disabled.");

  const selection = editor.state.selection;
  const from = slashContext?.triggerFrom ?? selection.from;
  const to = slashContext?.triggerTo ?? selection.to;
  const active: ActiveExecution = {
    commandId,
    executionId: createId("markweave-command"),
    source,
    query: slashContext?.query,
    payload,
    abortController: new AbortController(),
    target: {
      from,
      to,
      head: selection.head,
      originalContent: editor.state.doc.slice(from, to).content,
      originalSelection: selection,
      conflict: false,
    },
    applying: false,
  };
  runtime.active = active;
  emitState(runtime, activeState(active, "running", runtime.state.lastResult));

  if (isMarkweaveBuiltinCommandId(commandId)) {
    active.applying = true;
    emitState(runtime, activeState(active, "applying", runtime.state.lastResult));
    let applied = false;
    try {
      applied = executeMarkweaveBuiltinCommand(editor, commandId, active.target, (payload ?? {}) as MarkweaveBuiltinCommandPayload);
    } catch {
      return settle(runtime, failure(commandId, "INVALID_RESULT", "The built-in command could not be applied.", active.executionId));
    }
    return settle(runtime, applied ? success(active, "applied") : failure(commandId, "INVALID_RESULT", "The built-in command could not be applied.", active.executionId));
  }

  const registered = getRegisteredMarkweaveCommand(runtime.registry, commandId);
  if (!registered?.spec) {
    return settle(runtime, failure(commandId, "COMMAND_NOT_FOUND", "The command handler is unavailable.", active.executionId));
  }
  let result: MarkweaveCommandResult | typeof abortedHandlerResult;
  const signal = active.abortController.signal;
  let resolveAbort!: (value: typeof abortedHandlerResult) => void;
  const abortPromise = new Promise<typeof abortedHandlerResult>((resolve) => {
    resolveAbort = resolve;
  });
  const handleAbort = () => resolveAbort(abortedHandlerResult);
  signal.addEventListener("abort", handleAbort, { once: true });
  try {
    result = await Promise.race([
      Promise.resolve().then(() => registered.spec!.execute({
        commandId,
        source,
        payload,
        query: slashContext?.query,
        context,
        signal,
      })),
      abortPromise,
    ]);
  } catch {
    if (signal.aborted) {
      const code = active.target.conflict ? "COMMAND_CONFLICT" : "COMMAND_ABORTED";
      return settle(runtime, failure(commandId, code, active.target.conflict ? "The command target changed." : "The command was aborted.", active.executionId));
    }
    return settle(runtime, failure(commandId, "HANDLER_FAILED", "The command handler failed.", active.executionId));
  } finally {
    signal.removeEventListener("abort", handleAbort);
  }
  if (result === abortedHandlerResult || runtime.active?.executionId !== active.executionId || signal.aborted) {
    const code = active.target.conflict ? "COMMAND_CONFLICT" : "COMMAND_ABORTED";
    return settle(runtime, failure(commandId, code, active.target.conflict ? "The command target changed." : "The command was aborted.", active.executionId));
  }
  if (result && result.kind === "cancel") return settle(runtime, success(active, "cancelled"));
  if (!result || typeof result !== "object" || result.kind !== "apply" || active.target.conflict) {
    return settle(runtime, failure(commandId, active.target.conflict ? "COMMAND_CONFLICT" : "INVALID_RESULT", active.target.conflict ? "The command target changed." : "The command returned an invalid result.", active.executionId));
  }
  active.applying = true;
  emitState(runtime, activeState(active, "applying", runtime.state.lastResult));
  const applied = applyCommandResult(editor, active, result);
  return settle(runtime, applied ? success(active, "applied") : failure(commandId, "INVALID_RESULT", "The command result is incompatible with the editor schema.", active.executionId));
}

function disposeRuntime(editor: Editor) {
  const runtime = runtimes.get(editor);
  if (!runtime) return;
  runtime.disposed = true;
  abortActive(runtime, "editor-destroyed");
  runtime.unsubscribeMode();
  runtime.listeners.clear();
  runtimes.delete(editor);
  editorIds.delete(editor);
}

export const MarkweaveCommands = Extension.create<MarkweaveCommandsOptions>({
  name: "markweaveCommands",
  addOptions() {
    return { lang: "zh" };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    ensureRuntime(editor, this.options.lang);
    return [new Plugin<number>({
      key: commandPluginKey,
      state: {
        init: () => 0,
        apply(transaction, revision) {
          mapActiveExecution(editor, transaction);
          return transaction.docChanged ? revision + 1 : revision;
        },
      },
      view() {
        return { destroy: () => disposeRuntime(editor) };
      },
    })];
  },
});

export function createMarkweaveCommandController(editor: Editor): MarkweaveCommandController {
  return ensureRuntime(editor).controller;
}

export function setMarkweaveCommandRegistry(
  editor: Editor,
  registry: MarkweaveCommandRegistry,
  onError?: MarkweaveCommandErrorHandler,
) {
  const runtime = ensureRuntime(editor);
  runtime.onError = onError;
  if (runtime.registry === registry) return;
  abortActive(runtime, "registry-changed");
  runtime.registry = registry;
  emitState(runtime, runtime.state);
  for (const issue of registry.issues) {
    try {
      onError?.({
        code: "INVALID_RESULT",
        message: issue.message,
        commandId: issue.itemId ?? "<registry>",
      });
    } catch {
      // Registry activation remains deterministic even if host reporting fails.
    }
  }
}

export function setMarkweaveCommandContentFormat(editor: Editor, format: MarkweaveContentFormat) {
  ensureRuntime(editor).format = format;
}

export function executeMarkweaveSlashCommand(
  editor: Editor,
  commandId: string,
  context: SlashCommandContext,
  payload?: unknown,
) {
  return executeCommand(editor, commandId, "slash", payload, context);
}

export { commandResultMaxBytes as markweaveCommandResultMaxBytes };
