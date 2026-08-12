import { normalizeMarkdownLinkHref } from "../plugins/markdown/markdown-input";

export function openMarkweaveReadonlyLinkFromEvent(event: MouseEvent) {
  const target = event.target;

  if (!(target instanceof Element)) {
    return false;
  }

  const anchor = target.closest<HTMLAnchorElement>("a[href]");

  if (!anchor) {
    return false;
  }

  // Host-owned projections (external link cards / internal document cards) must
  // not open in a browser tab — the host intercepts those clicks itself.
  if (
    anchor.closest('[data-markweave-link-card="true"]') ||
    anchor.closest('[data-markweave-internal-link-card="true"]')
  ) {
    event.preventDefault();
    return true;
  }

  const href = normalizeMarkdownLinkHref(anchor.getAttribute("href") ?? "");
  event.preventDefault();

  if (!href || typeof window === "undefined" || typeof window.open !== "function") {
    return true;
  }

  window.open(href, "_blank", "noopener,noreferrer");
  return true;
}
