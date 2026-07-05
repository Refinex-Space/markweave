export type SlashCommandStateName =
  | "idle"
  | "trigger-detected"
  | "menu-open"
  | "filtering"
  | "keyboard-selecting"
  | "executing"
  | "closed";

export interface SlashCommandState {
  readonly name: SlashCommandStateName;
  readonly query: string;
  readonly activeIndex: number;
  readonly triggerFrom: number | null;
  readonly triggerTo: number | null;
}

export type SlashCommandEvent =
  | { readonly type: "detect-trigger"; readonly from: number; readonly to: number }
  | { readonly type: "open-menu" }
  | { readonly type: "change-query"; readonly query: string }
  | { readonly type: "move-active"; readonly delta: 1 | -1; readonly optionCount: number }
  | { readonly type: "set-active"; readonly index: number; readonly optionCount: number }
  | { readonly type: "execute" }
  | { readonly type: "escape" }
  | { readonly type: "composition-start" };

export const initialSlashCommandState: SlashCommandState = {
  name: "idle",
  query: "",
  activeIndex: 0,
  triggerFrom: null,
  triggerTo: null,
};

export function reduceSlashCommandState(state: SlashCommandState, event: SlashCommandEvent): SlashCommandState {
  switch (event.type) {
    case "detect-trigger":
      return {
        name: "trigger-detected",
        query: "",
        activeIndex: 0,
        triggerFrom: event.from,
        triggerTo: event.to,
      };
    case "open-menu":
      return state.name === "trigger-detected" ? { ...state, name: "menu-open" } : state;
    case "change-query":
      return state.name === "idle" || state.name === "closed"
        ? state
        : { ...state, name: event.query.length > 0 ? "filtering" : "menu-open", query: event.query, activeIndex: 0 };
    case "move-active":
      if (event.optionCount <= 0 || (state.name !== "menu-open" && state.name !== "filtering" && state.name !== "keyboard-selecting")) {
        return state;
      }

      return {
        ...state,
        name: "keyboard-selecting",
        activeIndex: (state.activeIndex + event.delta + event.optionCount) % event.optionCount,
      };
    case "set-active":
      if (event.optionCount <= 0 || (state.name !== "menu-open" && state.name !== "filtering" && state.name !== "keyboard-selecting")) {
        return state;
      }

      return {
        ...state,
        activeIndex: Math.min(event.optionCount - 1, Math.max(0, event.index)),
      };
    case "execute":
      return state.name === "idle" || state.name === "closed" ? state : { ...state, name: "executing" };
    case "escape":
    case "composition-start":
      return {
        ...initialSlashCommandState,
        name: "closed",
      };
    default:
      return state;
  }
}

export function getSlashQueryFromTextBeforeCursor(textBeforeCursor: string) {
  const match = /(?:^|\s)\/([\p{L}\p{N}\-_ ]*)$/u.exec(textBeforeCursor);
  return match ? match[1] : null;
}
