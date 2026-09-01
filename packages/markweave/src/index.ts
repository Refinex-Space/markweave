import "./editor-core/tiptap-type-augmentations";

export { createMarkweaveEditorExtensions } from "./editor-core/create-editor-extensions";
export type { CreateMarkweaveEditorExtensionsOptions } from "./editor-core/create-editor-extensions";
export type {
  MarkweaveDocumentLoadPhase,
  MarkweaveDocumentLoadState,
  MarkweaveDocumentProfile,
  MarkweaveEditorExtensionsLoadPolicy,
  MarkweavePerformancePolicy,
  MarkweavePerformanceTier,
} from "./editor-core/document-load";
export type { MarkweaveLang } from "./i18n";
export type {
  MarkweaveBuiltinCommandIconName,
  MarkweaveBuiltinCommandsConfig,
  MarkweaveCommandContent,
  MarkweaveCommandContext,
  MarkweaveCommandController,
  MarkweaveCommandErrorCode,
  MarkweaveCommandErrorHandler,
  MarkweaveCommandExecutionError,
  MarkweaveCommandExecutionResult,
  MarkweaveCommandGroupSpec,
  MarkweaveCommandHandler,
  MarkweaveCommandIcon,
  MarkweaveCommandInvocation,
  MarkweaveCommandPredicate,
  MarkweaveCommandReasonResolver,
  MarkweaveCommandRegistry,
  MarkweaveCommandRegistryIssue,
  MarkweaveCommandRegistryOptions,
  MarkweaveCommandResult,
  MarkweaveCommandRuntimeState,
  MarkweaveCommandSource,
  MarkweaveCommandSpec,
  MarkweaveCommandSurface,
  MarkweaveResolvedCommand,
} from "./commands/command-types";
export {
  createMarkweaveCommandRegistry,
  markweaveBuiltinCommandGroupIds,
  markweaveBuiltinCommandIds,
} from "./commands/command-registry";
export {
  createMarkweaveCommandController,
  markweaveCommandResultMaxBytes,
} from "./commands/command-runtime";
export type { MarkweaveEditorMode, MarkweaveEditorModeState } from "./core/editor-mode-state";
export {
  getMarkweaveEditorModeState,
  isMarkweaveEditorLiveEditable,
  normalizeMarkweaveEditorMode,
  setMarkweaveEditorModeState,
  subscribeToMarkweaveEditorMode,
} from "./core/editor-mode-state";
export type { MarkweaveTheme } from "./core/theme";
export { normalizeMarkweaveTheme } from "./core/theme";
export type {
  MarkweaveDocumentViewportSnapshot,
  MarkweaveDocumentViewportState,
  MarkweaveRevealPositionOptions,
  MarkweaveRevealPositionResult,
  MarkweaveRevealReason,
} from "./core/document-viewport";
export {
  createMarkweaveDocumentViewportCoordinator,
  getMarkweaveDocumentViewportCoordinator,
  getMarkweaveDocumentViewportCoordinatorForElement,
} from "./core/document-viewport";
export type {
  MarkweaveOutputKind,
  MarkweaveOutputPreparationReport,
  MarkweavePrepareOutputOptions,
} from "./editor-core/document-output";
export { prepareMarkweaveEditorForOutput } from "./editor-core/document-output";
export type { MarkweaveInnerTocPlacement, MarkweaveTocItem, MarkweaveTocState } from "./core/toc-state";
export {
  createMarkweaveTocState,
  emptyMarkweaveTocState,
  getActiveMarkweaveTocId,
  getMarkweaveTocItems,
  getValidMarkweaveTocActiveId,
  normalizeMarkweaveInnerTocPlacement,
  observeMarkweaveInnerTocContainerPosition,
  scrollToMarkweaveTocItem,
} from "./core/toc-state";
export type {
  FloatingToolbarAssistantRequest,
  FloatingToolbarAssistantSource,
  MarkweaveAiEditContext,
  MarkweaveAiEditController,
  MarkweaveAiEditDecision,
  MarkweaveAiEditErrorCode,
  MarkweaveAiEditHunk,
  MarkweaveAiEditHunkDecision,
  MarkweaveAiEditHunkDisposition,
  MarkweaveAiEditLineRange,
  MarkweaveAiEditPhase,
  MarkweaveAiEditProposal,
  MarkweaveAiEditResult,
  MarkweaveAiEditSelection,
  MarkweaveAiEditSelectionSnapshot,
  MarkweaveAiEditScope,
  MarkweaveAiEditState,
  MarkweaveAiEditTarget,
  MarkweaveAskAiConfig,
  MarkweaveAskAiHandler,
  MarkweaveAskAiOutput,
  MarkweaveAskAiRequest,
  MarkweaveAskAiSelection,
  MarkweaveAskAiTableCell,
  MarkweaveAskAiTableTarget,
  MarkweaveAskAiTarget,
  MarkweaveAskAiTextTarget,
  MarkweaveContentFormat,
  MarkweaveContentValue,
  MarkweaveEditorRuntimeSnapshot,
  MarkweaveEditorSetContentOptions,
  MarkweaveEditorUpdatePayload,
  MarkweavePerformanceRuntimeSnapshot,
  TableCommandResult,
  TableCommandSnapshot,
  TableEditWithAiRequest,
} from "./core/public-types";
export { createMarkweaveAiEditController } from "./plugins/ai-edit/ai-edit-controller";
export type { MarkweaveUploadProgress, MarkweaveUploadRequest, MarkweaveUploadResult, MarkweaveSlashCommandUploadHandler } from "./plugins/slash-command/upload";
export type {
  MarkweaveAttachmentDownloadContext,
  MarkweaveAttachmentDownloadHandler,
  MarkweaveAttachmentRef,
} from "./plugins/media/attachment-download";
export {
  activateMarkweaveAttachmentDownload,
  attrsFromMarkweaveAttachmentUploadResult,
  createMarkweaveAttachmentRefFromAttrs,
  createMarkweaveAttachmentUploadRequest,
  formatMarkweaveAttachmentSize,
  openMarkweaveAttachmentFallbackDownload,
} from "./plugins/media/attachment-download";
export type {
  MarkweaveMediaKind,
  MarkweaveMediaPriority,
  MarkweaveMediaResolveReason,
  MarkweaveMediaSourceRequest,
  MarkweaveMediaSourceResolver,
  MarkweaveMediaSourceResult,
} from "./plugins/media/media-source";
export type { MarkweaveMenuCopyPayload } from "./plugins/table/table-clipboard";
export type {
  MarkweaveTableCapabilities,
  MarkweaveTableCapability,
  MarkweaveTableCapabilityContext,
  MarkweaveTableCapabilityResolver,
  MarkweaveTableNodeDescriptor,
} from "./plugins/table/table-capabilities";
export type {
  MarkweaveSearchController,
  MarkweaveSearchOptions,
  MarkweaveSearchState,
} from "./plugins/search/search-controller";
export {
  createMarkweaveSearchController,
  MarkweaveSearch,
} from "./plugins/search/search-controller";
export type {
  MarkweaveReferenceItem,
  MarkweaveReferenceKeyDownState,
  MarkweaveReferenceRenderer,
  MarkweaveReferenceRenderState,
  MarkweaveReferenceSuggestionConfig,
  MarkweaveReferenceSuggestionExtensionOptions,
} from "./plugins/reference/reference-suggestion";
export {
  DEFAULT_MARKWEAVE_REFERENCE_TRIGGER,
  insertMarkweaveReferenceLink,
  MarkweaveReferenceSuggestion,
  markweaveReferenceSuggestionPluginKey,
} from "./plugins/reference/reference-suggestion";
export type {
  MarkweaveInternalLinkCardConfig,
  MarkweaveInternalLinkCardExtensionOptions,
  MarkweaveInternalLinkCardMeta,
  MarkweaveInternalLinkCardResolver,
  MarkweaveInternalLinkCardResolveRequest,
} from "./plugins/internal-link-card/internal-link-card";
export {
  INTERNAL_LINK_CARD_ATTRIBUTE,
  INTERNAL_LINK_CARD_SELECTOR,
  MarkweaveInternalLinkCard,
  markweaveInternalLinkCardPluginKey,
} from "./plugins/internal-link-card/internal-link-card";
export type { MarkweaveLinkCardAttrs, MarkweaveLinkCardMetadata, MarkweaveLinkCardResolveRequest, MarkweaveLinkCardResolver } from "./plugins/link-card/link-card";
export {
  getMarkweaveLinkCardMarkdown,
  getMarkweaveLinkCardTargetAtPos,
  normalizeMarkweaveLinkCardAttrs,
  normalizeMarkweaveLinkCardHref,
  normalizeMarkweaveLinkCardMediaUrl,
  removeMarkweaveLinkFromTarget,
  replaceMarkweaveLinkCardWithLink,
  replaceMarkweaveLinkWithCard,
  updateMarkweaveLinkCard,
} from "./plugins/link-card/link-card";
