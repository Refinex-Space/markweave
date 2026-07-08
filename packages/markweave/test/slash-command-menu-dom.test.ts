// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMarkweaveMessages } from "../src/i18n";
import { defaultSlashCommandSpecs, getLocalizedSlashCommandSpecs } from "../src/plugins/slash-command/command-spec";
import { SlashCommandMenu } from "../src/react/ui/slash-command/SlashCommandMenu";

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
  it("renders the disabled attachment command as visible but non-interactive", async () => {
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
    expect(button.dataset.disabled).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.textContent).toContain("附件");
    expect(button.textContent).toContain("暂不可用。");

    await click(button);

    expect(onInputCommandChange).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="markweave-slash-upload-panel"]')).toBeNull();
  });

  it("renders disabled attachment copy in English when English messages are provided", async () => {
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
    expect(button.textContent).toContain("Temporarily unavailable.");
  });
});
