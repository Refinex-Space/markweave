---
owner: refinex
updated: 2026-08-01
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Security Standards

## Secrets And Local Files

- Do not commit secrets, API keys, credentials, tokens, production config, or `.env*` contents.
- No `.env*` file was present in the 2026-07-05 control-plane scan.
- Do not paste credentials into docs, screenshots, tests, fixtures, logs, or examples.
- The private playground OpenRouter integration reads `OPENROUTER_API_KEY` only from the workspace-root ignored `.env` inside dev-server middleware. Never expose provider credentials through `VITE_*`, `VUE_APP_*`, browser code, generated assets, or client logs.
- `.env.example` may document variable names and placeholders only. Real provider credentials must remain in `.env` or the local process environment.

## Browser And Editor Data

Markweave is a browser-side editor package. Treat editor content, Markdown source, HTML fallbacks, JSON documents, pasted HTML/Markdown, links, media nodes, and Mermaid source as untrusted input unless a specific caller has already validated it.

- `MarkweaveAiEditController.getSelection()` and `subscribeSelection()` serialize selection content only on explicit host demand; selection content is intentionally absent from the high-frequency runtime snapshot. Line ranges are one-based block-precision locations in normalized Markdown, not byte-for-byte offsets in an uploaded source file.
- `captureSelection()` remains selection-only. `capture({ scope: "blocks" | "document" })` includes the explicitly requested block range or full document; Markweave never silently widens an empty selection, sends a request, chooses a provider, stores credentials, or persists the captured context.
- The host owns user consent, authorization, redaction, provider policy, network transport, retention, logging, rate limits, and deletion for any selection, block range, or document content it sends to an AI service. Full-document capture must be an explicit product action. Do not place API keys in Markweave props, browser bundles, metadata, or playground source.
- AI edit metadata is host-defined in-memory context. Treat it as untrusted application data: avoid secrets and do not render metadata as HTML.
- Proposal Markdown is parsed through the current editor schema and shown with ProseMirror Decorations before acceptance. Multi-scope proposals use a bounded block diff and fail closed when complexity exceeds the review budget. They must not bypass the existing link/media/Mermaid safety boundaries, and only a complete compatible proposal may enter the document.

## Uploads And Media

- Upload behavior is exposed through host-provided callback types such as `MarkweaveSlashCommandUploadHandler`.
- The package defines image, video, and attachment nodes; verify node attributes and rendering behavior when changing media support.
- Image insertion can create an empty browser-side upload placeholder before a `src` exists. Local file uploads, including pasted clipboard images, still require the host upload handler. Pasted remote images are accepted only from HTTP(S) HTML `<img>` sources or standalone URLs with a known image extension; Markweave does not fetch remote URLs to detect their MIME type. URL, path, and Base64 image sources entered through the upload UI may continue to resolve directly in the browser.
- Video insertion can create an empty browser-side upload placeholder before a `src` exists. Local video files still require the host upload handler. Direct video URLs render as `<video>`. YouTube and Bilibili sharing URLs are converted to iframe embeds, while whitelisted platform embed sources keep their original query strings. Do not resolve network redirects or accept arbitrary iframe hosts.
- Do not add network calls, storage assumptions, or production upload endpoints to the package without an explicit API design.

## Links And Rendering

- Link behavior currently uses `https` as the default protocol and allows the custom `markweave` protocol.
- Floating-toolbar link editing rejects empty URLs and unsafe `javascript:`, `data:`, or `vbscript:` URLs before applying or opening links.
- Mermaid preview/rendering changes need tests for invalid source and non-mutating preview behavior.
- Base64 images are currently allowed by the image extension; changing that is a public behavior change and needs tests plus docs updates.

## Infrastructure Boundary

No CI workflow or deployment manifest exists as of the 2026-07-05 scan. Any future CI, release automation, publishing token, or infrastructure change must be called out separately from editor implementation work.
