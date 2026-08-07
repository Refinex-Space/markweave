<template>
  <main class="markweave-playground" :data-theme="theme">
    <div class="markweave-playground-toolbar" aria-label="Playground controls">
      <button
        type="button"
        class="markweave-playground-ai-edit-toggle"
        :disabled="!aiEditController || !isLiveMode"
        aria-label="运行宿主 AI 预编辑（请先选择文本）"
        title="运行宿主 AI 预编辑（请先选择文本）"
        @click="runHostAiEdit"
      >
        <Sparkles :size="18" :stroke-width="1.8" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="markweave-playground-mode-toggle"
        data-testid="markweave-playground-mode-toggle"
        :data-mode="editorMode"
        :aria-label="modeToggleLabel"
        :title="modeToggleLabel"
        @click="toggleMode"
      >
        <component :is="modeIcon" :size="18" :stroke-width="1.8" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="markweave-playground-theme-toggle"
        data-testid="markweave-playground-theme-toggle"
        :data-theme="theme"
        :aria-label="themeToggleLabel"
        :title="themeToggleLabel"
        @click="toggleTheme"
      >
        <component :is="themeIcon" :size="18" :stroke-width="1.8" aria-hidden="true" />
      </button>
    </div>

    <MarkweaveEditor
      :ask-ai="playgroundAskAiConfig"
      :key="fixtureRevision"
      aria-label="Markweave Vue3 editor playground"
      auto-focus-first-table-body-cell
      :default-content="fixtureContent"
      :default-content-format="fixtureFormat"
      :mode="editorMode"
      :theme="theme"
      :link-card-resolver="resolvePlaygroundLinkCard"
      :resolve-media-source="resolvePlaygroundMediaSource"
      :on-edit-with-ai="handleEditWithAi"
      :on-extract-to-note="handleFloatingToolbarAssistantRequest"
      :on-rewrite-selection="handleFloatingToolbarAssistantRequest"
      :on-runtime-state-change="handleRuntimeStateChange"
      :on-slash-command-upload="handleSlashUpload"
      :on-attachment-download="handleAttachmentDownload"
      :on-table-command-result="handleTableCommandResult"
      :on-table-copy-payload="handleTableCopyPayload"
      :on-ai-edit-controller-change="handleAiEditControllerChange"
    />

    <details class="markweave-debug-panel">
      <summary>Debug</summary>
      <div class="markweave-debug-actions" aria-label="Debug fixtures">
        <button type="button" @click="loadFixture(initialPlaygroundDocument)">Default Fixture</button>
        <button type="button" @click="loadFixture(mergedTablePlaygroundDocument, 'html')">Merged Table Fixture</button>
        <button type="button" @click="loadFixture(largeDocumentPerformanceFixture)">100k Performance Fixture</button>
        <button type="button" @click="loadFixture(largeTextPerformanceFixture)">250k Text Fixture</button>
        <button type="button" @click="loadFixture(largeValidMediaPerformanceFixture)">250k Valid Media Fixture</button>
        <button type="button" @click="loadFixture(largeMissingMediaPerformanceFixture)">250k Missing Media Fixture</button>
        <button type="button" @click="loadFixture(stressDocumentPerformanceFixture)">1MB Stress Fixture</button>
      </div>

      <div v-if="lastAiEditStatus" class="markweave-debug-ai">Host AI edit: {{ lastAiEditStatus }}</div>

      <div v-if="lastTableCopyPayload" class="markweave-debug-copy" data-testid="markweave-debug-copy">
        <div>Last table copy: {{ lastTableCopyPayload.kind }}</div>
        <pre>{{ JSON.stringify({ text: lastTableCopyPayload.text, htmlLength: lastTableCopyPayload.html.length }, null, 2) }}</pre>
      </div>

      <div v-if="lastTableCommandResult" class="markweave-debug-command" data-testid="markweave-debug-command">
        <div>Last table command: {{ lastTableCommandResult.label }} ({{ lastTableCommandResult.success ? "handled" : "ignored" }})</div>
        <pre>{{ JSON.stringify(lastTableCommandResult, null, 2) }}</pre>
      </div>

      <div v-if="lastTableEditWithAiRequest" class="markweave-debug-ai" data-testid="markweave-debug-ai">
        <div>Last table AI request: {{ lastTableEditWithAiRequest.source }}</div>
        <pre>{{ JSON.stringify(lastTableEditWithAiRequest, null, 2) }}</pre>
      </div>

      <div v-if="lastFloatingToolbarAssistantRequest" class="markweave-debug-ai" data-testid="markweave-debug-toolbar-ai">
        <div>Last toolbar assistant request: {{ lastFloatingToolbarAssistantRequest.source }}</div>
        <pre>{{ JSON.stringify(lastFloatingToolbarAssistantRequest, null, 2) }}</pre>
      </div>

      <div v-if="lastSlashUploadRequest" class="markweave-debug-ai" data-testid="markweave-debug-slash-upload">
        <div>Last upload request: {{ lastSlashUploadRequest.kind }} ({{ lastSlashUploadRequest.trigger }})</div>
        <pre>{{ JSON.stringify(formatSlashUploadRequest(lastSlashUploadRequest), null, 2) }}</pre>
      </div>

      <div v-if="runtimeSnapshot?.tableDebugSnapshot" class="markweave-debug-table" data-testid="markweave-debug-table">
        <div>Table structure</div>
        <pre>{{ JSON.stringify(runtimeSnapshot.tableDebugSnapshot, null, 2) }}</pre>
      </div>

      <pre>{{ JSON.stringify(runtimeSnapshot, null, 2) }}</pre>
    </details>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Eye, Moon, PencilLine, Sparkles, Sun } from "lucide-vue-next";
import {
  MarkweaveEditor,
  type MarkweaveAiEditController,
  type FloatingToolbarAssistantRequest,
  type MarkweaveContentFormat,
  type MarkweaveEditorMode,
  type MarkweaveTheme,
  type MarkweaveEditorRuntimeSnapshot,
  type MarkweaveMenuCopyPayload,
  type MarkweaveUploadRequest,
  type MarkweaveUploadResult,
  type TableCommandResult,
  type TableEditWithAiRequest,
} from "@markweave/vue3";
import {
  createPlaygroundUploadResult,
  downloadPlaygroundAttachment,
  initialPlaygroundDocument,
  largeDocumentPerformanceFixture,
  largeMissingMediaPerformanceFixture,
  largeTextPerformanceFixture,
  largeValidMediaPerformanceFixture,
  mergedTablePlaygroundDocument,
  playgroundAskAiConfig,
  resolvePlaygroundLinkCard,
  resolvePlaygroundMediaSource,
  streamPlaygroundAiEditProposal,
  stressDocumentPerformanceFixture,
} from "@markweave/playground-fixtures";

const fixtureContent = ref(initialPlaygroundDocument);
const fixtureFormat = ref<MarkweaveContentFormat>("markdown");
const fixtureRevision = ref(0);
const editorMode = ref<MarkweaveEditorMode>("live");
const theme = ref<MarkweaveTheme>("light");
const runtimeSnapshot = ref<MarkweaveEditorRuntimeSnapshot | null>(null);
const lastTableCopyPayload = ref<MarkweaveMenuCopyPayload | null>(null);
const lastTableCommandResult = ref<TableCommandResult | null>(null);
const lastTableEditWithAiRequest = ref<TableEditWithAiRequest | null>(null);
const lastFloatingToolbarAssistantRequest = ref<FloatingToolbarAssistantRequest | null>(null);
const lastSlashUploadRequest = ref<MarkweaveUploadRequest | null>(null);
const aiEditController = ref<MarkweaveAiEditController | null>(null);
const lastAiEditStatus = ref<string | null>(null);

const isLiveMode = computed(() => editorMode.value === "live");
const modeIcon = computed(() => (isLiveMode.value ? Eye : PencilLine));
const themeIcon = computed(() => (theme.value === "light" ? Moon : Sun));
const modeToggleLabel = computed(() => (isLiveMode.value ? "切换到 View 模式" : "切换到 Live 模式"));
const themeToggleLabel = computed(() => (theme.value === "light" ? "切换到暗色主题" : "切换到亮色主题"));

function resetDebugState() {
  runtimeSnapshot.value = null;
  lastTableCopyPayload.value = null;
  lastTableCommandResult.value = null;
  lastTableEditWithAiRequest.value = null;
  lastFloatingToolbarAssistantRequest.value = null;
  lastSlashUploadRequest.value = null;
}

function loadFixture(content: string, format: MarkweaveContentFormat = "markdown") {
  fixtureContent.value = content;
  fixtureFormat.value = format;
  fixtureRevision.value += 1;
  resetDebugState();
}

function toggleMode() {
  editorMode.value = isLiveMode.value ? "view" : "live";
}

function toggleTheme() {
  theme.value = theme.value === "light" ? "dark" : "light";
}

function handleAiEditControllerChange(controller: MarkweaveAiEditController | null) {
  aiEditController.value = controller;
}

async function runHostAiEdit() {
  const controller = aiEditController.value;
  if (!controller) return;
  const captured = controller.captureSelection({ metadata: { source: "playground-host" } });
  if (!captured.ok) {
    lastAiEditStatus.value = `${captured.code}: ${captured.message}`;
    return;
  }
  let markdown = "";
  try {
    for await (markdown of streamPlaygroundAiEditProposal(captured.value)) {
      controller.updateProposal({ contextId: captured.value.id, markdown, status: "streaming" });
    }
    const completed = controller.updateProposal({ contextId: captured.value.id, markdown, status: "complete" });
    lastAiEditStatus.value = completed.ok ? "Host AI edit is ready for review." : `${completed.code}: ${completed.message}`;
  } catch (error) {
    if (!captured.value.signal.aborted) {
      const message = error instanceof Error ? error.message : "Host AI edit failed.";
      controller.failProposal(captured.value.id, message);
      lastAiEditStatus.value = message;
    }
  }
}

function handleEditWithAi(request: TableEditWithAiRequest) {
  lastTableEditWithAiRequest.value = request;
}

function handleFloatingToolbarAssistantRequest(request: FloatingToolbarAssistantRequest) {
  lastFloatingToolbarAssistantRequest.value = request;
}

function handleRuntimeStateChange(snapshot: MarkweaveEditorRuntimeSnapshot) {
  runtimeSnapshot.value = snapshot;
}

async function handleSlashUpload(request: MarkweaveUploadRequest): Promise<MarkweaveUploadResult> {
  lastSlashUploadRequest.value = request;
  return createPlaygroundUploadResult(request);
}

async function handleAttachmentDownload(attachment: Parameters<typeof downloadPlaygroundAttachment>[0]) {
  await downloadPlaygroundAttachment(attachment);
}

function handleTableCommandResult(result: TableCommandResult) {
  lastTableCommandResult.value = result;
}

function handleTableCopyPayload(payload: MarkweaveMenuCopyPayload) {
  lastTableCopyPayload.value = payload;
}

function formatSlashUploadRequest(request: MarkweaveUploadRequest) {
  return {
    kind: request.kind,
    trigger: request.trigger,
    source: {
      type: request.source.type,
      value: request.source.value,
      fileName: request.source.file?.name,
      mimeType: request.source.mimeType,
    },
  };
}
</script>
