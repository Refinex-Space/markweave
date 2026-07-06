---
owner: refinex
updated: 2026-07-05
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Security Standards

## Secrets And Local Files

- Do not commit secrets, API keys, credentials, tokens, production config, or `.env*` contents.
- No `.env*` file was present in the 2026-07-05 control-plane scan.
- Do not paste credentials into docs, screenshots, tests, fixtures, logs, or examples.

## Browser And Editor Data

Markweave is a browser-side editor package. Treat editor content, Markdown source, HTML fallbacks, JSON documents, pasted HTML/Markdown, links, media nodes, and Mermaid source as untrusted input unless a specific caller has already validated it.

## Uploads And Media

- Upload behavior is exposed through host-provided callback types such as `MarkweaveSlashCommandUploadHandler`.
- The package defines image, video, and attachment nodes; verify node attributes and rendering behavior when changing media support.
- Image insertion can create an empty browser-side upload placeholder before a `src` exists. Local file uploads still require the host upload handler; URL, path, and Base64 image sources may resolve directly in the browser.
- Video insertion can create an empty browser-side upload placeholder before a `src` exists. Local video files still require the host upload handler. Direct video URLs render as `<video>`. YouTube and Bilibili sharing URLs are converted to iframe embeds, while whitelisted platform embed sources keep their original query strings. Do not resolve network redirects or accept arbitrary iframe hosts.
- Do not add network calls, storage assumptions, or production upload endpoints to the package without an explicit API design.

## Links And Rendering

- Link behavior currently uses `https` as the default protocol and allows the custom `markweave` protocol.
- Floating-toolbar link editing rejects empty URLs and unsafe `javascript:`, `data:`, or `vbscript:` URLs before applying or opening links.
- Mermaid preview/rendering changes need tests for invalid source and non-mutating preview behavior.
- Base64 images are currently allowed by the image extension; changing that is a public behavior change and needs tests plus docs updates.

## Infrastructure Boundary

No CI workflow or deployment manifest exists as of the 2026-07-05 scan. Any future CI, release automation, publishing token, or infrastructure change must be called out separately from editor implementation work.
