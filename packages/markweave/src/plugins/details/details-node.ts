import { findParentNode, mergeAttributes, Node, type Editor, type JSONContent, type MarkdownToken } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type Selection } from "@tiptap/pm/state";
import { type ViewMutationRecord } from "@tiptap/pm/view";

export const MARKWEAVE_DETAILS_NAME = "markweaveDetails";
export const MARKWEAVE_DETAILS_SUMMARY_NAME = "markweaveDetailsSummary";

export const markweaveDetailsMarkdownLookahead = 8_192;
export const markweaveDetailsMarkdownBodyLimit = 32_768;

export interface MarkweaveDetailsOptions {
  readonly expandLabel: string;
  readonly collapseLabel: string;
}

const detailsSelectionPluginKey = new PluginKey("markweaveDetailsSelection");

const detailsOpeningPattern = /^:::details(\{open\})?[ \t]*([^\n]*?)[ \t]*(?:\n|$)/;
const detailsOpeningStartPattern = /^:::details(?:\{open\})?(?:\s|$)/m;
const detailsFenceOpenPattern = /^(```+|~~~+)/;
const detailsContainerOpenPattern = /^:::[A-Za-z]/;
const detailsContainerClosePattern = /^:::\s*$/;

export function isMarkweaveDetailsOpen(value: unknown) {
  return value === true || value === "true" || value === "";
}

export function createMarkweaveDetailsContent(options: { readonly open?: boolean; readonly summary?: string } = {}): JSONContent {
  const summaryText = options.summary?.trim() ?? "";
  return {
    type: MARKWEAVE_DETAILS_NAME,
    attrs: { open: options.open !== false },
    content: [
      {
        type: MARKWEAVE_DETAILS_SUMMARY_NAME,
        ...(summaryText ? { content: [{ type: "text", text: summaryText }] } : {}),
      },
      { type: "paragraph" },
    ],
  };
}

function flattenMarkdownTitle(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function findMatchingDetailsClose(source: string, bodyStart: number) {
  const limit = Math.min(source.length, bodyStart + markweaveDetailsMarkdownBodyLimit);
  let depth = 1;
  let index = bodyStart;
  let fence: string | null = null;

  while (index < limit) {
    const newline = source.indexOf("\n", index);
    const lineEnd = newline === -1 ? source.length : newline + 1;
    const line = source.slice(index, newline === -1 ? source.length : newline);

    if (fence) {
      if (line.startsWith(fence)) {
        fence = null;
      }
    } else {
      const fenceMatch = detailsFenceOpenPattern.exec(line);
      if (fenceMatch) {
        fence = fenceMatch[1] ?? null;
      } else if (detailsContainerOpenPattern.test(line)) {
        depth += 1;
      } else if (detailsContainerClosePattern.test(line)) {
        depth -= 1;
        if (depth === 0) {
          return { closeStart: index, closeEnd: lineEnd };
        }
      }
    }

    if (newline === -1) {
      break;
    }
    index = lineEnd;
  }

  return null;
}

function findDetailsSelection(selection: Selection) {
  return findParentNode((node) => node.type.name === MARKWEAVE_DETAILS_NAME)(selection);
}

function firstHiddenDetailsPosition(detailsPos: number, detailsNode: ProseMirrorNode) {
  const summary = detailsNode.firstChild;
  if (!summary || summary.type.name !== MARKWEAVE_DETAILS_SUMMARY_NAME) {
    return detailsPos + 2;
  }
  return detailsPos + 1 + summary.nodeSize;
}

function summaryEndPosition(detailsPos: number, detailsNode: ProseMirrorNode) {
  return Math.max(detailsPos + 2, firstHiddenDetailsPosition(detailsPos, detailsNode) - 1);
}

function isHiddenDetailsContentPosition($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== MARKWEAVE_DETAILS_NAME || isMarkweaveDetailsOpen(node.attrs.open)) {
      continue;
    }
    const detailsPos = $pos.before(depth);
    if ($pos.pos >= firstHiddenDetailsPosition(detailsPos, node)) {
      return { pos: detailsPos, node };
    }
  }
  return null;
}

function setDetailsOpen(editor: Editor, detailsPos: number, open: boolean) {
  const current = editor.state.doc.nodeAt(detailsPos);
  if (current?.type.name !== MARKWEAVE_DETAILS_NAME) {
    return false;
  }
  if (isMarkweaveDetailsOpen(current.attrs.open) === open) {
    return true;
  }

  return editor.chain().command(({ tr }) => {
    tr.setNodeMarkup(detailsPos, undefined, { ...current.attrs, open });
    if (!open) {
      const hidden = isHiddenDetailsContentPosition(tr.selection.$from);
      if (hidden && hidden.pos === detailsPos) {
        tr.setSelection(TextSelection.create(tr.doc, summaryEndPosition(detailsPos, current)));
      }
    }
    return true;
  }).run();
}

export function toggleMarkweaveDetailsOpen(editor: Editor, detailsPos?: number) {
  const resolved = typeof detailsPos === "number"
    ? { pos: detailsPos, node: editor.state.doc.nodeAt(detailsPos) }
    : findDetailsSelection(editor.state.selection);

  if (!resolved?.node || resolved.node.type.name !== MARKWEAVE_DETAILS_NAME) {
    return false;
  }

  return setDetailsOpen(editor, resolved.pos, !isMarkweaveDetailsOpen(resolved.node.attrs.open));
}

function enterFromSummary(editor: Editor) {
  const { $from } = editor.state.selection;
  if ($from.parent.type.name !== MARKWEAVE_DETAILS_SUMMARY_NAME) {
    return false;
  }

  const details = $from.node(-1);
  if (details.type.name !== MARKWEAVE_DETAILS_NAME) {
    return false;
  }

  const detailsPos = $from.before(-1);
  const summary = details.firstChild;
  const firstBodyPos = detailsPos + 1 + (summary?.nodeSize ?? 2);

  return editor.chain().command(({ tr }) => {
    if (!isMarkweaveDetailsOpen(details.attrs.open)) {
      tr.setNodeMarkup(detailsPos, undefined, { ...details.attrs, open: true });
    }
    const mappedBodyPos = tr.mapping.map(firstBodyPos);
    if (details.childCount <= 1) {
      const paragraph = editor.state.schema.nodes.paragraph?.createAndFill();
      if (!paragraph) {
        return false;
      }
      tr.insert(mappedBodyPos, paragraph);
      tr.setSelection(TextSelection.create(tr.doc, mappedBodyPos + 1));
      return true;
    }
    tr.setSelection(TextSelection.near(tr.doc.resolve(mappedBodyPos + 1), 1));
    return true;
  }).run();
}

function exitDetails(editor: Editor, details: { readonly pos: number; readonly node: ProseMirrorNode }) {
  const lastChild = details.node.lastChild;
  const lastIsEmptyParagraph = lastChild?.type.name === "paragraph" && lastChild.content.size === 0;
  if (!lastIsEmptyParagraph || details.node.childCount < 2) {
    return false;
  }

  const paragraph = editor.state.schema.nodes.paragraph?.createAndFill();
  if (!paragraph) {
    return false;
  }

  const keepInnerParagraph = details.node.childCount <= 2;
  const lastChildSize = lastChild.nodeSize;
  const detailsEnd = details.pos + details.node.nodeSize;

  return editor.chain().command(({ tr }) => {
    const insertPos = keepInnerParagraph ? detailsEnd : detailsEnd - lastChildSize;
    if (!keepInnerParagraph) {
      tr.delete(detailsEnd - lastChildSize, detailsEnd);
    }
    const mappedInsertPos = tr.mapping.map(insertPos);
    tr.insert(mappedInsertPos, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, mappedInsertPos + 1));
    return true;
  }).run();
}

function unsetDetails(editor: Editor) {
  const details = findDetailsSelection(editor.state.selection);
  if (!details) {
    return false;
  }

  const summary = details.node.firstChild;
  const paragraphType = editor.state.schema.nodes.paragraph;
  if (!summary || summary.type.name !== MARKWEAVE_DETAILS_SUMMARY_NAME || !paragraphType) {
    return false;
  }

  const replacement = [paragraphType.create(null, summary.content)];
  details.node.forEach((child, _offset, index) => {
    if (index > 0) {
      replacement.push(child);
    }
  });

  return editor.chain().command(({ tr }) => {
    tr.replaceWith(details.pos, details.pos + details.node.nodeSize, replacement);
    tr.setSelection(TextSelection.create(tr.doc, details.pos + 1));
    return true;
  }).run();
}

function moveOutOfClosedDetails(editor: Editor, key: "ArrowDown" | "ArrowRight") {
  const { $from, empty } = editor.state.selection;
  if (!empty || $from.parent.type.name !== MARKWEAVE_DETAILS_SUMMARY_NAME) {
    return false;
  }
  const details = $from.node(-1);
  if (details.type.name !== MARKWEAVE_DETAILS_NAME || isMarkweaveDetailsOpen(details.attrs.open)) {
    return false;
  }
  if (key === "ArrowRight" && $from.parentOffset < $from.parent.content.size) {
    return false;
  }

  const after = $from.after(-1);
  return editor.chain().command(({ tr }) => {
    if (tr.doc.nodeAt(after)) {
      tr.setSelection(TextSelection.near(tr.doc.resolve(after), 1));
      return true;
    }
    const paragraph = editor.state.schema.nodes.paragraph?.createAndFill();
    if (!paragraph) {
      return false;
    }
    tr.insert(after, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
    return true;
  }).run();
}

function createDetailsToggleButton(options: MarkweaveDetailsOptions) {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "markweave-details-toggle";
  toggle.tabIndex = -1;
  toggle.setAttribute("data-testid", "markweave-details-toggle");
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  toggle.setAttribute("aria-label", options.expandLabel);
  return toggle;
}

export const MarkweaveDetailsSummary = Node.create({
  name: MARKWEAVE_DETAILS_SUMMARY_NAME,
  markdownTokenName: MARKWEAVE_DETAILS_SUMMARY_NAME,
  content: "inline*",
  defining: true,
  isolating: true,

  parseHTML() {
    return [
      { tag: "div[data-markweave-details-summary]" },
      { tag: "summary" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "markweave-details-summary",
        "data-markweave-details-summary": "true",
      }),
      0,
    ];
  },
});

export const MarkweaveDetails = Node.create<MarkweaveDetailsOptions>({
  name: MARKWEAVE_DETAILS_NAME,
  markdownTokenName: MARKWEAVE_DETAILS_NAME,
  group: "block",
  content: `${MARKWEAVE_DETAILS_SUMMARY_NAME} block+`,
  defining: true,
  isolating: true,
  // GapCursor is provided by the Gapcursor extension; keep closed details from
  // trapping the cursor in hidden body content.
  allowGapCursor: false,

  addOptions() {
    return {
      expandLabel: "Expand details",
      collapseLabel: "Collapse details",
    };
  },

  addAttributes() {
    return {
      open: {
        default: false,
        parseHTML: (element) => element.hasAttribute("open") || element.getAttribute("data-open") === "true",
        renderHTML: (attributes) => ({
          "data-open": isMarkweaveDetailsOpen(attributes.open) ? "true" : "false",
        }),
      },
    };
  },

  parseHTML() {
    return [
      { tag: "div[data-markweave-details]" },
      { tag: "details" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "markweave-details",
        "data-markweave-details": "true",
      }),
      0,
    ];
  },

  markdownTokenizer: {
    name: MARKWEAVE_DETAILS_NAME,
    level: "block",
    start: (src: string) => src.slice(0, markweaveDetailsMarkdownLookahead).search(detailsOpeningStartPattern),
    tokenize: (src: string, _tokens: MarkdownToken[], lexer) => {
      const openingMatch = src.match(detailsOpeningPattern);
      if (!openingMatch) {
        return undefined;
      }

      const bodyStart = openingMatch[0].length;
      const closing = findMatchingDetailsClose(src, bodyStart);
      if (!closing) {
        return undefined;
      }

      const title = flattenMarkdownTitle(openingMatch[2] ?? "");
      const rawContent = src.slice(bodyStart, closing.closeStart);
      return {
        type: MARKWEAVE_DETAILS_NAME,
        raw: src.slice(0, closing.closeEnd),
        open: Boolean(openingMatch[1]),
        summaryTokens: title ? lexer.inlineTokens(title) : [],
        tokens: lexer.blockTokens(rawContent),
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const parseHelpers = helpers as typeof helpers & {
      parseInline?: (tokens: MarkdownToken[]) => JSONContent[];
      parseBlockChildren?: (tokens: MarkdownToken[]) => JSONContent[];
    };
    const summaryTokens = Array.isArray(token.summaryTokens) ? token.summaryTokens as MarkdownToken[] : [];
    const summaryContent = summaryTokens.length
      ? parseHelpers.parseInline?.(summaryTokens) ?? helpers.parseChildren(summaryTokens)
      : undefined;
    const body = parseHelpers.parseBlockChildren?.(token.tokens ?? []) ?? helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode(
      MARKWEAVE_DETAILS_NAME,
      { open: isMarkweaveDetailsOpen(token.open) },
      [
        helpers.createNode(MARKWEAVE_DETAILS_SUMMARY_NAME, {}, summaryContent),
        ...(body.length ? body : [helpers.createNode("paragraph")]),
      ],
    );
  },

  renderMarkdown: (node, helpers) => {
    const children = Array.isArray(node.content) ? node.content : [];
    const summary = children.find((child) => child.type === MARKWEAVE_DETAILS_SUMMARY_NAME);
    const body = children.filter((child) => child.type !== MARKWEAVE_DETAILS_SUMMARY_NAME);
    const title = flattenMarkdownTitle(helpers.renderChildren(summary?.content ?? []));
    const content = helpers.renderChildren(body, "\n\n").trim();
    const openMarker = isMarkweaveDetailsOpen(node.attrs?.open) ? "{open}" : "";
    const heading = title ? `:::details${openMarker} ${title}` : `:::details${openMarker}`;
    return content ? `${heading}\n${content}\n:::` : `${heading}\n:::`;
  },

  addNodeView() {
    return ({ editor, getPos, node, HTMLAttributes }) => {
      const options = this.options;
      const dom = document.createElement("div");
      const attributes = mergeAttributes(HTMLAttributes, {
        class: "markweave-details",
        "data-markweave-details": "true",
      });
      Object.entries(attributes).forEach(([key, value]) => {
        if (value == null || value === false) {
          return;
        }
        dom.setAttribute(key, value === true ? "" : String(value));
      });

      const toggle = createDetailsToggleButton(options);
      const content = document.createElement("div");
      content.className = "markweave-details-body";

      const applyOpen = (open: boolean) => {
        dom.dataset.open = open ? "true" : "false";
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.setAttribute("aria-label", open ? options.collapseLabel : options.expandLabel);
      };

      applyOpen(isMarkweaveDetailsOpen(node.attrs.open));

      const onMouseDown = (event: MouseEvent) => {
        event.preventDefault();
      };
      const onClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") {
          return;
        }
        if (!editor.isEditable) {
          applyOpen(dom.dataset.open !== "true");
          return;
        }
        toggleMarkweaveDetailsOpen(editor, pos);
      };

      toggle.addEventListener("mousedown", onMouseDown);
      toggle.addEventListener("click", onClick);
      dom.append(toggle, content);

      return {
        dom,
        contentDOM: content,
        ignoreMutation(mutation: ViewMutationRecord) {
          if (mutation.type === "selection") {
            return false;
          }
          const target = mutation.target;
          return (target instanceof globalThis.Node && toggle.contains(target)) || target === dom;
        },
        update: (updatedNode) => {
          if (updatedNode.type.name !== MARKWEAVE_DETAILS_NAME) {
            return false;
          }
          applyOpen(isMarkweaveDetailsOpen(updatedNode.attrs.open));
          return true;
        },
        destroy() {
          toggle.removeEventListener("mousedown", onMouseDown);
          toggle.removeEventListener("click", onClick);
        },
      };
    };
  },

  addCommands() {
    return {
      setMarkweaveDetails: () => ({ chain }) => chain().insertContent(createMarkweaveDetailsContent()).run(),
      unsetMarkweaveDetails: () => () => unsetDetails(this.editor),
      toggleMarkweaveDetailsOpen: () => () => toggleMarkweaveDetailsOpen(this.editor),
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { empty, $from } = editor.state.selection;
        if (!empty) {
          return false;
        }
        if ($from.parent.type.name === MARKWEAVE_DETAILS_SUMMARY_NAME) {
          if (!editor.isEditable) {
            const detailsPos = $from.before(-1);
            return toggleMarkweaveDetailsOpen(editor, detailsPos);
          }
          return enterFromSummary(editor);
        }
        if (!editor.isEditable) {
          return false;
        }
        const details = findDetailsSelection(editor.state.selection);
        if (!details || $from.parent.type.name !== "paragraph" || $from.parent.content.size > 0) {
          return false;
        }
        if ($from.node(-1) !== details.node || $from.index(-1) !== details.node.childCount - 1) {
          return false;
        }
        return exitDetails(editor, details);
      },
      Backspace: ({ editor }) => {
        if (!editor.isEditable) {
          return false;
        }
        const { empty, $from } = editor.state.selection;
        if (!empty) {
          return false;
        }
        if ($from.parent.type.name === MARKWEAVE_DETAILS_SUMMARY_NAME) {
          if ($from.parentOffset !== 0) {
            return editor.commands.command(({ tr }) => {
              tr.delete($from.pos - 1, $from.pos);
              return true;
            });
          }
          return unsetDetails(editor);
        }
        if ($from.parentOffset !== 0) {
          return false;
        }
        const details = findDetailsSelection(editor.state.selection);
        if (!details || $from.node(-1) !== details.node || $from.index(-1) !== 1) {
          return false;
        }
        return editor.commands.setTextSelection(summaryEndPosition(details.pos, details.node));
      },
      ArrowDown: ({ editor }) => moveOutOfClosedDetails(editor, "ArrowDown"),
      ArrowRight: ({ editor }) => moveOutOfClosedDetails(editor, "ArrowRight"),
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: detailsSelectionPluginKey,
        appendTransaction: (transactions, _oldState, newState) => {
          if (editor.view.composing || !newState.selection.empty) {
            return null;
          }
          if (!transactions.some((transaction) => transaction.selectionSet)) {
            return null;
          }
          const hidden = isHiddenDetailsContentPosition(newState.selection.$from);
          if (!hidden) {
            return null;
          }
          return newState.tr.setSelection(TextSelection.create(newState.doc, summaryEndPosition(hidden.pos, hidden.node)));
        },
      }),
    ];
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    markweaveDetails: {
      setMarkweaveDetails: () => ReturnType;
      unsetMarkweaveDetails: () => ReturnType;
      toggleMarkweaveDetailsOpen: () => ReturnType;
    };
  }
}
