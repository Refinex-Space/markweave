# markweave

Language: English | [中文](./README.zh-CN.md)

Markdown-first WYSIWYG editor built on Tiptap and CodeMirror, providing Typora-like editing experience with block-level structure, slash commands, and rich text tooling.

Markweave publishes a framework-neutral core package plus React, Vue 2, and Vue 3 adapter packages. The playground apps are private workspace demos for local development checks and are not included in any npm package.

## Full Integration Guides

Read the guide for your framework when integrating the complete editor surface, including Markdown storage, uploads, Live/View mode, TOC, table callbacks, AI callbacks, media nodes, Mermaid, math, and production notes.

| Framework | English | Chinese |
| --- | --- | --- |
| React | [React Integration](./docs/guides/react-integration.md) | [React 接入手册](./docs/guides/react-integration-zh-cn.md) |
| Vue 3 | [Vue 3 Integration](./docs/guides/vue3-integration.md) | [Vue 3 接入手册](./docs/guides/vue3-integration-zh-cn.md) |
| Vue 2 | [Vue 2 Integration](./docs/guides/vue2-integration.md) | [Vue 2 接入手册](./docs/guides/vue2-integration-zh-cn.md) |

## Install

Install one Markweave adapter package in an existing framework app. React or Vue itself remains owned by the host app.

### React

```sh
pnpm add @markweave/react
```

### Vue 3

```sh
pnpm add @markweave/vue3
```

### Vue 2

```sh
pnpm add @markweave/vue2
```

Vue 2 CLI / Webpack 4 projects should keep `vue-template-compiler` on the same Vue 2.6.x version as `vue`. Existing Vue 2 CLI projects usually already have both.

Each adapter package re-exports the shared editor stylesheet from its own `styles.css` subpath. If you explicitly install the core `markweave` package or use the legacy subpath imports, `markweave/styles.css` remains available.

## Usage

### React

```tsx
import { MarkweaveEditor } from "@markweave/react";
import "@markweave/react/styles.css";

export function Editor() {
  return (
    <MarkweaveEditor
      defaultContent={"# Hello Markweave\n\nStart writing in **Markdown**."}
      mode="live"
      onUpdate={({ markdown }) => {
        console.log(markdown);
      }}
    />
  );
}
```

### Vue 3

```vue
<script setup lang="ts">
import { MarkweaveEditor } from "@markweave/vue3";
import "@markweave/vue3/styles.css";

function handleUpdate({ markdown }: { markdown: string }) {
  console.log(markdown);
}
</script>

<template>
  <MarkweaveEditor
    default-content="# Hello Markweave\n\nStart writing in **Markdown**."
    mode="live"
    :on-update="handleUpdate"
  />
</template>
```

### Vue 2

Vue CLI 4 / Webpack 4 projects must install `vue-template-compiler` with the same `2.6.x` version as Vue.

```vue
<template>
  <MarkweaveEditor
    default-content="# Hello Markweave\n\nStart writing in **Markdown**."
    mode="live"
    :on-update="handleUpdate"
  />
</template>

<script>
import { MarkweaveEditor } from "@markweave/vue2";
import "@markweave/vue2/styles.css";

export default {
  name: "Editor",
  components: { MarkweaveEditor },
  methods: {
    handleUpdate({ markdown }) {
      console.log(markdown);
    },
  },
};
</script>
```

You can import the adapter `styles.css` once in the app entry instead of inside each component.

`defaultContent` and controlled `content` are parsed as Markdown unless you explicitly pass `defaultContentFormat` or `contentFormat`. Store `onUpdate.markdown` as the canonical product value; `html`, `json`, and `text` remain available for rendering and integration needs.

Legacy HTML input remains supported when declared explicitly:

```tsx
<MarkweaveEditor defaultContent="<h1>Hello Markweave</h1>" defaultContentFormat="html" />
```

`mode` defaults to `"live"`. Pass `mode="view"` for a read-only rendered view that reuses the same Markweave output styling. The existing `editable={false}` prop still works as a compatibility lock, so `mode="live" editable={false}` is also read-only. `theme` defaults to `"light"`; pass `theme="dark"` to switch the editor frame and every built-in interaction surface to the graphite dark theme. Theme changes are safe at runtime and do not recreate editor content. In Live mode, ordinary links stay in the editor on a plain click; use Ctrl/Cmd-click to open them safely. `canvasColor` is optional: it overrides only the editor canvas background while preserving the rest of the theme. Omit it to use the theme default (`transparent` in light mode and `#181A1F` in dark mode), or pass a host color such as `"#000"` or `"var(--app-canvas)"`; it can also change at runtime without recreating the editor.

## Document Search And Replace

Markweave 0.2.3 includes a framework-neutral ProseMirror search plugin without imposing a specific host search bar. React hosts can receive the controller through `onSearchControllerChange` and build their own Ctrl/Cmd+F UI:

```tsx
const searchRef = useRef<MarkweaveSearchController | null>(null);

<MarkweaveEditor
  onSearchControllerChange={(controller) => {
    searchRef.current = controller;
  }}
/>
```

The controller exposes `setQuery`, `setOptions`, `findNext`, `findPrevious`, `replaceCurrent`, `replaceAll`, `clear`, `getState`, and `subscribe`. Matching supports case sensitivity, Unicode whole words, and regular expressions. ProseMirror decorations highlight every result and distinguish the active result. View mode can search and navigate, while replacement methods safely return failure.

## External Link Cards

A paragraph containing exactly one HTTP(S) link can be embedded as a link card in Live mode. Mixed text links, inline links, and `markweave:` document links remain ordinary links. Markweave never fetches a URL itself: pass an optional `linkCardResolver` when the host has a controlled metadata service.

```tsx
<MarkweaveEditor
  linkCardResolver={async ({ href, title, signal }) => {
    const response = await fetch(`/api/link-preview?url=${encodeURIComponent(href)}`, { signal });
    if (!response.ok) return null;
    return response.json(); // { title, description, siteName, imageUrl, faviconUrl }
  }}
/>
```

The resolver receives a validated HTTP(S) URL, the link title, and an `AbortSignal`; it runs only after a user explicitly embeds or edits a card. Implement URL allowlists, DNS/IP checks, redirect limits, timeouts, response-size limits, and image URL filtering in the server-side service. Link-card Markdown stores a safe HTML fallback so its metadata survives Markdown round trips.

The composer keeps actions compact: copy address, embed, copy Markdown, and remove link are icon-only controls with accessible labels and hover/focus tooltips.

`innerToc` defaults to `true` and renders the built-in right-side document outline from Markdown headings. `innerTocPlacement` defaults to `"container"`: it keeps the outline vertically centered in the visual viewport and centers the writing column with symmetric TOC gutters. When the actual editor container is narrow, the built-in outline hides automatically so the writing column remains readable. Set `innerTocPlacement="viewport"` only when a fixed viewport-side outline is required; set `innerToc={false}` to hide the default UI while still receiving outline data through `onTocChange` and `onRuntimeStateChange`.

```tsx
<MarkweaveEditor
  defaultContent={"# Product Spec\n\n## Goals"}
  innerToc={false}
  onTocChange={({ items, activeId }) => {
    console.log(items, activeId);
  }}
/>
```

## Code Block Languages

Markweave 0.2.1 uses one searchable code-block language catalog across React, Vue 2, and Vue 3. Markdown fence identifiers are preserved, and every selectable identifier is registered with either a dedicated Highlight.js grammar or a documented compatible grammar.

- Web and templates: HTML, XML, Angular HTML, Vue HTML, CSS, SCSS, Less, Stylus, PostCSS, JavaScript, JSX, TypeScript, TSX, Django, ERB, Handlebars, PHP Template, and Twig.
- Data and configuration: JSON, JSON5, JSONC, JSONL, Jsonnet, Hjson, YAML, INI, TOML, Properties, Protocol Buffers, GraphQL, and HTTP.
- Systems and application languages: C, C++, C#, Java, Kotlin, Scala, Go, Rust, Python, Ruby, PHP, Swift, Objective-C, Dart, F#, Fortran, Lua, Perl, R, MATLAB, GLSL, WebAssembly, Arduino, and Vyper.
- Functional and scripting languages: Bash, Shell, PowerShell, NuShell, Clojure, Elixir, Erlang, Groovy, Haskell, Lisp, OCaml, and Scheme.
- Tooling and infrastructure: Apache, CMake, Dockerfile, Gradle, Makefile, Nginx, Nix, SQL, PL/SQL, PostgreSQL, Diff, LaTeX, Markdown, and shell sessions.

Plain text remains available without token coloring. Mermaid code blocks use plain code coloring plus Markweave's Code/Preview controls. Compatibility identifiers keep their stored fence value while using the closest registered grammar: `js`/`jsx` use JavaScript, `ts`/`tsx` use TypeScript, `angular-html`/`html`/`html-derivative`/`vue-html` use XML, `hjson`/`json5`/`jsonc`/`jsonl`/`jsonnet` use JSON, `nushell`/`shellscript`/`shellsession` use Bash, `toml` uses INI, `postcss` uses CSS, `plsql` uses SQL, and `vyper` uses Python.

## Framework Parity

| Capability | React | Vue 3 | Vue 2 |
| --- | --- | --- | --- |
| Markdown input/output | Yes | Yes | Yes |
| Live/View mode | Yes | Yes | Yes |
| Floating toolbar | Yes | Yes | Yes |
| Slash command menu | Yes | Yes | Yes |
| Tables and clipboard callbacks | Yes | Yes | Yes |
| Image/video/attachment rendering | Yes | Yes | Yes |
| Code blocks and Mermaid | Yes | Yes | Yes |
| Math editing/rendering | Yes | Yes | Yes |
| Inner TOC | Yes | Yes | Yes |
| Upload and AI callbacks | Yes | Yes | Yes |

## Package Boundary

- `packages/markweave` contains the framework-neutral npm package named `markweave`.
- `packages/markweave-react` contains `@markweave/react`.
- `packages/markweave-vue2` contains `@markweave/vue2`.
- `packages/markweave-vue3` contains `@markweave/vue3`.
- `markweave` exports framework-neutral types and helpers.
- `@markweave/react` exports the React editor component, hook, React extension factory, and `@markweave/react/styles.css`.
- `@markweave/vue2` exports the Vue 2 editor component, controller helper, Vue 2 extension factory, and `@markweave/vue2/styles.css`.
- `@markweave/vue3` exports the Vue 3 editor component, composable, Vue 3 extension factory, and `@markweave/vue3/styles.css`.
- `markweave/react`, `markweave/vue2`, and `markweave/vue3` remain legacy compatibility shims for one release cycle and forward to the adapter packages.
- `markweave/styles.css` remains the core stylesheet entry for direct core-package consumers and legacy imports.
- `apps/playground-react`, `apps/playground-vue2`, and `apps/playground-vue3` contain private local demo apps.
- `apps/playground-fixtures` contains shared private playground Markdown fixtures.

## Local Development

```sh
pnpm install
pnpm dev
```

Open the default React playground:

```text
http://127.0.0.1:5173/
```

For Vue 3:

```sh
pnpm dev:vue3
```

Open:

```text
http://127.0.0.1:5174/
```

For Vue 2:

```sh
pnpm dev:vue2
```

Open:

```text
http://127.0.0.1:5175/
```

Useful checks:

```sh
pnpm test
pnpm typecheck
pnpm build
```
