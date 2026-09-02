import { useEffect, useState } from "react";
import { Eye, ListChecks, Moon, PencilLine, Sparkles, Sun } from "lucide-react";
import {
  createMarkweaveEditorExtensions,
  MarkweaveEditor,
  type MarkweaveAiEditController,
  type MarkweaveAttachmentDownloadHandler,
  type MarkweaveContentFormat,
  type MarkweaveDocumentLoadState,
  type FloatingToolbarAssistantRequest,
  type MarkweaveEditorMode,
  type MarkweaveTheme,
  type MarkweaveEditorRuntimeSnapshot,
  type MarkweaveSearchController,
  type MarkweaveMenuCopyPayload,
  type MarkweaveCommandController,
  type MarkweaveUploadRequest,
  type MarkweaveUploadResult,
  type TableCommandResult,
  type TableEditWithAiRequest,
} from "@markweave/react";
import {
  createPlaygroundUploadResult,
  createPlaygroundHostCommands,
  createPlaygroundHostExtension,
  downloadPlaygroundAttachment,
  flakyMediaRecoveryFixture,
  initialPlaygroundDocument,
  largeDocumentPerformanceFixture,
  largeMixedMediaPerformanceFixture,
  largeMissingMediaPerformanceFixture,
  largeTextPerformanceFixture,
  largeValidMediaPerformanceFixture,
  mergedTablePlaygroundDocument,
  playgroundAskAiConfig,
  playgroundCommandGroups,
  resolvePlaygroundLinkCard,
  resolvePlaygroundMediaSource,
  streamPlaygroundAiEditProposal,
  stressDocumentPerformanceFixture,
} from "@markweave/playground-fixtures";

const playgroundHostCommands = createPlaygroundHostCommands();
const playgroundParagraphExtension = createMarkweaveEditorExtensions().find((extension) => extension.name === "paragraph");
if (!playgroundParagraphExtension) throw new Error("The playground requires the paragraph extension.");
const playgroundHostExtension = createPlaygroundHostExtension(playgroundParagraphExtension);

export function MarkweaveEditorPlayground() {
  const [benchmarkMode] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("benchmark") === "1",
  );
  const [fixtureContent, setFixtureContent] = useState(initialPlaygroundDocument);
  const [fixtureFormat, setFixtureFormat] = useState<MarkweaveContentFormat>("markdown");
  const [fixtureRevision, setFixtureRevision] = useState(0);
  const [editorMode, setEditorMode] = useState<MarkweaveEditorMode>("live");
  const [theme, setTheme] = useState<MarkweaveTheme>("light");
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<MarkweaveEditorRuntimeSnapshot | null>(null);
  const [lastTableCopyPayload, setLastTableCopyPayload] = useState<MarkweaveMenuCopyPayload | null>(null);
  const [lastTableCommandResult, setLastTableCommandResult] = useState<TableCommandResult | null>(null);
  const [lastTableEditWithAiRequest, setLastTableEditWithAiRequest] = useState<TableEditWithAiRequest | null>(null);
  const [lastFloatingToolbarAssistantRequest, setLastFloatingToolbarAssistantRequest] = useState<FloatingToolbarAssistantRequest | null>(null);
  const [lastSlashUploadRequest, setLastSlashUploadRequest] = useState<MarkweaveUploadRequest | null>(null);
  const [aiEditController, setAiEditController] = useState<MarkweaveAiEditController | null>(null);
  const [lastAiEditStatus, setLastAiEditStatus] = useState<string | null>(null);
  const [commandController, setCommandController] = useState<MarkweaveCommandController | null>(null);
  const [searchController, setSearchController] = useState<MarkweaveSearchController | null>(null);
  const [lastCommandStatus, setLastCommandStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!benchmarkMode) return;
    (globalThis as typeof globalThis & {
      __markweaveSearchController?: MarkweaveSearchController | null;
    }).__markweaveSearchController = searchController;
    return () => {
      delete (globalThis as typeof globalThis & {
        __markweaveSearchController?: MarkweaveSearchController | null;
      }).__markweaveSearchController;
    };
  }, [benchmarkMode, searchController]);

  const resetDebugState = () => {
    setRuntimeSnapshot(null);
    setLastTableCopyPayload(null);
    setLastTableCommandResult(null);
    setLastTableEditWithAiRequest(null);
    setLastFloatingToolbarAssistantRequest(null);
    setLastSlashUploadRequest(null);
  };

  const recordBenchmarkLoadState = (state: MarkweaveDocumentLoadState) => {
    if (!benchmarkMode) return;
    const benchmark = (globalThis as typeof globalThis & {
      __markweaveBenchmark?: {
        loadStates: Array<{ at: number; phase: MarkweaveDocumentLoadState["phase"] }>;
      };
    }).__markweaveBenchmark;
    benchmark?.loadStates.push({ at: performance.now(), phase: state.phase });
  };

  const loadFixture = (content: string, format: MarkweaveContentFormat = "markdown") => {
    setFixtureContent(content);
    setFixtureFormat(format);
    setFixtureRevision((revision) => revision + 1);
    resetDebugState();
  };

  const handleSlashUpload = async (request: MarkweaveUploadRequest): Promise<MarkweaveUploadResult> => {
    setLastSlashUploadRequest(request);
    return createPlaygroundUploadResult(request);
  };

  const handleAttachmentDownload: MarkweaveAttachmentDownloadHandler = async (attachment) => {
    await downloadPlaygroundAttachment(attachment);
  };

  const runHostAiEdit = async () => {
    if (!aiEditController) return;
    const captured = aiEditController.captureSelection({ metadata: { source: "playground-host" } });
    if (!captured.ok) {
      setLastAiEditStatus(`${captured.code}: ${captured.message}`);
      return;
    }
    let markdown = "";
    try {
      for await (markdown of streamPlaygroundAiEditProposal(captured.value)) {
        aiEditController.updateProposal({ contextId: captured.value.id, markdown, status: "streaming" });
      }
      const completed = aiEditController.updateProposal({
        contextId: captured.value.id,
        markdown,
        status: "complete",
      });
      setLastAiEditStatus(completed.ok ? "Host AI edit is ready for review." : `${completed.code}: ${completed.message}`);
    } catch (error) {
      if (!captured.value.signal.aborted) {
        const message = error instanceof Error ? error.message : "Host AI edit failed.";
        aiEditController.failProposal(captured.value.id, message);
        setLastAiEditStatus(message);
      }
    }
  };

  const runHostAiMultiEdit = () => {
    if (!aiEditController) return;
    const captured = aiEditController.capture({
      scope: "document",
      metadata: { source: "playground-host-multi-edit" },
    });
    if (!captured.ok) {
      setLastAiEditStatus(`${captured.code}: ${captured.message}`);
      return;
    }
    const replacements = [
      ["# Markweave Editor", "# Markweave AI Review"],
      ["## 2. Headings And Paragraph Rhythm", "## 2. Headings, Rhythm, And Review"],
      ["## 7. Code Blocks", "## 7. Code Blocks And Tooling"],
      ["## 11. Keyboard And Slash Checks", "## 11. Keyboard, Slash, And AI Review Checks"],
    ] as const;
    const proposal = replacements.reduce(
      (markdown, [original, revised]) => markdown.replace(original, revised),
      captured.value.target.markdown,
    );
    const completed = aiEditController.updateProposal({
      contextId: captured.value.id,
      markdown: proposal,
      status: "complete",
    });
    setLastAiEditStatus(completed.ok ? "Multi-hunk host AI edit is ready for review." : `${completed.code}: ${completed.message}`);
  };

  const isLiveMode = editorMode === "live";
  const ModeIcon = isLiveMode ? Eye : PencilLine;
  const nextMode: MarkweaveEditorMode = isLiveMode ? "view" : "live";
  const modeToggleLabel = isLiveMode ? "切换到 View 模式" : "切换到 Live 模式";
  const nextTheme: MarkweaveTheme = theme === "light" ? "dark" : "light";
  const themeToggleLabel = theme === "light" ? "切换到暗色主题" : "切换到亮色主题";
  const ThemeIcon = theme === "light" ? Moon : Sun;

  return (
    <main className="markweave-playground" data-theme={theme}>
      <div className="markweave-playground-toolbar" aria-label="Playground controls">
        <button
          type="button"
          className="markweave-playground-command-toggle"
          disabled={!commandController || !isLiveMode}
          aria-label="通过宿主工具栏执行通用命令"
          title="通过宿主工具栏执行通用命令"
          onClick={() => {
            void commandController?.execute("playground.host.insert-status").then((result) => {
              setLastCommandStatus(result.ok ? result.outcome : `${result.code}: ${result.message}`);
            });
          }}
        >
          Host
        </button>
        <button
          type="button"
          className="markweave-playground-ai-edit-toggle"
          disabled={!aiEditController || !isLiveMode}
          aria-label="运行宿主 AI 预编辑（请先选择文本）"
          title="运行宿主 AI 预编辑（请先选择文本）"
          onClick={() => void runHostAiEdit()}
        >
          <Sparkles size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="markweave-playground-ai-edit-toggle"
          data-testid="markweave-playground-ai-multi-edit"
          disabled={!aiEditController || !isLiveMode}
          aria-label="运行宿主 AI 全文多处预编辑"
          title="运行宿主 AI 全文多处预编辑"
          onClick={runHostAiMultiEdit}
        >
          <ListChecks size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="markweave-playground-mode-toggle"
          data-testid="markweave-playground-mode-toggle"
          data-mode={editorMode}
          aria-label={modeToggleLabel}
          title={modeToggleLabel}
          onClick={() => setEditorMode(nextMode)}
        >
          <ModeIcon size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="markweave-playground-theme-toggle"
          data-testid="markweave-playground-theme-toggle"
          data-theme={theme}
          aria-label={themeToggleLabel}
          title={themeToggleLabel}
          onClick={() => setTheme(nextTheme)}
        >
          <ThemeIcon size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
      <MarkweaveEditor
        askAi={playgroundAskAiConfig}
        key={fixtureRevision}
        ariaLabel="Markweave editor playground"
        autoFocusFirstTableBodyCell={!benchmarkMode}
        defaultContent={fixtureContent}
        defaultContentFormat={fixtureFormat}
        mode={editorMode}
        theme={theme}
        linkCardResolver={resolvePlaygroundLinkCard}
        resolveMediaSource={resolvePlaygroundMediaSource}
        onEditWithAi={setLastTableEditWithAiRequest}
        onExtractToNote={setLastFloatingToolbarAssistantRequest}
        onRewriteSelection={setLastFloatingToolbarAssistantRequest}
        onRuntimeStateChange={benchmarkMode ? undefined : setRuntimeSnapshot}
        onSlashCommandUpload={handleSlashUpload}
        onAttachmentDownload={handleAttachmentDownload}
        onTableCommandResult={setLastTableCommandResult}
        onTableCopyPayload={setLastTableCopyPayload}
        onAiEditControllerChange={setAiEditController}
        onDocumentLoadStateChange={recordBenchmarkLoadState}
        onSearchControllerChange={setSearchController}
        commandGroups={playgroundCommandGroups}
        commands={playgroundHostCommands}
        editorExtensions={benchmarkMode ? undefined : [playgroundHostExtension]}
        editorExtensionsLoadPolicy="transactional-safe"
        onCommandControllerChange={setCommandController}
        onCommandError={(error) => setLastCommandStatus(`${error.code}: ${error.message}`)}
      />
      <details className="markweave-debug-panel">
        <summary>Debug</summary>
        <div className="markweave-debug-actions" aria-label="Debug fixtures">
          <button type="button" onClick={() => loadFixture(initialPlaygroundDocument)}>
            Default Fixture
          </button>
          <button type="button" onClick={() => loadFixture(mergedTablePlaygroundDocument, "html")}>
            Merged Table Fixture
          </button>
          <button type="button" onClick={() => loadFixture(flakyMediaRecoveryFixture)}>
            Flaky Media Recovery Fixture
          </button>
          <button type="button" onClick={() => loadFixture(largeDocumentPerformanceFixture)}>
            100k Performance Fixture
          </button>
          <button type="button" onClick={() => loadFixture(largeTextPerformanceFixture)}>
            250k Text Fixture
          </button>
          <button type="button" onClick={() => loadFixture(largeValidMediaPerformanceFixture)}>
            250k Valid Media Fixture
          </button>
          <button type="button" onClick={() => loadFixture(largeMissingMediaPerformanceFixture)}>
            250k Missing Media Fixture
          </button>
          <button type="button" onClick={() => loadFixture(largeMixedMediaPerformanceFixture)}>
            250k Mixed Media Fixture
          </button>
          <button type="button" onClick={() => loadFixture(stressDocumentPerformanceFixture)}>
            1MB Stress Fixture
          </button>
        </div>
        {lastAiEditStatus ? <div className="markweave-debug-ai">Host AI edit: {lastAiEditStatus}</div> : null}
        {lastCommandStatus ? <div className="markweave-debug-command">Host command: {lastCommandStatus}</div> : null}
        {lastTableCopyPayload ? (
          <div className="markweave-debug-copy" data-testid="markweave-debug-copy">
            <div>Last table copy: {lastTableCopyPayload.kind}</div>
            <pre>{JSON.stringify({ text: lastTableCopyPayload.text, htmlLength: lastTableCopyPayload.html.length }, null, 2)}</pre>
          </div>
        ) : null}
        {lastTableCommandResult ? (
          <div className="markweave-debug-command" data-testid="markweave-debug-command">
            <div>
              Last table command: {lastTableCommandResult.label} ({lastTableCommandResult.success ? "handled" : "ignored"})
            </div>
            <pre>{JSON.stringify(lastTableCommandResult, null, 2)}</pre>
          </div>
        ) : null}
        {lastTableEditWithAiRequest ? (
          <div className="markweave-debug-ai" data-testid="markweave-debug-ai">
            <div>Last table AI request: {lastTableEditWithAiRequest.source}</div>
            <pre>{JSON.stringify(lastTableEditWithAiRequest, null, 2)}</pre>
          </div>
        ) : null}
        {lastFloatingToolbarAssistantRequest ? (
          <div className="markweave-debug-ai" data-testid="markweave-debug-toolbar-ai">
            <div>Last toolbar assistant request: {lastFloatingToolbarAssistantRequest.source}</div>
            <pre>{JSON.stringify(lastFloatingToolbarAssistantRequest, null, 2)}</pre>
          </div>
        ) : null}
        {lastSlashUploadRequest ? (
          <div className="markweave-debug-ai" data-testid="markweave-debug-slash-upload">
            <div>
              Last upload request: {lastSlashUploadRequest.kind} ({lastSlashUploadRequest.trigger})
            </div>
            <pre>
              {JSON.stringify(
                {
                  kind: lastSlashUploadRequest.kind,
                  trigger: lastSlashUploadRequest.trigger,
                  source: {
                    type: lastSlashUploadRequest.source.type,
                    value: lastSlashUploadRequest.source.value,
                    fileName: lastSlashUploadRequest.source.file?.name,
                    mimeType: lastSlashUploadRequest.source.mimeType,
                  },
                },
                null,
                2,
              )}
            </pre>
          </div>
        ) : null}
        {runtimeSnapshot?.tableDebugSnapshot ? (
          <div className="markweave-debug-table" data-testid="markweave-debug-table">
            <div>Table structure</div>
            <pre>{JSON.stringify(runtimeSnapshot.tableDebugSnapshot, null, 2)}</pre>
          </div>
        ) : null}
        <pre>{JSON.stringify(runtimeSnapshot, null, 2)}</pre>
      </details>
    </main>
  );
}
