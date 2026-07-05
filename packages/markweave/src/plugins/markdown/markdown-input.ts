import { Extension, InputRule } from "@tiptap/core";
import { isEditorComposing } from "../../editor-core/composition-guard";

const markdownImageInputRegex = /(?:^|\s)(!\[([^\]\n]*)\]\(((?!(?:javascript|data|vbscript):)[^)\s]+)\))$/i;
const markdownLinkInputRegex = /(?:^|\s)(\[([^\]\n]+)\]\(([^)\s]+)\))$/;
const markdownDocLinkInputRegex = /(?:^|\s)(\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\])$/;
const unsafeHrefProtocolRegex = /^(?:javascript|data|vbscript):/i;

export function normalizeMarkdownLinkHref(href: string) {
  const trimmedHref = href.trim();

  if (!trimmedHref || unsafeHrefProtocolRegex.test(trimmedHref)) {
    return null;
  }

  return trimmedHref;
}

export function normalizeMarkdownImageSrc(src: string) {
  const trimmedSrc = src.trim();

  if (!trimmedSrc || unsafeHrefProtocolRegex.test(trimmedSrc)) {
    return null;
  }

  return trimmedSrc;
}

export function normalizeMarkdownDocLinkHref(target: string) {
  const trimmedTarget = target.trim();

  if (!trimmedTarget) {
    return null;
  }

  return `markweave://doc/${encodeURIComponent(trimmedTarget)}`;
}

export const MarkweaveMarkdownInput = Extension.create({
  name: "markweaveMarkdownInput",
  priority: 970,

  addInputRules() {
    const imageNode = this.editor.schema.nodes.image;
    const linkMark = this.editor.schema.marks.link;
    const inputRules: InputRule[] = [];

    if (imageNode) {
      inputRules.push(
        new InputRule({
          find: markdownImageInputRegex,
          handler: ({ state, range, match }) => {
            if (isEditorComposing(state)) {
              return null;
            }

            const fullMatch = match[0];
            const alt = match[2] ?? "";
            const src = normalizeMarkdownImageSrc(match[3]);

            if (!src) {
              return null;
            }

            const startSpaces = fullMatch.search(/\S/);
            const imageStart = range.from + startSpaces;
            const { tr } = state;

            tr.replaceRangeWith(imageStart, range.to, imageNode.create({ src, alt }));
          },
        }),
      );
    }

    if (!linkMark) {
      return inputRules;
    }

    inputRules.push(
      new InputRule({
        find: markdownDocLinkInputRegex,
        handler: ({ state, range, match }) => {
          if (isEditorComposing(state)) {
            return null;
          }

          const fullMatch = match[0];
          const target = match[2];
          const alias = match[3]?.trim();
          const href = target ? normalizeMarkdownDocLinkHref(target) : null;
          const linkText = alias || target?.trim();

          if (!href || !linkText) {
            return null;
          }

          const startSpaces = fullMatch.search(/\S/);
          const linkStart = range.from + startSpaces;
          const linkEnd = linkStart + linkText.length;
          const { tr } = state;

          tr.insertText(linkText, linkStart, range.to);
          tr.addMark(linkStart, linkEnd, linkMark.create({ href }));
          tr.removeStoredMark(linkMark);
        },
      }),
    );

    inputRules.push(
      new InputRule({
        find: markdownLinkInputRegex,
        handler: ({ state, range, match }) => {
          if (isEditorComposing(state)) {
            return null;
          }

          const fullMatch = match[0];
          const linkText = match[2];
          const href = normalizeMarkdownLinkHref(match[3]);

          if (!linkText || !href) {
            return null;
          }

          const startSpaces = fullMatch.search(/\S/);
          const linkStart = range.from + startSpaces;
          const linkEnd = linkStart + linkText.length;
          const { tr } = state;

          tr.insertText(linkText, linkStart, range.to);
          tr.addMark(linkStart, linkEnd, linkMark.create({ href }));
          tr.removeStoredMark(linkMark);
        },
      }),
    );

    return inputRules;
  },
});
