import { spawnSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { verifyVue2Webpack4StatsFile } from "./verify-vue2-webpack4-stats.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const matrices = [
  {
    name: "minimum",
    vue: "2.6.12",
    vueCli: "4.4.6",
  },
  {
    name: "final",
    vue: "2.7.16",
    vueCli: "4.5.19",
  },
];
const maxVue2TarballBytes = 1.75 * 1024 * 1024;

function runPnpm(args, cwd) {
  const pnpmCli = process.env.npm_execpath;
  const command = pnpmCli ? process.execPath : "pnpm";
  const commandArgs = pnpmCli ? [pnpmCli, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function findTarball(directory, packageName) {
  const normalizedName = packageName.replace(/^@/, "").replaceAll("/", "-");
  const tarball = readdirSync(directory)
    .find((name) => name.startsWith(`${normalizedName}-`) && name.endsWith(".tgz"));
  if (!tarball) {
    throw new Error(`Packed tarball is missing for ${packageName}`);
  }
  return resolve(directory, tarball);
}

function writeConsumerFiles(consumerRoot, matrix, coreTarball, vue2Tarball) {
  mkdirSync(resolve(consumerRoot, "public"), { recursive: true });
  mkdirSync(resolve(consumerRoot, "src"), { recursive: true });
  writeFileSync(resolve(consumerRoot, "package.json"), `${JSON.stringify({
    name: `markweave-vue2-packed-${matrix.name}`,
    private: true,
    version: "0.0.0",
    packageManager: "pnpm@11.7.0",
    scripts: { build: "vue-cli-service build --report-json" },
    dependencies: {
      "@markweave/vue2": `file:${vue2Tarball}`,
      "core-js": "3.50.0",
      markweave: `file:${coreTarball}`,
      vue: matrix.vue,
      "vue-template-compiler": matrix.vue,
    },
    devDependencies: {
      "@vue/cli-plugin-babel": matrix.vueCli,
      "@vue/cli-service": matrix.vueCli,
      "babel-loader": "8.4.1",
      webpack: "4.47.0",
    },
  }, null, 2)}\n`);
  writeFileSync(resolve(consumerRoot, "babel.config.js"), `module.exports = {\n  presets: ["@vue/cli-plugin-babel/preset"],\n};\n`);
  writeFileSync(resolve(consumerRoot, "vue.config.js"), `const applyMarkweaveVue2Webpack4Legacy = require("@markweave/vue2/webpack4");\n\nmodule.exports = {\n  productionSourceMap: false,\n  chainWebpack(config) {\n    config.resolve.symlinks(false);\n    applyMarkweaveVue2Webpack4Legacy(config, { projectRoot: __dirname });\n  },\n};\n`);
  writeFileSync(resolve(consumerRoot, "public/index.html"), `<!doctype html>\n<html><head><meta charset="utf-8"><title>Markweave packed Vue 2 smoke</title></head><body><div id="app"></div></body></html>\n`);
  writeFileSync(resolve(consumerRoot, "src/main.js"), `import Vue from "vue";\nimport { MarkweaveEditor } from "@markweave/vue2";\nimport "@markweave/vue2/styles.css";\n\nnew Vue({\n  data() {\n    return { mode: "live" };\n  },\n  render(h) {\n    return h("main", [\n      h("button", {\n        attrs: { "data-testid": "packed-mode-toggle", type: "button" },\n        on: { click: () => { this.mode = this.mode === "live" ? "view" : "live"; } },\n      }, this.mode),\n      h(MarkweaveEditor, {\n        props: {\n          ariaLabel: "Packed Vue 2 editor",\n          defaultContent: "# Packed Consumer\\n\\n~~~mermaid\\ngraph TD\\n  A[Packed] --> B[Verified]\\n~~~\\n\\nSmoke target",\n          innerToc: false,\n          mode: this.mode,\n          onUpdate: (payload) => { window.__markweavePackedMarkdown = payload.markdown; },\n        },\n      }),\n    ]);\n  },\n}).$mount("#app");\n`);
}

function contentType(path) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  }[extname(path)] ?? "application/octet-stream";
}

async function serveDirectory(directory) {
  const root = resolve(directory);
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    if (pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    const filePath = resolve(root, pathname === "/" ? "index.html" : `.${pathname}`);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": contentType(filePath) });
    createReadStream(filePath).pipe(response);
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Packed consumer HTTP server did not expose a TCP address");
  }
  return {
    close: () => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())),
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function launchPackedBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Executable doesn't exist")) {
      throw error;
    }
    return chromium.launch({ channel: "chrome", headless: true });
  }
}

async function smokePackedConsumer(distRoot, matrixName) {
  const server = await serveDirectory(distRoot);
  const browser = await launchPackedBrowser();
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.goto(server.url, { waitUntil: "networkidle" });
    const frame = page.locator('[data-testid="markweave-editor-frame"]');
    await frame.waitFor({ state: "visible" });
    await page.locator('[aria-label="Mermaid preview"] svg').first().waitFor({ state: "visible" });
    const surface = page.locator(".ProseMirror");
    await surface.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" packed-smoke");
    await page.waitForFunction(() => globalThis.__markweavePackedMarkdown?.includes("packed-smoke") === true);
    await page.locator('[data-testid="packed-mode-toggle"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-mode") === "view");
    if (await surface.getAttribute("contenteditable") !== "false") {
      throw new Error("Packed consumer did not become read-only in View mode");
    }
    if (errors.length) {
      throw new Error(`Packed consumer browser errors:\n- ${errors.join("\n- ")}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  process.stdout.write(`[Markweave Packed Vue 2] ${matrixName} browser smoke passed.\n`);
}

function safelyRemoveTempRoot(tempRoot) {
  const resolvedTempRoot = resolve(tempRoot);
  const resolvedSystemTemp = resolve(tmpdir());
  if (!resolvedTempRoot.startsWith(`${resolvedSystemTemp}${sep}`) || !basename(resolvedTempRoot).startsWith("markweave-vue2-packed-")) {
    throw new Error(`Refusing to remove unexpected temporary directory: ${resolvedTempRoot}`);
  }
  rmSync(resolvedTempRoot, { recursive: true, force: true });
}

const tempRoot = mkdtempSync(join(tmpdir(), "markweave-vue2-packed-"));
let succeeded = false;
try {
  const artifactsRoot = resolve(tempRoot, "artifacts");
  mkdirSync(artifactsRoot, { recursive: true });
  runPnpm(["--filter", "markweave", "pack", "--pack-destination", artifactsRoot], workspaceRoot);
  runPnpm(["--filter", "@markweave/vue2", "pack", "--pack-destination", artifactsRoot], workspaceRoot);
  const coreTarball = findTarball(artifactsRoot, "markweave");
  const vue2Tarball = findTarball(artifactsRoot, "@markweave/vue2");
  const vue2TarballBytes = statSync(vue2Tarball).size;
  if (vue2TarballBytes > maxVue2TarballBytes) {
    throw new Error(`@markweave/vue2 tarball exceeds ${(maxVue2TarballBytes / 1024).toFixed(2)} KiB: ${(vue2TarballBytes / 1024).toFixed(2)} KiB`);
  }

  for (const matrix of matrices) {
    const consumerRoot = resolve(tempRoot, matrix.name);
    mkdirSync(consumerRoot, { recursive: true });
    writeConsumerFiles(consumerRoot, matrix, coreTarball, vue2Tarball);
    runPnpm(["install", "--ignore-scripts", "--prefer-offline"], consumerRoot);
    runPnpm(["run", "build"], consumerRoot);
    const statsPath = resolve(consumerRoot, "dist/report.json");
    const summary = verifyVue2Webpack4StatsFile(statsPath);
    rmSync(statsPath, { force: true });
    await smokePackedConsumer(resolve(consumerRoot, "dist"), matrix.name);
    process.stdout.write(`[Markweave Packed Vue 2] ${matrix.name} Vue ${matrix.vue} / Vue CLI ${matrix.vueCli} passed. ${JSON.stringify(summary)}\n`);
  }
  succeeded = true;
} catch (error) {
  process.stderr.write(`[Markweave Packed Vue 2] preserved failed fixture at ${tempRoot}\n`);
  throw error;
} finally {
  if (succeeded) {
    safelyRemoveTempRoot(tempRoot);
  }
}
