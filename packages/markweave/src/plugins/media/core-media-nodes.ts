import { mergeAttributes, Node } from "@tiptap/core";
import Image, { type ImageOptions } from "@tiptap/extension-image";
import type { MarkweaveUploadRequest, MarkweaveUploadResult, MarkweaveUploadSource } from "../slash-command/upload";

export type MarkweaveCoreImageAlign = "left" | "center" | "right";
export type MarkweaveCoreVideoProvider = "youtube" | "bilibili";

export interface MarkweaveCoreVideoEmbed {
  readonly provider: MarkweaveCoreVideoProvider;
  readonly embedUrl: string;
}

export const markweaveVideoIframeAllow = "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

export interface MarkweaveCoreVideoOptions {
  readonly HTMLAttributes: Record<string, unknown>;
}

const imageAlignments = new Set<MarkweaveCoreImageAlign>(["left", "center", "right"]);
const videoFileUrlRegex = /\.(?:mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i;

export function stringAttribute(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function numberAttribute(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseDimension(value: string | null) {
  if (!value) {
    return null;
  }

  return numberAttribute(value.replace(/px$/i, ""));
}

function compactAttributes(attributes: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderHtmlAttributes(attributes: Record<string, unknown>) {
  return Object.entries(compactAttributes(attributes))
    .map(([key, value]) => `${key}="${escapeHtmlAttribute(String(value))}"`)
    .join(" ");
}

export function normalizeMarkweaveCoreImageAlign(value: unknown): MarkweaveCoreImageAlign {
  return typeof value === "string" && imageAlignments.has(value as MarkweaveCoreImageAlign) ? (value as MarkweaveCoreImageAlign) : "center";
}

export function clampMarkweaveImageWidth(width: number, containerWidth: number) {
  const safeContainerWidth = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 720;
  const minWidth = Math.min(safeContainerWidth, Math.max(120, safeContainerWidth * 0.2));
  return Math.round(Math.min(safeContainerWidth, Math.max(minWidth, width)));
}

function getImageFileName(src: string) {
  const cleanSrc = src.split(/[?#]/)[0] ?? "";
  return cleanSrc.split("/").filter(Boolean).at(-1) || "markweave-image";
}

export function downloadMarkweaveImage(src: string, ownerDocument: Document = document) {
  const trimmedSrc = src.trim();

  if (!trimmedSrc) {
    return false;
  }

  const anchor = ownerDocument.createElement("a");
  anchor.href = trimmedSrc;
  anchor.download = getImageFileName(trimmedSrc);
  anchor.rel = "noopener noreferrer";
  ownerDocument.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

export function attrsFromMarkweaveImageUploadResult(nodeAttrs: Record<string, unknown>, result: MarkweaveUploadResult) {
  return {
    src: result.src,
    alt: result.alt ?? result.name ?? stringAttribute(nodeAttrs.alt),
    title: result.title ?? stringAttribute(nodeAttrs.title),
    width: null,
    height: null,
  };
}

export function createMarkweaveImageUploadRequest(source: MarkweaveUploadSource, trigger: MarkweaveUploadRequest["trigger"]): MarkweaveUploadRequest {
  return {
    kind: "image",
    source,
    trigger,
  };
}

function normalizeVideoUrl(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function toHttpsUrl(url: URL) {
  const nextUrl = new URL(url.href);
  nextUrl.protocol = "https:";
  return nextUrl.toString();
}

export function normalizeMarkweaveVideoEmbedUrl(input: string, provider?: MarkweaveCoreVideoProvider | string | null) {
  const url = normalizeVideoUrl(input);

  if (!url) {
    return input;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const detectedProvider = host.includes("youtube") || host === "youtu.be" ? "youtube" : host.endsWith("bilibili.com") ? "bilibili" : null;
  const normalizedProvider = detectedProvider ?? provider;
  const nextUrl = new URL(url.href);
  nextUrl.protocol = "https:";

  if (normalizedProvider === "bilibili") {
    nextUrl.searchParams.set("autoplay", "0");
  } else if (normalizedProvider === "youtube" && nextUrl.searchParams.has("autoplay")) {
    nextUrl.searchParams.set("autoplay", "0");
  }

  return nextUrl.toString();
}

function firstMatchValue(url: URL, keys: readonly string[]) {
  for (const key of keys) {
    const value = url.searchParams.get(key);

    if (value) {
      return value;
    }
  }

  return null;
}

export function parseMarkweaveVideoEmbed(input: string): MarkweaveCoreVideoEmbed | null {
  const url = normalizeVideoUrl(input);

  if (!url) {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ? { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(id)}` } : null;
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (pathParts[0] === "embed" && pathParts[1]) {
      return { provider: "youtube", embedUrl: normalizeMarkweaveVideoEmbedUrl(toHttpsUrl(url), "youtube") };
    }

    const id = pathParts[0] === "shorts" ? pathParts[1] : url.searchParams.get("v");
    return id ? { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(id)}` } : null;
  }

  if (host === "player.bilibili.com" && url.pathname === "/player.html") {
    const hasVideoIdentity = ["aid", "bvid", "cid"].some((key) => url.searchParams.has(key));
    return hasVideoIdentity ? { provider: "bilibili", embedUrl: normalizeMarkweaveVideoEmbedUrl(toHttpsUrl(url), "bilibili") } : null;
  }

  if (host.endsWith("bilibili.com")) {
    const bvid = firstMatchValue(url, ["bvid"]) ?? url.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1];
    const aid = firstMatchValue(url, ["aid"]) ?? url.pathname.match(/\/video\/av(\d+)/i)?.[1];
    const cid = firstMatchValue(url, ["cid"]);
    const page = firstMatchValue(url, ["p", "page"]);
    const params = new URLSearchParams();

    if (bvid) {
      params.set("bvid", bvid);
    } else if (aid) {
      params.set("aid", aid);
    }

    if (cid) {
      params.set("cid", cid);
    }

    if (page) {
      params.set("p", page);
    }

    const query = params.toString();
    return query ? { provider: "bilibili", embedUrl: normalizeMarkweaveVideoEmbedUrl(`https://player.bilibili.com/player.html?${query}`, "bilibili") } : null;
  }

  return null;
}

export function isDirectMarkweaveVideoUrl(input: string) {
  const url = normalizeVideoUrl(input);
  return Boolean(url && videoFileUrlRegex.test(url.href));
}

export function attrsFromMarkweaveVideoUrl(url: string) {
  const embed = parseMarkweaveVideoEmbed(url);

  if (embed) {
    return {
      src: normalizeMarkweaveVideoEmbedUrl(url.trim(), embed.provider),
      embedUrl: embed.embedUrl,
      provider: embed.provider,
      mimeType: null,
      title: null,
    };
  }

  if (!isDirectMarkweaveVideoUrl(url)) {
    return null;
  }

  return {
    src: url.trim(),
    embedUrl: null,
    provider: null,
    mimeType: null,
    title: url.trim().split("/").filter(Boolean).at(-1),
  };
}

export function attrsFromMarkweaveVideoUploadResult(result: MarkweaveUploadResult) {
  return {
    src: result.src,
    embedUrl: null,
    provider: null,
    title: result.title ?? result.name,
    mimeType: result.mimeType,
  };
}

export function createMarkweaveVideoUploadRequest(source: MarkweaveUploadSource): MarkweaveUploadRequest {
  return {
    kind: "video",
    source,
    trigger: "video-insert",
  };
}

function getImageAttrsFromElement(element: Element) {
  const imageElement = element.matches("img") ? element : element.querySelector("img");

  if (!(imageElement instanceof HTMLElement)) {
    return false;
  }

  const src = imageElement.getAttribute("src");
  if (!src) {
    return false;
  }

  const figure = imageElement.closest("figure[data-markweave-image]");
  const caption = figure?.querySelector("figcaption")?.textContent?.trim() || null;

  return {
    src,
    alt: imageElement.getAttribute("alt"),
    title: imageElement.getAttribute("title"),
    width: parseDimension(imageElement.getAttribute("width") ?? imageElement.style.width),
    height: parseDimension(imageElement.getAttribute("height") ?? imageElement.style.height),
    align: normalizeMarkweaveCoreImageAlign(figure?.getAttribute("data-markweave-image-align") ?? imageElement.getAttribute("data-markweave-image-align")),
    caption,
  };
}

function getVideoAttrsFromElement(element: Element) {
  if (element.matches("iframe[data-markweave-video-embed]")) {
    const iframe = element as HTMLIFrameElement;
    const provider = stringAttribute(iframe.getAttribute("data-markweave-video-provider"));
    const src = stringAttribute(iframe.getAttribute("data-markweave-video-src")) ?? iframe.src;
    return {
      src: normalizeMarkweaveVideoEmbedUrl(src, provider),
      embedUrl: normalizeMarkweaveVideoEmbedUrl(iframe.src, provider),
      provider,
      title: stringAttribute(iframe.getAttribute("title")),
      mimeType: null,
    };
  }

  if (element.matches("video[data-markweave-video]")) {
    const video = element as HTMLVideoElement;
    return {
      src: stringAttribute(video.getAttribute("src")),
      embedUrl: null,
      provider: null,
      title: stringAttribute(video.getAttribute("title")),
      mimeType: stringAttribute(video.getAttribute("data-markweave-mime-type")),
    };
  }

  return false;
}

export const MarkweaveCoreImage = Image.extend<ImageOptions>({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      align: {
        default: "center",
        parseHTML: (element: Element) =>
          normalizeMarkweaveCoreImageAlign(element.closest("figure[data-markweave-image]")?.getAttribute("data-markweave-image-align") ?? element.getAttribute("data-markweave-image-align")),
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-markweave-image-align": normalizeMarkweaveCoreImageAlign(attributes.align),
        }),
      },
      caption: {
        default: null,
        parseHTML: (element: Element) => element.closest("figure[data-markweave-image]")?.querySelector("figcaption")?.textContent?.trim() || null,
        renderHTML: () => ({}),
      },
      width: {
        default: null,
        parseHTML: (element: Element) => parseDimension(element.getAttribute("width") ?? (element instanceof HTMLElement ? element.style.width : null)),
        renderHTML: (attributes: Record<string, unknown>) => {
          const width = numberAttribute(attributes.width);
          return width ? { width: String(Math.round(width)) } : {};
        },
      },
      height: {
        default: null,
        parseHTML: (element: Element) => parseDimension(element.getAttribute("height") ?? (element instanceof HTMLElement ? element.style.height : null)),
        renderHTML: (attributes: Record<string, unknown>) => {
          const height = numberAttribute(attributes.height);
          return height ? { height: String(Math.round(height)) } : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-markweave-image]",
        getAttrs: (element) => {
          if (!(element instanceof Element)) {
            return false;
          }

          const attrs = getImageAttrsFromElement(element);
          if (!attrs || (!this.options.allowBase64 && attrs.src.startsWith("data:"))) {
            return false;
          }

          return attrs;
        },
      },
      {
        tag: this.options.allowBase64 ? "img[src]" : 'img[src]:not([src^="data:"])',
      },
    ];
  },

  renderHTML({ node }) {
    const src = stringAttribute(node.attrs.src);
    const align = normalizeMarkweaveCoreImageAlign(node.attrs.align);
    const caption = stringAttribute(node.attrs.caption);
    const imageAttributes = mergeAttributes(
      this.options.HTMLAttributes,
      compactAttributes({
        src,
        alt: stringAttribute(node.attrs.alt),
        title: stringAttribute(node.attrs.title),
        width: numberAttribute(node.attrs.width) ? String(Math.round(numberAttribute(node.attrs.width) ?? 0)) : null,
        height: numberAttribute(node.attrs.height) ? String(Math.round(numberAttribute(node.attrs.height) ?? 0)) : null,
        "data-markweave-image-align": align,
      }),
    );

    if (!src) {
      return [
        "figure",
        {
          class: "markweave-image-figure",
          "data-markweave-image": "true",
          "data-markweave-image-empty": "true",
          "data-markweave-image-align": align,
        },
      ];
    }

    if (!caption) {
      return ["img", imageAttributes];
    }

    return [
      "figure",
      {
        class: "markweave-image-figure",
        "data-markweave-image": "true",
        "data-markweave-image-align": align,
      },
      ["img", imageAttributes],
      ["figcaption", { "data-markweave-image-caption": "true" }, caption],
    ];
  },

  renderMarkdown: (node) => {
    const src = stringAttribute(node.attrs?.src);
    const alt = stringAttribute(node.attrs?.alt) ?? "";
    const title = stringAttribute(node.attrs?.title);
    const align = normalizeMarkweaveCoreImageAlign(node.attrs?.align);
    const caption = stringAttribute(node.attrs?.caption);
    const width = numberAttribute(node.attrs?.width);
    const height = numberAttribute(node.attrs?.height);

    if (!src) {
      return `<figure class="markweave-image-figure" data-markweave-image="true" data-markweave-image-empty="true" data-markweave-image-align="${align}"></figure>`;
    }

    if (!caption && align === "center" && !width && !height) {
      return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
    }

    const figureAttrs = renderHtmlAttributes({
      class: "markweave-image-figure",
      "data-markweave-image": "true",
      "data-markweave-image-align": align,
    });
    const imageAttrs = renderHtmlAttributes({
      class: "markweave-image",
      src,
      alt,
      title,
      width: width ? String(Math.round(width)) : null,
      height: height ? String(Math.round(height)) : null,
      "data-markweave-image-align": align,
    });
    const captionHtml = caption ? `<figcaption data-markweave-image-caption="true">${escapeHtmlText(caption)}</figcaption>` : "";

    return `<figure ${figureAttrs}><img ${imageAttrs} />${captionHtml}</figure>`;
  },

  addInputRules() {
    return [];
  },
});

export const MarkweaveCoreVideo = Node.create<MarkweaveCoreVideoOptions>({
  name: "markweaveVideo",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => stringAttribute(element.getAttribute("src") ?? element.getAttribute("data-markweave-video-src")),
      },
      title: {
        default: null,
        parseHTML: (element) => stringAttribute(element.getAttribute("title")),
      },
      mimeType: {
        default: null,
        parseHTML: (element) => stringAttribute(element.getAttribute("data-markweave-mime-type")),
        renderHTML: (attributes) => (attributes.mimeType ? { "data-markweave-mime-type": attributes.mimeType } : {}),
      },
      embedUrl: {
        default: null,
        parseHTML: (element) => stringAttribute(element.getAttribute("src")),
        renderHTML: () => ({}),
      },
      provider: {
        default: null,
        parseHTML: (element) => stringAttribute(element.getAttribute("data-markweave-video-provider")),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "iframe[data-markweave-video-embed]",
        getAttrs: (element) => (element instanceof Element ? getVideoAttrsFromElement(element) : false),
      },
      {
        tag: "video[data-markweave-video]",
        getAttrs: (element) => (element instanceof Element ? getVideoAttrsFromElement(element) : false),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const src = stringAttribute(node.attrs.src);
    const embedUrl = stringAttribute(node.attrs.embedUrl);
    const provider = stringAttribute(node.attrs.provider);

    if (!src) {
      return [
        "figure",
        {
          class: "markweave-video-figure",
          "data-markweave-video-empty": "true",
        },
      ];
    }

    if (embedUrl) {
      const safeEmbedUrl = normalizeMarkweaveVideoEmbedUrl(embedUrl, provider);
      return [
        "iframe",
        mergeAttributes(
          HTMLAttributes,
          compactAttributes({
            class: "markweave-video-iframe",
            src: safeEmbedUrl,
            title: stringAttribute(node.attrs.title) ?? `${provider ?? "Video"} embed`,
            "data-markweave-video-embed": "true",
            "data-markweave-video-provider": provider,
            "data-markweave-video-src": src,
            allow: markweaveVideoIframeAllow,
            allowfullscreen: "true",
          }),
        ),
      ];
    }

    return [
      "video",
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        compactAttributes({
          class: "markweave-video",
          src,
          title: stringAttribute(node.attrs.title),
          controls: "",
          "data-markweave-video": "true",
          "data-markweave-mime-type": stringAttribute(node.attrs.mimeType),
        }),
      ),
    ];
  },

  renderMarkdown: (node) => {
    const src = stringAttribute(node.attrs?.src);
    const embedUrl = stringAttribute(node.attrs?.embedUrl);
    const provider = stringAttribute(node.attrs?.provider);

    if (!src) {
      return '<figure class="markweave-video-figure" data-markweave-video-empty="true"></figure>';
    }

    if (embedUrl) {
      const safeEmbedUrl = normalizeMarkweaveVideoEmbedUrl(embedUrl, provider);
      return `<iframe ${renderHtmlAttributes({
        class: "markweave-video-iframe",
        src: safeEmbedUrl,
        title: stringAttribute(node.attrs?.title) ?? `${provider ?? "Video"} embed`,
        "data-markweave-video-embed": "true",
        "data-markweave-video-provider": provider,
        "data-markweave-video-src": src,
        allow: markweaveVideoIframeAllow,
        allowfullscreen: "true",
      })}></iframe>`;
    }

    return `<video ${renderHtmlAttributes({
      class: "markweave-video",
      src,
      title: stringAttribute(node.attrs?.title),
      controls: "",
      "data-markweave-video": "true",
      "data-markweave-mime-type": stringAttribute(node.attrs?.mimeType),
    })}></video>`;
  },
});
