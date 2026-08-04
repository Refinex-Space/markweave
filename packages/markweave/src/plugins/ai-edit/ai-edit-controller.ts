import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import type { Fragment } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type {
  MarkweaveAiEditContext,
  MarkweaveAiEditController,
  MarkweaveAiEditDecision,
  MarkweaveAiEditErrorCode,
  MarkweaveAiEditHunk,
  MarkweaveAiEditHunkDecision,
  MarkweaveAiEditHunkDisposition,
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
import { getMarkweaveVisibleBoundaryRect } from "../../core/visible-boundary";
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
  selectionHunk: MarkweaveAiEditHunk | null;
  activeHunkId: string | null;
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
  activeHunkId: null,
};

function sessionHunks(session: MarkweaveAiEditSession): readonly MarkweaveAiEditHunk[] {
  return session.selectionHunk ? [session.selectionHunk] : session.hunks;
}

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
        hunks: sessionHunks(session),
        activeHunkId: session.activeHunkId,
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
    state.activeHunkId ?? "",
    state.hunks.map((hunk) => `${hunk.id}:${hunk.from}:${hunk.to}:${hunk.disposition}`).join(","),
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
  hunkDecisions?: MarkweaveAiEditDecision["hunkDecisions"],
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
    hunkDecisions,
  };
}

function createHunkDecisions(
  hunks: readonly MarkweaveAiEditHunk[],
  forcedDisposition?: Exclude<MarkweaveAiEditHunkDisposition, "pending">,
): readonly MarkweaveAiEditHunkDecision[] {
  return hunks
    .filter((hunk) => forcedDisposition || hunk.disposition !== "pending")
    .map((hunk) => {
      const decision = forcedDisposition ?? hunk.disposition;
      return {
        hunkId: hunk.id,
        decision: decision as Exclude<MarkweaveAiEditHunkDisposition, "pending">,
        ...(decision === "accepted" ? { appliedRange: { from: hunk.from, to: hunk.to } } : {}),
      };
    });
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

type AiEditIconName = "check" | "discard" | "previous" | "next";

const aiEditIconPaths: Record<AiEditIconName, readonly string[]> = {
  check: ["M20 6 9 17l-5-5"],
  discard: ["M18 6 6 18", "M6 6l12 12"],
  previous: ["m18 15-6-6-6 6"],
  next: ["m6 9 6 6 6-6"],
};

let aiEditTooltipSequence = 0;

function createActionIcon(ownerDocument: Document, icon: AiEditIconName) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = ownerDocument.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  aiEditIconPaths[icon].forEach((value) => {
    const path = ownerDocument.createElementNS(namespace, "path");
    path.setAttribute("d", value);
    svg.appendChild(path);
  });
  return svg;
}

function createActionButton(
  ownerDocument: Document,
  label: string,
  className: string,
  action: () => void,
  icon?: AiEditIconName,
) {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = className;
  if (icon) {
    button.appendChild(createActionIcon(ownerDocument, icon));
    const tooltip = ownerDocument.createElement("span");
    tooltip.id = `markweave-ai-edit-tooltip-${++aiEditTooltipSequence}`;
    tooltip.className = "markweave-ai-edit-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = label;
    button.setAttribute("aria-describedby", tooltip.id);
    button.appendChild(tooltip);
  } else {
    button.textContent = label;
  }
  button.setAttribute("aria-label", label);
  button.addEventListener("mousedown", preventEditorFocusLoss);
  button.addEventListener("click", (event) => {
    preventEditorFocusLoss(event);
    action();
  });
  return button;
}

function activeHunkIndex(session: MarkweaveAiEditSession) {
  const hunks = sessionHunks(session);
  const index = hunks.findIndex((hunk) => hunk.id === session.activeHunkId);
  return index >= 0 ? index : 0;
}

function createHunkReviewDom(editor: Editor, session: MarkweaveAiEditSession, hunk: MarkweaveAiEditInternalHunk) {
  const messages = editorMessages.get(editor) ?? getMarkweaveMessages(editorLanguages.get(editor)).aiEdit;
  const controller = createMarkweaveAiEditController(editor);
  const ownerDocument = editor.view.dom.ownerDocument;
  const shell = ownerDocument.createElement("div");
  shell.className = "markweave-ai-edit-hunk-shell";
  shell.dataset.markweaveAiEditHunk = hunk.id;
  shell.dataset.markweaveAiEditDisposition = hunk.disposition;
  shell.dataset.markweaveAiEditActive = String(session.activeHunkId === hunk.id);
  shell.contentEditable = "false";

  const proposal = createMarkweaveAiEditProposalDom(editor, hunk);
  shell.appendChild(proposal);
  if (session.controls === "none") {
    return shell;
  }
  const actions = ownerDocument.createElement("span");
  actions.className = "markweave-ai-edit-hunk-actions";
  actions.setAttribute("role", "toolbar");
  actions.setAttribute("aria-label", `${messages.ariaLabel}: ${hunk.lineRange.start}-${hunk.lineRange.end}`);
  actions.append(
    createActionButton(
      ownerDocument,
      messages.discardHunk,
      "markweave-ai-edit-hunk-button markweave-ai-edit-hunk-button--discard",
      () => controller.discardHunk(session.context.id, hunk.id),
      "discard",
    ),
    createActionButton(
      ownerDocument,
      messages.acceptHunk,
      "markweave-ai-edit-hunk-button markweave-ai-edit-hunk-button--accept",
      () => controller.acceptHunk(session.context.id, hunk.id),
      "check",
    ),
  );
  shell.addEventListener("pointerenter", () => {
    controller.activateHunk(session.context.id, hunk.id);
  });
  shell.addEventListener("focusin", () => {
    controller.activateHunk(session.context.id, hunk.id);
  });
  shell.appendChild(actions);
  return shell;
}

function createReviewControls(editor: Editor, session: MarkweaveAiEditSession) {
  const messages = editorMessages.get(editor) ?? getMarkweaveMessages(editorLanguages.get(editor)).aiEdit;
  const controller = createMarkweaveAiEditController(editor);
  const ownerDocument = editor.view.dom.ownerDocument;
  const element = ownerDocument.createElement("span");
  element.className = "markweave-ai-edit-controls";
  element.dataset.markweaveAiEditPhase = session.phase;
  element.dataset.markweaveAiEditContext = session.context.id;
  element.contentEditable = "false";
  element.setAttribute("role", "toolbar");
  element.setAttribute("aria-label", messages.ariaLabel);

  const status = ownerDocument.createElement("span");
  status.className = "markweave-ai-edit-status";
  status.setAttribute("aria-live", "polite");

  if (session.phase === "captured" || session.phase === "streaming") {
    status.textContent = session.phase === "captured" ? messages.preparing : messages.streaming;
    element.append(
      status,
      createActionButton(ownerDocument, messages.stop, "markweave-ai-edit-button markweave-ai-edit-button--secondary", () => {
        controller.discard(session.context.id);
      }),
    );
    return element;
  }

  if (session.phase === "review") {
    const hunks = sessionHunks(session);
    const current = hunks.length ? activeHunkIndex(session) + 1 : 0;
    const navigation = ownerDocument.createElement("span");
    navigation.className = "markweave-ai-edit-navigation";
    const previous = createActionButton(
      ownerDocument,
      messages.previousHunk,
      "markweave-ai-edit-nav-button markweave-ai-edit-nav-button--previous",
      () => controller.previousHunk(session.context.id),
      "previous",
    );
    const count = ownerDocument.createElement("span");
    count.className = "markweave-ai-edit-count";
    count.textContent = messages.changeCount(current, hunks.length);
    count.setAttribute("aria-live", "polite");
    const next = createActionButton(
      ownerDocument,
      messages.nextHunk,
      "markweave-ai-edit-nav-button markweave-ai-edit-nav-button--next",
      () => controller.nextHunk(session.context.id),
      "next",
    );
    previous.disabled = hunks.length <= 1;
    next.disabled = hunks.length <= 1;
    navigation.append(previous, count, next);
    element.append(
      navigation,
      createActionButton(ownerDocument, messages.discardAll, "markweave-ai-edit-button markweave-ai-edit-button--secondary", () => {
        controller.discardAll(session.context.id);
      }),
      createActionButton(ownerDocument, messages.acceptAll, "markweave-ai-edit-button markweave-ai-edit-button--primary", () => {
        controller.acceptAll(session.context.id);
      }),
    );
    return element;
  }

  status.textContent = session.error ?? (session.phase === "conflict" ? messages.conflict : messages.errorFallback);
  element.append(
    status,
    createActionButton(ownerDocument, messages.discard, "markweave-ai-edit-button markweave-ai-edit-button--secondary", () => {
      controller.discard(session.context.id);
    }),
  );
  return element;
}

const aiEditPortalThemeTokens = [
  "--markweave-text",
  "--markweave-text-muted",
  "--markweave-surface",
  "--markweave-surface-muted",
  "--markweave-border",
  "--markweave-focus",
  "--markweave-shadow",
  "--markweave-ai-primary-text",
  "--markweave-ai-primary-hover",
] as const;

function getAiEditFrame(editor: Editor) {
  return editor.view.dom.closest<HTMLElement>(".markweave-editor-frame") ?? editor.view.dom;
}

function copyAiEditPortalTheme(frame: HTMLElement, controls: HTMLElement) {
  const view = frame.ownerDocument.defaultView;
  if (!view) {
    return;
  }
  const styles = view.getComputedStyle(frame);
  aiEditPortalThemeTokens.forEach((token) => {
    const value = styles.getPropertyValue(token).trim();
    if (value) {
      controls.style.setProperty(token, value);
    }
  });
  controls.dataset.markweaveTheme = frame.dataset.markweaveTheme ?? "light";
}

function createFloatingReviewControls(editor: Editor) {
  const frame = getAiEditFrame(editor);
  const ownerDocument = frame.ownerDocument;
  const view = ownerDocument.defaultView;
  let controls: HTMLElement | null = null;
  let controlsKey = "";
  let cancelScheduledPosition: (() => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let tracking = false;

  const position = () => {
    cancelScheduledPosition = null;
    if (!controls?.isConnected) {
      return;
    }
    const boundary = getMarkweaveVisibleBoundaryRect(frame);
    if (boundary.width <= 0 || boundary.height <= 0) {
      controls.style.visibility = "hidden";
      controls.dataset.markweavePositioned = "false";
      return;
    }

    const margin = Math.min(12, Math.max(4, boundary.width / 8), Math.max(4, boundary.height / 8));
    controls.style.maxWidth = `${Math.max(0, Math.floor(boundary.width - margin * 2))}px`;
    const controlsRect = controls.getBoundingClientRect();
    const left = Math.max(
      boundary.left + margin,
      Math.min(
        boundary.left + boundary.width - controlsRect.width - margin,
        boundary.left + (boundary.width - controlsRect.width) / 2,
      ),
    );
    const top = Math.max(boundary.top + margin, boundary.top + boundary.height - controlsRect.height - margin);
    controls.style.left = `${Math.round(left)}px`;
    controls.style.top = `${Math.round(top)}px`;
    controls.style.visibility = "visible";
    controls.dataset.markweavePositioned = "true";
  };

  const schedulePosition = () => {
    if (cancelScheduledPosition) {
      return;
    }
    if (view?.requestAnimationFrame) {
      const frameId = view.requestAnimationFrame(position);
      cancelScheduledPosition = () => view.cancelAnimationFrame(frameId);
      return;
    }
    const timeout = globalThis.setTimeout(position, 0);
    cancelScheduledPosition = () => globalThis.clearTimeout(timeout);
  };

  const startTracking = () => {
    if (tracking) {
      return;
    }
    const ResizeObserverCtor = view?.ResizeObserver ?? globalThis.ResizeObserver;
    resizeObserver = ResizeObserverCtor ? new ResizeObserverCtor(schedulePosition) : null;
    resizeObserver?.observe(frame);
    if (controls) {
      resizeObserver?.observe(controls);
    }
    ownerDocument.addEventListener("scroll", schedulePosition, true);
    ownerDocument.addEventListener("visibilitychange", schedulePosition);
    view?.addEventListener("resize", schedulePosition);
    view?.addEventListener("focus", schedulePosition);
    view?.addEventListener("pageshow", schedulePosition);
    tracking = true;
  };

  const stopTracking = () => {
    if (!tracking) {
      return;
    }
    cancelScheduledPosition?.();
    cancelScheduledPosition = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    ownerDocument.removeEventListener("scroll", schedulePosition, true);
    ownerDocument.removeEventListener("visibilitychange", schedulePosition);
    view?.removeEventListener("resize", schedulePosition);
    view?.removeEventListener("focus", schedulePosition);
    view?.removeEventListener("pageshow", schedulePosition);
    tracking = false;
  };

  return {
    update() {
      const session = sessions.get(editor);
      if (!session || session.controls !== "default") {
        stopTracking();
        controls?.remove();
        controls = null;
        controlsKey = "";
        return;
      }

      const nextKey = [
        session.context.id,
        session.phase,
        session.error ?? "",
        session.activeHunkId ?? "",
        sessionHunks(session).map((hunk) => `${hunk.id}:${hunk.disposition}`).join(","),
      ].join("\u0000");
      if (!controls || controlsKey !== nextKey) {
        stopTracking();
        controls?.remove();
        controls = createReviewControls(editor, session);
        controls.classList.add("markweave-ai-edit-controls--floating");
        copyAiEditPortalTheme(frame, controls);
        ownerDocument.body.appendChild(controls);
        controlsKey = nextKey;
      } else {
        copyAiEditPortalTheme(frame, controls);
      }
      startTracking();
      schedulePosition();
    },
    destroy() {
      stopTracking();
      controls?.remove();
      controls = null;
      controlsKey = "";
    },
  };
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
    session.activeHunkId ?? "",
    sessionHunks(session).map((hunk) => hunk.disposition).join(","),
  ].join("-");
  const decorations: Decoration[] = [];
  if (session.range) {
    session.hunks.forEach((hunk) => {
      if (hunk.from < hunk.to) {
        decorations.push(Decoration.inline(hunk.from, hunk.to, {
          class: "markweave-ai-edit-original markweave-ai-edit-hunk-original",
          "data-markweave-ai-edit-original": "true",
          "data-markweave-ai-edit-hunk": hunk.id,
          "data-markweave-ai-edit-disposition": hunk.disposition,
          "data-markweave-ai-edit-active": String(session.activeHunkId === hunk.id),
        }));
      }
      decorations.push(Decoration.widget(hunk.to, () => {
        return createHunkReviewDom(editor, session, hunk);
      }, {
        key: `markweave-ai-edit-hunk-${key}-${hunk.id}`,
        side: 1,
      }));
    });
  } else if (target && hasMarkweaveAskAiPreview(editor.state) && target.status === "target") {
    const hunk = session.selectionHunk;
    decorations.push(Decoration.inline(target.from, target.to, {
      class: "markweave-ai-edit-original",
      "data-markweave-ai-edit-original": "true",
      ...(hunk ? {
        "data-markweave-ai-edit-hunk": hunk.id,
        "data-markweave-ai-edit-disposition": hunk.disposition,
        "data-markweave-ai-edit-active": String(session.activeHunkId === hunk.id),
      } : {}),
    }));
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

function bindHunkPointerActivation(editor: Editor) {
  const handlePointerOver = (event: Event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-markweave-ai-edit-hunk]")
      : null;
    const session = sessions.get(editor);
    const hunkId = target?.dataset.markweaveAiEditHunk;
    if (!session || session.controls !== "default" || session.phase !== "review" || !hunkId || session.activeHunkId === hunkId) {
      return;
    }
    createMarkweaveAiEditController(editor).activateHunk(session.context.id, hunkId);
  };
  editor.view.dom.addEventListener("pointerover", handlePointerOver);
  return () => editor.view.dom.removeEventListener("pointerover", handlePointerOver);
}

function scrollToHunk(editor: Editor, hunkId: string) {
  const editorDom = editor.view.dom;
  const view = editorDom.ownerDocument.defaultView;
  const scroll = () => {
    if (editor.isDestroyed || !editorDom.isConnected) {
      return;
    }
    const target = [...editorDom.querySelectorAll<HTMLElement>("[data-markweave-ai-edit-hunk]")]
      .find((element) => element.dataset.markweaveAiEditHunk === hunkId);
    if (!target) {
      return;
    }
    const reduceMotion = view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView?.({ block: "center", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  };
  if (view?.requestAnimationFrame) {
    view.requestAnimationFrame(scroll);
  } else {
    globalThis.setTimeout(scroll, 0);
  }
}

function settleMultiScopeReview(
  editor: Editor,
  session: MarkweaveAiEditSession,
  forcedDisposition?: Exclude<MarkweaveAiEditHunkDisposition, "pending">,
): MarkweaveAiEditResult<MarkweaveAiEditDecision> {
  const settledHunks = forcedDisposition
    ? session.hunks.map((hunk) => ({ ...hunk, disposition: forcedDisposition }))
    : session.hunks;
  const acceptedHunks = settledHunks.filter((hunk) => hunk.disposition === "accepted");
  const appliedRanges = acceptedHunks.map((hunk) => ({ from: hunk.from, to: hunk.to }));
  const appliedRange = acceptedHunks.length && session.range
    ? { from: session.range.from, to: session.range.to }
    : undefined;
  const decisionType: MarkweaveAiEditDecision["decision"] = acceptedHunks.length === 0
    ? "discarded"
    : acceptedHunks.length === settledHunks.length
      ? "accepted"
      : "partially-accepted";
  const hunkDecisions = createHunkDecisions(settledHunks);

  cancelPendingPreview(editor);
  sessions.delete(editor);
  if (acceptedHunks.length) {
    try {
      const transaction = applyMarkweaveAiEditHunks(editor.state.tr, acceptedHunks).scrollIntoView();
      editor.view.dispatch(transaction);
    } catch {
      session.phase = "error";
      session.error = "The AI edit proposal could not be applied to the current schema.";
      sessions.set(editor, session);
      dispatchRefresh(editor);
      return fail("schema-incompatible", session.error);
    }
  } else {
    abortSession(session, "discarded");
    dispatchRefresh(editor);
  }
  const decision = createDecision(session, decisionType, appliedRange, appliedRanges, hunkDecisions);
  emitDecision(editor, decision);
  return ok(decision);
}

function decideMultiScopeHunk(
  editor: Editor,
  session: MarkweaveAiEditSession,
  hunkId: string,
  disposition: Exclude<MarkweaveAiEditHunkDisposition, "pending">,
): MarkweaveAiEditResult<MarkweaveAiEditState | MarkweaveAiEditDecision> {
  const hunkIndex = session.hunks.findIndex((hunk) => hunk.id === hunkId);
  if (hunkIndex < 0) {
    return fail("stale-context", "The AI edit hunk is no longer active.");
  }
  session.hunks = session.hunks.map((hunk) => (
    hunk.id === hunkId ? { ...hunk, disposition } : hunk
  ));
  const pending = session.hunks.filter((hunk) => hunk.disposition === "pending");
  if (!pending.length) {
    return settleMultiScopeReview(editor, session);
  }
  for (let offset = 1; offset <= session.hunks.length; offset += 1) {
    const candidate = session.hunks[(hunkIndex + offset) % session.hunks.length];
    if (candidate?.disposition === "pending") {
      session.activeHunkId = candidate.id;
      break;
    }
  }
  dispatchRefresh(editor);
  if (session.activeHunkId) {
    scrollToHunk(editor, session.activeHunkId);
  }
  return ok(publicState(editor));
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
          const floatingControls = createFloatingReviewControls(editor);
          const unbindHunkPointerActivation = bindHunkPointerActivation(editor);
          let previousStateKey = stateKey(publicState(editor));
          floatingControls.update();
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
              floatingControls.update();
            },
            destroy() {
              unbindHunkPointerActivation();
              floatingControls.destroy();
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
        selectionHunk: null,
        activeHunkId: null,
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
        session.selectionHunk = null;
        session.activeHunkId = diff.hunks[0]?.id ?? null;
        session.phase = "review";
        dispatchRefresh(editor);
        if (session.controls === "default" && session.activeHunkId) {
          scrollToHunk(editor, session.activeHunkId);
        }
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
      const selectionHunk: MarkweaveAiEditHunk = {
        id: `hunk-1-${session.context.target.from}-${session.context.target.to}`,
        kind: "replace",
        from: session.context.target.from,
        to: session.context.target.to,
        originalMarkdown: session.context.target.markdown,
        proposedMarkdown: proposal.markdown,
        lineRange: session.context.target.lineRange,
        disposition: "pending",
      };
      session.selectionHunk = selectionHunk;
      session.activeHunkId = selectionHunk.id;
      dispatchRefresh(editor);
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
      return controller.acceptAll(contextId);
    },

    discard(contextId) {
      return controller.discardAll(contextId);
    },

    acceptAll(contextId) {
      const active = ensureActiveSession(editor, contextId);
      if (!active.ok) {
        return active;
      }
      const session = active.value;
      if (session.phase !== "review" || session.proposal?.status !== "complete") {
        return fail("incomplete-proposal", "Only a complete AI edit proposal can be accepted.");
      }

      cancelPendingPreview(editor);
      if (session.range) {
        return settleMultiScopeReview(editor, session, "accepted");
      }
      sessions.delete(editor);
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
      const hunkDecisions = session.selectionHunk
        ? [{
            hunkId: session.selectionHunk.id,
            decision: "accepted" as const,
            ...(appliedRange ? { appliedRange } : {}),
          }]
        : undefined;
      const decision = createDecision(
        session,
        "accepted",
        appliedRange,
        appliedRange ? [appliedRange] : undefined,
        hunkDecisions,
      );
      emitDecision(editor, decision);
      globalThis.setTimeout(() => {
        const target = getMarkweaveAskAiTarget(editor);
        if (!sessions.has(editor) && target?.status === "applied") {
          clearMarkweaveAskAiTarget(editor);
        }
      }, 560);
      return ok(decision);
    },

    discardAll(contextId) {
      const session = sessions.get(editor);
      if (!session || session.context.id !== contextId) {
        return fail("stale-context", "The AI edit context is no longer active.");
      }
      if (session.range && session.phase === "review") {
        return settleMultiScopeReview(editor, session, "discarded");
      }
      cancelPendingPreview(editor);
      sessions.delete(editor);
      abortSession(session, session.phase === "conflict" ? "conflict" : "discarded");
      const hunkDecisions = session.phase === "conflict"
        ? undefined
        : createHunkDecisions(sessionHunks(session), "discarded");
      const decision = createDecision(
        session,
        session.phase === "conflict" ? "conflict" : "discarded",
        undefined,
        undefined,
        hunkDecisions,
      );
      if (!session.conflictNotified) {
        emitDecision(editor, decision);
      }
      clearMarkweaveAskAiTarget(editor);
      return ok(decision);
    },

    activateHunk(contextId, hunkId) {
      const active = ensureActiveSession(editor, contextId);
      if (!active.ok) {
        return active;
      }
      const session = active.value;
      if (session.phase !== "review" || !sessionHunks(session).some((hunk) => hunk.id === hunkId)) {
        return fail("stale-context", "The AI edit hunk is no longer active.");
      }
      if (session.activeHunkId !== hunkId) {
        session.activeHunkId = hunkId;
        dispatchRefresh(editor);
      }
      return ok(publicState(editor));
    },

    previousHunk(contextId) {
      const active = ensureActiveSession(editor, contextId);
      if (!active.ok) {
        return active;
      }
      const session = active.value;
      const hunks = sessionHunks(session);
      if (session.phase !== "review" || !hunks.length) {
        return fail("incomplete-proposal", "No AI edit hunk is available for review.");
      }
      const current = activeHunkIndex(session);
      session.activeHunkId = hunks[(current - 1 + hunks.length) % hunks.length]!.id;
      dispatchRefresh(editor);
      scrollToHunk(editor, session.activeHunkId);
      return ok(publicState(editor));
    },

    nextHunk(contextId) {
      const active = ensureActiveSession(editor, contextId);
      if (!active.ok) {
        return active;
      }
      const session = active.value;
      const hunks = sessionHunks(session);
      if (session.phase !== "review" || !hunks.length) {
        return fail("incomplete-proposal", "No AI edit hunk is available for review.");
      }
      const current = activeHunkIndex(session);
      session.activeHunkId = hunks[(current + 1) % hunks.length]!.id;
      dispatchRefresh(editor);
      scrollToHunk(editor, session.activeHunkId);
      return ok(publicState(editor));
    },

    acceptHunk(contextId, hunkId) {
      const active = ensureActiveSession(editor, contextId);
      if (!active.ok) {
        return active;
      }
      const session = active.value;
      if (session.phase !== "review" || session.proposal?.status !== "complete") {
        return fail("incomplete-proposal", "Only a complete AI edit hunk can be accepted.");
      }
      if (session.selectionHunk?.id === hunkId) {
        return controller.acceptAll(contextId);
      }
      return decideMultiScopeHunk(editor, session, hunkId, "accepted");
    },

    discardHunk(contextId, hunkId) {
      const active = ensureActiveSession(editor, contextId);
      if (!active.ok) {
        return active;
      }
      const session = active.value;
      if (session.phase !== "review" || session.proposal?.status !== "complete") {
        return fail("incomplete-proposal", "Only a complete AI edit hunk can be discarded.");
      }
      if (session.selectionHunk?.id === hunkId) {
        return controller.discardAll(contextId);
      }
      return decideMultiScopeHunk(editor, session, hunkId, "discarded");
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
