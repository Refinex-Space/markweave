const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const ASK_AI_ROUTE = "/api/markweave/ask-ai";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MAX_REQUEST_BYTES = 128 * 1024;

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseEnvFile(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function loadLocalEnv(workspaceRoot) {
  let fileEnv = {};
  try {
    fileEnv = parseEnvFile(readFileSync(resolve(workspaceRoot, ".env"), "utf8"));
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
  return { ...fileEnv, ...process.env };
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new RequestError(413, "Ask AI request is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError(400, "Ask AI request must contain valid JSON.");
  }
}

function validateRequest(body) {
  if (!body || typeof body !== "object") throw new RequestError(400, "Ask AI request is invalid.");
  if (typeof body.id !== "string" || !body.id.trim()) throw new RequestError(400, "Ask AI request id is required.");
  if (typeof body.prompt !== "string" || !body.prompt.trim()) throw new RequestError(400, "Ask AI prompt is required.");
  if (body.lang !== "en" && body.lang !== "zh") throw new RequestError(400, "Ask AI language is invalid.");
  if (body.outputFormat !== "markdown") throw new RequestError(400, "Ask AI output format must be Markdown.");
  if (!body.selection || typeof body.selection !== "object") throw new RequestError(400, "Ask AI selection is required.");
  if (typeof body.selection.text !== "string") throw new RequestError(400, "Ask AI selection text is invalid.");
  if (typeof body.selection.html !== "string") throw new RequestError(400, "Ask AI selection HTML is invalid.");
  if (!Number.isSafeInteger(body.selection.from) || !Number.isSafeInteger(body.selection.to)) {
    throw new RequestError(400, "Ask AI selection range is invalid.");
  }
  if (body.target !== undefined) validateTarget(body.target);
  if (body.target?.kind !== "table" && !body.selection.text.trim()) {
    throw new RequestError(400, "Ask AI selection text is required.");
  }
  return body;
}

function validateTarget(target) {
  if (!target || typeof target !== "object" || (target.kind !== "text" && target.kind !== "table")) {
    throw new RequestError(400, "Ask AI target is invalid.");
  }
  if (target.kind === "text") return;
  if (!["cell", "row", "column", "selection", "table"].includes(target.scope)) {
    throw new RequestError(400, "Ask AI table target scope is invalid.");
  }
  if (!Number.isSafeInteger(target.rows) || target.rows <= 0 || !Number.isSafeInteger(target.columns) || target.columns <= 0) {
    throw new RequestError(400, "Ask AI table target shape is invalid.");
  }
  if ((target.resultShape !== "fragment" && target.resultShape !== "table") || typeof target.markdown !== "string" || typeof target.html !== "string") {
    throw new RequestError(400, "Ask AI table target content is invalid.");
  }
  if (!Array.isArray(target.cells) || (target.resultShape === "table" && target.cells.length !== target.rows * target.columns)) {
    throw new RequestError(400, "Ask AI table target cells do not match its shape.");
  }
  if (target.resultShape === "fragment" && target.cells.length !== 1) {
    throw new RequestError(400, "Ask AI table fragment targets must contain one cell.");
  }
  if (target.cells.some((cell) => !cell || typeof cell.text !== "string" || typeof cell.html !== "string")) {
    throw new RequestError(400, "Ask AI table target cell content is invalid.");
  }
}

function createOpenRouterMessages(body) {
  const language = body.lang === "zh" ? "Chinese" : "English";
  const tableTarget = body.target?.kind === "table" ? body.target : null;
  const outputContract = tableTarget?.resultShape === "table"
    ? `Return one GFM table with exactly ${tableTarget.rows} data row(s) and ${tableTarget.columns} column(s). The GFM separator row is structural and does not count as a data row. Do not add text before or after the table.`
    : tableTarget?.resultShape === "fragment"
      ? "Return only the replacement Markdown fragment for the single target cell. Do not wrap it in a table."
      : "Return only the replacement content as valid Markdown, without code fences, commentary, or labels.";
  return [
    {
      role: "system",
      content: [
        "You are the writing assistant embedded in Markweave, a Markdown editor.",
        "Apply the user's instruction only to the selected content supplied as data.",
        outputContract,
        `Use ${language} unless the user's instruction explicitly requests another language.`,
      ].join(" "),
    },
    {
      role: "user",
      content: tableTarget
        ? [
            "Instruction:",
            body.prompt.trim(),
            "",
            `Table target scope: ${tableTarget.scope}`,
            `Required result shape: ${tableTarget.rows} row(s) x ${tableTarget.columns} column(s)`,
            "",
            "Target Markdown:",
            tableTarget.markdown,
            "",
            "Target HTML (formatting reference only):",
            tableTarget.html,
          ].join("\n")
        : [
            "Instruction:",
            body.prompt.trim(),
            "",
            "Selected plain text:",
            body.selection.text,
            "",
            "Selected HTML (formatting reference only):",
            body.selection.html,
          ].join("\n"),
    },
  ];
}

function parseSseEvent(block) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
  if (!data) return null;
  if (data === "[DONE]") return { done: true, content: "" };
  const payload = JSON.parse(data);
  if (payload.error) {
    throw new Error(typeof payload.error.message === "string" ? payload.error.message : "OpenRouter stream failed.");
  }
  const content = payload.choices?.[0]?.delta?.content;
  return { done: false, content: typeof content === "string" ? content : "" };
}

async function* iterateOpenRouterContent(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";
      for (const block of events) {
        const event = parseSseEvent(block);
        if (!event) continue;
        if (event.done) return;
        if (event.content) yield event.content;
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const event = parseSseEvent(buffer);
      if (event && !event.done && event.content) yield event.content;
    }
  } finally {
    reader.releaseLock();
  }
}

async function readOpenRouterError(response) {
  try {
    const payload = await response.json();
    if (typeof payload?.error?.message === "string") return payload.error.message;
    if (typeof payload?.error === "string") return payload.error;
  } catch {
    // Fall through to a stable error without reflecting arbitrary upstream content.
  }
  return `OpenRouter request failed with status ${response.status}.`;
}

function createOpenRouterDevMiddleware(options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("This playground requires a Node.js runtime with fetch support.");

  return async function openRouterDevMiddleware(request, response, next) {
    const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
    if (pathname !== ASK_AI_ROUTE) return next();
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      return sendJson(response, 405, { error: "Ask AI only accepts POST requests." });
    }

    const env = options.env === undefined ? loadLocalEnv(options.workspaceRoot) : options.env;
    const apiKey = env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return sendJson(response, 503, { error: "OpenRouter is not configured for this playground." });

    const abortController = new AbortController();
    const abortUpstream = () => abortController.abort();
    request.once("aborted", abortUpstream);
    response.once("close", abortUpstream);

    try {
      const body = validateRequest(await readJsonBody(request));
      const headers = {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      };
      if (env.OPENROUTER_APP_URL?.trim()) headers["HTTP-Referer"] = env.OPENROUTER_APP_URL.trim();
      if (env.OPENROUTER_APP_NAME?.trim()) headers["X-OpenRouter-Title"] = env.OPENROUTER_APP_NAME.trim();

      const upstream = await fetchImpl(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL?.trim() || "openrouter/free",
          messages: createOpenRouterMessages(body),
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!upstream.ok) throw new RequestError(upstream.status, await readOpenRouterError(upstream));
      if (!upstream.body) throw new RequestError(502, "OpenRouter returned an empty response stream.");

      response.statusCode = 200;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.setHeader("x-content-type-options", "nosniff");
      response.flushHeaders?.();
      for await (const content of iterateOpenRouterContent(upstream.body)) {
        if (abortController.signal.aborted) return;
        response.write(content);
      }
      response.end();
    } catch (error) {
      if (abortController.signal.aborted) return;
      const status = error instanceof RequestError ? error.status : 502;
      const message = error instanceof Error ? error.message : "OpenRouter request failed.";
      if (!response.headersSent) sendJson(response, status, { error: message });
      else response.destroy(error instanceof Error ? error : undefined);
    } finally {
      request.off("aborted", abortUpstream);
      response.off("close", abortUpstream);
    }
  };
}

module.exports = {
  ASK_AI_ROUTE,
  createOpenRouterDevMiddleware,
  iterateOpenRouterContent,
  parseEnvFile,
};
