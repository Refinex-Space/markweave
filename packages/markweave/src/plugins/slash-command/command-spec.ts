import type { MarkweaveCalloutType } from "../callout/callout-node";
import { getLocalizedSlashCommandSpecs } from "../../i18n";
import type {
  MarkweaveBuiltinCommandIconName,
  MarkweaveCommandIcon,
  MarkweaveResolvedCommand,
} from "../../commands/command-types";

export type SlashCommandGroup = string;
export type SlashCommandCategory = "structure" | "callout" | "insert" | "table" | "upload" | "ai";
export type SlashCommandExecutionKind = "editor" | "external-ai";
export type SlashCommandInputKind = "emoji" | "upload";
export type SlashCommandIconName = MarkweaveBuiltinCommandIconName;
export type SlashCommandIcon = SlashCommandIconName | MarkweaveCommandIcon;

export type SlashCommandUploadKind = "image" | "video" | "attachment";

export interface SlashCommandSpec {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly group: SlashCommandGroup;
  readonly category: SlashCommandCategory;
  readonly executionKind: SlashCommandExecutionKind;
  readonly icon: SlashCommandIcon;
  readonly searchTerms: readonly string[];
  readonly groupId?: string;
  readonly groupOrder?: number;
  readonly order?: number;
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

export function createResolvedSlashCommandSpecs(
  commands: readonly MarkweaveResolvedCommand[],
  lang: "zh" | "en" = "zh",
): readonly SlashCommandSpec[] {
  const builtinById = new Map(getLocalizedSlashCommandSpecs(lang).map((command) => [command.id, command]));
  return commands.map((command) => {
    const builtin = builtinById.get(command.id);
    return Object.freeze({
      id: command.id,
      label: command.label,
      description: command.description ?? "",
      group: command.groupLabel,
      groupId: command.groupId,
      groupOrder: command.groupOrder,
      order: command.order,
      category: builtin?.category ?? "insert",
      executionKind: "editor",
      icon: command.icon ?? "type",
      searchTerms: command.keywords,
      calloutType: builtin?.calloutType,
      inputKind: builtin?.inputKind,
      uploadKind: builtin?.uploadKind,
      disabled: !command.enabled,
      disabledReason: command.disabledReason,
    } satisfies SlashCommandSpec);
  });
}

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
