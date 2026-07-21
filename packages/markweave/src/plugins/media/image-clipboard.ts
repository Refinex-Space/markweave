import { Extension } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { attrsFromMarkweaveImageUploadResult, createMarkweaveImageUploadRequest } from "./core-media-nodes";
import { resolveMarkweaveUploadResult, type MarkweaveSlashCommandUploadHandler, type MarkweaveUploadResult } from "../slash-command/upload";

export interface MarkweaveImageClipboardOptions {
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
}

export interface MarkweaveClipboardData {
  readonly files?: ArrayLike<File> | null;
  getData(type: string): string;
}

export type MarkweaveClipboardImageCandidate =
  | {
      readonly type: "file";
      readonly file: File;
    }
  | {
      readonly type: "remote";
      readonly src: string;
      readonly alt?: string;
      readonly title?: string;
    };

interface PendingClipboardImage {
  readonly id: string;
  readonly pos: number;
}

interface ImageClipboardPluginState {
  readonly pending: ReadonlyMap<string, number>;
}

type ImageClipboardPluginMeta =
  | {
      readonly type: "register";
      readonly entries: readonly PendingClipboardImage[];
    }
  | {
      readonly type: "remove";
      readonly id: string;
    };

const remoteImageExtensions = new Set(["avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"]);
const imageOnlyWrapperTags = new Set(["A", "DIV", "P", "SPAN", "FIGURE"]);
const madoraDrawingReferencePattern = /^\[!\[((?:\\.|[^\]])*)\]\((madora-asset:\/\/[0-9a-f]{64})\)\]\((madora-drawing:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\)$/i;
const imageClipboardPluginKey = new PluginKey<ImageClipboardPluginState>("markweaveImageClipboard");
let clipboardImageSequence = 0;

function nextClipboardImageId() {
  clipboardImageSequence += 1;
  return `markweave-clipboard-image-${clipboardImageSequence}`;
}

function normalizeRemoteImageUrl(input: string, requireImageExtension: boolean) {
  const trimmed = input.trim();

  if (!trimmed || /[\r\n]/.test(trimmed)) {
    return null;
  }

  if (!requireImageExtension && /^madora-asset:\/\/[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (requireImageExtension) {
      const extension = url.pathname.split(".").at(-1)?.toLowerCase();

      if (!extension || !remoteImageExtensions.has(extension)) {
        return null;
      }
    }

    return url.toString();
  } catch {
    return null;
  }
}

function isImageOnlyHtmlNode(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return !(node.textContent ?? "").trim();
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    return true;
  }

  if (!(node instanceof Element)) {
    return false;
  }

  if (node.tagName === "IMG" || node.tagName === "BR") {
    return true;
  }

  return imageOnlyWrapperTags.has(node.tagName) && Array.from(node.childNodes).every(isImageOnlyHtmlNode);
}

function parseImageOnlyHtml(html: string): readonly MarkweaveClipboardImageCandidate[] | null {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const images = Array.from(body.querySelectorAll("img[src]"));

  if (!images.length || !Array.from(body.childNodes).every(isImageOnlyHtmlNode)) {
    return null;
  }

  const candidates: Array<Extract<MarkweaveClipboardImageCandidate, { readonly type: "remote" }> | null> = images.map((image) => {
    const src = normalizeRemoteImageUrl(image.getAttribute("src") ?? "", false);

    return src
      ? {
          type: "remote" as const,
          src,
          alt: image.getAttribute("alt") || undefined,
          title: image.getAttribute("title") || undefined,
        }
      : null;
  });

  return candidates.every((candidate) => candidate !== null)
    ? candidates.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    : null;
}

function parseMadoraDrawingReference(input: string): MarkweaveClipboardImageCandidate | null {
  const match = madoraDrawingReferencePattern.exec(input.trim());

  if (!match) {
    return null;
  }

  return {
    type: "remote",
    src: match[2]!,
    alt: match[1]!.replace(/\\([\\[\]])/g, "$1"),
    title: match[3]!,
  };
}

export function sanitizeMarkweavePastedImageHtml(html: string) {
  if (!html.trim()) {
    return html;
  }

  const body = new DOMParser().parseFromString(html, "text/html").body;

  for (const image of body.querySelectorAll("img[src]")) {
    const src = normalizeRemoteImageUrl(image.getAttribute("src") ?? "", false);

    if (!src) {
      image.remove();
      continue;
    }

    image.setAttribute("src", src);
  }

  return body.innerHTML;
}

export function parseMarkweaveClipboardImages(clipboardData: MarkweaveClipboardData): readonly MarkweaveClipboardImageCandidate[] {
  const imageFiles = Array.from(clipboardData.files ?? []).filter((file) => file.type.toLowerCase().startsWith("image/"));

  if (imageFiles.length) {
    return imageFiles.map((file) => ({ type: "file", file }));
  }

  const html = clipboardData.getData("text/html");

  if (html.trim()) {
    return parseImageOnlyHtml(html) ?? [];
  }

  const text = clipboardData.getData("text/plain");
  const drawingReference = parseMadoraDrawingReference(text);

  if (drawingReference) {
    return [drawingReference];
  }

  const src = normalizeRemoteImageUrl(text, true);
  return src ? [{ type: "remote", src }] : [];
}

function removePendingClipboardImage(view: EditorView, id: string) {
  if (view.isDestroyed) {
    return;
  }

  view.dispatch(view.state.tr.setMeta(imageClipboardPluginKey, { type: "remove", id } satisfies ImageClipboardPluginMeta).setMeta("addToHistory", false));
}

function resolvePendingClipboardImage(view: EditorView, id: string, result: MarkweaveUploadResult) {
  if (view.isDestroyed) {
    return;
  }

  const pos = imageClipboardPluginKey.getState(view.state)?.pending.get(id);

  if (pos === undefined) {
    return;
  }

  const node = view.state.doc.nodeAt(pos);

  if (!node || node.type.name !== "image" || node.attrs.src) {
    removePendingClipboardImage(view, id);
    return;
  }

  const tr = view.state.tr
    .setNodeMarkup(pos, undefined, {
      ...node.attrs,
      ...attrsFromMarkweaveImageUploadResult(node.attrs, result),
    })
    .setMeta(imageClipboardPluginKey, { type: "remove", id } satisfies ImageClipboardPluginMeta)
    .setMeta("addToHistory", false);
  view.dispatch(tr);
}

function insertClipboardImages(
  view: EditorView,
  candidates: readonly MarkweaveClipboardImageCandidate[],
  onUpload?: MarkweaveSlashCommandUploadHandler,
) {
  const imageType = view.state.schema.nodes.image;

  if (!imageType || !candidates.length) {
    return false;
  }

  const pendingFiles: Array<{ readonly id: string; readonly file: File }> = [];
  const nodes = candidates.map((candidate) => {
    if (candidate.type === "remote") {
      return imageType.create({
        src: candidate.src,
        alt: candidate.alt,
        title: candidate.title,
        align: "center",
      });
    }

    const id = nextClipboardImageId();
    pendingFiles.push({ id, file: candidate.file });
    return imageType.create({
      src: null,
      align: "center",
      clipboardPasteId: id,
    });
  });
  const tr = view.state.tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0)).scrollIntoView();
  const pendingIds = new Set(pendingFiles.map(({ id }) => id));
  const pendingEntries: PendingClipboardImage[] = [];

  tr.doc.descendants((node, pos) => {
    const id = typeof node.attrs.clipboardPasteId === "string" ? node.attrs.clipboardPasteId : null;

    if (!id || !pendingIds.has(id)) {
      return true;
    }

    pendingEntries.push({ id, pos });
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, clipboardPasteId: null });
    return false;
  });

  if (pendingEntries.length) {
    tr.setMeta(imageClipboardPluginKey, { type: "register", entries: pendingEntries } satisfies ImageClipboardPluginMeta);
  }

  view.dispatch(tr);

  for (const { id, file } of pendingFiles) {
    void resolveMarkweaveUploadResult(
      createMarkweaveImageUploadRequest({ type: "file", file, mimeType: file.type || "image/*" }, "image-insert"),
      onUpload,
    ).then(
      (result) => resolvePendingClipboardImage(view, id, result),
      () => removePendingClipboardImage(view, id),
    );
  }

  return true;
}

export const MarkweaveImageClipboard = Extension.create<MarkweaveImageClipboardOptions>({
  name: "markweaveImageClipboard",
  priority: 1000,

  addOptions() {
    return {
      onUpload: undefined,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: ["image"],
        attributes: {
          clipboardPasteId: {
            default: null,
            rendered: false,
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    const onUpload = this.options.onUpload;

    return [
      new Plugin<ImageClipboardPluginState>({
        key: imageClipboardPluginKey,
        state: {
          init() {
            return { pending: new Map() };
          },
          apply(tr, pluginState) {
            const pending = new Map<string, number>();

            for (const [id, pos] of pluginState.pending) {
              const mapped = tr.mapping.mapResult(pos, 1);

              if (!mapped.deleted) {
                pending.set(id, mapped.pos);
              }
            }

            const meta = tr.getMeta(imageClipboardPluginKey) as ImageClipboardPluginMeta | undefined;

            if (meta?.type === "register") {
              for (const entry of meta.entries) {
                pending.set(entry.id, entry.pos);
              }
            } else if (meta?.type === "remove") {
              pending.delete(meta.id);
            }

            return { pending };
          },
        },
        props: {
          transformPastedHTML(html) {
            return sanitizeMarkweavePastedImageHtml(html);
          },
          handlePaste(view, event) {
            if (!view.editable || !event.clipboardData) {
              return false;
            }

            const candidates = parseMarkweaveClipboardImages(event.clipboardData);

            if (!insertClipboardImages(view, candidates, onUpload)) {
              return false;
            }

            event.preventDefault();
            return true;
          },
        },
      }),
    ];
  },
});
