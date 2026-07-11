import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Copy, Link2, Pencil, Trash2, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  normalizeMarkweaveLinkCardAttrs,
  normalizeMarkweaveLinkCardHref,
  replaceMarkweaveLinkCardWithLink,
  type MarkweaveLinkCardResolver,
} from "markweave/internal/plugins/link-card/link-card";
import { openMarkweaveLinkCardComposer } from "markweave/internal/plugins/link-card/link-card-composer";
import { MarkweaveLinkCard } from "markweave/internal/plugins/link-card/link-card-node";
import type { MarkweaveLinkCardExtensionOptions } from "markweave/internal/plugins/link-card/link-card-node";
import { getMarkweaveMessages, type MarkweaveMessages } from "markweave/internal/i18n";
import { isMarkweaveEditorLiveEditable } from "markweave/internal/core/editor-mode-state";
import { useMarkweaveEditorModeState } from "./editor-mode-state";

export interface MarkweaveReactLinkCardOptions extends MarkweaveLinkCardExtensionOptions {
  readonly messages?: MarkweaveMessages;
  readonly resolver?: MarkweaveLinkCardResolver;
}

function isLinkCardUiTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-markweave-link-card-ui="true"]'));
}

function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value).catch(() => undefined);
  }

  return Promise.resolve();
}

function openHref(href: string) {
  if (!href || typeof window === "undefined") return;
  window.open(href, "_blank", "noopener,noreferrer");
}

function getHost(href: string) {
  try {
    return new URL(href).host;
  } catch {
    return href;
  }
}

function LinkCardNodeView(props: NodeViewProps) {
  const { deleteNode, editor, getPos, node, updateAttributes } = props;
  const options = props.extension.options as MarkweaveReactLinkCardOptions;
  const messages = options.messages ?? getMarkweaveMessages("zh");
  const copy = messages.linkCard;
  const modeState = useMarkweaveEditorModeState(editor);
  const editable = isMarkweaveEditorLiveEditable(modeState);
  const attrs = normalizeMarkweaveLinkCardAttrs(node.attrs);
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [title, setTitle] = useState(attrs?.title ?? "");
  const [href, setHref] = useState(attrs?.href ?? "");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    setTitle(attrs?.title ?? "");
    setHref(attrs?.href ?? "");
    setImageFailed(false);
  }, [attrs?.href, attrs?.title]);

  if (!attrs) return null;

  const update = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeMarkweaveLinkCardAttrs({ ...attrs, href, title });
    if (!normalized) return;
    updateAttributes(normalized);
    setEditing(false);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const metadata = await options.resolver?.({ href: normalized.href, title: normalized.title, signal: controller.signal });
      if (!controller.signal.aborted && metadata) {
        updateAttributes(normalizeMarkweaveLinkCardAttrs({ ...normalized, ...metadata }) ?? normalized);
      }
    } catch {
      // A card remains useful without resolved metadata.
    }
  };

  const convertToLink = () => {
    const pos = getPos();
    if (typeof pos === "number") replaceMarkweaveLinkCardWithLink(editor, pos);
  };

  const mediaUrl = !imageFailed ? attrs.imageUrl : null;
  const host = getHost(attrs.href);
  return (
    <NodeViewWrapper
      as="article"
      className="markweave-link-card"
      data-testid="markweave-link-card"
      data-markweave-link-card="true"
      data-hovered={hovered ? "true" : "false"}
      data-selected={props.selected ? "true" : "false"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(event: ReactMouseEvent<HTMLElement>) => {
        if (isLinkCardUiTarget(event.target)) return;
        event.preventDefault();
      }}
      onClick={(event: ReactMouseEvent<HTMLElement>) => {
        if (isLinkCardUiTarget(event.target)) return;
        event.preventDefault();
        openHref(attrs.href);
      }}
    >
      <a className="markweave-link-card-main" href={attrs.href} aria-label={copy.open}>
        <span className="markweave-link-card-copy">
          <strong>{attrs.title}</strong>
          {attrs.description ? <span>{attrs.description}</span> : null}
          <small>{attrs.siteName ?? host}</small>
        </span>
        <span className="markweave-link-card-media" aria-hidden="true">
          {mediaUrl ? <img src={mediaUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : !imageFailed && attrs.faviconUrl ? <img className="markweave-link-card-favicon" src={attrs.faviconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : <b>{host.slice(0, 1).toUpperCase()}</b>}
        </span>
      </a>
      {editable && hovered ? (
        <div className="markweave-link-card-tools" data-markweave-link-card-ui="true" aria-label={copy.toolsAriaLabel}>
          <CardButton label={copy.convertToLink} icon={Link2} onClick={convertToLink} testId="markweave-link-card-convert" />
          <CardButton label={copy.copyAddress} icon={Copy} onClick={() => void copyText(attrs.href)} testId="markweave-link-card-copy" />
          <CardButton label={copy.edit} icon={Pencil} onClick={(event) => {
            const pos = getPos();
            if (typeof pos === "number") openMarkweaveLinkCardComposer({ anchor: event.currentTarget, editor, messages, resolver: options.resolver, card: { pos, attrs } });
          }} testId="markweave-link-card-edit" />
          <CardButton label={copy.delete} icon={Trash2} onClick={deleteNode} testId="markweave-link-card-delete" />
        </div>
      ) : null}
      {editable && editing ? (
        <form className="markweave-link-card-editor" data-markweave-link-card-ui="true" data-testid="markweave-link-card-editor" onSubmit={update}>
          <label>
            <span>{copy.titleLabel}</span>
            <input aria-label={copy.titleLabel} placeholder={copy.titlePlaceholder} value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
          </label>
          <label>
            <span>{copy.addressLabel}</span>
            <input aria-label={copy.addressLabel} placeholder={copy.addressPlaceholder} value={href} onChange={(event) => setHref(event.currentTarget.value)} />
          </label>
          <button type="submit" aria-label={copy.edit} disabled={!normalizeMarkweaveLinkCardHref(href)}><Link2 size={16} /></button>
        </form>
      ) : null}
    </NodeViewWrapper>
  );
}

function CardButton({ icon: Icon, label, onClick, testId }: { readonly icon: LucideIcon; readonly label: string; readonly onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void; readonly testId: string }) {
  return <button type="button" aria-label={label} title={label} data-testid={testId} onMouseDown={(event) => event.preventDefault()} onClick={onClick}><Icon size={16} strokeWidth={1.8} /><span role="tooltip">{label}</span></button>;
}

export const MarkweaveReactLinkCard = MarkweaveLinkCard.extend<MarkweaveReactLinkCardOptions>({
  addOptions() {
    return { ...(this.parent?.() as object), messages: getMarkweaveMessages("zh"), resolver: undefined };
  },
  addNodeView() {
    if (typeof document === "undefined") return null;
    return ReactNodeViewRenderer(LinkCardNodeView, { stopEvent: ({ event }) => isLinkCardUiTarget(event.target) });
  },
});
