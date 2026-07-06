import { useState } from "react";
import { Eye, PencilLine } from "lucide-react";
import {
  MarkweaveEditor,
  type MarkweaveContentFormat,
  type FloatingToolbarAssistantRequest,
  type MarkweaveEditorMode,
  type MarkweaveEditorRuntimeSnapshot,
  type MarkweaveMenuCopyPayload,
  type MarkweaveUploadRequest,
  type MarkweaveUploadResult,
  type TableCommandResult,
  type TableEditWithAiRequest,
} from "markweave";
import { initialPlaygroundDocument, mergedTablePlaygroundDocument } from "./fixtures";

function getUploadResultName(value: string) {
  return value.split("/").filter(Boolean).at(-1);
}

export function MarkweaveEditorPlayground() {
  const [fixtureContent, setFixtureContent] = useState(initialPlaygroundDocument);
  const [fixtureFormat, setFixtureFormat] = useState<MarkweaveContentFormat>("markdown");
  const [fixtureRevision, setFixtureRevision] = useState(0);
  const [editorMode, setEditorMode] = useState<MarkweaveEditorMode>("live");
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<MarkweaveEditorRuntimeSnapshot | null>(null);
  const [lastTableCopyPayload, setLastTableCopyPayload] = useState<MarkweaveMenuCopyPayload | null>(null);
  const [lastTableCommandResult, setLastTableCommandResult] = useState<TableCommandResult | null>(null);
  const [lastTableEditWithAiRequest, setLastTableEditWithAiRequest] = useState<TableEditWithAiRequest | null>(null);
  const [lastFloatingToolbarAssistantRequest, setLastFloatingToolbarAssistantRequest] = useState<FloatingToolbarAssistantRequest | null>(null);
  const [lastSlashUploadRequest, setLastSlashUploadRequest] = useState<MarkweaveUploadRequest | null>(null);

  const resetDebugState = () => {
    setRuntimeSnapshot(null);
    setLastTableCopyPayload(null);
    setLastTableCommandResult(null);
    setLastTableEditWithAiRequest(null);
    setLastFloatingToolbarAssistantRequest(null);
    setLastSlashUploadRequest(null);
  };

  const loadFixture = (content: string, format: MarkweaveContentFormat = "markdown") => {
    setFixtureContent(content);
    setFixtureFormat(format);
    setFixtureRevision((revision) => revision + 1);
    resetDebugState();
  };

  const handleSlashUpload = (request: MarkweaveUploadRequest): MarkweaveUploadResult => {
    setLastSlashUploadRequest(request);

    if (request.source.file) {
      return {
        src: URL.createObjectURL(request.source.file),
        name: request.source.file.name,
        mimeType: request.source.file.type,
        size: request.source.file.size,
      };
    }

    if (request.source.value) {
      return {
        src: request.source.value,
        name: getUploadResultName(request.source.value),
        mimeType: request.source.mimeType,
      };
    }

    throw new Error("Unsupported upload source.");
  };

  const isLiveMode = editorMode === "live";
  const ModeIcon = isLiveMode ? Eye : PencilLine;
  const nextMode: MarkweaveEditorMode = isLiveMode ? "view" : "live";
  const modeToggleLabel = isLiveMode ? "切换到 View 模式" : "切换到 Live 模式";

  return (
    <main className="markweave-playground">
      <div className="markweave-playground-toolbar" aria-label="Playground controls">
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
      </div>
      <MarkweaveEditor
        key={fixtureRevision}
        ariaLabel="Markweave editor playground"
        autoFocusFirstTableBodyCell
        defaultContent={fixtureContent}
        defaultContentFormat={fixtureFormat}
        mode={editorMode}
        onEditWithAi={setLastTableEditWithAiRequest}
        onExtractToNote={setLastFloatingToolbarAssistantRequest}
        onRewriteSelection={setLastFloatingToolbarAssistantRequest}
        onRuntimeStateChange={setRuntimeSnapshot}
        onSlashCommandUpload={handleSlashUpload}
        onTableCommandResult={setLastTableCommandResult}
        onTableCopyPayload={setLastTableCopyPayload}
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
        </div>
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
