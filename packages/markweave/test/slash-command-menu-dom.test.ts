// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMarkweaveMessages } from "../src/i18n";
import { defaultSlashCommandSpecs, getLocalizedSlashCommandSpecs } from "../src/plugins/slash-command/command-spec";
import { SlashCommandMenu } from "../../markweave-react/src/ui/slash-command/SlashCommandMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeRoot: Root | null = null;

async function flushReact() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function renderReact(node: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  activeRoot = createRoot(host);

  await act(async () => {
    activeRoot?.render(node);
  });
  await flushReact();

  return host;
}

function getByTestId<T extends HTMLElement = HTMLElement>(testId: string) {
  const element = document.querySelector<T>(`[data-testid="${testId}"]`);

  if (!element) {
    throw new Error(`Expected test id "${testId}".`);
  }

  return element;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flushReact();
}

afterEach(() => {
  activeRoot?.unmount();
  activeRoot = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("slash command menu DOM", () => {
  it("renders host groups, text icons, disabled reasons, and accessible listbox state", async () => {
    const hostCommand = {
      id: "host.test.insert",
      label: "Host command",
      description: "Host description",
      group: "Host tools",
      groupId: "host.test",
      groupOrder: 250,
      order: 10,
      category: "insert" as const,
      executionKind: "editor" as const,
      icon: { kind: "text" as const, text: "Host" },
      searchTerms: ["host"],
      disabled: true,
      disabledReason: "Select a field first.",
    };

    const host = await renderReact(createElement(SlashCommandMenu, {
      commands: [hostCommand],
      state: { name: "filtering", query: "", activeIndex: 0, triggerFrom: 0, triggerTo: 1 },
      position: { left: 20, top: 40, triggerLeft: 20, triggerTop: 10, maxHeight: 320, placement: "bottom" },
      error: "Safe host error",
      onSelect: vi.fn(),
    }));

    const listbox = host.querySelector('[role="listbox"]');
    const option = getByTestId("markweave-slash-command-host.test.insert");
    expect(listbox?.id).toBe("markweave-slash-command-listbox");
    expect(option.id).toBe("markweave-slash-command-option-0");
    expect(option.getAttribute("aria-disabled")).toBe("true");
    expect(option.textContent).toContain("Host");
    expect(option.textContent).toContain("Select a field first.");
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Safe host error");
  });

  it("selects the attachment command without opening the upload panel", async () => {
    const attachmentCommand = defaultSlashCommandSpecs.find((command) => command.id === "attachment");

    if (!attachmentCommand) {
      throw new Error("Expected attachment slash command.");
    }

    const onSelect = vi.fn();
    const onInputCommandChange = vi.fn();

    await renderReact(
      createElement(SlashCommandMenu, {
        commands: [attachmentCommand],
        state: {
          name: "filtering",
          query: "attachment",
          activeIndex: 0,
          triggerFrom: 0,
          triggerTo: 11,
        },
        position: {
          left: 20,
          top: 40,
          triggerLeft: 20,
          triggerTop: 10,
          maxHeight: 320,
          placement: "bottom",
        },
        onInputCommandChange,
        onSelect,
      }),
    );

    const button = getByTestId<HTMLButtonElement>("markweave-slash-command-attachment");

    expect(button.disabled).toBe(false);
    expect(button.dataset.disabled).toBe("false");
    expect(button.getAttribute("aria-disabled")).toBe("false");
    expect(button.textContent).toContain("附件");
    expect(attachmentCommand.inputKind).toBeUndefined();

    await click(button);

    expect(onSelect).toHaveBeenCalledWith(attachmentCommand);
    expect(onInputCommandChange).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="markweave-slash-upload-panel"]')).toBeNull();
  });

  it("renders English attachment copy when English messages are provided", async () => {
    const attachmentCommand = getLocalizedSlashCommandSpecs("en").find((command) => command.id === "attachment");

    if (!attachmentCommand) {
      throw new Error("Expected attachment slash command.");
    }

    await renderReact(
      createElement(SlashCommandMenu, {
        commands: [attachmentCommand],
        messages: getMarkweaveMessages("en"),
        state: {
          name: "filtering",
          query: "attachment",
          activeIndex: 0,
          triggerFrom: 0,
          triggerTo: 11,
        },
        position: {
          left: 20,
          top: 40,
          triggerLeft: 20,
          triggerTop: 10,
          maxHeight: 320,
          placement: "bottom",
        },
        onSelect: vi.fn(),
      }),
    );

    const button = getByTestId<HTMLButtonElement>("markweave-slash-command-attachment");

    expect(button.textContent).toContain("Attachment");
    expect(button.textContent).not.toContain("Temporarily unavailable.");
    expect(button.disabled).toBe(false);
    expect(button.dataset.disabled).toBe("false");
  });

  it("centers the keyboard-selected slash option inside the scrollable list", async () => {
    const commands = defaultSlashCommandSpecs.slice(0, 8);
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function mockRect(this: HTMLElement) {
      if (this.classList.contains("markweave-slash-command-list")) {
        return {
          bottom: 160,
          height: 160,
          left: 0,
          right: 280,
          top: 0,
          width: 280,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }

      if (this.getAttribute("data-active") === "true") {
        return {
          bottom: 220,
          height: 32,
          left: 0,
          right: 280,
          top: 188,
          width: 280,
          x: 0,
          y: 188,
          toJSON: () => ({}),
        } as DOMRect;
      }

      return {
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    const host = await renderReact(
      createElement(SlashCommandMenu, {
        commands,
        state: {
          name: "keyboard-selecting",
          query: "",
          activeIndex: commands.length - 1,
          triggerFrom: 0,
          triggerTo: 1,
        },
        position: {
          left: 20,
          top: 40,
          triggerLeft: 20,
          triggerTop: 10,
          maxHeight: 160,
          placement: "bottom",
        },
        onSelect: vi.fn(),
      }),
    );

    const list = host.querySelector<HTMLElement>(".markweave-slash-command-list");
    if (!list) {
      throw new Error("Expected slash command list.");
    }

    Object.defineProperty(list, "clientHeight", { configurable: true, value: 160 });
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 480 });

    await act(async () => {
      activeRoot?.render(
        createElement(SlashCommandMenu, {
          commands,
          state: {
            name: "keyboard-selecting",
            query: "",
            activeIndex: Math.max(0, commands.length - 2),
            triggerFrom: 0,
            triggerTo: 1,
          },
          position: {
            left: 20,
            top: 40,
            triggerLeft: 20,
            triggerTop: 10,
            maxHeight: 160,
            placement: "bottom",
          },
          onSelect: vi.fn(),
        }),
      );
    });
    await flushReact();

    expect(list.scrollTop).toBe(124);
    expect(getBoundingClientRect).toHaveBeenCalled();
  });
});
