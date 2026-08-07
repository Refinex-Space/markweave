export interface SlashCommandListScrollMetrics {
  readonly itemTop: number;
  readonly itemBottom: number;
  readonly listTop: number;
  readonly listHeight: number;
  readonly scrollTop: number;
  readonly maxScrollTop: number;
}

export function calculateCenteredSlashCommandListScrollTop(metrics: SlashCommandListScrollMetrics) {
  const itemHeight = Math.max(0, metrics.itemBottom - metrics.itemTop);
  const itemOffset = metrics.itemTop - metrics.listTop + metrics.scrollTop;
  const centered = itemOffset - (metrics.listHeight - itemHeight) / 2;

  return Math.min(metrics.maxScrollTop, Math.max(0, centered));
}

export function scrollSlashCommandItemIntoView(listElement: HTMLElement, itemElement: HTMLElement) {
  const listRect = listElement.getBoundingClientRect();
  const itemRect = itemElement.getBoundingClientRect();
  const maxScrollTop = Math.max(0, listElement.scrollHeight - listElement.clientHeight);
  const nextScrollTop = calculateCenteredSlashCommandListScrollTop({
    itemBottom: itemRect.bottom,
    itemTop: itemRect.top,
    listHeight: listRect.height,
    listTop: listRect.top,
    maxScrollTop,
    scrollTop: listElement.scrollTop,
  });

  if (nextScrollTop !== listElement.scrollTop) {
    listElement.scrollTop = nextScrollTop;
  }
}
