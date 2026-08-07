import type { MarkweaveEditorMode } from "../../core/editor-mode-state";
import { normalizeMarkdownLinkHref } from "../markdown/markdown-input";
import type { MarkweaveUploadRequest, MarkweaveUploadResult, MarkweaveUploadSource } from "../slash-command/upload";

export interface MarkweaveAttachmentRef {
  readonly src: string;
  readonly name: string | null;
  readonly mimeType: string | null;
  readonly size: number | null;
}

export interface MarkweaveAttachmentDownloadContext {
  readonly mode: MarkweaveEditorMode;
  readonly event: MouseEvent;
}

export type MarkweaveAttachmentDownloadHandler = (
  attachment: MarkweaveAttachmentRef,
  context: MarkweaveAttachmentDownloadContext,
) => void | Promise<void>;

function stringAttribute(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function derivedAttachmentFileName(src: string) {
  return src.split(/[\\/]/).filter(Boolean).at(-1) ?? null;
}

export function attrsFromMarkweaveAttachmentUploadResult(result: MarkweaveUploadResult) {
  const src = result.src.trim();
  return {
    src,
    name: stringAttribute(result.name) ?? derivedAttachmentFileName(src),
    mimeType: stringAttribute(result.mimeType),
    size: typeof result.size === "number" && Number.isFinite(result.size) ? result.size : null,
  };
}

export function createMarkweaveAttachmentRefFromAttrs(attrs: {
  readonly src?: unknown;
  readonly name?: unknown;
  readonly mimeType?: unknown;
  readonly size?: unknown;
}): MarkweaveAttachmentRef | null {
  const src = stringAttribute(attrs.src);
  if (!src) {
    return null;
  }

  return {
    src,
    name: stringAttribute(attrs.name) ?? derivedAttachmentFileName(src),
    mimeType: stringAttribute(attrs.mimeType),
    size: typeof attrs.size === "number" && Number.isFinite(attrs.size) ? attrs.size : null,
  };
}

export function createMarkweaveAttachmentUploadRequest(
  source: MarkweaveUploadSource,
  trigger: Extract<MarkweaveUploadRequest["trigger"], "slash-command" | "attachment-insert"> = "attachment-insert",
): MarkweaveUploadRequest {
  return {
    kind: "attachment",
    source,
    trigger,
  };
}

export function formatMarkweaveAttachmentSize(size: number | null | undefined, unknownLabel = ""): string {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
    return unknownLabel;
  }

  if (size < 1024) {
    return `${Math.round(size)} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10_240 ? 1 : 0)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(size < 10_485_760 ? 1 : 0)} MB`;
}

export function openMarkweaveAttachmentFallbackDownload(src: string): boolean {
  const href = normalizeMarkdownLinkHref(src);

  if (!href || !/^https?:\/\//i.test(href) || typeof window === "undefined" || typeof window.open !== "function") {
    return false;
  }

  window.open(href, "_blank", "noopener,noreferrer");
  return true;
}

export function activateMarkweaveAttachmentDownload(
  attachment: MarkweaveAttachmentRef,
  context: MarkweaveAttachmentDownloadContext,
  onDownload?: MarkweaveAttachmentDownloadHandler | null,
): boolean {
  if (onDownload) {
    void Promise.resolve(onDownload(attachment, context));
    return true;
  }

  return openMarkweaveAttachmentFallbackDownload(attachment.src);
}
