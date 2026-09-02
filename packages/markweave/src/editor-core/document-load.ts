import {
  createDocument,
  type Editor,
  type JSONContent,
  type MarkdownToken,
} from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type {
  MarkweaveContentFormat,
  MarkweaveContentValue,
} from "../core/public-types";

export type MarkweavePerformancePolicy =
  | "auto"
  | "standard"
  | "large"
  | "extreme";

export type MarkweavePerformanceTier = Exclude<
  MarkweavePerformancePolicy,
  "auto"
>;

export type MarkweaveEditorExtensionsLoadPolicy = "atomic" | "transactional-safe";

export type MarkweaveDocumentLoadPhase =
  | "idle"
  | "parsing"
  | "mounting"
  | "finalizing"
  | "ready"
  | "error"
  | "cancelled";

export interface MarkweaveDocumentProfile {
  readonly sourceLength: number;
  readonly documentSize: number;
  readonly nodeCount: number;
  readonly topLevelBlockCount: number;
  readonly tableCellCount: number;
  readonly codeBlockCount: number;
  readonly mermaidBlockCount: number;
  readonly mathNodeCount: number;
  readonly mediaNodeCount: number;
}

export interface MarkweaveDocumentLoadState {
  readonly phase: MarkweaveDocumentLoadPhase;
  readonly progress: number | null;
  readonly tier: MarkweavePerformanceTier;
  readonly profile: MarkweaveDocumentProfile | null;
  readonly error: string | null;
}

export interface MarkweaveDocumentLoadOptions {
  readonly content: MarkweaveContentValue;
  readonly format: MarkweaveContentFormat;
  readonly performancePolicy?: MarkweavePerformancePolicy;
  readonly allowProgressiveMount?: boolean;
  /** @internal Only safe when the editor has no unknown Markdown tokenizers. */
  readonly allowBuiltInMarkdownWorker?: boolean;
  readonly signal?: AbortSignal;
  readonly onStateChange?: (state: MarkweaveDocumentLoadState) => void;
}

export interface MarkweaveDocumentLoadResult {
  readonly document: ProseMirrorNode;
  readonly profile: MarkweaveDocumentProfile;
  readonly tier: MarkweavePerformanceTier;
}

export const markweaveDocumentLoadMetaKey = "markweaveDocumentLoad";

export interface MarkweaveDocumentLoadTransactionMeta {
  readonly phase: "mounting" | "complete";
  readonly outcome?: "ready" | "error" | "cancelled";
}

const LARGE_SOURCE_LENGTH = 200_000;
const EXTREME_SOURCE_LENGTH = 1_000_000;
const LOAD_FRAME_BUDGET_MS = 6;
const MARKDOWN_WORKER_TIMEOUT_MS = 15_000;
// ProseMirror view reconciliation grows with the mounted prefix. In practice,
// tiny node-count batches create many increasingly expensive transactions;
// the time budget remains authoritative while this ceiling prevents that
// transaction amplification on extreme documents.
const LARGE_BATCH_NODE_LIMIT = 256;
const EXTREME_BATCH_NODE_LIMIT = 256;

export function getMarkweaveDocumentLoadMeta(
  transaction: { getMeta: (key: string) => unknown },
): MarkweaveDocumentLoadTransactionMeta | null {
  const meta = transaction.getMeta(markweaveDocumentLoadMetaKey);
  if (!meta || typeof meta !== "object") return null;
  const phase = (meta as { phase?: unknown }).phase;
  if (phase !== "mounting" && phase !== "complete") return null;
  const outcome = (meta as { outcome?: unknown }).outcome;
  return outcome === "ready" || outcome === "error" || outcome === "cancelled"
    ? { phase, outcome }
    : { phase };
}

export function createMarkweaveDocumentLoadState(
  overrides: Partial<MarkweaveDocumentLoadState> = {},
): MarkweaveDocumentLoadState {
  return {
    phase: "idle",
    progress: null,
    tier: "standard",
    profile: null,
    error: null,
    ...overrides,
  };
}

export function getMarkweaveContentLength(content: MarkweaveContentValue) {
  return typeof content === "string"
    ? content.length
    : JSON.stringify(content).length;
}

export function shouldCoordinateMarkweaveDocumentLoad(
  content: MarkweaveContentValue,
  policy: MarkweavePerformancePolicy = "auto",
) {
  if (policy === "standard") return false;
  if (policy === "large" || policy === "extreme") return true;
  return getMarkweaveContentLength(content) >= LARGE_SOURCE_LENGTH;
}

export function parseMarkweaveDocument(
  editor: Editor,
  content: MarkweaveContentValue,
  format: MarkweaveContentFormat,
) {
  if (format === "markdown") {
    if (typeof content !== "string") {
      throw new Error("Markdown content must be a string.");
    }
    const parsed = editor.markdown?.parse(content);
    if (!parsed) throw new Error("Markdown parser is unavailable.");
    return createCheckedMarkweaveMarkdownDocument(
      editor,
      parsed as JSONContent,
    );
  }

  const normalized =
    format === "json" && typeof content === "string"
      ? (JSON.parse(content) as JSONContent)
      : content;
  const document = createDocument(normalized, editor.schema, {}, {
    errorOnInvalidContent: false,
  });
  document.check();
  return document;
}

interface MarkweaveMarkdownManagerWithTokens {
  parseTokens(tokens: readonly MarkdownToken[], parseImplicitEmptyParagraphs?: boolean): JSONContent[];
}

interface MarkdownWorkerMessage {
  readonly error?: string;
  readonly id: number;
  readonly tokens?: readonly MarkdownToken[];
  readonly type: "result" | "error";
}

let markdownWorkerRequestId = 0;

function normalizeMarkweaveMarkdownNode(
  editor: Editor,
  node: JSONContent,
): JSONContent[] {
  if (node.content) {
    node.content = node.content.flatMap((child) =>
      normalizeMarkweaveMarkdownNode(editor, child),
    );
  }

  if (node.type !== "paragraph" || !node.content) {
    return [node];
  }

  const siblings: JSONContent[] = [];
  let inlineContent: JSONContent[] = [];
  const flushInlineContent = () => {
    const first = inlineContent[0];
    if (first?.type === "text" && first.text) {
      first.text = first.text.trimStart();
      if (!first.text) inlineContent.shift();
    }
    const last = inlineContent[inlineContent.length - 1];
    if (last?.type === "text" && last.text) {
      last.text = last.text.trimEnd();
      if (!last.text) inlineContent.pop();
    }
    const content = inlineContent;
    inlineContent = [];
    if (content.length) siblings.push({ ...node, content });
  };

  for (const child of node.content) {
    if (editor.schema.nodes[child.type as string]?.isBlock) {
      flushInlineContent();
      siblings.push(child);
    } else {
      inlineContent.push(child);
    }
  }
  if (!siblings.length) return [node];
  flushInlineContent();

  return siblings;
}

export function createCheckedMarkweaveMarkdownDocument(
  editor: Editor,
  content: JSONContent,
) {
  const document = editor.schema.nodeFromJSON(
    normalizeMarkweaveMarkdownNode(editor, content)[0]!,
  );
  document.check();
  return document;
}

function parseMarkweaveMarkdownTokens(
  editor: Editor,
  tokens: readonly MarkdownToken[],
) {
  const manager = editor.markdown as unknown as MarkweaveMarkdownManagerWithTokens | undefined;
  if (!manager?.parseTokens) {
    throw new Error("Markdown token parser is unavailable.");
  }
  return createCheckedMarkweaveMarkdownDocument(editor, {
    type: "doc",
    content: manager.parseTokens(tokens, true),
  });
}

async function lexMarkweaveMarkdownInWorker(
  markdown: string,
  signal?: AbortSignal,
) {
  const ownerWindow = typeof window === "undefined" ? null : window;
  if (!ownerWindow?.Worker || !ownerWindow.Blob || !ownerWindow.URL?.createObjectURL) {
    return Promise.resolve<readonly MarkdownToken[] | null>(null);
  }

  let workerSource: string;
  try {
    ({ markweaveMarkdownParserWorkerSource: workerSource } = await import(
      "./markdown-parser-worker-source.generated"
    ));
  } catch {
    return null;
  }
  throwIfAborted(signal);

  let objectUrl: string;
  let worker: Worker;
  try {
    objectUrl = ownerWindow.URL.createObjectURL(
      new ownerWindow.Blob([workerSource], {
        type: "text/javascript",
      }),
    );
    worker = new ownerWindow.Worker(objectUrl);
  } catch {
    return Promise.resolve(null);
  }

  return new Promise<readonly MarkdownToken[] | null>((resolve, reject) => {
    const id = ++markdownWorkerRequestId;
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      ownerWindow.clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
      ownerWindow.URL.revokeObjectURL(objectUrl);
      callback();
    };
    const cancel = () => finish(() => reject(new DOMException("Document load cancelled.", "AbortError")));
    const fallback = () => finish(() => resolve(null));
    const timeout = ownerWindow.setTimeout(fallback, MARKDOWN_WORKER_TIMEOUT_MS);
    worker.onerror = fallback;
    worker.onmessage = (event: MessageEvent<MarkdownWorkerMessage>) => {
      if (event.data.id !== id) return;
      if (event.data.type === "result" && event.data.tokens) {
        finish(() => resolve(event.data.tokens ?? []));
      } else {
        fallback();
      }
    };
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) {
      cancel();
      return;
    }
    worker.postMessage({ id, markdown });
  });
}

async function parseMarkweaveDocumentForLoad(
  editor: Editor,
  options: MarkweaveDocumentLoadOptions,
) {
  if (
    options.format !== "markdown" ||
    typeof options.content !== "string" ||
    options.content.length < LARGE_SOURCE_LENGTH ||
    options.allowBuiltInMarkdownWorker !== true
  ) {
    return parseMarkweaveDocument(editor, options.content, options.format);
  }

  const tokens = await lexMarkweaveMarkdownInWorker(options.content, options.signal);
  throwIfAborted(options.signal);
  return tokens
    ? parseMarkweaveMarkdownTokens(editor, tokens)
    : parseMarkweaveDocument(editor, options.content, options.format);
}

export function profileMarkweaveDocument(
  document: ProseMirrorNode,
  sourceLength = document.content.size,
): MarkweaveDocumentProfile {
  let nodeCount = 0;
  let tableCellCount = 0;
  let codeBlockCount = 0;
  let mermaidBlockCount = 0;
  let mathNodeCount = 0;
  let mediaNodeCount = 0;

  document.descendants((node) => {
    nodeCount += 1;
    const name = node.type.name;
    if (name === "tableCell" || name === "tableHeader") tableCellCount += 1;
    if (name === "codeBlock") {
      codeBlockCount += 1;
      if (node.attrs.language === "mermaid") mermaidBlockCount += 1;
    }
    if (name === "inlineMath" || name === "blockMath") mathNodeCount += 1;
    if (name === "image" || name === "video" || name === "attachment") {
      mediaNodeCount += 1;
    }
    return true;
  });

  return {
    sourceLength,
    documentSize: document.content.size,
    nodeCount,
    topLevelBlockCount: document.childCount,
    tableCellCount,
    codeBlockCount,
    mermaidBlockCount,
    mathNodeCount,
    mediaNodeCount,
  };
}

export function resolveMarkweavePerformanceTier(
  profile: MarkweaveDocumentProfile,
  policy: MarkweavePerformancePolicy = "auto",
): MarkweavePerformanceTier {
  if (policy !== "auto") return policy;

  if (
    profile.sourceLength >= EXTREME_SOURCE_LENGTH ||
    profile.nodeCount >= 20_000 ||
    profile.topLevelBlockCount >= 5_000 ||
    profile.tableCellCount >= 2_500 ||
    profile.codeBlockCount >= 200 ||
    profile.mermaidBlockCount >= 100 ||
    profile.mediaNodeCount >= 1_000
  ) {
    return "extreme";
  }

  if (
    profile.sourceLength >= LARGE_SOURCE_LENGTH ||
    profile.topLevelBlockCount >= 1_000 ||
    profile.tableCellCount >= 500 ||
    profile.codeBlockCount >= 50 ||
    profile.mermaidBlockCount >= 10 ||
    profile.mediaNodeCount >= 100
  ) {
    return "large";
  }

  return "standard";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Document load cancelled.", "AbortError");
}

function yieldToBrowser() {
  if (typeof window === "undefined") return Promise.resolve();
  if (typeof window.requestAnimationFrame === "function") {
    return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function dispatchAtomicDocument(editor: Editor, document: ProseMirrorNode) {
  const transaction = editor.state.tr
    .replaceWith(0, editor.state.doc.content.size, document.content)
    .setMeta("addToHistory", false)
    .setMeta("preventUpdate", true)
    .setMeta(markweaveDocumentLoadMetaKey, { phase: "complete", outcome: "ready" });
  editor.view.dispatch(transaction);
}

async function dispatchProgressiveDocument(
  editor: Editor,
  document: ProseMirrorNode,
  tier: MarkweavePerformanceTier,
  signal: AbortSignal | undefined,
  onProgress: (progress: number) => void,
) {
  const nodes = Array.from({ length: document.childCount }, (_, index) =>
    document.child(index),
  );
  const nodeLimit =
    tier === "extreme" ? EXTREME_BATCH_NODE_LIMIT : LARGE_BATCH_NODE_LIMIT;
  let cursor = 0;
  let firstBatch = true;

  while (cursor < nodes.length) {
    throwIfAborted(signal);
    await yieldToBrowser();
    throwIfAborted(signal);

    const batchStartedAt = performance.now();
    const batch: ProseMirrorNode[] = [];
    while (
      cursor < nodes.length &&
      batch.length < nodeLimit &&
      (batch.length === 0 || performance.now() - batchStartedAt < LOAD_FRAME_BUDGET_MS)
    ) {
      batch.push(nodes[cursor]!);
      cursor += 1;
    }

    const fragment = Fragment.fromArray(batch);
    const transaction = firstBatch
      ? editor.state.tr.replaceWith(0, editor.state.doc.content.size, fragment)
      : editor.state.tr.insert(editor.state.doc.content.size, fragment);
    editor.view.dispatch(
      transaction
        .setMeta("addToHistory", false)
        .setMeta("preventUpdate", true)
        .setMeta(markweaveDocumentLoadMetaKey, { phase: "mounting" }),
    );
    firstBatch = false;
    onProgress(nodes.length ? cursor / nodes.length : 1);
  }

  editor.view.dispatch(
    editor.state.tr
      .setMeta("addToHistory", false)
      .setMeta("preventUpdate", true)
      .setMeta(markweaveDocumentLoadMetaKey, { phase: "complete", outcome: "ready" }),
  );
}

function dispatchDocumentLoadTermination(
  editor: Editor,
  outcome: "error" | "cancelled",
) {
  if (editor.isDestroyed) return;
  try {
    editor.view.dispatch(
      editor.state.tr
        .setMeta("addToHistory", false)
        .setMeta("preventUpdate", true)
        .setMeta(markweaveDocumentLoadMetaKey, { phase: "complete", outcome }),
    );
  } catch {
    // Preserve the original load failure if the view was destroyed concurrently.
  }
}

export async function loadMarkweaveDocument(
  editor: Editor,
  options: MarkweaveDocumentLoadOptions,
): Promise<MarkweaveDocumentLoadResult> {
  const policy = options.performancePolicy ?? "auto";
  const emit = (state: MarkweaveDocumentLoadState) => options.onStateChange?.(state);
  let tier: MarkweavePerformanceTier =
    policy === "auto" ? "standard" : policy;

  try {
    throwIfAborted(options.signal);
    emit(createMarkweaveDocumentLoadState({ phase: "parsing", tier }));
    await yieldToBrowser();
    throwIfAborted(options.signal);

    const document = await parseMarkweaveDocumentForLoad(editor, options);
    const profile = profileMarkweaveDocument(
      document,
      getMarkweaveContentLength(options.content),
    );
    tier = resolveMarkweavePerformanceTier(profile, policy);
    const progressive =
      options.allowProgressiveMount !== false && tier !== "standard";

    emit(createMarkweaveDocumentLoadState({
      phase: "mounting",
      progress: 0,
      tier,
      profile,
    }));

    if (progressive) {
      await dispatchProgressiveDocument(
        editor,
        document,
        tier,
        options.signal,
        (progress) => emit(createMarkweaveDocumentLoadState({
          phase: "mounting",
          progress,
          tier,
          profile,
        })),
      );
    } else {
      throwIfAborted(options.signal);
      dispatchAtomicDocument(editor, document);
    }

    throwIfAborted(options.signal);
    emit(createMarkweaveDocumentLoadState({
      phase: "finalizing",
      progress: 1,
      tier,
      profile,
    }));
    await yieldToBrowser();
    throwIfAborted(options.signal);
    emit(createMarkweaveDocumentLoadState({
      phase: "ready",
      progress: 1,
      tier,
      profile,
    }));
    return { document, profile, tier };
  } catch (error) {
    const cancelled = options.signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError");
    dispatchDocumentLoadTermination(editor, cancelled ? "cancelled" : "error");
    emit(createMarkweaveDocumentLoadState({
      phase: cancelled ? "cancelled" : "error",
      tier,
      error: cancelled
        ? null
        : error instanceof Error
          ? error.message
          : "Document load failed.",
    }));
    throw error;
  }
}
