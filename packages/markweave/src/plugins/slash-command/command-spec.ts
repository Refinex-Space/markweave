import type { MarkweaveCalloutType } from "../callout/callout-node";
import { getLocalizedSlashCommandSpecs } from "../../i18n";

export type SlashCommandGroup = string;
export type SlashCommandCategory = "structure" | "callout" | "insert" | "table" | "upload" | "ai";
export type SlashCommandExecutionKind = "editor" | "external-ai";
export type SlashCommandInputKind = "emoji" | "upload";
export type SlashCommandIconName =
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
  | "table"
  | "separator"
  | "image"
  | "video"
  | "attachment";

export type SlashCommandUploadKind = "image" | "video" | "attachment";

export interface SlashCommandSpec {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly group: SlashCommandGroup;
  readonly category: SlashCommandCategory;
  readonly executionKind: SlashCommandExecutionKind;
  readonly icon: SlashCommandIconName;
  readonly searchTerms: readonly string[];
  readonly calloutType?: MarkweaveCalloutType;
  readonly inputKind?: SlashCommandInputKind;
  readonly uploadKind?: SlashCommandUploadKind;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

export const externalAiSlashCommandSpecs: readonly SlashCommandSpec[] = [
  {
    id: "fix-grammar",
    label: "Fix Grammar",
    description: "Correct the grammar in the following text.",
    group: "Style",
    category: "ai",
    executionKind: "external-ai",
    icon: "tip",
    searchTerms: ["grammar", "correct", "proofread"],
  },
  {
    id: "make-concise",
    label: "Make this concise",
    description: "Shorten the following text while retaining its meaning.",
    group: "Style",
    category: "ai",
    executionKind: "external-ai",
    icon: "tip",
    searchTerms: ["concise", "shorten", "summary"],
  },
  {
    id: "reduce-length",
    label: "Reduce Length",
    description: "Reduce the length of the following text without losing important information.",
    group: "Style",
    category: "ai",
    executionKind: "external-ai",
    icon: "tip",
    searchTerms: ["reduce", "length", "shorten"],
  },
  {
    id: "improve-clarity",
    label: "Improve Clarity",
    description: "Rewrite the following text to improve its clarity.",
    group: "Style",
    category: "ai",
    executionKind: "external-ai",
    icon: "tip",
    searchTerms: ["clarity", "clear", "rewrite"],
  },
  {
    id: "enhance-vocabulary",
    label: "Enhance Vocabulary",
    description: "Enhance the vocabulary used in the following text.",
    group: "Style",
    category: "ai",
    executionKind: "external-ai",
    icon: "tip",
    searchTerms: ["vocabulary", "wording", "enhance"],
  },
  {
    id: "simplify-language",
    label: "Simplify Language",
    description: "Simplify the language used in the following text.",
    group: "Style",
    category: "ai",
    executionKind: "external-ai",
    icon: "tip",
    searchTerms: ["simplify", "plain", "language"],
  },
  {
    id: "add-formal-tone",
    label: "Add Formal Tone",
    description: "Rewrite the following text to add a formal tone.",
    group: "Style",
    category: "ai",
    executionKind: "external-ai",
    icon: "tip",
    searchTerms: ["formal", "tone", "rewrite"],
  },
  {
    id: "add-informal-tone",
    label: "Add Informal Tone",
    description: "Rewrite the following text to add an informal tone.",
    group: "Style",
    category: "ai",
    executionKind: "external-ai",
    icon: "tip",
    searchTerms: ["informal", "casual", "tone"],
  },
] as const;

export { getLocalizedSlashCommandSpecs };

export const editorSlashCommandSpecs: readonly SlashCommandSpec[] = getLocalizedSlashCommandSpecs("zh");

export const defaultSlashCommandSpecs: readonly SlashCommandSpec[] = [...editorSlashCommandSpecs] as const;

export function isExecutableSlashCommand(command: SlashCommandSpec) {
  return command.executionKind === "editor" && !command.disabled;
}

export function filterSlashCommands(query: string, commands: readonly SlashCommandSpec[] = defaultSlashCommandSpecs) {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return commands;
  }

  return commands.filter((command) => {
    const searchable = [command.label, command.description, command.group, command.category, ...command.searchTerms].join(" ").toLowerCase();
    return searchable.includes(normalizedQuery);
  });
}
