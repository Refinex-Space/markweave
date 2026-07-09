<template>
  <main class="markweave-playground">
    <div class="markweave-playground-toolbar" aria-label="Playground controls">
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
    </div>

    <MarkweaveEditor
      :key="fixtureRevision"
      aria-label="Markweave Vue3 editor playground"
      auto-focus-first-table-body-cell
      :default-content="fixtureContent"
      :default-content-format="fixtureFormat"
      :mode="editorMode"
      :on-edit-with-ai="handleEditWithAi"
      :on-extract-to-note="handleFloatingToolbarAssistantRequest"
      :on-rewrite-selection="handleFloatingToolbarAssistantRequest"
      :on-runtime-state-change="handleRuntimeStateChange"
      :on-slash-command-upload="handleSlashUpload"
      :on-table-command-result="handleTableCommandResult"
      :on-table-copy-payload="handleTableCopyPayload"
    />

    <details class="markweave-debug-panel">
      <summary>Debug</summary>
      <div class="markweave-debug-actions" aria-label="Debug fixtures">
        <button type="button" @click="loadFixture(initialPlaygroundDocument)">Default Fixture</button>
        <button type="button" @click="loadFixture(mergedTablePlaygroundDocument, 'html')">Merged Table Fixture</button>
      </div>

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
import { Eye, PencilLine } from "lucide-vue-next";
import {
  MarkweaveEditor,
  type FloatingToolbarAssistantRequest,
  type MarkweaveContentFormat,
  type MarkweaveEditorMode,
  type MarkweaveEditorRuntimeSnapshot,
  type MarkweaveMenuCopyPayload,
  type MarkweaveUploadRequest,
  type MarkweaveUploadResult,
  type TableCommandResult,
  type TableEditWithAiRequest,
} from "@markweave/vue3";
import { createPlaygroundUploadResult, initialPlaygroundDocument, mergedTablePlaygroundDocument } from "@markweave/playground-fixtures";

const fixtureContent = ref(initialPlaygroundDocument);
const fixtureFormat = ref<MarkweaveContentFormat>("markdown");
const fixtureRevision = ref(0);
const editorMode = ref<MarkweaveEditorMode>("live");
const runtimeSnapshot = ref<MarkweaveEditorRuntimeSnapshot | null>(null);
const lastTableCopyPayload = ref<MarkweaveMenuCopyPayload | null>(null);
const lastTableCommandResult = ref<TableCommandResult | null>(null);
const lastTableEditWithAiRequest = ref<TableEditWithAiRequest | null>(null);
const lastFloatingToolbarAssistantRequest = ref<FloatingToolbarAssistantRequest | null>(null);
const lastSlashUploadRequest = ref<MarkweaveUploadRequest | null>(null);

const isLiveMode = computed(() => editorMode.value === "live");
const modeIcon = computed(() => (isLiveMode.value ? Eye : PencilLine));
const modeToggleLabel = computed(() => (isLiveMode.value ? "切换到 View 模式" : "切换到 Live 模式"));

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

function handleEditWithAi(request: TableEditWithAiRequest) {
  lastTableEditWithAiRequest.value = request;
}

function handleFloatingToolbarAssistantRequest(request: FloatingToolbarAssistantRequest) {
  lastFloatingToolbarAssistantRequest.value = request;
}

function handleRuntimeStateChange(snapshot: MarkweaveEditorRuntimeSnapshot) {
  runtimeSnapshot.value = snapshot;
}

function handleSlashUpload(request: MarkweaveUploadRequest): MarkweaveUploadResult {
  lastSlashUploadRequest.value = request;
  return createPlaygroundUploadResult(request);
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
