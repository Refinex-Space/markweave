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

type SlashCommandSelectOptions = { readonly emoji?: string; readonly uploadResult?: MarkweaveUploadResult };

interface SlashCommandMenuProps {
  readonly commands: readonly SlashCommandSpec[];
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

const slashCommandGroupOrder: readonly SlashCommandGroup[] = ["Style", "Callout", "Insert", "Upload"];

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

const defaultEmojiItems = [
  { emoji: "😀", label: "Grinning", terms: ["smile", "happy", "face"] },
  { emoji: "😂", label: "Joy", terms: ["laugh", "tears"] },
  { emoji: "😍", label: "Heart eyes", terms: ["love", "heart"] },
  { emoji: "👍", label: "Thumbs up", terms: ["yes", "approve"] },
  { emoji: "🙏", label: "Thanks", terms: ["pray", "please"] },
  { emoji: "🔥", label: "Fire", terms: ["hot", "ship"] },
  { emoji: "✨", label: "Sparkles", terms: ["magic", "polish"] },
  { emoji: "✅", label: "Done", terms: ["check", "success"] },
  { emoji: "⚠️", label: "Warning", terms: ["alert", "caution"] },
  { emoji: "💡", label: "Idea", terms: ["tip", "light"] },
  { emoji: "🚀", label: "Rocket", terms: ["launch", "ship"] },
  { emoji: "📌", label: "Pin", terms: ["note", "important"] },
  { emoji: "📎", label: "Attachment", terms: ["file", "paperclip"] },
  { emoji: "🧠", label: "Brain", terms: ["think", "idea"] },
  { emoji: "🎯", label: "Target", terms: ["goal", "focus"] },
] as const;

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

function groupSlashCommands(commands: readonly SlashCommandSpec[]) {
  return slashCommandGroupOrder
    .map((group) => ({
      group,
      commands: commands.filter((command) => command.group === group),
    }))
    .filter((entry) => entry.commands.length > 0);
}

function getUploadKindLabel(kind: SlashCommandUploadKind) {
  switch (kind) {
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "attachment":
      return "Attachment";
    default:
      return "Upload";
  }
}

function EmojiPicker({
  command,
  onBack,
  onSelect,
}: {
  readonly command: SlashCommandSpec;
  readonly onBack: () => void;
  readonly onSelect: (command: SlashCommandSpec, options: SlashCommandSelectOptions) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? defaultEmojiItems.filter((item) => [item.emoji, item.label, ...item.terms].join(" ").toLowerCase().includes(normalized))
      : defaultEmojiItems;
    return filtered.slice(0, 12);
  }, [query]);

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
          Back
        </button>
        <span>Emoji</span>
      </div>
      <label className="markweave-slash-input">
        <span>/</span>
        <input autoFocus value={query} placeholder="Search emoji..." onChange={(event) => setQuery(event.currentTarget.value)} onKeyDown={handleKeyDown} />
      </label>
      <div className="markweave-slash-emoji-grid" role="listbox" aria-label="Emoji">
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
  onBack,
  onSelect,
  onUpload,
}: {
  readonly command: SlashCommandSpec;
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
        setError("Enter a URL, path, or Base64 value.");
        return;
      }

      await submitRequest(detectUploadSource(inputValue));
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : "Upload failed.");
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
          Back
        </button>
        <span>{getUploadKindLabel(uploadKind)}</span>
      </div>
      <label className="markweave-slash-upload-field">
        <span>URL / path / Base64</span>
        <input autoFocus value={inputValue} placeholder="https://..., /path/file, data:..." onChange={(event) => setInputValue(event.currentTarget.value)} onKeyDown={handleKeyDown} />
      </label>
      <label className="markweave-slash-upload-field">
        <span>File</span>
        <input type="file" onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} />
      </label>
      {error ? <div className="markweave-slash-upload-error">{error}</div> : null}
      <div className="markweave-slash-upload-actions">
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onBack}>
          Cancel
        </button>
        <button type="button" data-primary="true" disabled={isSubmitting} onMouseDown={(event) => event.preventDefault()} onClick={() => void submit()}>
          Insert
        </button>
      </div>
    </div>
  );
}

export function SlashCommandMenu({
  commands,
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

  const groupedCommands = groupSlashCommands(commands);
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
        <em>{state.query ? state.query : "Filter..."}</em>
      </div>
      <div
        className="markweave-slash-menu"
        style={style}
        role="listbox"
        aria-label="Slash commands"
        data-placement={position.placement}
        data-testid="markweave-slash-menu"
      >
        {inputCommand?.inputKind === "emoji" ? (
          <EmojiPicker command={inputCommand} onBack={closeInputCommand} onSelect={onSelect} />
        ) : inputCommand?.inputKind === "upload" ? (
          <UploadPanel command={inputCommand} onBack={closeInputCommand} onSelect={onSelect} onUpload={onUpload} />
        ) : presentation.empty ? (
          <div className="markweave-slash-menu__empty" role="option" aria-disabled="true">
            No results
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
                  return (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-disabled={!executable}
                      data-active={active}
                      data-execution-kind={command.executionKind}
                      data-testid={`markweave-slash-command-${command.id}`}
                      disabled={!executable}
                      onFocus={() => onActiveIndexChange?.(flatIndex)}
                      onMouseEnter={() => onActiveIndexChange?.(flatIndex)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (!executable) {
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
