// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  calculateCenteredSlashCommandListScrollTop,
  scrollSlashCommandItemIntoView,
} from "../src/plugins/slash-command/slash-menu-scroll";
import { isMarkweaveSlashMenuScrollTarget } from "../src/plugins/slash-command/slash-runtime";

describe("slash command menu scroll model", () => {
  it("centers the active option inside the visible list window", () => {
    expect(
      calculateCenteredSlashCommandListScrollTop({
        itemBottom: 220,
        itemTop: 188,
        listHeight: 200,
        listTop: 0,
        maxScrollTop: 400,
        scrollTop: 0,
      }),
    ).toBe(104);

    expect(
      calculateCenteredSlashCommandListScrollTop({
        itemBottom: 40,
        itemTop: 8,
        listHeight: 200,
        listTop: 0,
        maxScrollTop: 400,
        scrollTop: 120,
      }),
    ).toBe(44);
  });

  it("clamps centered scroll to the list bounds", () => {
    expect(
      calculateCenteredSlashCommandListScrollTop({
        itemBottom: 900,
        itemTop: 868,
        listHeight: 200,
        listTop: 0,
        maxScrollTop: 300,
        scrollTop: 0,
      }),
    ).toBe(300);

    expect(
      calculateCenteredSlashCommandListScrollTop({
        itemBottom: 24,
        itemTop: -8,
        listHeight: 200,
        listTop: 0,
        maxScrollTop: 300,
        scrollTop: 0,
      }),
    ).toBe(0);
  });

  it("updates the list scrollTop when the active option needs centering", () => {
    const listElement = {
      clientHeight: 200,
      getBoundingClientRect: () => ({ bottom: 200, height: 200, top: 0 }),
      scrollHeight: 600,
      scrollTop: 0,
    } as HTMLElement;
    const itemElement = {
      getBoundingClientRect: () => ({ bottom: 220, height: 32, top: 188 }),
    } as HTMLElement;

    scrollSlashCommandItemIntoView(listElement, itemElement);

    expect(listElement.scrollTop).toBe(104);
  });

  it("leaves scrollTop unchanged when the option is already centered", () => {
    const listElement = {
      clientHeight: 200,
      getBoundingClientRect: () => ({ bottom: 200, height: 200, top: 0 }),
      scrollHeight: 600,
      scrollTop: 104,
    } as HTMLElement;
    const itemElement = {
      getBoundingClientRect: () => ({ bottom: 116, height: 32, top: 84 }),
    } as HTMLElement;
    const setter = vi.fn();
    Object.defineProperty(listElement, "scrollTop", {
      configurable: true,
      get: () => 104,
      set: setter,
    });

    scrollSlashCommandItemIntoView(listElement, itemElement);

    expect(setter).not.toHaveBeenCalled();
  });

  it("recognizes slash menu DOM as an internal scroll target", () => {
    const menu = document.createElement("div");
    menu.className = "markweave-slash-menu";
    const list = document.createElement("div");
    list.className = "markweave-slash-command-list";
    menu.append(list);
    document.body.append(menu);

    expect(isMarkweaveSlashMenuScrollTarget(list)).toBe(true);
    expect(isMarkweaveSlashMenuScrollTarget(document.createElement("div"))).toBe(false);
    expect(isMarkweaveSlashMenuScrollTarget(null)).toBe(false);
  });
});
