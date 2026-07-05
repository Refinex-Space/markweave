import type { SlashCommandUploadKind } from "./command-spec";

export type MarkweaveUploadSourceType = "url" | "absolute-path" | "relative-path" | "base64" | "file";

export interface MarkweaveUploadSource {
  readonly type: MarkweaveUploadSourceType;
  readonly value?: string;
  readonly file?: File;
  readonly mimeType?: string;
}

export type MarkweaveUploadTrigger = "slash-command" | "image-insert" | "image-replace";

export interface MarkweaveUploadRequest {
  readonly kind: SlashCommandUploadKind;
  readonly source: MarkweaveUploadSource;
  readonly trigger: MarkweaveUploadTrigger;
}

export interface MarkweaveUploadResult {
  readonly src: string;
  readonly name?: string;
  readonly alt?: string;
  readonly title?: string;
  readonly mimeType?: string;
  readonly size?: number;
}

export type MarkweaveSlashCommandUploadHandler = (
  request: MarkweaveUploadRequest,
) => Promise<MarkweaveUploadResult> | MarkweaveUploadResult;

export function detectUploadSource(input: string): MarkweaveUploadSource {
  const value = input.trim();

  if (value.startsWith("data:")) {
    return { type: "base64", value };
  }

  if (/^https?:\/\//i.test(value)) {
    return { type: "url", value };
  }

  if (value.startsWith("/")) {
    return { type: "absolute-path", value };
  }

  return { type: "relative-path", value };
}

export function getDirectUploadResult(request: MarkweaveUploadRequest): MarkweaveUploadResult | null {
  if (request.source.type === "file" || !request.source.value) {
    return null;
  }

  return {
    src: request.source.value,
    name: request.source.value.split("/").filter(Boolean).at(-1),
    mimeType: request.source.mimeType,
  };
}

export async function resolveMarkweaveUploadResult(
  request: MarkweaveUploadRequest,
  onUpload?: MarkweaveSlashCommandUploadHandler,
): Promise<MarkweaveUploadResult> {
  const result = onUpload ? await onUpload(request) : getDirectUploadResult(request);

  if (!result) {
    throw new Error("File upload requires an upload handler.");
  }

  return result;
}
