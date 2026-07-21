import { spawn } from "node:child_process";
import process from "node:process";
import { chromium } from "@playwright/test";

const port = Number(process.env.MARKWEAVE_BENCHMARK_PORT ?? 4173);
const baseUrl = process.env.MARKWEAVE_BENCHMARK_URL ?? `http://127.0.0.1:${port}`;
const fixtureNames = process.argv.slice(2);
const fixtures = fixtureNames.length
  ? fixtureNames
  : [
      "250k Text Fixture",
      "250k Valid Media Fixture",
      "250k Missing Media Fixture",
      "1MB Stress Fixture",
    ];
const server = process.env.MARKWEAVE_BENCHMARK_URL
  ? null
  : spawn(
      "pnpm",
      ["--filter", "@markweave/playground-react", "dev", "--port", String(port)],
      { cwd: process.cwd(), stdio: "ignore" },
    );

try {
  await waitForServer(baseUrl);
  const browser = await launchBenchmarkBrowser();
  try {
    const results = [];
    for (const fixture of fixtures) {
      const page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
      await page.addInitScript(() => {
        globalThis.__markweaveBenchmark = { longTasks: [] };
        try {
          const observer = new PerformanceObserver((entries) => {
            for (const entry of entries.getEntries()) {
              globalThis.__markweaveBenchmark.longTasks.push(entry.duration);
            }
          });
          observer.observe({ type: "longtask", buffered: true });
        } catch {
          // Long Task API is diagnostic-only and may be unavailable.
        }
      });
      await page.goto(`${baseUrl}?benchmark=1`, { waitUntil: "networkidle" });
      await page.locator("details.markweave-debug-panel").evaluate((element) => {
        element.open = true;
      });
      const profiling = process.env.MARKWEAVE_BENCHMARK_PROFILE === "1";
      const cdp = profiling ? await page.context().newCDPSession(page) : null;
      if (cdp) {
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.start");
      }
      await page.evaluate(() => {
        if (globalThis.__markweaveBenchmark) {
          globalThis.__markweaveBenchmark.longTasks = [];
        }
      });
      const startedAt = await page.evaluate(() => performance.now());
      await page.getByRole("button", { name: fixture, exact: true }).click();
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="markweave-editor-frame"]')
            ?.getAttribute("data-markweave-large-document-loading") !== "true",
        undefined,
        { timeout: 30_000 },
      );
      const editor = page.locator('[contenteditable="true"]');
      await editor.waitFor({ state: "visible", timeout: 30_000 });
      await page.waitForFunction(
        () => document.querySelectorAll(".ProseMirror > *").length > 0,
        undefined,
        { timeout: 30_000 },
      );
      const mountedAt = await page.evaluate(() => performance.now());
      await editor.click({ position: { x: 24, y: 24 } });
      const inputSamples = [];
      for (const character of "benchmark-performance") {
        const inputStartedAt = await page.evaluate(() => performance.now());
        await page.keyboard.insertText(character);
        const elapsed = await page.evaluate(
          (startedAt) =>
            new Promise((resolve) =>
              requestAnimationFrame(() => resolve(performance.now() - startedAt)),
            ),
          inputStartedAt,
        );
        inputSamples.push(elapsed);
      }
      const result = await page.evaluate(
        ({ fixture, inputSamples, mountedAt, startedAt }) => {
          const round = (value) => Math.round(value * 10) / 10;
          const percentile = (values, value) => {
            const sorted = [...values].sort((left, right) => left - right);
            return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)] ?? 0;
          };
          const benchmark = globalThis.__markweaveBenchmark;
          const longTasks = benchmark?.longTasks ?? [];
          const memory = performance.memory;
          return {
            domNodes: document.querySelectorAll("*").length,
            fixture,
            inputToPaintP95Ms: round(percentile(inputSamples, 0.95)),
            inputToPaintP99Ms: round(percentile(inputSamples, 0.99)),
            longestTaskMs: round(Math.max(0, ...longTasks)),
            longTaskCount: longTasks.length,
            mountMs: round(mountedAt - startedAt),
            nodeViews: document.querySelectorAll('[data-markweave-lightweight-image="true"]').length,
            rendererHeapBytes: memory?.usedJSHeapSize ?? null,
          };
        },
        { fixture, inputSamples, mountedAt, startedAt },
      );
      if (cdp) {
        const { profile } = await cdp.send("Profiler.stop");
        result.profile = summarizeCpuProfile(profile);
        await cdp.detach();
      }
      results.push(result);
      await page.close();
    }

    process.stdout.write(`${JSON.stringify({ platform: process.platform, results, version: 1 }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
} finally {
  server?.kill("SIGTERM");
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for benchmark server at ${url}`);
}

async function launchBenchmarkBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Executable doesn't exist")) {
      throw error;
    }
    return chromium.launch({ channel: "chrome", headless: true });
  }
}

function summarizeCpuProfile(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const hits = new Map();
  for (const sample of profile.samples ?? []) {
    hits.set(sample, (hits.get(sample) ?? 0) + 1);
  }
  return [...hits.entries()]
    .map(([id, samples]) => {
      const frame = nodes.get(id)?.callFrame;
      return {
        function: frame?.functionName || "(anonymous)",
        line: frame?.lineNumber ?? null,
        samples,
        url: frame?.url ? frame.url.replace(/^.*\/src\//, "src/") : "",
      };
    })
    .sort((left, right) => right.samples - left.samples)
    .slice(0, 20);
}
