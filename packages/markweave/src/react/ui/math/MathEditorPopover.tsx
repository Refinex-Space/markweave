import type { Editor } from "@tiptap/react";
import { Check, Code2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { MarkweaveMessages } from "../../../i18n";
import {
  applyMarkweaveMathLatex,
  calculateMarkweaveMathPopoverPosition,
  getMarkweaveMathAnchorRect,
  getMarkweaveMathBlockIndex,
  getMarkweaveMathRenderedHtml,
  renderMarkweaveMathPreview,
  setMarkweaveMathEditingDomState,
  type MarkweaveMathPopoverPosition,
  type MarkweaveMathTarget,
} from "../../../plugins/math/math-ui-model";

export interface MathEditorPopoverProps {
  readonly editor: Editor;
  readonly messages: MarkweaveMessages;
  readonly target: MarkweaveMathTarget;
  readonly onClose: () => void;
}

export function MathEditorPopover({ editor, messages, onClose, target }: MathEditorPopoverProps) {
  const popoverRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(target.latex);
  const [position, setPosition] = useState<MarkweaveMathPopoverPosition | null>(null);
  const mathMessages = messages.math;
  const blockNumber = useMemo(() => getMarkweaveMathBlockIndex(editor, target) ?? 1, [editor, target]);
  const renderedPreviewHtml = useMemo(() => getMarkweaveMathRenderedHtml(editor, target), [editor, target]);
  const preview = useMemo(() => {
    if (value === target.latex && renderedPreviewHtml) {
      return { html: renderedPreviewHtml, error: false };
    }

    return renderMarkweaveMathPreview(value, target.kind, editor);
  }, [editor, renderedPreviewHtml, target.kind, target.latex, value]);
  const canApply = value.trim().length > 0;

  const updatePosition = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const anchorRect = getMarkweaveMathAnchorRect(editor, target);
    const frameRect = editor.view.dom.closest(".markweave-editor-frame")?.getBoundingClientRect();

    if (!anchorRect || !frameRect) {
      onClose();
      return;
    }

    setPosition(
      calculateMarkweaveMathPopoverPosition({
        anchorRect,
        frameRect,
        kind: target.kind,
        latex: value,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      }),
    );
  }, [editor, onClose, target, value]);

  useEffect(() => {
    setValue(target.latex);
  }, [target.latex, target.pos]);

  useEffect(() => {
    setMarkweaveMathEditingDomState(editor, target, true);
    updatePosition();
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
      updatePosition();
    });

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      setMarkweaveMathEditingDomState(editor, target, false);
    };
  }, [editor, onClose, target, updatePosition]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const eventTarget = event.target;

      if (!(eventTarget instanceof Node)) {
        return;
      }

      if (popoverRef.current?.contains(eventTarget)) {
        return;
      }

      const mathElement = eventTarget instanceof Element ? eventTarget.closest(".tiptap-mathematics-render") : null;
      if (mathElement) {
        return;
      }

      onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onClose]);

  const apply = useCallback(() => {
    if (!canApply) {
      return;
    }

    if (applyMarkweaveMathLatex(editor, target, value)) {
      onClose();
    }
  }, [canApply, editor, onClose, target, value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      editor.commands.focus();
      return;
    }

    if (event.key === "Enter" && (target.kind === "inline" || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      apply();
    }
  };

  const style: CSSProperties | undefined = position
    ? {
        left: position.left,
        top: position.top,
        width: position.width,
      }
    : undefined;
  const title = target.kind === "block" ? mathMessages.blockTitle : mathMessages.inlineTitle;

  if (target.kind === "inline") {
    return (
      <form
        ref={popoverRef}
        aria-label={title}
        className="markweave-math-editor-popover markweave-math-editor-popover--inline"
        data-kind="inline"
        data-placement={position?.placement ?? "bottom"}
        data-testid="markweave-math-editor-popover"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
        style={style}
      >
        <label className="markweave-math-inline-source" data-testid="markweave-math-inline-source">
          <span aria-hidden="true">$</span>
          <input
            ref={inputRef as never}
            aria-label={mathMessages.latexLabel}
            data-testid="markweave-math-editor-input"
            onChange={(event) => setValue(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder={mathMessages.latexPlaceholder}
            size={Math.max(value.length, 1)}
            spellCheck={false}
            value={value}
          />
          <span aria-hidden="true">$</span>
        </label>
        <div className="markweave-math-inline-preview" data-error={preview.error ? "true" : "false"} data-testid="markweave-math-editor-preview">
          <div dangerouslySetInnerHTML={{ __html: preview.html || "&nbsp;" }} />
          {preview.error ? <small>{mathMessages.invalidPreview}</small> : null}
        </div>
      </form>
    );
  }

  return (
    <form
      ref={popoverRef}
      aria-label={title}
      className="markweave-math-editor-popover markweave-math-editor-popover--block"
      data-kind={target.kind}
      data-placement={position?.placement ?? "bottom"}
      data-testid="markweave-math-editor-popover"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      style={style}
    >
      <div className="markweave-math-block-toolbar">
        <span>{mathMessages.label}</span>
        <Code2 aria-hidden="true" size={15} strokeWidth={1.75} />
        <button aria-label={mathMessages.apply} data-testid="markweave-math-editor-apply" disabled={!canApply} title={mathMessages.apply} type="submit">
          <Check aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      </div>
      <label className="markweave-math-block-source" data-testid="markweave-math-block-source">
        <span aria-hidden="true">$$</span>
        <textarea
          ref={inputRef as never}
          aria-label={mathMessages.latexLabel}
          data-testid="markweave-math-editor-input"
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder={mathMessages.latexPlaceholder}
          rows={3}
          spellCheck={false}
          value={value}
        />
        <span aria-hidden="true">$$</span>
      </label>
      <div
        className="markweave-math-block-preview"
        data-error={preview.error ? "true" : "false"}
        data-math-number={String(blockNumber)}
        data-testid="markweave-math-editor-preview"
      >
        <div dangerouslySetInnerHTML={{ __html: preview.html || "&nbsp;" }} />
        {preview.error ? <small>{mathMessages.invalidPreview}</small> : null}
      </div>
    </form>
  );
}
