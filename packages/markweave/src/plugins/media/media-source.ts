export type MarkweaveMediaKind = "image" | "video" | "attachment";
export type MarkweaveMediaPriority = "visible" | "nearby" | "background";
export type MarkweaveMediaResolveReason =
  | "initial"
  | "viewport"
  | "retry"
  | "image-error"
  | "output";

export interface MarkweaveMediaSourceRequest {
  readonly kind: MarkweaveMediaKind;
  readonly src: string;
  readonly priority: MarkweaveMediaPriority;
  readonly signal: AbortSignal;
  /** One-based attempt count for the current persisted source. */
  readonly attempt?: number;
  /** Why this resolution attempt was started. Existing hosts may ignore it. */
  readonly reason?: MarkweaveMediaResolveReason;
}

export interface MarkweaveMediaSourceResult {
  readonly src: string;
  readonly width?: number;
  readonly height?: number;
}

export type MarkweaveMediaSourceResolver = (
  request: MarkweaveMediaSourceRequest,
) =>
  | MarkweaveMediaSourceResult
  | null
  | Promise<MarkweaveMediaSourceResult | null>;

export async function resolveMarkweaveMediaSource(
  resolver: MarkweaveMediaSourceResolver | undefined,
  request: MarkweaveMediaSourceRequest,
): Promise<MarkweaveMediaSourceResult | null> {
  if (!resolver) {
    return { src: request.src };
  }

  const result = await resolver(request);
  if (request.signal.aborted || !result?.src.trim()) {
    return null;
  }

  return {
    src: result.src.trim(),
    width: normalizeMediaDimension(result.width),
    height: normalizeMediaDimension(result.height),
  };
}

function normalizeMediaDimension(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}
