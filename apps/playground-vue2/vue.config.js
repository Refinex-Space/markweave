const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "../..");
const markweaveRoot = path.resolve(workspaceRoot, "packages/markweave");
const markweaveNodeModules = path.resolve(markweaveRoot, "node_modules");
const playgroundNodeModules = path.resolve(__dirname, "node_modules");

function packagePath(packageName, subpath = "") {
  return path.resolve(markweaveNodeModules, packageName, subpath);
}

function playgroundPackagePath(packageName, subpath = "") {
  return path.resolve(playgroundNodeModules, packageName, subpath);
}

function tiptapPmPath(subpath) {
  return packagePath("@tiptap/pm", `dist/${subpath}/index.js`);
}

function pnpmPackagePath(pnpmPackageName, packageName, subpath = "") {
  return path.resolve(workspaceRoot, "node_modules/.pnpm", pnpmPackageName, "node_modules", packageName, subpath);
}

module.exports = {
  productionSourceMap: false,
  transpileDependencies: [
    "markweave",
    "@markweave/playground-fixtures",
    "@tiptap",
    "prosemirror",
    "lowlight",
    "mermaid",
    "marked",
    "es-toolkit",
    "@iconify",
    "@mermaid-js",
    "uuid",
  ],
  configureWebpack: {
    context: __dirname,
    resolve: {
      extensions: [".mjs", ".js", ".jsx", ".ts", ".tsx", ".vue", ".json"],
      alias: {
        vue$: playgroundPackagePath("vue", "dist/vue.runtime.common.js"),
        markweave$: path.resolve(markweaveRoot, "src/index.ts"),
        "markweave/vue2": path.resolve(markweaveRoot, "src/vue2/index.ts"),
        "markweave/styles.css": path.resolve(markweaveRoot, "src/editor-core/markweave-editor.css"),
        "@markweave/playground-fixtures": path.resolve(workspaceRoot, "apps/playground-fixtures/src/index.ts"),
        "@tiptap/vue-2$": playgroundPackagePath("@tiptap/vue-2", "dist/index.js"),
        "@tiptap/vue-2/menus": playgroundPackagePath("@tiptap/vue-2", "dist/menus/index.js"),
        "@tiptap/pm/changeset": tiptapPmPath("changeset"),
        "@tiptap/pm/commands": tiptapPmPath("commands"),
        "@tiptap/pm/dropcursor": tiptapPmPath("dropcursor"),
        "@tiptap/pm/gapcursor": tiptapPmPath("gapcursor"),
        "@tiptap/pm/history": tiptapPmPath("history"),
        "@tiptap/pm/inputrules": tiptapPmPath("inputrules"),
        "@tiptap/pm/keymap": tiptapPmPath("keymap"),
        "@tiptap/pm/model": tiptapPmPath("model"),
        "@tiptap/pm/schema-list": tiptapPmPath("schema-list"),
        "@tiptap/pm/state": tiptapPmPath("state"),
        "@tiptap/pm/tables": tiptapPmPath("tables"),
        "@tiptap/pm/transform": tiptapPmPath("transform"),
        "@tiptap/pm/view": tiptapPmPath("view"),
        lowlight: packagePath("lowlight", "index.js"),
        "@mermaid-js/parser$": pnpmPackagePath("@mermaid-js+parser@1.2.0", "@mermaid-js/parser", "dist/mermaid-parser.core.mjs"),
        devlop$: pnpmPackagePath("devlop@1.1.0", "devlop", "lib/default.js"),
        uuid$: pnpmPackagePath("uuid@14.0.1", "uuid", "dist/index.js"),
      },
    },
    module: {
      rules: [
        {
          test: /\.mjs$/,
          include: /node_modules/,
          type: "javascript/auto"
        },
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: "ts-loader",
              options: {
                transpileOnly: true,
                compilerOptions: {
                  target: "ES2019",
                  module: "ESNext",
                  moduleResolution: "Node"
                }
              }
            }
          ],
          include: [
            path.resolve(markweaveRoot, "src"),
            path.resolve(workspaceRoot, "apps/playground-fixtures/src")
          ]
        }
      ]
    }
  },
  devServer: {
    host: "127.0.0.1",
    port: 5175,
  },
};
