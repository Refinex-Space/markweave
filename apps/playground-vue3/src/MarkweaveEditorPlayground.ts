import { Eye, PencilLine } from "lucide-vue-next";
import { computed, defineComponent, h, ref } from "vue";
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
} from "markweave/vue3";
import { initialPlaygroundDocument, mergedTablePlaygroundDocument } from "@markweave/playground-fixtures";

function getUploadResultName(value: string) {
  return value.split("/").filter(Boolean).at(-1);
}

function debugBlock(testId: string, title: string, value: unknown) {
  return h("div", { class: "markweave-debug-ai", "data-testid": testId }, [h("div", null, title), h("pre", null, JSON.stringify(value, null, 2))]);
}

export const MarkweaveEditorPlayground = defineComponent({
  name: "MarkweaveEditorPlayground",
  setup() {
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

    const resetDebugState = () => {
      runtimeSnapshot.value = null;
      lastTableCopyPayload.value = null;
      lastTableCommandResult.value = null;
      lastTableEditWithAiRequest.value = null;
      lastFloatingToolbarAssistantRequest.value = null;
      lastSlashUploadRequest.value = null;
    };

    const loadFixture = (content: string, format: MarkweaveContentFormat = "markdown") => {
      fixtureContent.value = content;
      fixtureFormat.value = format;
      fixtureRevision.value += 1;
      resetDebugState();
    };

    const handleSlashUpload = (request: MarkweaveUploadRequest): MarkweaveUploadResult => {
      lastSlashUploadRequest.value = request;
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

    const isLiveMode = computed(() => editorMode.value === "live");
    const modeToggleLabel = computed(() => (isLiveMode.value ? "切换到 View 模式" : "切换到 Live 模式"));

    return () =>
      h("main", { class: "markweave-playground" }, [
        h("div", { class: "markweave-playground-toolbar", "aria-label": "Playground controls" }, [
          h(
            "button",
            {
              type: "button",
              class: "markweave-playground-mode-toggle",
              "data-testid": "markweave-playground-mode-toggle",
              "data-mode": editorMode.value,
              "aria-label": modeToggleLabel.value,
              title: modeToggleLabel.value,
              onClick: () => {
                editorMode.value = isLiveMode.value ? "view" : "live";
              },
            },
            [h(isLiveMode.value ? Eye : PencilLine, { size: 18, strokeWidth: 1.8, "aria-hidden": "true" })],
          ),
        ]),
        h(MarkweaveEditor, {
          key: fixtureRevision.value,
          ariaLabel: "Markweave Vue3 editor playground",
          autoFocusFirstTableBodyCell: true,
          defaultContent: fixtureContent.value,
          defaultContentFormat: fixtureFormat.value,
          mode: editorMode.value,
          onEditWithAi: (request: TableEditWithAiRequest) => {
            lastTableEditWithAiRequest.value = request;
          },
          onExtractToNote: (request: FloatingToolbarAssistantRequest) => {
            lastFloatingToolbarAssistantRequest.value = request;
          },
          onRewriteSelection: (request: FloatingToolbarAssistantRequest) => {
            lastFloatingToolbarAssistantRequest.value = request;
          },
          onRuntimeStateChange: (snapshot: MarkweaveEditorRuntimeSnapshot) => {
            runtimeSnapshot.value = snapshot;
          },
          onSlashCommandUpload: handleSlashUpload,
          onTableCommandResult: (result: TableCommandResult) => {
            lastTableCommandResult.value = result;
          },
          onTableCopyPayload: (payload: MarkweaveMenuCopyPayload) => {
            lastTableCopyPayload.value = payload;
          },
        }),
        h("details", { class: "markweave-debug-panel" }, [
          h("summary", null, "Debug"),
          h("div", { class: "markweave-debug-actions", "aria-label": "Debug fixtures" }, [
            h("button", { type: "button", onClick: () => loadFixture(initialPlaygroundDocument) }, "Default Fixture"),
            h("button", { type: "button", onClick: () => loadFixture(mergedTablePlaygroundDocument, "html") }, "Merged Table Fixture"),
          ]),
          lastTableCopyPayload.value ? debugBlock("markweave-debug-copy", `Last table copy: ${lastTableCopyPayload.value.kind}`, lastTableCopyPayload.value) : null,
          lastTableCommandResult.value ? debugBlock("markweave-debug-command", "Last table command", lastTableCommandResult.value) : null,
          lastTableEditWithAiRequest.value ? debugBlock("markweave-debug-ai", "Last table AI request", lastTableEditWithAiRequest.value) : null,
          lastFloatingToolbarAssistantRequest.value ? debugBlock("markweave-debug-toolbar-ai", "Last toolbar assistant request", lastFloatingToolbarAssistantRequest.value) : null,
          lastSlashUploadRequest.value ? debugBlock("markweave-debug-slash-upload", "Last upload request", lastSlashUploadRequest.value) : null,
          runtimeSnapshot.value?.tableDebugSnapshot ? debugBlock("markweave-debug-table", "Table structure", runtimeSnapshot.value.tableDebugSnapshot) : null,
          h("pre", null, JSON.stringify(runtimeSnapshot.value, null, 2)),
        ]),
      ]);
  },
});
