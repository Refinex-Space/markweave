export interface MarkweaveVisibleBoundaryRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function rectRight(rect: MarkweaveVisibleBoundaryRect) {
  return rect.left + rect.width;
}

function rectBottom(rect: MarkweaveVisibleBoundaryRect) {
  return rect.top + rect.height;
}

export function intersectMarkweaveVisibleBoundaryRects(
  first: MarkweaveVisibleBoundaryRect,
  second: MarkweaveVisibleBoundaryRect,
): MarkweaveVisibleBoundaryRect {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.max(left, Math.min(rectRight(first), rectRight(second)));
  const bottom = Math.max(top, Math.min(rectBottom(first), rectBottom(second)));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function clipsOverflow(value: string) {
  return /^(auto|clip|hidden|overlay|scroll)$/.test(value);
}

/**
 * Returns the visible portion of an element after intersecting the viewport and
 * every clipping ancestor. Coordinates remain viewport-relative so body-level
 * portals can use the result directly with fixed positioning.
 */
export function getMarkweaveVisibleBoundaryRect(element: HTMLElement): MarkweaveVisibleBoundaryRect {
  const elementRect = element.getBoundingClientRect();
  let boundary: MarkweaveVisibleBoundaryRect = {
    left: elementRect.left,
    top: elementRect.top,
    width: elementRect.width,
    height: elementRect.height,
  };

  const view = element.ownerDocument.defaultView;
  if (!view) {
    return boundary;
  }

  boundary = intersectMarkweaveVisibleBoundaryRects(boundary, {
    left: 0,
    top: 0,
    width: view.innerWidth,
    height: view.innerHeight,
  });

  let ancestor = element.parentElement;
  while (ancestor) {
    const style = view.getComputedStyle(ancestor);
    const clipsX = clipsOverflow(style.overflowX)
      || clipsOverflow(style.overflow)
      || clipsOverflow(ancestor.style.overflowX)
      || clipsOverflow(ancestor.style.overflow);
    const clipsY = clipsOverflow(style.overflowY)
      || clipsOverflow(style.overflow)
      || clipsOverflow(ancestor.style.overflowY)
      || clipsOverflow(ancestor.style.overflow);

    if (clipsX || clipsY) {
      const ancestorRect = ancestor.getBoundingClientRect();
      boundary = intersectMarkweaveVisibleBoundaryRects(boundary, {
        left: clipsX ? ancestorRect.left : boundary.left,
        top: clipsY ? ancestorRect.top : boundary.top,
        width: clipsX ? ancestorRect.width : boundary.width,
        height: clipsY ? ancestorRect.height : boundary.height,
      });
    }

    ancestor = ancestor.parentElement;
  }

  return boundary;
}
