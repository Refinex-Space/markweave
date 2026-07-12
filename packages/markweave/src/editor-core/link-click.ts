import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { openMarkweaveReadonlyLinkFromEvent } from "./readonly-link";

function getOrdinaryLinkTarget(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return null;

  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  return anchor && !anchor.closest('[data-markweave-link-card="true"]') ? anchor : null;
}

/**
 * Keeps authoring clicks inside the editor while retaining the familiar
 * Ctrl/Cmd-click shortcut for opening an ordinary safe link.
 */
export function handleMarkweaveEditorLinkClick(event: MouseEvent) {
  if (!getOrdinaryLinkTarget(event)) return false;

  event.preventDefault();
  return event.metaKey || event.ctrlKey ? openMarkweaveReadonlyLinkFromEvent(event) : false;
}

export const MarkweaveLinkClick = Extension.create({
  name: "markweaveLinkClick",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClick: (_view, _pos, event) => handleMarkweaveEditorLinkClick(event),
        },
      }),
    ];
  },
});
