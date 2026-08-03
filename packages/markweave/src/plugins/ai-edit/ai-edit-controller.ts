import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import type { Fragment } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type {
  MarkweaveAiEditContext,
  MarkweaveAiEditController,
  MarkweaveAiEditDecision,
  MarkweaveAiEditErrorCode,
  MarkweaveAiEditProposal,
  MarkweaveAiEditResult,
  MarkweaveAiEditSelection,
  MarkweaveAiEditSelectionSnapshot,
  MarkweaveAiEditState,
} from "../../core/public-types";
import {
  getMarkweaveEditorModeState,
  isMarkweaveEditorLiveEditable,
  subscribeToMarkweaveEditorMode,
} from "../../core/editor-mode-state";
import {
  getMarkweaveMessages,
  normalizeMarkweaveLang,
  type MarkweaveLang,
  type MarkweaveMessages,
} from "../../i18n";
import {
  acceptMarkweaveAskAiResult,
  clearMarkweaveAskAiTarget,
  createMarkweaveAskAiSelection,
  getMarkweaveAskAiTarget,
  hasMarkweaveAskAiPreview,
  isMarkweaveAskAiSelectionEligible,
  setMarkweaveAskAiPreview,
  startMarkweaveAskAiTarget,
} from "../ask-ai/ask-ai-session";
import {
  applyMarkweaveAiEditHunks,
  createMarkweaveAiEditDiff,
  createMarkweaveAiEditProposalDom,
  parseMarkweaveAiEditProposal,
  type MarkweaveAiEditInternalHunk,
} from "./ai-edit-multi-scope";
import {
  createMarkweaveAiEditTarget,
  inspectMarkweaveAiEditSelection,
} from "./ai-edit-selection";

export interface MarkweaveAiEditOptions {
  readonly lang: MarkweaveLang;
  readonly messages: MarkweaveMessages["aiEdit"];
}

interface MarkweaveAiEditSession {
  readonly context: MarkweaveAiEditContext;
  readonly abortController: AbortController;
  readonly controls: "default" | "none";
  phase: Exclude<MarkweaveAiEditState["phase"], "idle">;
  proposal: MarkweaveAiEditProposal | null;
  error: string | null;
  conflictNotified: boolean;
  hunks: readonly MarkweaveAiEditInternalHunk[];
  range: {
    from: number;
    to: number;
    readonly originalContent: Fragment;
    conflict: boolean;
  } | null;
}

interface MarkweaveAiEditControllerRuntime {
  readonly controller: MarkweaveAiEditController;
  readonly listeners: Set<(state: MarkweaveAiEditState) => void>;
  readonly decisionListeners: Set<(event: MarkweaveAiEditDecision) => void>;
  readonly selectionListeners: Set<(selection: MarkweaveAiEditSelectionSnapshot | null) => void>;
  readonly unsubscribeMode: () => void;
}

type MarkweaveAiEditPluginAction = { readonly type: "refresh" };

const markweaveAiEditPluginKey = new PluginKey<number>("markweaveAiEdit");
const sessions = new WeakMap<Editor, MarkweaveAiEditSession>();
const controllerRuntimes = new WeakMap<Editor, MarkweaveAiEditControllerRuntime>();
const editorLanguages = new WeakMap<Editor, MarkweaveLang>();
const editorMessages = new WeakMap<Editor, MarkweaveMessages["aiEdit"]>();
const pendingPreviewFrames = new WeakMap<Editor, {
  readonly contextId: string;
  markdown: string;
  readonly cancel: () => void;
}>();

const idleState: MarkweaveAiEditState = {
  phase: "idle",
  context: null,
  proposal: null,
  error: null,
  hunks: [],
};

function ok<T>(value: T): MarkweaveAiEditResult<T> {
  return { ok: true, value };
}

function fail<T>(code: MarkweaveAiEditErrorCode, message: string): MarkweaveAiEditResult<T> {
  return { ok: false, code, message };
}

function createContextId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `markweave-ai-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function publicState(editor: Editor): MarkweaveAiEditState {
  const session = sessions.get(editor);
  return session
    ? {
        phase: session.phase,
        context: session.context,
        proposal: session.proposal,
        error: session.error,
        hunks: session.hunks,
      }
    : idleState;
}

function stateKey(state: MarkweaveAiEditState) {
  return [
    state.phase,
    state.context?.id ?? "",
    state.proposal?.status ?? "",
    state.proposal?.markdown ?? "",
    state.error ?? "",
    state.hunks.map((hunk) => `${hunk.id}:${hunk.from}:${hunk.to}`).join(","),
  ].join("\u0000");
}

function dispatchRefresh(editor: Editor) {
  if (editor.isDestroyed) {
    return;
  }
  editor.view.dispatch(
    editor.state.tr
      .setMeta(markweaveAiEditPluginKey, { type: "refresh" } satisfies MarkweaveAiEditPluginAction)
      .setMeta("addToHistory", false),
  );
}

function emitDecision(editor: Editor, decision: MarkweaveAiEditDecision) {
  controllerRuntimes.get(editor)?.decisionListeners.forEach((listener) => listener(decision));
}

function createDecision(
  session: MarkweaveAiEditSession,
  decision: MarkweaveAiEditDecision["decision"],
  appliedRange?: MarkweaveAiEditDecision["appliedRange"],
  appliedRanges?: MarkweaveAiEditDecision["appliedRanges"],
): MarkweaveAiEditDecision {
  return {
    contextId: session.context.id,
    decision,
    original: session.context.selection,
    originalTarget: session.context.target,
    proposedMarkdown: session.proposal?.markdown ?? null,
    metadata: session.context.metadata,
    appliedRange,
    appliedRanges,
  };
}

function abortSession(session: MarkweaveAiEditSession, reason: string) {
  if (!session.abortController.signal.aborted) {
    session.abortController.abort(reason);
  }
}

function synchronizeConflict(editor: Editor) {
  const session = sessions.get(editor);
  if (!session || session.phase === "conflict") {
    return false;
  }
  const target = getMarkweaveAskAiTarget(editor);
  const targetIsCurrent = session.range
    ? !session.range.conflict
    : target?.status === "target";
  if (targetIsCurrent) {
    return false;
  }

  session.phase = "conflict";
  session.error = editorMessages.get(editor)?.conflict ?? getMarkweaveMessages(editorLanguages.get(editor)).aiEdit.conflict;
  cancelPendingPreview(editor);
  abortSession(session, "conflict");
  if (!session.conflictNotified) {
    session.conflictNotified = true;
    emitDecision(editor, createDecision(session, "conflict"));
  }
  return true;
}

function validateCompleteMarkdown(editor: Editor, markdown: string) {
  if (!editor.markdown) {
    return "schema-incompatible" as const;
  }
  let parsed: JSONContent;
  try {
    parsed = editor.markdown.parse(markdown);
  } catch {
    return "invalid-markdown" as const;
  }
  try {
    const documentNode = editor.schema.nodeFromJSON(parsed);
    return documentNode.content.size ? null : "schema-incompatible" as const;
  } catch {
    return "schema-incompatible" as const;
  }
}

function cancelPendingPreview(editor: Editor) {
  const pending = pendingPreviewFrames.get(editor);
  if (!pending) {
    return;
  }
  pendingPreviewFrames.delete(editor);
  pending.cancel();
}

function schedulePreview(editor: Editor, contextId: string, markdown: string) {
  const pending = pendingPreviewFrames.get(editor);
  if (pending?.contextId === contextId) {
    pending.markdown = markdown;
    return;
  }
  cancelPendingPreview(editor);

  const view = editor.view.dom.ownerDocument.defaultView;
  let cancelled = false;
  const flush = () => {
    const active = pendingPreviewFrames.get(editor);
    if (cancelled || !active || active.contextId !== contextId) {
      return;
    }
    pendingPreviewFrames.delete(editor);
    const session = sessions.get(editor);
    if (!session || session.context.id !== contextId || session.phase !== "streaming") {
      return;
    }
    setMarkweaveAskAiPreview(editor, active.markdown);
  };
  if (view?.requestAnimationFrame) {
    const frame = view.requestAnimationFrame(flush);
    pendingPreviewFrames.set(editor, {
      contextId,
      markdown,
      cancel: () => {
        cancelled = true;
        view.cancelAnimationFrame(frame);
      },
    });
    return;
  }

  const timeout = globalThis.setTimeout(flush, 0);
  pendingPreviewFrames.set(editor, {
    contextId,
    markdown,
    cancel: () => {
      cancelled = true;
      globalThis.clearTimeout(timeout);
    },
  });
}

function ensureActiveSession(
  editor: Editor,
  contextId: string,
): MarkweaveAiEditResult<MarkweaveAiEditSession> {
  synchronizeConflict(editor);
  const session = sessions.get(editor);
  if (!session || session.context.id !== contextId) {
    return fail("stale-context", "The AI edit context is no longer active.");
  }
  if (session.phase === "conflict") {
    return fail("conflict", session.error ?? "The selected content changed.");
  }
  return ok(session);
}

function preventEditorFocusLoss(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}

function createActionButton(label: string, className: string, action: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("mousedown", preventEditorFocusLoss);
  button.addEventListener("click", (event) => {
    preventEditorFocusLoss(event);
    action();
  });
  return button;
}

function createReviewControls(editor: Editor, session: MarkweaveAiEditSession) {
  const messages = editorMessages.get(editor) ?? getMarkweaveMessages(editorLanguages.get(editor)).aiEdit;
  const controller = createMarkweaveAiEditController(editor);
  const element = document.createElement("span");
  element.className = "markweave-ai-edit-controls";
  element.dataset.markweaveAiEditPhase = session.phase;
  element.dataset.markweaveAiEditContext = session.context.id;
  element.contentEditable = "false";
  element.setAttribute("role", "toolbar");
  element.setAttribute("aria-label", messages.ariaLabel);

  const status = document.createElement("span");
  status.className = "markweave-ai-edit-status";
  status.setAttribute("aria-live", "polite");

  if (session.phase === "captured" || session.phase === "streaming") {
    status.textContent = session.phase === "captured" ? messages.preparing : messages.streaming;
    element.append(
      status,
      createActionButton(messages.stop, "markweave-ai-edit-button markweave-ai-edit-button--secondary", () => {
        controller.discard(session.context.id);
      }),
    );
    return element;
  }

  if (session.phase === "review") {
    element.append(
      createActionButton(messages.discard, "markweave-ai-edit-button markweave-ai-edit-button--secondary", () => {
        controller.discard(session.context.id);
      }),
      createActionButton(messages.accept, "markweave-ai-edit-button markweave-ai-edit-button--primary", () => {
        controller.accept(session.context.id);
      }),
    );
    return element;
  }

  status.textContent = session.error ?? (session.phase === "conflict" ? messages.conflict : messages.errorFallback);
  element.append(
    status,
    createActionButton(messages.discard, "markweave-ai-edit-button markweave-ai-edit-button--secondary", () => {
      controller.discard(session.context.id);
    }),
  );
  return element;
}

function createAiEditDecorations(editor: Editor) {
  const session = sessions.get(editor);
  const target = getMarkweaveAskAiTarget(editor);
  if (!session) {
    return DecorationSet.empty;
  }
  const key = [
    session.context.id,
    session.phase,
    session.proposal?.status ?? "",
    session.proposal?.markdown.length ?? 0,
    session.error ?? "",
  ].join("-");
  const decorations: Decoration[] = [];
  if (session.range) {
    session.hunks.forEach((hunk) => {
      if (hunk.from < hunk.to) {
        decorations.push(Decoration.inline(hunk.from, hunk.to, {
          class: "markweave-ai-edit-original markweave-ai-edit-hunk-original",
          "data-markweave-ai-edit-original": "true",
          "data-markweave-ai-edit-hunk": hunk.id,
        }));
      }
      decorations.push(Decoration.widget(hunk.to, () => {
        const proposal = createMarkweaveAiEditProposalDom(editor, hunk);
        if (session.controls === "default" && hunk.id === session.hunks.at(-1)?.id) {
          proposal.append(createReviewControls(editor, session));
        }
        return proposal;
      }, {
        key: `markweave-ai-edit-hunk-${key}-${hunk.id}`,
        side: 1,
      }));
    });
  } else if (target && hasMarkweaveAskAiPreview(editor.state) && target.status === "target") {
    decorations.push(Decoration.inline(target.from, target.to, {
      class: "markweave-ai-edit-original",
      "data-markweave-ai-edit-original": "true",
    }));
  }
  if (session.controls === "default") {
    const controlsFollowPreview = !session.range
      && target?.status === "target"
      && hasMarkweaveAskAiPreview(editor.state);
    const controlsAt = session.range
      ? session.hunks.length === 0 ? session.range.to : undefined
      : controlsFollowPreview ? target?.from : target?.to;
    if (controlsAt !== undefined) {
      decorations.push(Decoration.widget(controlsAt, () => createReviewControls(editor, session), {
        key: `markweave-ai-edit-controls-${key}`,
        side: controlsFollowPreview ? 2 : 1,
      }));
    }
  }
  return DecorationSet.create(editor.state.doc, decorations);
}

function disposeController(editor: Editor) {
  cancelPendingPreview(editor);
  const session = sessions.get(editor);
  if (session) {
    sessions.delete(editor);
    abortSession(session, "editor-destroyed");
    if (!session.conflictNotified) {
      emitDecision(editor, createDecision(session, "discarded"));
    }
  }
  controllerRuntimes.get(editor)?.unsubscribeMode();
  controllerRuntimes.delete(editor);
  editorLanguages.delete(editor);
  editorMessages.delete(editor);
}

function mapMultiScopeSession(editor: Editor, transaction: Transaction) {
  const session = sessions.get(editor);
  if (!session?.range || !transaction.docChanged || session.range.conflict) {
    return;
  }
  const mappedFrom = transaction.mapping.mapResult(session.range.from, 1);
  const mappedTo = transaction.mapping.mapResult(session.range.to, -1);
  const from = Math.max(0, Math.min(mappedFrom.pos, transaction.doc.content.size));
  const to = Math.max(from, Math.min(mappedTo.pos, transaction.doc.content.size));
  session.range.from = from;
  session.range.to = to;
  if (mappedFrom.deletedAcross || mappedTo.deletedAcross
    || !transaction.doc.slice(from, to).content.eq(session.range.originalContent)) {
    session.range.conflict = true;
    return;
  }
  session.hunks = session.hunks.map((hunk) => ({
    ...hunk,
    from: transaction.mapping.map(hunk.from, 1),
    to: transaction.mapping.map(hunk.to, -1),
  }));
}

export const MarkweaveAiEdit = Extension.create<MarkweaveAiEditOptions>({
  name: "markweaveAiEdit",

  addOptions() {
    return {
      lang: "zh",
      messages: getMarkweaveMessages("zh").aiEdit,
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    editorLanguages.set(editor, this.options.lang);
    editorMessages.set(editor, this.options.messages);

    return [
      new Plugin<number>({
        key: markweaveAiEditPluginKey,
        state: {
          init: () => 0,
          apply(transaction, revision) {
            mapMultiScopeSession(editor, transaction);
            return transaction.getMeta(markweaveAiEditPluginKey) ? revision + 1 : revision;
          },
        },
        props: {
          decorations: () => createAiEditDecorations(editor),
        },
        view() {
          let previousStateKey = stateKey(publicState(editor));
          return {
            update(view, previousState) {
              const becameConflict = synchronizeConflict(editor);
              const nextState = publicState(editor);
              const nextStateKey = stateKey(nextState);
              if (nextStateKey !== previousStateKey) {
                previousStateKey = nextStateKey;
                controllerRuntimes.get(editor)?.listeners.forEach((listener) => listener(nextState));
              }
              if (becameConflict) {
                Promise.resolve().then(() => dispatchRefresh(editor));
              }
              const selectionListeners = controllerRuntimes.get(editor)?.selectionListeners;
              if (selectionListeners?.size
                && (!view.state.selection.eq(previousState.selection) || !view.state.doc.eq(previousState.doc))) {
                const selection = inspectMarkweaveAiEditSelection(editor);
                selectionListeners.forEach((listener) => listener(selection));
              }
            },
            destroy() {
              disposeController(editor);
            },
          };
        },
      }),
    ];
  },
});

export function createMarkweaveAiEditController(editor: Editor): MarkweaveAiEditController {
  const existing = controllerRuntimes.get(editor);
  if (existing) {
    return existing.controller;
  }

  const listeners = new Set<(state: MarkweaveAiEditState) => void>();
  const decisionListeners = new Set<(event: MarkweaveAiEditDecision) => void>();
  const selectionListeners = new Set<(selection: MarkweaveAiEditSelectionSnapshot | null) => void>();

  const controller: MarkweaveAiEditController = {
    getSelection() {
      return inspectMarkweaveAiEditSelection(editor);
    },

    subscribeSelection(listener) {
      selectionListeners.add(listener);
      listener(inspectMarkweaveAiEditSelection(editor));
      return () => selectionListeners.delete(listener);
    },

    capture(options) {
      if (sessions.has(editor) || getMarkweaveAskAiTarget(editor)) {
        return fail("active-review", "An AI edit review is already active.");
      }
      if (!editor.isEditable || !isMarkweaveEditorLiveEditable(getMarkweaveEditorModeState(editor))) {
        return fail("readonly", "AI edits require Live editable mode.");
      }
      if (!(["selection", "blocks", "document"] as const).includes(options.scope)) {
        return fail("unsupported-scope", "The requested AI edit scope is not supported.");
      }
      if (options.scope === "selection") {
        if (!(editor.state.selection instanceof TextSelection)) {
          return fail("unsupported-selection", "The current selection type is not supported.");
        }
        if (editor.state.selection.empty) {
          return fail("no-selection", "Select text before creating an AI edit context.");
        }
        if (!isMarkweaveAskAiSelectionEligible(editor)) {
          return fail("unsupported-selection", "The current selection cannot be reviewed as a text edit.");
        }
      }

      const capturedTarget = createMarkweaveAiEditTarget(editor, options.scope);
      if (!capturedTarget) {
        return fail(options.scope === "selection" ? "no-selection" : "unsupported-scope", "The requested AI edit scope cannot be captured.");
      }
      const askAiSelection = options.scope === "selection" ? createMarkweaveAskAiSelection(editor) : null;
      const target = askAiSelection
        ? { ...capturedTarget, ...askAiSelection, scope: capturedTarget.scope, lineRange: capturedTarget.lineRange }
        : capturedTarget;
      const selection: MarkweaveAiEditSelection = target;
      const abortController = new AbortController();
      const context: MarkweaveAiEditContext = {
        id: createContextId(),
        lang: normalizeMarkweaveLang(editorLanguages.get(editor)),
        selection,
        target,
        signal: abortController.signal,
        metadata: options.metadata,
      };
      if (options.scope === "selection" && !startMarkweaveAskAiTarget(editor)) {
        return fail("unsupported-selection", "The current selection cannot be captured.");
      }
      const range = options.scope === "selection"
        ? null
        : {
            from: target.from,
            to: target.to,
            originalContent: editor.state.doc.slice(target.from, target.to).content,
            conflict: false,
          };
      sessions.set(editor, {
        context,
        abortController,
        controls: options.controls ?? "default",
        phase: "captured",
        proposal: null,
        error: null,
        conflictNotified: false,
        hunks: [],
        range,
      });
      dispatchRefresh(editor);
      return ok(context);
    },

    captureSelection(options = {}) {
      return controller.capture({ ...options, scope: "selection" });
    },

    updateProposal(proposal) {
      const active = ensureActiveSession(editor, proposal.contextId);
      if (!active.ok) {
        return active;
      }
      const session = active.value;
      const nextProposal = { ...proposal };
      session.proposal = nextProposal;
      session.error = null;

      if (proposal.status === "streaming") {
        session.phase = "streaming";
        // Multi-block and document proposals are complete-target snapshots. Rendering
        // a partial stream would make the unreceived suffix look deleted.
        if (!session.range && proposal.markdown.trim()) {
          schedulePreview(editor, proposal.contextId, proposal.markdown);
        }
        dispatchRefresh(editor);
        return ok(publicState(editor));
      }

      cancelPendingPreview(editor);

      if (!proposal.markdown.trim()) {
        session.phase = "error";
        session.error = "The completed AI edit proposal is empty.";
        dispatchRefresh(editor);
        return fail("incomplete-proposal", session.error);
      }
      if (session.range) {
        const parsed = parseMarkweaveAiEditProposal(editor, proposal.markdown);
        if (!parsed.ok) {
          session.phase = "error";
          session.error = parsed.reason === "invalid-markdown"
            ? "The completed AI edit proposal is not valid Markdown."
            : "The completed AI edit proposal is incompatible with the editor schema.";
          dispatchRefresh(editor);
          return fail(parsed.reason, session.error);
        }
        const diff = createMarkweaveAiEditDiff(
          editor,
          session.range.originalContent,
          parsed.content,
          session.range.from,
          session.context.target.lineRange.start,
        );
        if (!diff.ok) {
          session.phase = "error";
          session.error = diff.reason === "proposal-too-complex"
            ? "The completed AI edit proposal is too complex to review safely."
            : "The completed AI edit proposal is incompatible with the editor schema.";
          dispatchRefresh(editor);
          return fail(diff.reason, session.error);
        }
        if (diff.hunks.length === 0) {
          session.phase = "error";
          session.error = "The completed AI edit proposal does not change the captured content.";
          dispatchRefresh(editor);
          return fail("incomplete-proposal", session.error);
        }
        session.hunks = diff.hunks;
        session.phase = "review";
        dispatchRefresh(editor);
        return ok(publicState(editor));
      }

      const validationError = validateCompleteMarkdown(editor, proposal.markdown);
      if (validationError) {
        session.phase = "error";
        session.error = validationError === "invalid-markdown"
          ? "The completed AI edit proposal is not valid Markdown."
          : "The completed AI edit proposal is incompatible with the editor schema.";
        dispatchRefresh(editor);
        return fail(validationError, session.error);
      }
      session.phase = "review";
      if (!setMarkweaveAskAiPreview(editor, proposal.markdown)) {
        session.phase = "error";
        session.error = "The completed AI edit proposal is incompatible with the editor schema.";
        dispatchRefresh(editor);
        return fail("schema-incompatible", session.error);
      }
      return ok(publicState(editor));
    },

    failProposal(contextId, message) {
      const active = ensureActiveSession(editor, contextId);
      if (!active.ok) {
        return active;
      }
      cancelPendingPreview(editor);
      active.value.phase = "error";
      active.value.error = message?.trim()
        || editorMessages.get(editor)?.errorFallback
        || getMarkweaveMessages(editorLanguages.get(editor)).aiEdit.errorFallback;
      dispatchRefresh(editor);
      return ok(publicState(editor));
    },

    accept(contextId) {
      const active = ensureActiveSession(editor, contextId);
      if (!active.ok) {
        return active;
      }
      const session = active.value;
      if (session.phase !== "review" || session.proposal?.status !== "complete") {
        return fail("incomplete-proposal", "Only a complete AI edit proposal can be accepted.");
      }

      cancelPendingPreview(editor);
      sessions.delete(editor);
      if (session.range) {
        const appliedRanges = session.hunks.map((hunk) => ({ from: hunk.from, to: hunk.to }));
        const appliedRange = { from: session.range.from, to: session.range.to };
        try {
          const transaction = applyMarkweaveAiEditHunks(editor.state.tr, session.hunks).scrollIntoView();
          editor.view.dispatch(transaction);
        } catch {
          session.phase = "error";
          session.error = "The AI edit proposal could not be applied to the current schema.";
          sessions.set(editor, session);
          dispatchRefresh(editor);
          return fail("schema-incompatible", session.error);
        }
        const decision = createDecision(session, "accepted", appliedRange, appliedRanges);
        emitDecision(editor, decision);
        return ok(decision);
      }
      if (!acceptMarkweaveAskAiResult(editor, session.proposal.markdown)) {
        session.phase = "error";
        session.error = "The AI edit proposal could not be applied to the current schema.";
        sessions.set(editor, session);
        dispatchRefresh(editor);
        return fail("schema-incompatible", session.error);
      }
      const appliedTarget = getMarkweaveAskAiTarget(editor);
      const appliedRange = appliedTarget
        ? { from: appliedTarget.from, to: appliedTarget.to }
        : undefined;
      const decision = createDecision(session, "accepted", appliedRange);
      emitDecision(editor, decision);
      globalThis.setTimeout(() => {
        const target = getMarkweaveAskAiTarget(editor);
        if (!sessions.has(editor) && target?.status === "applied") {
          clearMarkweaveAskAiTarget(editor);
        }
      }, 560);
      return ok(decision);
    },

    discard(contextId) {
      const session = sessions.get(editor);
      if (!session || session.context.id !== contextId) {
        return fail("stale-context", "The AI edit context is no longer active.");
      }
      cancelPendingPreview(editor);
      sessions.delete(editor);
      abortSession(session, session.phase === "conflict" ? "conflict" : "discarded");
      const decision = createDecision(session, session.phase === "conflict" ? "conflict" : "discarded");
      if (!session.conflictNotified) {
        emitDecision(editor, decision);
      }
      clearMarkweaveAskAiTarget(editor);
      return ok(decision);
    },

    getState() {
      synchronizeConflict(editor);
      return publicState(editor);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    onDecision(listener) {
      decisionListeners.add(listener);
      return () => decisionListeners.delete(listener);
    },
  };

  const unsubscribeMode = subscribeToMarkweaveEditorMode(editor, () => {
    const session = sessions.get(editor);
    if (session && !isMarkweaveEditorLiveEditable(getMarkweaveEditorModeState(editor))) {
      controller.discard(session.context.id);
    }
  });
  controllerRuntimes.set(editor, {
    controller,
    listeners,
    decisionListeners,
    selectionListeners,
    unsubscribeMode,
  });
  return controller;
}
