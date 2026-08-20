import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import process from "node:process";

const pnpmCli = process.env.npm_execpath;

if (!pnpmCli) {
  throw new Error("Run this verification through the pnpm build:vue2-legacy script.");
}

const startedAt = performance.now();
const result = spawnSync(
  process.execPath,
  [pnpmCli, "--filter", "@markweave/playground-vue2", "exec", "vue-cli-service", "build"],
  {
    env: {
      ...process.env,
      MARKWEAVE_VUE2_LEGACY: "1",
    },
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
if (process.exitCode === 0) {
  process.stdout.write(`[Markweave Webpack 4 Legacy] consumer build completed in ${((performance.now() - startedAt) / 1_000).toFixed(2)}s.\n`);
}
