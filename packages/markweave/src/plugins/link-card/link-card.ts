import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface MarkweaveLinkCardMetadata {
  readonly title?: string;
  readonly description?: string;
  readonly siteName?: string;
  readonly imageUrl?: string;
  readonly faviconUrl?: string;
}

export interface MarkweaveLinkCardResolveRequest {
  readonly href: string;
  readonly title: string;
  readonly signal: AbortSignal;
}

export type MarkweaveLinkCardResolver = (request: MarkweaveLinkCardResolveRequest) => Promise<MarkweaveLinkCardMetadata | null>;

export interface MarkweaveLinkCardAttrs extends Required<Pick<MarkweaveLinkCardMetadata, "title">> {
  readonly href: string;
  readonly description: string | null;
  readonly siteName: string | null;
  readonly imageUrl: string | null;
  readonly faviconUrl: string | null;
}

export interface MarkweaveLinkCardTarget {
  readonly from: number;
  readonly to: number;
  readonly href: string;
  readonly title: string;
}

const maxTitleLength = 240;
const maxDescriptionLength = 640;
const maxSiteNameLength = 120;

function compactText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

export function normalizeMarkweaveLinkCardHref(value: unknown) {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizeMarkweaveLinkCardMediaUrl(value: unknown) {
  return normalizeMarkweaveLinkCardHref(value);
}

export function normalizeMarkweaveLinkCardAttrs(value: {
  readonly href?: unknown;
  readonly title?: unknown;
  readonly description?: unknown;
  readonly siteName?: unknown;
  readonly imageUrl?: unknown;
  readonly faviconUrl?: unknown;
}): MarkweaveLinkCardAttrs | null {
  const href = normalizeMarkweaveLinkCardHref(value.href);
  if (!href) return null;

  const title = compactText(value.title, maxTitleLength) || href;
  return {
    href,
    title,
    description: compactText(value.description, maxDescriptionLength) || null,
    siteName: compactText(value.siteName, maxSiteNameLength) || null,
    imageUrl: normalizeMarkweaveLinkCardMediaUrl(value.imageUrl),
    faviconUrl: normalizeMarkweaveLinkCardMediaUrl(value.faviconUrl),
  };
}

function getLinkMark(node: ProseMirrorNode) {
  return node.marks.find((mark) => mark.type.name === "link") ?? null;
}

export function getMarkweaveLinkCardTargetAtPos(editor: Editor, pos: number): MarkweaveLinkCardTarget | null {
  const safePos = Math.max(0, Math.min(pos, editor.state.doc.content.size));
  const $pos = editor.state.doc.resolve(safePos);

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const parent = $pos.node(depth);
    if (parent.type.name !== "paragraph" || parent.childCount !== 1) continue;

    const child = parent.firstChild;
    if (!child?.isText || !child.text) continue;
    const link = getLinkMark(child);
    const href = normalizeMarkweaveLinkCardHref(link?.attrs.href);
    if (!href) continue;

    const from = $pos.before(depth);
    return {
      from,
      to: from + parent.nodeSize,
      href,
      title: child.text,
    };
  }

  return null;
}

export function replaceMarkweaveLinkWithCard(editor: Editor, target: MarkweaveLinkCardTarget, metadata: MarkweaveLinkCardMetadata = {}) {
  const attrs = normalizeMarkweaveLinkCardAttrs({ href: target.href, title: target.title, ...metadata });
  const nodeType = editor.schema.nodes.markweaveLinkCard;
  if (!attrs || !nodeType) return false;

  editor.view.dispatch(editor.state.tr.replaceWith(target.from, target.to, nodeType.create(attrs)));
  return true;
}

export function updateMarkweaveLinkCard(editor: Editor, pos: number, attrs: Partial<MarkweaveLinkCardMetadata> & { readonly href?: unknown; readonly title?: unknown }) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "markweaveLinkCard") return false;
  const normalized = normalizeMarkweaveLinkCardAttrs({ ...node.attrs, ...attrs });
  if (!normalized) return false;

  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, normalized));
  return true;
}

export function replaceMarkweaveLinkCardWithLink(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  const href = node ? normalizeMarkweaveLinkCardHref(node.attrs.href) : null;
  const title = node ? compactText(node.attrs.title, maxTitleLength) || href : null;
  if (!node || node.type.name !== "markweaveLinkCard" || !href || !title) return false;

  const linkMark = editor.schema.marks.link;
  const paragraph = editor.schema.nodes.paragraph;
  if (!linkMark || !paragraph) return false;

  const text = editor.schema.text(title, [linkMark.create({ href })]);
  editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + node.nodeSize, paragraph.create(null, text)));
  return true;
}

export function removeMarkweaveLinkFromTarget(editor: Editor, target: MarkweaveLinkCardTarget) {
  const paragraph = editor.state.doc.nodeAt(target.from);
  if (!paragraph || paragraph.type.name !== "paragraph") return false;
  editor.view.dispatch(editor.state.tr.removeMark(target.from + 1, target.to - 1, editor.schema.marks.link));
  return true;
}

export function getMarkweaveLinkCardMarkdown(attrs: Pick<MarkweaveLinkCardAttrs, "href" | "title">) {
  const href = normalizeMarkweaveLinkCardHref(attrs.href);
  const title = compactText(attrs.title, maxTitleLength) || href;
  return href && title ? `[${title}](${href})` : "";
}
