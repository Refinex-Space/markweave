import type { JSONContent } from "@tiptap/core";
import { normalizeMarkdownLinkHref } from "./markdown-input";

const cssColorPattern = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([0-9.%\s,/-]+\)|[a-z]+)$/i;
const textAlignmentValues = new Set(["left", "center", "right", "justify"]);

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

export function normalizeMarkweaveHtmlColor(value: unknown) {
  const color = typeof value === "string" ? value.trim() : "";
  return cssColorPattern.test(color) ? color : null;
}

function renderMarkweaveMarks(content: string, marks: readonly { type: string; attrs?: Record<string, unknown> }[] = []) {
  return marks.reduceRight((result, mark) => {
    if (mark.type === "bold") return `<strong>${result}</strong>`;
    if (mark.type === "italic") return `<em>${result}</em>`;
    if (mark.type === "strike") return `<s>${result}</s>`;
    if (mark.type === "underline") return `<u>${result}</u>`;
    if (mark.type === "code") return `<code>${result}</code>`;
    if (mark.type === "subscript") return `<sub>${result}</sub>`;
    if (mark.type === "superscript") return `<sup>${result}</sup>`;

    if (mark.type === "link") {
      const href = normalizeMarkdownLinkHref(String(mark.attrs?.href ?? ""));
      return href ? `<a href="${escapeHtml(href)}">${result}</a>` : result;
    }

    if (mark.type === "textStyle") {
      const color = normalizeMarkweaveHtmlColor(mark.attrs?.color);
      return color ? `<span style="color: ${escapeHtml(color)}">${result}</span>` : result;
    }

    if (mark.type === "highlight") {
      const color = normalizeMarkweaveHtmlColor(mark.attrs?.color);
      return color
        ? `<mark data-color="${escapeHtml(color)}" style="background-color: ${escapeHtml(color)}; color: inherit">${result}</mark>`
        : `<mark>${result}</mark>`;
    }

    return result;
  }, content);
}

function renderHtmlAttributes(attributes: Record<string, unknown>, names: readonly string[]) {
  return names
    .map((name) => {
      const value = attributes[name];
      return typeof value === "number" && value > 1 ? ` ${name}="${value}"` : "";
    })
    .join("");
}

function renderTextAlignment(attributes: Record<string, unknown> = {}) {
  const alignment = typeof attributes.textAlign === "string" ? attributes.textAlign : "";
  return textAlignmentValues.has(alignment) && alignment !== "left" ? ` style="text-align: ${alignment}"` : "";
}

export function renderMarkweaveHtmlFallback(node: JSONContent): string {
  const children = () => (node.content ?? []).map(renderMarkweaveHtmlFallback).join("");

  if (node.type === "text") {
    return renderMarkweaveMarks(escapeHtml(node.text ?? ""), node.marks as readonly { type: string; attrs?: Record<string, unknown> }[] | undefined);
  }

  if (node.type === "hardBreak") return "<br>";
  if (node.type === "paragraph") return `<p${renderTextAlignment(node.attrs)}>${children()}</p>`;
  if (node.type === "heading") return `<h${Math.min(6, Math.max(1, Number(node.attrs?.level) || 1))}${renderTextAlignment(node.attrs)}>${children()}</h${Math.min(6, Math.max(1, Number(node.attrs?.level) || 1))}>`;
  if (node.type === "bulletList") return `<ul>${children()}</ul>`;
  if (node.type === "orderedList") return `<ol>${children()}</ol>`;
  if (node.type === "listItem") return `<li>${children()}</li>`;
  if (node.type === "table") return `<table><tbody>${children()}</tbody></table>`;
  if (node.type === "tableRow") return `<tr>${children()}</tr>`;
  if (node.type === "tableHeader") return `<th${renderHtmlAttributes(node.attrs ?? {}, ["colspan", "rowspan"])}>${children()}</th>`;
  if (node.type === "tableCell") return `<td${renderHtmlAttributes(node.attrs ?? {}, ["colspan", "rowspan"])}>${children()}</td>`;

  return children();
}

export function needsMarkweaveTableHtmlFallback(node: JSONContent) {
  let requiresFallback = false;
  const visit = (current: JSONContent) => {
    if (requiresFallback) return;

    if ((current.type === "tableCell" || current.type === "tableHeader") && ((Number(current.attrs?.colspan) || 1) > 1 || (Number(current.attrs?.rowspan) || 1) > 1)) {
      requiresFallback = true;
      return;
    }

    current.content?.forEach(visit);
  };

  visit(node);
  return requiresFallback;
}
