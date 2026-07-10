import type { Editor } from "@tiptap/core";
import { useEffect, useRef } from "react";
import type { MarkweaveMessages } from "markweave/internal/i18n";
import {
  observeMarkweaveInnerTocContainerPosition,
  scrollToMarkweaveTocItem,
  type MarkweaveInnerTocPlacement,
  type MarkweaveTocItem,
  type MarkweaveTocState,
} from "markweave/internal/core/toc-state";

export interface MarkweaveInnerTocProps {
  readonly editor: Editor;
  readonly state: MarkweaveTocState;
  readonly messages: MarkweaveMessages;
  readonly editable: boolean;
  readonly placement: MarkweaveInnerTocPlacement;
}

function getItemLabel(messages: MarkweaveMessages, item: MarkweaveTocItem) {
  return `${messages.toc.itemAriaLabel}: ${item.text}`;
}

export function MarkweaveInnerToc({ editor, state, messages, editable, placement }: MarkweaveInnerTocProps) {
  const tocElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (placement !== "container" || !tocElement.current) {
      return undefined;
    }

    return observeMarkweaveInnerTocContainerPosition(tocElement.current);
  }, [placement]);

  if (!state.items.length) {
    return null;
  }

  const handleSelect = (item: MarkweaveTocItem) => {
    scrollToMarkweaveTocItem(editor, item, {
      behavior: "smooth",
      focus: editable,
    });
  };

  return (
    <nav ref={tocElement} className="markweave-inner-toc" data-testid="markweave-inner-toc" aria-label={messages.toc.ariaLabel}>
      <div className="markweave-inner-toc-rail" aria-hidden="true">
        {state.items.map((item) => (
          <span key={item.id} data-level={item.level} data-active={item.active ? "true" : "false"} />
        ))}
      </div>
      <div className="markweave-inner-toc-panel">
        <div className="markweave-inner-toc-list">
          {state.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="markweave-inner-toc-item"
              data-level={item.level}
              data-active={item.active ? "true" : "false"}
              aria-current={item.active ? "location" : undefined}
              aria-label={getItemLabel(messages, item)}
              title={item.text}
              onClick={() => handleSelect(item)}
            >
              {item.text}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
