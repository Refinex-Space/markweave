import type { MarkweaveCalloutType } from "../callout/callout-node";

export type SlashCommandGroup = "Style" | "Callout" | "Insert" | "Upload";
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

export const editorSlashCommandSpecs: readonly SlashCommandSpec[] = [
  {
    id: "paragraph",
    label: "Text",
    description: "Convert the current block to plain text.",
    group: "Style",
    category: "structure",
    executionKind: "editor",
    icon: "type",
    searchTerms: ["paragraph", "text", "normal", "plain"],
  },
  {
    id: "heading-1",
    label: "Heading 1",
    description: "Large section heading.",
    group: "Style",
    category: "structure",
    executionKind: "editor",
    icon: "heading-1",
    searchTerms: ["h1", "title"],
  },
  {
    id: "heading-2",
    label: "Heading 2",
    description: "Medium section heading.",
    group: "Style",
    category: "structure",
    executionKind: "editor",
    icon: "heading-2",
    searchTerms: ["h2", "subtitle"],
  },
  {
    id: "heading-3",
    label: "Heading 3",
    description: "Small section heading.",
    group: "Style",
    category: "structure",
    executionKind: "editor",
    icon: "heading-3",
    searchTerms: ["h3", "subtitle"],
  },
  {
    id: "bullet-list",
    label: "Bullet list",
    description: "Start an unordered list.",
    group: "Style",
    category: "structure",
    executionKind: "editor",
    icon: "bullet-list",
    searchTerms: ["ul", "list", "dash"],
  },
  {
    id: "ordered-list",
    label: "Numbered list",
    description: "Start a numbered list.",
    group: "Style",
    category: "structure",
    executionKind: "editor",
    icon: "ordered-list",
    searchTerms: ["ol", "number", "list"],
  },
  {
    id: "task-list",
    label: "To-do list",
    description: "Start a task list.",
    group: "Style",
    category: "structure",
    executionKind: "editor",
    icon: "task-list",
    searchTerms: ["todo", "task", "checkbox", "check"],
  },
  {
    id: "blockquote",
    label: "Blockquote",
    description: "Quote a paragraph.",
    group: "Style",
    category: "structure",
    executionKind: "editor",
    icon: "blockquote",
    searchTerms: ["quote", "blockquote"],
  },
  {
    id: "code-block",
    label: "Code Block",
    description: "Insert a fenced code block.",
    group: "Style",
    category: "structure",
    executionKind: "editor",
    icon: "code-block",
    searchTerms: ["code", "fence", "pre"],
  },
  {
    id: "callout-info",
    label: "Info",
    description: "Insert an info callout.",
    group: "Callout",
    category: "callout",
    executionKind: "editor",
    icon: "info",
    calloutType: "info",
    searchTerms: ["callout", "note", "info"],
  },
  {
    id: "callout-tip",
    label: "Tip",
    description: "Insert a tip callout.",
    group: "Callout",
    category: "callout",
    executionKind: "editor",
    icon: "tip",
    calloutType: "tip",
    searchTerms: ["callout", "tip", "hint"],
  },
  {
    id: "callout-warning",
    label: "Warning",
    description: "Insert a warning callout.",
    group: "Callout",
    category: "callout",
    executionKind: "editor",
    icon: "warning",
    calloutType: "warning",
    searchTerms: ["callout", "warning", "caution"],
  },
  {
    id: "callout-error",
    label: "Error",
    description: "Insert an error callout.",
    group: "Callout",
    category: "callout",
    executionKind: "editor",
    icon: "error",
    calloutType: "error",
    searchTerms: ["callout", "error", "danger"],
  },
  {
    id: "callout-success",
    label: "Success",
    description: "Insert a success callout.",
    group: "Callout",
    category: "callout",
    executionKind: "editor",
    icon: "success",
    calloutType: "success",
    searchTerms: ["callout", "success", "done"],
  },
  {
    id: "emoji",
    label: "Emoji",
    description: "Insert an emoji.",
    group: "Insert",
    category: "insert",
    executionKind: "editor",
    icon: "emoji",
    inputKind: "emoji",
    searchTerms: ["emoji", "smile", "emote"],
  },
  {
    id: "table",
    label: "Table",
    description: "Insert a 3 by 3 table with a header row.",
    group: "Insert",
    category: "table",
    executionKind: "editor",
    icon: "table",
    searchTerms: ["grid", "cell", "row", "column"],
  },
  {
    id: "separator",
    label: "Separator",
    description: "Insert a horizontal divider.",
    group: "Insert",
    category: "insert",
    executionKind: "editor",
    icon: "separator",
    searchTerms: ["divider", "horizontal", "rule", "separator", "line"],
  },
  {
    id: "image",
    label: "Image",
    description: "Insert an image.",
    group: "Upload",
    category: "upload",
    executionKind: "editor",
    icon: "image",
    uploadKind: "image",
    searchTerms: ["image", "picture", "photo", "upload"],
  },
  {
    id: "video",
    label: "Video",
    description: "Insert a video.",
    group: "Upload",
    category: "upload",
    executionKind: "editor",
    icon: "video",
    inputKind: "upload",
    uploadKind: "video",
    searchTerms: ["video", "movie", "upload"],
  },
  {
    id: "attachment",
    label: "Attachment",
    description: "Insert a file attachment.",
    group: "Upload",
    category: "upload",
    executionKind: "editor",
    icon: "attachment",
    inputKind: "upload",
    uploadKind: "attachment",
    searchTerms: ["attachment", "file", "upload"],
  },
] as const;

export const defaultSlashCommandSpecs: readonly SlashCommandSpec[] = [...editorSlashCommandSpecs] as const;

export function isExecutableSlashCommand(command: SlashCommandSpec) {
  return command.executionKind === "editor";
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
