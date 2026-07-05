import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

export const markweaveIndentNodeTypes = ["paragraph", "heading"] as const;
export const markweaveIndentMaxLevel = 7;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    markweaveIndent: {
      setMarkweaveIndent: (level: number) => ReturnType;
      increaseMarkweaveIndent: () => ReturnType;
      decreaseMarkweaveIndent: () => ReturnType;
    };
  }
}

export function normalizeMarkweaveIndentLevel(value: unknown) {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : 0;

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(markweaveIndentMaxLevel, Math.max(0, numericValue));
}

export const MarkweaveIndent = Extension.create({
  name: "markweaveIndent",

  addGlobalAttributes() {
    return [
      {
        types: [...markweaveIndentNodeTypes],
        attributes: {
          markweaveIndentLevel: {
            default: 0,
            parseHTML: (element) => normalizeMarkweaveIndentLevel(element.getAttribute("data-markweave-indent-level")),
            renderHTML: (attributes) => {
              const level = normalizeMarkweaveIndentLevel(attributes.markweaveIndentLevel);

              if (level <= 0) {
                return {};
              }

              return {
                "data-markweave-indent-level": String(level),
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setMarkweaveIndent:
        (level) =>
        ({ dispatch, state }) => {
          const indentLevel = normalizeMarkweaveIndentLevel(level);
          const { from, to } = state.selection;
          const tr = state.tr;
          let changed = false;
          let visited = false;

          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!markweaveIndentNodeTypes.includes(node.type.name as (typeof markweaveIndentNodeTypes)[number])) {
              return true;
            }

            visited = true;

            if (normalizeMarkweaveIndentLevel(node.attrs.markweaveIndentLevel) === indentLevel) {
              return false;
            }

            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              markweaveIndentLevel: indentLevel,
            });
            changed = true;
            return false;
          });

          if (!visited) {
            const currentBlock = findCurrentIndentBlock(state);

            if (currentBlock && normalizeMarkweaveIndentLevel(currentBlock.node.attrs.markweaveIndentLevel) !== indentLevel) {
              tr.setNodeMarkup(currentBlock.pos, undefined, {
                ...currentBlock.node.attrs,
                markweaveIndentLevel: indentLevel,
              });
              changed = true;
            }
          }

          if (!changed) {
            return false;
          }

          dispatch?.(tr);
          return true;
        },
      increaseMarkweaveIndent:
        () =>
        ({ commands, state }) => {
          const currentLevel = getSelectionIndentLevel(state);
          return commands.setMarkweaveIndent(currentLevel + 1);
        },
      decreaseMarkweaveIndent:
        () =>
        ({ commands, state }) => {
          const currentLevel = getSelectionIndentLevel(state);
          return commands.setMarkweaveIndent(currentLevel - 1);
        },
    };
  },
});

function getSelectionIndentLevel(state: EditorState) {
  let indentLevel = 0;
  const { from, to } = state.selection;

  state.doc.nodesBetween(from, to, (node) => {
    if (!markweaveIndentNodeTypes.includes(node.type.name as (typeof markweaveIndentNodeTypes)[number])) {
      return true;
    }

    indentLevel = normalizeMarkweaveIndentLevel(node.attrs.markweaveIndentLevel);
    return false;
  });

  if (indentLevel > 0) {
    return indentLevel;
  }

  const currentBlock = findCurrentIndentBlock(state);
  return currentBlock ? normalizeMarkweaveIndentLevel(currentBlock.node.attrs.markweaveIndentLevel) : 0;
}

function findCurrentIndentBlock(state: EditorState) {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);

    if (markweaveIndentNodeTypes.includes(node.type.name as (typeof markweaveIndentNodeTypes)[number])) {
      return {
        node,
        pos: depth === 0 ? 0 : $from.before(depth),
      };
    }
  }

  return null;
}
