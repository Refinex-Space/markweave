import { readFileSync } from "node:fs";
import { transformWithOxc, type Plugin } from "vite";

const sharedRuntimePackages = [
  "@tiptap/core",
  "@tiptap/pm",
  "prosemirror-",
];

export function createLegacyRuntimeExternal(extraPackages: readonly string[] = []) {
  const packageNames = [...sharedRuntimePackages, ...extraPackages];
  return (id: string) => packageNames.some((packageName) =>
    packageName.endsWith("-")
      ? id.startsWith(packageName)
      : id === packageName || id.startsWith(`${packageName}/`),
  );
}

export function legacyMermaidSingleFile(path: string): Plugin {
  const virtualId = "\0markweave-legacy-mermaid";
  const browserBundle = readFileSync(path, "utf8")
    .replace("var __esbuild_esm_mermaid_nm;", "")
    .replace(/\b__esbuild_esm_mermaid_nm\b/g, "globalThis.__esbuild_esm_mermaid_nm")
    .replace(/\n?\/\/# sourceMappingURL=mermaid\.min\.js\.map\s*$/, "");
  let transformedBrowserBundle: Promise<string> | null = null;
  return {
    name: "markweave-legacy-mermaid-single-file",
    enforce: "pre",
    resolveId(id) {
      return id === "mermaid" ? virtualId : null;
    },
    load(id) {
      if (id !== virtualId) {
        return null;
      }
      return "export default globalThis.mermaid;";
    },
    async generateBundle(_options, bundle) {
      transformedBrowserBundle ??= transformWithOxc(browserBundle, path, {
        lang: "js",
        target: "es2019",
      }).then((result) => result.code.replace(
        /var _defineProperty = require\("@oxc-project\/runtime\/helpers\/defineProperty"\);\r?\n/,
        "var _defineProperty = function(object, key, value) { if (key in object) { Object.defineProperty(object, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { object[key] = value; } return object; };\n",
      ));
      const es2019BrowserBundle = await transformedBrowserBundle;
      for (const artifact of Object.values(bundle)) {
        if (artifact.type === "chunk" && artifact.facadeModuleId === virtualId) {
          artifact.code = `${es2019BrowserBundle}\nexport default globalThis.mermaid;\n`;
          artifact.map = null;
        }
      }
    },
  };
}
