import type { SlashCommandUploadKind } from "./command-spec";

export type MarkweaveUploadSourceType = "url" | "absolute-path" | "relative-path" | "base64" | "file";

export interface MarkweaveUploadSource {
  readonly type: MarkweaveUploadSourceType;
  readonly value?: string;
  readonly file?: File;
  readonly mimeType?: string;
}

export interface MarkweaveUploadRequest {
  readonly kind: SlashCommandUploadKind;
  readonly source: MarkweaveUploadSource;
  readonly trigger: "slash-command";
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
