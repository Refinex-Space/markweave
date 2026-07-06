import { isExecutableSlashCommand, type SlashCommandSpec } from "./command-spec";
import type { SlashCommandState } from "./slash-state";

export type SlashCommandKeyboardAction =
  | { readonly type: "ignore" }
  | { readonly type: "close" }
  | { readonly type: "move-active"; readonly delta: 1 | -1; readonly optionCount: number }
  | { readonly type: "execute-active"; readonly command: SlashCommandSpec };

export interface SlashCommandKeyboardOptions {
  readonly isComposing?: boolean;
}

export function isSlashCommandMenuState(state: SlashCommandState) {
  return state.name !== "idle" && state.name !== "closed" && state.name !== "executing";
}

export function getSlashCommandKeyboardAction(
  state: SlashCommandState,
  commands: readonly SlashCommandSpec[],
  key: string,
  options: SlashCommandKeyboardOptions = {},
): SlashCommandKeyboardAction {
  if (options.isComposing) {
    return { type: "ignore" };
  }

  if (!isSlashCommandMenuState(state)) {
    return { type: "ignore" };
  }

  if (key === "Escape") {
    return { type: "close" };
  }

  if (key === "ArrowDown" && commands.length > 0) {
    return { type: "move-active", delta: 1, optionCount: commands.length };
  }

  if (key === "ArrowUp" && commands.length > 0) {
    return { type: "move-active", delta: -1, optionCount: commands.length };
  }

  if (key === "Enter" || key === "Tab") {
    const command = commands[state.activeIndex];
    return command && isExecutableSlashCommand(command) ? { type: "execute-active", command } : { type: "ignore" };
  }

  return { type: "ignore" };
}
