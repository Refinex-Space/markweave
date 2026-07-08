import Vue from "vue";
import {
  MarkweaveEditor,
} from "markweave/vue2";
import { initialPlaygroundDocument, mergedTablePlaygroundDocument } from "@markweave/playground-fixtures";

function getUploadResultName(value) {
  return value.split("/").filter(Boolean).pop();
}

function debugBlock(h, testId, title, value) {
  return h("div", { class: "markweave-debug-ai", attrs: { "data-testid": testId } }, [
    h("div", title),
    h("pre", JSON.stringify(value, null, 2)),
  ]);
}

function modeIcon(h, live) {
  return h(
    "svg",
    {
      attrs: {
        viewBox: "0 0 24 24",
        width: "18",
        height: "18",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "1.8",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "aria-hidden": "true",
      },
    },
    live
      ? [h("path", { attrs: { d: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" } }), h("circle", { attrs: { cx: "12", cy: "12", r: "3" } })]
      : [h("path", { attrs: { d: "M12 20h9" } }), h("path", { attrs: { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" } })],
  );
}

export const MarkweaveEditorPlayground = Vue.extend({
  name: "MarkweaveEditorPlayground",
  data() {
    return {
      fixtureContent: initialPlaygroundDocument,
      fixtureFormat: "markdown",
      fixtureRevision: 0,
      editorMode: "live",
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
      this.fixtureRevision += 1;
      this.resetDebugState();
    },
    handleSlashUpload(request) {
      this.lastSlashUploadRequest = request;

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
    },
  },
  render(h) {
    return h("main", { class: "markweave-playground" }, [
      h("div", { class: "markweave-playground-toolbar", attrs: { "aria-label": "Playground controls" } }, [
        h(
          "button",
          {
            class: "markweave-playground-mode-toggle",
            attrs: {
              type: "button",
              "data-testid": "markweave-playground-mode-toggle",
              "data-mode": this.editorMode,
              "aria-label": this.modeToggleLabel,
              title: this.modeToggleLabel,
            },
            on: {
              click: () => {
                this.editorMode = this.isLiveMode ? "view" : "live";
              },
            },
          },
          [modeIcon(h, this.isLiveMode)],
        ),
      ]),
      h(MarkweaveEditor, {
        key: this.fixtureRevision,
        props: {
          ariaLabel: "Markweave Vue2 editor playground",
          autoFocusFirstTableBodyCell: true,
          defaultContent: this.fixtureContent,
          defaultContentFormat: this.fixtureFormat,
          mode: this.editorMode,
          onEditWithAi: (request) => {
            this.lastTableEditWithAiRequest = request;
          },
          onExtractToNote: (request) => {
            this.lastFloatingToolbarAssistantRequest = request;
          },
          onRewriteSelection: (request) => {
            this.lastFloatingToolbarAssistantRequest = request;
          },
          onRuntimeStateChange: (snapshot) => {
            this.runtimeSnapshot = snapshot;
          },
          onSlashCommandUpload: this.handleSlashUpload,
          onTableCommandResult: (result) => {
            this.lastTableCommandResult = result;
          },
          onTableCopyPayload: (payload) => {
            this.lastTableCopyPayload = payload;
          },
        },
      }),
      h("details", { class: "markweave-debug-panel" }, [
        h("summary", "Debug"),
        h("div", { class: "markweave-debug-actions", attrs: { "aria-label": "Debug fixtures" } }, [
          h("button", { attrs: { type: "button" }, on: { click: () => this.loadFixture(initialPlaygroundDocument) } }, "Default Fixture"),
          h("button", { attrs: { type: "button" }, on: { click: () => this.loadFixture(mergedTablePlaygroundDocument, "html") } }, "Merged Table Fixture"),
        ]),
        this.lastTableCopyPayload ? debugBlock(h, "markweave-debug-copy", `Last table copy: ${this.lastTableCopyPayload.kind}`, this.lastTableCopyPayload) : null,
        this.lastTableCommandResult ? debugBlock(h, "markweave-debug-command", "Last table command", this.lastTableCommandResult) : null,
        this.lastTableEditWithAiRequest ? debugBlock(h, "markweave-debug-ai", "Last table AI request", this.lastTableEditWithAiRequest) : null,
        this.lastFloatingToolbarAssistantRequest ? debugBlock(h, "markweave-debug-toolbar-ai", "Last toolbar assistant request", this.lastFloatingToolbarAssistantRequest) : null,
        this.lastSlashUploadRequest ? debugBlock(h, "markweave-debug-slash-upload", "Last upload request", this.lastSlashUploadRequest) : null,
        this.runtimeSnapshot && this.runtimeSnapshot.tableDebugSnapshot ? debugBlock(h, "markweave-debug-table", "Table structure", this.runtimeSnapshot.tableDebugSnapshot) : null,
        h("pre", JSON.stringify(this.runtimeSnapshot, null, 2)),
      ]),
    ]);
  },
});
