import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestPlaygroundAskAi } from "@markweave/playground-fixtures";

const require = createRequire(import.meta.url);
const { createOpenRouterDevMiddleware } = require("../../playground-fixtures/openrouter-dev-proxy.cjs") as {
  createOpenRouterDevMiddleware(options: {
    readonly workspaceRoot: string;
    readonly fetchImpl?: typeof fetch;
    readonly env?: Record<string, string | undefined>;
  }): (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, next: () => void) => void;
};

const workspaceRoot = resolve(__dirname, "../../..");
const activeServers = new Set<Server>();

async function listen(server: Server) {
  activeServers.add(server);
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected an IPv4 test server address.");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all([...activeServers].map((server) => new Promise<void>((resolveClose) => server.close(() => resolveClose()))));
  activeServers.clear();
  vi.restoreAllMocks();
});

describe("playground OpenRouter browser handler", () => {
  it("sends only the Ask AI request context and yields streamed text chunks", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("first "));
        controller.enqueue(new TextEncoder().encode("second"));
        controller.close();
      },
    }), { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } }));
    const controller = new AbortController();
    const chunks: string[] = [];

    for await (const chunk of requestPlaygroundAskAi({
      id: "ask-ai-test",
      prompt: "Improve this",
      lang: "en",
      selection: { from: 2, to: 8, text: "selected", html: "<p>selected</p>" },
      outputFormat: "markdown",
      signal: controller.signal,
    }, fetchMock)) {
      chunks.push(chunk);
    }

    expect(chunks.join("")).toBe("first second");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/markweave/ask-ai");
    expect(init).toMatchObject({ method: "POST", signal: controller.signal });
    expect(JSON.parse(String(init?.body))).toEqual({
      id: "ask-ai-test",
      prompt: "Improve this",
      lang: "en",
      selection: { from: 2, to: 8, text: "selected", html: "<p>selected</p>" },
      outputFormat: "markdown",
    });
  });

  it("reports proxy errors without treating them as generated Markdown", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: "OpenRouter is not configured for this playground.",
    }), { status: 503, headers: { "content-type": "application/json" } }));

    await expect(async () => {
      for await (const _chunk of requestPlaygroundAskAi({
        id: "ask-ai-test",
        prompt: "Improve this",
        lang: "en",
        selection: { from: 2, to: 8, text: "selected", html: "<p>selected</p>" },
        outputFormat: "markdown",
        signal: new AbortController().signal,
      }, fetchMock)) {
        // The proxy error must reject before yielding content.
      }
    }).rejects.toThrow("OpenRouter is not configured for this playground.");
  });

  it("forwards the table target contract without adding document context", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("| 姓名 | 职位 |", { status: 200 }));
    const target = {
      kind: "table" as const,
      scope: "row" as const,
      tablePos: 1,
      axisIndex: 1,
      cellPositions: [8, 15],
      rows: 1,
      columns: 2,
      text: "Alice\tEngineer",
      html: "<td>Alice</td><td>Engineer</td>",
      markdown: "| Alice | Engineer |\n| --- | --- |",
      resultShape: "table" as const,
      cells: [
        { position: 8, row: 0, column: 0, rowSpan: 1, columnSpan: 1, text: "Alice", html: "<p>Alice</p>" },
        { position: 15, row: 0, column: 1, rowSpan: 1, columnSpan: 1, text: "Engineer", html: "<p>Engineer</p>" },
      ],
    };

    for await (const _chunk of requestPlaygroundAskAi({
      id: "ask-ai-table",
      prompt: "翻译",
      lang: "zh",
      selection: { from: 9, to: 24, text: "Alice\tEngineer", html: target.html },
      target,
      outputFormat: "markdown",
      signal: new AbortController().signal,
    }, fetchMock)) {
      // Consume the deterministic response stream.
    }

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.target).toEqual(target);
    expect(payload).not.toHaveProperty("document");
  });
});

describe("playground OpenRouter development proxy", () => {
  it("keeps credentials server-side and converts OpenRouter SSE to plain streamed text", async () => {
    let upstreamInit: RequestInit | undefined;
    const upstreamFetch = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      upstreamInit = init;
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("data: {\"choices\":[{\"delta\":{\"content\":\"Hello \"}}]}\n\n"));
          controller.enqueue(encoder.encode("data: {\"choices\":[{\"delta\":{\"content\":\"world\"}}]}\n\n"));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      }), { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    const middleware = createOpenRouterDevMiddleware({
      workspaceRoot,
      fetchImpl: upstreamFetch,
      env: { OPENROUTER_API_KEY: "test-only-key", OPENROUTER_MODEL: "openrouter/free" },
    });
    const server = createServer((request, response) => middleware(request, response, () => {
      response.writeHead(404).end();
    }));
    const origin = await listen(server);

    const response = await fetch(`${origin}/api/markweave/ask-ai`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "request-1",
        prompt: "Rewrite",
        lang: "en",
        selection: { from: 1, to: 5, text: "Text", html: "<p>Text</p>" },
        outputFormat: "markdown",
      }),
    });

    expect(response.status).toBe(200);
    const responseText = await response.text();
    expect(responseText).toBe("Hello world");
    expect(upstreamFetch).toHaveBeenCalledWith("https://openrouter.ai/api/v1/chat/completions", expect.any(Object));
    expect(new Headers(upstreamInit?.headers).get("authorization")).toBe("Bearer test-only-key");
    const upstreamBody = JSON.parse(String(upstreamInit?.body));
    expect(upstreamBody).toMatchObject({ model: "openrouter/free", stream: true });
    expect(upstreamBody.messages.at(-1).content).toContain("Rewrite");
    expect(upstreamBody.messages.at(-1).content).toContain("Text");
    expect(responseText).not.toContain("test-only-key");
  });

  it("fails closed when the local API key is absent", async () => {
    const middleware = createOpenRouterDevMiddleware({ workspaceRoot, env: {} });
    const server = createServer((request, response) => middleware(request, response, () => {
      response.writeHead(404).end();
    }));
    const origin = await listen(server);

    const response = await fetch(`${origin}/api/markweave/ask-ai`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "request-1",
        prompt: "Rewrite",
        lang: "en",
        selection: { from: 1, to: 5, text: "Text", html: "<p>Text</p>" },
        outputFormat: "markdown",
      }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "OpenRouter is not configured for this playground." });
  });

  it("instructs OpenRouter to return an exact-shape GFM table for table targets", async () => {
    let upstreamInit: RequestInit | undefined;
    const upstreamFetch = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      upstreamInit = init;
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
        },
      }), { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    const middleware = createOpenRouterDevMiddleware({
      workspaceRoot,
      fetchImpl: upstreamFetch,
      env: { OPENROUTER_API_KEY: "test-only-key", OPENROUTER_MODEL: "openrouter/free" },
    });
    const server = createServer((request, response) => middleware(request, response, () => response.writeHead(404).end()));
    const origin = await listen(server);
    const target = {
      kind: "table",
      scope: "row",
      tablePos: 1,
      axisIndex: 1,
      cellPositions: [8, 15],
      rows: 1,
      columns: 2,
      text: "Alice\tEngineer",
      html: "<td>Alice</td><td>Engineer</td>",
      markdown: "| Alice | Engineer |\n| --- | --- |",
      resultShape: "table",
      cells: [
        { position: 8, row: 0, column: 0, rowSpan: 1, columnSpan: 1, text: "Alice", html: "<p>Alice</p>" },
        { position: 15, row: 0, column: 1, rowSpan: 1, columnSpan: 1, text: "Engineer", html: "<p>Engineer</p>" },
      ],
    };

    const response = await fetch(`${origin}/api/markweave/ask-ai`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "request-table-1",
        prompt: "Translate",
        lang: "en",
        selection: { from: 9, to: 24, text: target.text, html: target.html },
        target,
        outputFormat: "markdown",
      }),
    });

    expect(response.status).toBe(200);
    const messages = JSON.parse(String(upstreamInit?.body)).messages;
    expect(messages[0].content).toContain("exactly 1 data row(s) and 2 column(s)");
    expect(messages[1].content).toContain("Table target scope: row");
    expect(messages[1].content).toContain(target.markdown);
    expect(messages[1].content).not.toContain("private document context");
  });
});
