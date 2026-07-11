<template>
  <main class="markweave-playground" :data-theme="theme">
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
        <svg
          v-if="isLiveMode"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
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
        <svg
          v-if="theme === 'light'"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      </button>
    </div>

    <MarkweaveEditor
      aria-label="Markweave Vue2 editor playground"
      auto-focus-first-table-body-cell
      :content="fixtureContent"
      :content-format="fixtureFormat"
      :mode="editorMode"
      :theme="theme"
      :link-card-resolver="resolvePlaygroundLinkCard"
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
        <button type="button" @click="loadFixture(largeDocumentPerformanceFixture)">100k Performance Fixture</button>
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

      <div v-if="runtimeSnapshot && runtimeSnapshot.tableDebugSnapshot" class="markweave-debug-table" data-testid="markweave-debug-table">
        <div>Table structure</div>
        <pre>{{ JSON.stringify(runtimeSnapshot.tableDebugSnapshot, null, 2) }}</pre>
      </div>

      <pre>{{ JSON.stringify(runtimeSnapshot, null, 2) }}</pre>
    </details>
  </main>
</template>

<script>
import { MarkweaveEditor } from "@markweave/vue2";
import { createPlaygroundUploadResult, initialPlaygroundDocument, largeDocumentPerformanceFixture, mergedTablePlaygroundDocument, resolvePlaygroundLinkCard } from "@markweave/playground-fixtures";

export default {
  name: "MarkweaveEditorPlayground",
  components: {
    MarkweaveEditor,
  },
  data() {
    return {
      initialPlaygroundDocument,
      largeDocumentPerformanceFixture,
      mergedTablePlaygroundDocument,
      resolvePlaygroundLinkCard,
      fixtureContent: initialPlaygroundDocument,
      fixtureFormat: "markdown",
      editorMode: "live",
      theme: "light",
      runtimeSnapshot: null,
      lastTableCopyPayload: null,
      lastTableCommandResult: null,
      lastTableEditWithAiRequest: null,
      lastFloatingToolbarAssistantRequest: null,
      lastSlashUploadRequest: null,
    };
  },
  computed: {
    isLiveMode() {
      return this.editorMode === "live";
    },
    modeToggleLabel() {
      return this.isLiveMode ? "切换到 View 模式" : "切换到 Live 模式";
    },
    themeToggleLabel() {
      return this.theme === "light" ? "切换到暗色主题" : "切换到亮色主题";
    },
  },
  methods: {
    resetDebugState() {
      this.runtimeSnapshot = null;
      this.lastTableCopyPayload = null;
      this.lastTableCommandResult = null;
      this.lastTableEditWithAiRequest = null;
      this.lastFloatingToolbarAssistantRequest = null;
      this.lastSlashUploadRequest = null;
    },
    loadFixture(content, format = "markdown") {
      this.fixtureContent = content;
      this.fixtureFormat = format;
      this.resetDebugState();
    },
    toggleMode() {
      this.editorMode = this.isLiveMode ? "view" : "live";
    },
    toggleTheme() {
      this.theme = this.theme === "light" ? "dark" : "light";
    },
    handleEditWithAi(request) {
      this.lastTableEditWithAiRequest = request;
    },
    handleFloatingToolbarAssistantRequest(request) {
      this.lastFloatingToolbarAssistantRequest = request;
    },
    handleRuntimeStateChange(snapshot) {
      this.runtimeSnapshot = snapshot;
    },
    handleSlashUpload(request) {
      this.lastSlashUploadRequest = request;
      return createPlaygroundUploadResult(request);
    },
    handleTableCommandResult(result) {
      this.lastTableCommandResult = result;
    },
    handleTableCopyPayload(payload) {
      this.lastTableCopyPayload = payload;
    },
    formatSlashUploadRequest(request) {
      return {
        kind: request.kind,
        trigger: request.trigger,
        source: {
          type: request.source.type,
          value: request.source.value,
          fileName: request.source.file && request.source.file.name,
          mimeType: request.source.mimeType,
        },
      };
    },
  },
};
</script>
