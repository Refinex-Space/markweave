import type { JSONContent } from "@tiptap/core";
import type { MarkweaveContentFormat } from "../core/public-types";
import type { MarkweaveEditorMode } from "../core/editor-mode-state";
import type { MarkweaveLang } from "../i18n";

export type MarkweaveCommandSurface = "slash" | "api";
export type MarkweaveCommandSource = "slash" | "api";

export type MarkweaveBuiltinCommandIconName =
  | "type"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bullet-list"
  | "ordered-list"
  | "task-list"
  | "blockquote"
  | "code-block"
  | "info"
  | "tip"
  | "warning"
  | "error"
  | "success"
  | "emoji"
  | "math"
  | "table"
  | "separator"
  | "image"
  | "video"
  | "attachment";

export type MarkweaveCommandIcon =
  | { readonly kind: "builtin"; readonly name: MarkweaveBuiltinCommandIconName }
  | { readonly kind: "text"; readonly text: string };

export interface MarkweaveCommandGroupSpec {
  readonly id: string;
  readonly label: string;
  readonly order?: number;
}

export interface MarkweaveCommandContext {
  readonly editorId: string;
  readonly editable: boolean;
  readonly mode: MarkweaveEditorMode;
  readonly format: MarkweaveContentFormat;
  readonly selection: {
    readonly empty: boolean;
    readonly from: number;
    readonly to: number;
    readonly text: string;
  };
  readonly activeBlock: {
    readonly type: string;
    readonly depth: number;
    readonly text: string;
  } | null;
}

export type MarkweaveCommandPredicate = (context: MarkweaveCommandContext) => boolean;
export type MarkweaveCommandReasonResolver = (context: MarkweaveCommandContext) => string | undefined;

export interface MarkweaveCommandInvocation<TPayload = unknown> {
  readonly commandId: string;
  readonly source: MarkweaveCommandSource;
  readonly payload?: TPayload;
  readonly query?: string;
  readonly context: MarkweaveCommandContext;
  readonly signal: AbortSignal;
}

export type MarkweaveCommandContent =
  | { readonly format: "text"; readonly value: string }
  | { readonly format: "markdown"; readonly value: string }
  | { readonly format: "json"; readonly value: JSONContent | readonly JSONContent[] };

export type MarkweaveCommandResult =
  | { readonly kind: "cancel" }
  | {
      readonly kind: "apply";
      readonly content: MarkweaveCommandContent;
      readonly placement?: "replace-trigger" | "replace-selection" | "insert-at-cursor";
      readonly selection?: "after" | "preserve";
    };

export type MarkweaveCommandHandler<TPayload = unknown> = (
  invocation: MarkweaveCommandInvocation<TPayload>,
) => MarkweaveCommandResult | Promise<MarkweaveCommandResult>;

export interface MarkweaveCommandSpec<TPayload = unknown> {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly groupId: string;
  readonly order?: number;
  readonly keywords?: readonly string[];
  readonly icon?: MarkweaveCommandIcon;
  readonly surfaces?: readonly MarkweaveCommandSurface[];
  readonly payloadSchemaId?: string;
  readonly isVisible?: MarkweaveCommandPredicate;
  readonly isEnabled?: MarkweaveCommandPredicate;
  readonly getDisabledReason?: MarkweaveCommandReasonResolver;
  readonly execute: MarkweaveCommandHandler<TPayload>;
}

export interface MarkweaveBuiltinCommandsConfig {
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
}

export interface MarkweaveResolvedCommand {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly groupId: string;
  readonly groupLabel: string;
  readonly groupOrder: number;
  readonly order: number;
  readonly keywords: readonly string[];
  readonly icon?: MarkweaveCommandIcon;
  readonly surfaces: readonly MarkweaveCommandSurface[];
  readonly payloadSchemaId?: string;
  readonly enabled: boolean;
  readonly disabledReason?: string;
}

export interface MarkweaveCommandRegistryIssue {
  readonly code:
    | "INVALID_GROUP"
    | "DUPLICATE_GROUP"
    | "INVALID_COMMAND"
    | "DUPLICATE_COMMAND"
    | "UNKNOWN_GROUP"
    | "INVALID_BUILTIN_CONFIG";
  readonly message: string;
  readonly itemId?: string;
}

export interface MarkweaveCommandRegistryOptions {
  readonly lang?: MarkweaveLang;
  readonly commandGroups?: readonly MarkweaveCommandGroupSpec[];
  readonly commands?: readonly MarkweaveCommandSpec[];
  readonly builtinCommands?: MarkweaveBuiltinCommandsConfig;
  readonly strict?: boolean;
}

export interface MarkweaveCommandRegistry {
  readonly groups: readonly MarkweaveCommandGroupSpec[];
  readonly commands: readonly MarkweaveResolvedCommand[];
  readonly issues: readonly MarkweaveCommandRegistryIssue[];
  readonly resolve: (
    context: MarkweaveCommandContext,
    options?: { readonly surface?: MarkweaveCommandSurface; readonly query?: string },
  ) => readonly MarkweaveResolvedCommand[];
}

export type MarkweaveCommandErrorCode =
  | "COMMAND_NOT_FOUND"
  | "COMMAND_DISABLED"
  | "COMMAND_BUSY"
  | "COMMAND_ABORTED"
  | "COMMAND_CONFLICT"
  | "INVALID_RESULT"
  | "HANDLER_FAILED"
  | "EDITOR_UNAVAILABLE";

export interface MarkweaveCommandExecutionError {
  readonly code: MarkweaveCommandErrorCode;
  readonly message: string;
  readonly commandId: string;
  readonly executionId?: string;
}

export type MarkweaveCommandExecutionResult =
  | {
      readonly ok: true;
      readonly commandId: string;
      readonly executionId: string;
      readonly outcome: "applied" | "cancelled";
    }
  | ({ readonly ok: false } & MarkweaveCommandExecutionError);

export interface MarkweaveCommandRuntimeState {
  readonly phase: "idle" | "running" | "applying";
  readonly activeExecution: {
    readonly commandId: string;
    readonly executionId: string;
    readonly source: MarkweaveCommandSource;
  } | null;
  readonly lastResult: MarkweaveCommandExecutionResult | null;
}

export interface MarkweaveCommandController {
  readonly getCommands: (options?: {
    readonly surface?: MarkweaveCommandSurface;
    readonly query?: string;
  }) => readonly MarkweaveResolvedCommand[];
  readonly execute: <TPayload = unknown>(
    commandId: string,
    options?: { readonly source?: "api"; readonly payload?: TPayload },
  ) => Promise<MarkweaveCommandExecutionResult>;
  readonly getState: () => MarkweaveCommandRuntimeState;
  readonly subscribe: (listener: (state: MarkweaveCommandRuntimeState) => void) => () => void;
  readonly cancel: (executionId?: string) => void;
}

export type MarkweaveCommandErrorHandler = (error: MarkweaveCommandExecutionError) => void;
