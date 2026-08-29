import { getMarkweaveMessages, normalizeMarkweaveLang } from "../i18n";
import { getLocalizedSlashCommandSpecs } from "../plugins/slash-command/command-spec";
import type {
  MarkweaveCommandContext,
  MarkweaveCommandGroupSpec,
  MarkweaveCommandRegistry,
  MarkweaveCommandRegistryIssue,
  MarkweaveCommandRegistryOptions,
  MarkweaveCommandSpec,
  MarkweaveCommandSurface,
  MarkweaveResolvedCommand,
} from "./command-types";

export const markweaveBuiltinCommandIds = [
  "paragraph",
  "heading-1",
  "heading-2",
  "heading-3",
  "bullet-list",
  "ordered-list",
  "task-list",
  "blockquote",
  "code-block",
  "details",
  "callout-info",
  "callout-tip",
  "callout-warning",
  "callout-error",
  "callout-success",
  "emoji",
  "table",
  "separator",
  "block-math",
  "image",
  "video",
  "attachment",
] as const;

export const markweaveBuiltinCommandGroupIds = ["style", "callout", "insert", "upload"] as const;

const builtinCommandIdSet = new Set<string>(markweaveBuiltinCommandIds);
const hostIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const defaultSurfaces = ["slash", "api"] as const;
const registryRecords = new WeakMap<MarkweaveCommandRegistry, ReadonlyMap<string, RegisteredCommand>>();

interface RegisteredCommand {
  readonly resolved: MarkweaveResolvedCommand;
  readonly spec: MarkweaveCommandSpec | null;
  readonly registrationIndex: number;
}

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]);
}

function isFiniteOrder(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isValidText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function commandGroupId(commandId: string) {
  if (commandId.startsWith("callout-")) return "callout";
  if (["image", "video", "attachment"].includes(commandId)) return "upload";
  if (["emoji", "table", "separator", "block-math"].includes(commandId)) return "insert";
  return "style";
}

function validateHostGroup(group: MarkweaveCommandGroupSpec) {
  return hostIdPattern.test(group.id) && isValidText(group.label) && isFiniteOrder(group.order);
}

function validateIcon(icon: MarkweaveCommandSpec["icon"]) {
  if (!icon) return true;
  if (icon.kind === "builtin") {
    return getLocalizedSlashCommandSpecs("zh").some((command) => command.icon === icon.name);
  }
  if (icon.kind !== "text") return false;
  const text = icon.text.trim();
  const length = Array.from(text).length;
  return length >= 1 && length <= 4;
}

function validateSurfaces(surfaces: readonly MarkweaveCommandSurface[] | undefined) {
  if (!surfaces) return true;
  return surfaces.length > 0
    && new Set(surfaces).size === surfaces.length
    && surfaces.every((surface) => surface === "slash" || surface === "api");
}

function validateHostCommand(command: MarkweaveCommandSpec) {
  return hostIdPattern.test(command.id)
    && isValidText(command.label)
    && isValidText(command.groupId)
    && typeof command.execute === "function"
    && isFiniteOrder(command.order)
    && validateIcon(command.icon)
    && validateSurfaces(command.surfaces)
    && (command.description === undefined || typeof command.description === "string")
    && (command.keywords === undefined || command.keywords.every((keyword) => typeof keyword === "string"));
}

function resolveCommand(
  command: RegisteredCommand,
  context: MarkweaveCommandContext,
): MarkweaveResolvedCommand | null {
  const spec = command.spec;
  if (spec?.isVisible) {
    try {
      const visible = spec.isVisible(context);
      if (typeof visible !== "boolean" || !visible) return null;
    } catch {
      return null;
    }
  }

  let enabled = context.editable && command.resolved.enabled;
  if (enabled && spec?.isEnabled) {
    try {
      const result = spec.isEnabled(context);
      enabled = typeof result === "boolean" && result;
    } catch {
      enabled = false;
    }
  }

  let disabledReason = command.resolved.disabledReason;
  if (!enabled) {
    if (spec?.getDisabledReason) {
      try {
        const reason = spec.getDisabledReason(context);
        disabledReason = typeof reason === "string" && reason.trim() ? reason : undefined;
      } catch {
        disabledReason = undefined;
      }
    }
    disabledReason ??= context.editable ? "Command is unavailable in the current context." : "The editor is read-only.";
  }

  return Object.freeze({ ...command.resolved, enabled, disabledReason });
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchesQuery(command: MarkweaveResolvedCommand, query: string) {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;
  return normalizeSearch([
    command.id,
    command.label,
    command.description ?? "",
    ...command.keywords,
  ].join(" ")).includes(normalized);
}

export function createMarkweaveCommandRegistry(
  options: MarkweaveCommandRegistryOptions = {},
): MarkweaveCommandRegistry {
  const lang = normalizeMarkweaveLang(options.lang);
  const messages = getMarkweaveMessages(lang);
  const issues: MarkweaveCommandRegistryIssue[] = [];
  const groups: Array<MarkweaveCommandGroupSpec & { readonly registrationIndex: number }> = [
    { id: "style", label: messages.slash.groups.Style, order: 100, registrationIndex: 0 },
    { id: "callout", label: messages.slash.groups.Callout, order: 200, registrationIndex: 1 },
    { id: "insert", label: messages.slash.groups.Insert, order: 300, registrationIndex: 2 },
    { id: "upload", label: messages.slash.groups.Upload, order: 400, registrationIndex: 3 },
  ];
  const groupIds = new Set(groups.map((group) => group.id));

  for (const group of options.commandGroups ?? []) {
    if (!validateHostGroup(group)) {
      issues.push({ code: "INVALID_GROUP", itemId: group.id, message: `Invalid host command group: ${group.id || "<empty>"}.` });
      continue;
    }
    if (groupIds.has(group.id)) {
      issues.push({ code: "DUPLICATE_GROUP", itemId: group.id, message: `Duplicate command group id: ${group.id}.` });
      continue;
    }
    groupIds.add(group.id);
    groups.push({ ...group, registrationIndex: groups.length });
  }

  const include = options.builtinCommands?.include;
  const exclude = options.builtinCommands?.exclude;
  if (include && exclude) {
    issues.push({ code: "INVALID_BUILTIN_CONFIG", message: "builtinCommands.include and builtinCommands.exclude cannot be used together." });
  }
  for (const id of [...(include ?? []), ...(exclude ?? [])]) {
    if (!builtinCommandIdSet.has(id)) {
      issues.push({ code: "INVALID_BUILTIN_CONFIG", itemId: id, message: `Unknown built-in command id: ${id}.` });
    }
  }
  const includedBuiltins = new Set(include ?? markweaveBuiltinCommandIds);
  const excludedBuiltins = new Set(exclude ?? []);
  const sortedGroups = groups
    .slice()
    .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
      || left.registrationIndex - right.registrationIndex);
  const groupById = new Map(sortedGroups.map((group) => [group.id, group]));
  const records: RegisteredCommand[] = [];

  getLocalizedSlashCommandSpecs(lang).forEach((command, index) => {
    if ((include && !includedBuiltins.has(command.id)) || excludedBuiltins.has(command.id)) return;
    const groupId = commandGroupId(command.id);
    const group = groupById.get(groupId)!;
    records.push({
      registrationIndex: records.length,
      spec: null,
      resolved: Object.freeze({
        id: command.id,
        label: command.label,
        description: command.description,
        groupId,
        groupLabel: group.label,
        groupOrder: group.order ?? Number.MAX_SAFE_INTEGER,
        order: index,
        keywords: freezeArray(command.searchTerms),
        icon: {
          kind: "builtin" as const,
          name: typeof command.icon === "string"
            ? command.icon
            : command.icon.kind === "builtin"
              ? command.icon.name
              : "type",
        },
        surfaces: defaultSurfaces,
        enabled: !command.disabled,
        disabledReason: command.disabledReason,
      }),
    });
  });

  const commandIds = new Set(records.map((record) => record.resolved.id));
  for (const command of options.commands ?? []) {
    if (commandIds.has(command.id) || builtinCommandIdSet.has(command.id)) {
      issues.push({ code: "DUPLICATE_COMMAND", itemId: command.id, message: `Duplicate command id: ${command.id}.` });
      continue;
    }
    if (!validateHostCommand(command)) {
      issues.push({ code: "INVALID_COMMAND", itemId: command.id, message: `Invalid host command: ${command.id || "<empty>"}.` });
      continue;
    }
    const group = groupById.get(command.groupId);
    if (!group) {
      issues.push({ code: "UNKNOWN_GROUP", itemId: command.id, message: `Unknown command group ${command.groupId} for ${command.id}.` });
      continue;
    }
    commandIds.add(command.id);
    records.push({
      registrationIndex: records.length,
      spec: command,
      resolved: Object.freeze({
        id: command.id,
        label: command.label,
        description: command.description,
        groupId: command.groupId,
        groupLabel: group.label,
        groupOrder: group.order ?? Number.MAX_SAFE_INTEGER,
        order: command.order ?? Number.MAX_SAFE_INTEGER,
        keywords: freezeArray(command.keywords ?? []),
        icon: command.icon?.kind === "text"
          ? Object.freeze({ kind: "text" as const, text: command.icon.text.trim() })
          : command.icon,
        surfaces: freezeArray(command.surfaces ?? defaultSurfaces),
        payloadSchemaId: command.payloadSchemaId,
        enabled: true,
      }),
    });
  }

  records.sort((left, right) => left.resolved.groupOrder - right.resolved.groupOrder
    || left.resolved.order - right.resolved.order
    || left.registrationIndex - right.registrationIndex);

  if (options.strict && issues.length) {
    throw new Error(issues.map((issue) => issue.message).join("\n"));
  }

  const frozenGroups = freezeArray(sortedGroups.map(({ registrationIndex: _registrationIndex, ...group }) => Object.freeze(group)));
  const frozenIssues = freezeArray(issues.map((issue) => Object.freeze(issue)));
  const frozenCommands = freezeArray(records.map((record) => record.resolved));
  const recordMap = new Map(records.map((record) => [record.resolved.id, record]));
  const registry: MarkweaveCommandRegistry = Object.freeze({
    groups: frozenGroups,
    commands: frozenCommands,
    issues: frozenIssues,
    resolve(
      context: MarkweaveCommandContext,
      resolveOptions: { readonly surface?: MarkweaveCommandSurface; readonly query?: string } = {},
    ) {
      return freezeArray(records.flatMap((record) => {
        if (resolveOptions.surface && !record.resolved.surfaces.includes(resolveOptions.surface)) return [];
        const resolved = resolveCommand(record, context);
        return resolved && matchesQuery(resolved, resolveOptions.query ?? "") ? [resolved] : [];
      }));
    },
  });
  registryRecords.set(registry, recordMap);
  return registry;
}

export function getRegisteredMarkweaveCommand(registry: MarkweaveCommandRegistry, commandId: string) {
  return registryRecords.get(registry)?.get(commandId) ?? null;
}

export function isMarkweaveBuiltinCommandId(commandId: string) {
  return builtinCommandIdSet.has(commandId);
}
