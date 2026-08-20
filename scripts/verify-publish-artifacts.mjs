import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publishablePackages = [
  "packages/markweave",
  "packages/markweave-react",
  "packages/markweave-vue2",
  "packages/markweave-vue3",
];
const errors = [];

function listFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function collectManifestTargets(value) {
  if (typeof value === "string") {
    return value.includes("*") ? [] : [value];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap(collectManifestTargets);
}

function requireFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    errors.push(`${label}: missing ${relative(workspaceRoot, path)}`);
    return false;
  }
  return true;
}

function collectEsmImports(source, path) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const requests = [];

  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)) {
      requests.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])) {
      requests.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return requests;
}

function verifyLegacyBundle(packageRoot, packageLabel, allowedExternal) {
  const legacyRoot = resolve(packageRoot, "dist/legacy");
  const legacyEntry = resolve(legacyRoot, "index.js");
  if (!requireFile(legacyEntry, `${packageLabel} legacy`)) {
    return;
  }

  const javascriptFiles = listFiles(legacyRoot).filter((path) => path.endsWith(".js"));
  const totalBytes = javascriptFiles.reduce((sum, path) => sum + statSync(path).size, 0);
  if (javascriptFiles.length > 150) {
    errors.push(`${packageLabel}: legacy build emitted ${javascriptFiles.length} JavaScript files; expected at most 150`);
  }
  if (totalBytes > 8 * 1024 * 1024) {
    errors.push(`${packageLabel}: legacy JavaScript exceeds the 8 MiB release budget`);
  }

  const mermaidArtifacts = javascriptFiles.filter((path) =>
    readFileSync(path, "utf8").includes("globalThis.__esbuild_esm_mermaid_nm"),
  );
  if (mermaidArtifacts.length !== 1) {
    errors.push(`${packageLabel}: expected one self-contained legacy Mermaid artifact, received ${mermaidArtifacts.length}`);
  } else if (!readFileSync(mermaidArtifacts[0], "utf8").includes("export default globalThis.mermaid")) {
    errors.push(`${packageLabel}: legacy Mermaid artifact does not expose the browser bundle default`);
  }

  for (const path of javascriptFiles) {
    const source = readFileSync(path, "utf8");
    if (/(?<![.$\w])require\s*\(/.test(source)) {
      errors.push(`${packageLabel}: browser legacy output contains a free require() in ${relative(packageRoot, path)}`);
    }

    for (const request of collectEsmImports(source, path)) {
      if (request.startsWith(".") || allowedExternal(request)) {
        continue;
      }
      errors.push(`${packageLabel}: unexpected legacy external ${request} in ${relative(packageRoot, path)}`);
    }
  }
}

const manifests = publishablePackages.map((packagePath) => {
  const packageRoot = resolve(workspaceRoot, packagePath);
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  return { manifest, packagePath, packageRoot };
});
const expectedVersion = manifests[0].manifest.version;

for (const { manifest, packagePath, packageRoot } of manifests) {
  if (manifest.version !== expectedVersion) {
    errors.push(`${packagePath}: expected version ${expectedVersion}, received ${manifest.version}`);
  }
  if (manifest.scripts?.prepack !== "pnpm run build") {
    errors.push(`${packagePath}: prepack must run pnpm run build`);
  }

  const manifestTargets = [
    manifest.main,
    manifest.module,
    manifest.types,
    manifest.style,
    ...collectManifestTargets(manifest.exports),
  ].filter(Boolean);
  for (const target of new Set(manifestTargets)) {
    requireFile(resolve(packageRoot, target), packagePath);
  }

  const sourceFiles = listFiles(resolve(packageRoot, "src")).filter((path) =>
    [".ts", ".tsx"].includes(extname(path)) && !path.endsWith(".d.ts"),
  );
  const mainOutput = resolve(packageRoot, manifest.main);
  if (sourceFiles.length && requireFile(mainOutput, packagePath)) {
    const newestSource = Math.max(...sourceFiles.map((path) => statSync(path).mtimeMs));
    if (statSync(mainOutput).mtimeMs + 1_000 < newestSource) {
      errors.push(`${packagePath}: build output is older than package source`);
    }
  }
}

const isCoreLegacyExternal = (request) =>
  request === "@tiptap/core"
  || request.startsWith("@tiptap/core/")
  || request === "@tiptap/pm"
  || request.startsWith("@tiptap/pm/")
  || request.startsWith("prosemirror-");
verifyLegacyBundle(resolve(workspaceRoot, "packages/markweave"), "packages/markweave", isCoreLegacyExternal);
verifyLegacyBundle(
  resolve(workspaceRoot, "packages/markweave-vue2"),
  "packages/markweave-vue2",
  (request) => request === "vue"
    || request === "@tiptap/vue-2"
    || request.startsWith("@tiptap/vue-2/")
    || isCoreLegacyExternal(request),
);

const coreRoot = resolve(workspaceRoot, "packages/markweave");
const coreSourceRoot = resolve(coreRoot, "src");
for (const sourcePath of listFiles(coreSourceRoot).filter((path) => path.endsWith(".ts") && !path.endsWith(".d.ts"))) {
  const sourceRelativePath = relative(coreSourceRoot, sourcePath).replace(/\.ts$/, "");
  requireFile(resolve(coreRoot, "dist", `${sourceRelativePath}.js`), "packages/markweave source coverage");
  requireFile(resolve(coreRoot, "dist/types", `${sourceRelativePath}.d.ts`), "packages/markweave declaration coverage");
}

const sourceStyles = resolve(coreSourceRoot, "editor-core/markweave-editor.css");
const builtStyles = resolve(coreRoot, "dist/styles.css");
if (requireFile(builtStyles, "packages/markweave styles") && readFileSync(sourceStyles, "utf8") !== readFileSync(builtStyles, "utf8")) {
  errors.push("packages/markweave: dist/styles.css does not match the editor source stylesheet");
}

const imageClipboardArtifact = resolve(coreRoot, "dist/plugins/media/image-clipboard.js");
if (requireFile(imageClipboardArtifact, "packages/markweave Madora image bridge")) {
  const imageClipboardSource = readFileSync(imageClipboardArtifact, "utf8");
  if (!imageClipboardSource.includes("madoraDrawingReferencePattern") || !imageClipboardSource.includes("madora-asset")) {
    errors.push("packages/markweave: built image clipboard is missing Madora asset and drawing-reference support");
  }
}

if (errors.length) {
  process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Verified publish artifacts for ${publishablePackages.length} packages at ${expectedVersion}.\n`);
}
