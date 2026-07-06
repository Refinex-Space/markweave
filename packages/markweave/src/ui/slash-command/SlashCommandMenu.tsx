import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  CircleX,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Info,
  Lightbulb,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Paperclip,
  SmilePlus,
  Table2,
  Text,
  Video,
  Quote,
  type LucideIcon,
} from "lucide-react";
import {
  isExecutableSlashCommand,
  type SlashCommandGroup,
  type SlashCommandIconName,
  type SlashCommandSpec,
  type SlashCommandUploadKind,
} from "../../plugins/slash-command/command-spec";
import { isSlashCommandMenuState } from "../../plugins/slash-command/slash-keyboard";
import type { SlashCommandMenuPosition } from "../../plugins/slash-command/slash-runtime";
import type { SlashCommandState } from "../../plugins/slash-command/slash-state";
import {
  detectUploadSource,
  resolveMarkweaveUploadResult,
  type MarkweaveSlashCommandUploadHandler,
  type MarkweaveUploadRequest,
  type MarkweaveUploadResult,
} from "../../plugins/slash-command/upload";
import { getMarkweaveMessages, type MarkweaveMessages } from "../../i18n";

type SlashCommandSelectOptions = { readonly emoji?: string; readonly uploadResult?: MarkweaveUploadResult };

interface SlashCommandMenuProps {
  readonly commands: readonly SlashCommandSpec[];
  readonly messages?: MarkweaveMessages;
  readonly state: SlashCommandState;
  readonly position: SlashCommandMenuPosition | null;
  readonly inputCommand?: SlashCommandSpec | null;
  readonly onActiveIndexChange?: (index: number) => void;
  readonly onInputCommandChange?: (command: SlashCommandSpec | null) => void;
  readonly onSelect: (command: SlashCommandSpec, options?: SlashCommandSelectOptions) => void;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
}

export type SlashCommandMenuPresentation =
  | {
      readonly visible: false;
      readonly empty: false;
      readonly activeIndex: -1;
    }
  | {
      readonly visible: true;
      readonly empty: true;
      readonly activeIndex: -1;
    }
  | {
      readonly visible: true;
      readonly empty: false;
      readonly activeIndex: number;
    };

const defaultMessages = getMarkweaveMessages("zh");

const slashIconMap: Record<SlashCommandIconName, LucideIcon> = {
  type: Text,
  "heading-1": Heading1,
  "heading-2": Heading2,
  "heading-3": Heading3,
  "bullet-list": List,
  "ordered-list": ListOrdered,
  "task-list": ListChecks,
  blockquote: Quote,
  "code-block": Braces,
  info: Info,
  tip: Lightbulb,
  warning: AlertTriangle,
  error: CircleX,
  success: CheckCircle2,
  emoji: SmilePlus,
  table: Table2,
  separator: Minus,
  image: Image,
  video: Video,
  attachment: Paperclip,
};

function SlashIcon({ name }: { readonly name: SlashCommandIconName }) {
  const Icon = slashIconMap[name];
  return <Icon aria-hidden="true" absoluteStrokeWidth size={18} strokeWidth={1.6} />;
}

export function getSlashCommandMenuPresentation(
  state: SlashCommandState,
  commands: readonly SlashCommandSpec[],
  position: SlashCommandMenuPosition | null,
): SlashCommandMenuPresentation {
  if (!isSlashCommandMenuState(state) || !position) {
    return {
      visible: false,
      empty: false,
      activeIndex: -1,
    };
  }

  if (commands.length === 0) {
    return {
      visible: true,
      empty: true,
      activeIndex: -1,
    };
  }

  return {
    visible: true,
    empty: false,
    activeIndex: Math.min(commands.length - 1, Math.max(0, state.activeIndex)),
  };
}

function groupSlashCommands(commands: readonly SlashCommandSpec[], messages: MarkweaveMessages) {
  const slashCommandGroupOrder = Object.values(messages.slash.groups) as readonly SlashCommandGroup[];

  return slashCommandGroupOrder
    .map((group) => ({
      group,
      commands: commands.filter((command) => command.group === group),
    }))
    .filter((entry) => entry.commands.length > 0);
}

function getUploadKindLabel(kind: SlashCommandUploadKind, messages: MarkweaveMessages) {
  return messages.slash.uploadKindLabels[kind] ?? messages.slash.uploadKindLabels.upload;
}

function EmojiPicker({
  command,
  messages,
  onBack,
  onSelect,
}: {
  readonly command: SlashCommandSpec;
  readonly messages: MarkweaveMessages;
  readonly onBack: () => void;
  readonly onSelect: (command: SlashCommandSpec, options: SlashCommandSelectOptions) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? messages.slash.emojiItems.filter((item) => [item.emoji, item.label, ...item.terms].join(" ").toLowerCase().includes(normalized))
      : messages.slash.emojiItems;
    return filtered.slice(0, 12);
  }, [messages.slash.emojiItems, query]);

  const choose = (index: number) => {
    const item = visibleItems[Math.min(visibleItems.length - 1, Math.max(0, index))];
    if (item) {
      onSelect(command, { emoji: item.emoji });
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onBack();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (visibleItems.length ? (index + 1) % visibleItems.length : 0));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (visibleItems.length ? (index - 1 + visibleItems.length) % visibleItems.length : 0));
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      choose(activeIndex);
    }
  };

  return (
    <div className="markweave-slash-subpanel" data-testid="markweave-slash-emoji-picker">
      <div className="markweave-slash-subpanel-header">
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onBack}>
          {messages.common.back}
        </button>
        <span>{messages.slash.emojiTitle}</span>
      </div>
      <label className="markweave-slash-input">
        <span>/</span>
        <input autoFocus value={query} placeholder={messages.slash.emojiSearchPlaceholder} onChange={(event) => setQuery(event.currentTarget.value)} onKeyDown={handleKeyDown} />
      </label>
      <div className="markweave-slash-emoji-grid" role="listbox" aria-label={messages.slash.emojiTitle}>
        {visibleItems.map((item, index) => (
          <button
            key={`${item.emoji}-${item.label}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            data-active={index === activeIndex}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
          >
            <span>{item.emoji}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function UploadPanel({
  command,
  messages,
  onBack,
  onSelect,
  onUpload,
}: {
  readonly command: SlashCommandSpec;
  readonly messages: MarkweaveMessages;
  readonly onBack: () => void;
  readonly onSelect: (command: SlashCommandSpec, options: SlashCommandSelectOptions) => void;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
}) {
  const uploadKind = command.uploadKind ?? "attachment";
  const [inputValue, setInputValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitRequest = async (source: MarkweaveUploadRequest["source"]) => {
    const request: MarkweaveUploadRequest = {
      kind: uploadKind,
      source,
      trigger: "slash-command",
    };

    const result = await resolveMarkweaveUploadResult(request, onUpload);

    onSelect(command, { uploadResult: result });
  };

  const submit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      if (file) {
        await submitRequest({ type: "file", file, mimeType: file.type });
        return;
      }

      if (!inputValue.trim()) {
        setError(messages.slash.uploadRequiredError);
        return;
      }

      await submitRequest(detectUploadSource(inputValue));
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : messages.slash.uploadFailedError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onBack();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="markweave-slash-subpanel" data-testid="markweave-slash-upload-panel">
      <div className="markweave-slash-subpanel-header">
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onBack}>
          {messages.common.back}
        </button>
        <span>{getUploadKindLabel(uploadKind, messages)}</span>
      </div>
      <label className="markweave-slash-upload-field">
        <span>{messages.slash.uploadValueLabel}</span>
        <input autoFocus value={inputValue} placeholder={messages.slash.uploadValuePlaceholder} onChange={(event) => setInputValue(event.currentTarget.value)} onKeyDown={handleKeyDown} />
      </label>
      <label className="markweave-slash-upload-field">
        <span>{messages.common.file}</span>
        <input type="file" onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} />
      </label>
      {error ? <div className="markweave-slash-upload-error">{error}</div> : null}
      <div className="markweave-slash-upload-actions">
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onBack}>
          {messages.common.cancel}
        </button>
        <button type="button" data-primary="true" disabled={isSubmitting} onMouseDown={(event) => event.preventDefault()} onClick={() => void submit()}>
          {messages.common.insert}
        </button>
      </div>
    </div>
  );
}

export function SlashCommandMenu({
  commands,
  messages = defaultMessages,
  state,
  position,
  inputCommand,
  onActiveIndexChange,
  onInputCommandChange,
  onSelect,
  onUpload,
}: SlashCommandMenuProps) {
  const presentation = getSlashCommandMenuPresentation(state, commands, position);

  if (!presentation.visible || !position) {
    return null;
  }

  const groupedCommands = groupSlashCommands(commands, messages);
  const style = {
    left: position.left,
    top: position.top,
    maxHeight: position.maxHeight,
    "--markweave-slash-menu-max-height": `${position.maxHeight}px`,
  } as CSSProperties;
  const triggerStyle = {
    left: position.triggerLeft,
    top: position.triggerTop,
  } as CSSProperties;
  const openInputCommand = (command: SlashCommandSpec) => onInputCommandChange?.(command);
  const closeInputCommand = () => onInputCommandChange?.(null);

  return (
    <>
      <div className="markweave-slash-trigger" style={triggerStyle} aria-hidden="true" data-testid="markweave-slash-trigger">
        <span>/</span>
        <em>{state.query ? state.query : messages.slash.filterPlaceholder}</em>
      </div>
      <div
        className="markweave-slash-menu"
        style={style}
        role="listbox"
        aria-label={messages.slash.ariaLabel}
        data-placement={position.placement}
        data-testid="markweave-slash-menu"
      >
        {inputCommand?.inputKind === "emoji" ? (
          <EmojiPicker command={inputCommand} messages={messages} onBack={closeInputCommand} onSelect={onSelect} />
        ) : inputCommand?.inputKind === "upload" ? (
          <UploadPanel command={inputCommand} messages={messages} onBack={closeInputCommand} onSelect={onSelect} onUpload={onUpload} />
        ) : presentation.empty ? (
          <div className="markweave-slash-menu__empty" role="option" aria-disabled="true">
            {messages.slash.noResults}
          </div>
        ) : (
          <div className="markweave-slash-command-list">
            {groupedCommands.map((groupEntry) => (
              <section key={groupEntry.group} className="markweave-slash-group" aria-label={groupEntry.group}>
                <div className="markweave-slash-group-title">{groupEntry.group}</div>
                {groupEntry.commands.map((command) => {
                  const flatIndex = commands.indexOf(command);
                  const active = flatIndex === presentation.activeIndex;
                  const executable = isExecutableSlashCommand(command);
                  const disabled = Boolean(command.disabled);
                  return (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-disabled={!executable || disabled}
                      data-active={active}
                      data-disabled={disabled ? "true" : "false"}
                      data-execution-kind={command.executionKind}
                      data-testid={`markweave-slash-command-${command.id}`}
                      title={disabled ? command.disabledReason : undefined}
                      onFocus={() => onActiveIndexChange?.(flatIndex)}
                      onMouseEnter={() => onActiveIndexChange?.(flatIndex)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (!executable || disabled) {
                          return;
                        }

                        if (command.inputKind) {
                          openInputCommand(command);
                          return;
                        }

                        onSelect(command);
                      }}
                    >
                      <SlashIcon name={command.icon} />
                      <span>{command.label}</span>
                      {disabled && command.disabledReason ? <small>{command.disabledReason}</small> : null}
                    </button>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
