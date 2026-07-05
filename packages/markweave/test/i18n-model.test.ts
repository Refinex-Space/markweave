import { describe, expect, it } from "vitest";
import { getLocalizedSlashCommandSpecs, getMarkweaveMessages, normalizeMarkweaveLang } from "../src/i18n";
import { filterSlashCommands } from "../src/plugins/slash-command/command-spec";

describe("markweave i18n model", () => {
  it("normalizes supported languages and falls back to Chinese", () => {
    expect(normalizeMarkweaveLang(undefined)).toBe("zh");
    expect(normalizeMarkweaveLang("zh")).toBe("zh");
    expect(normalizeMarkweaveLang("en")).toBe("en");
    expect(normalizeMarkweaveLang("fr")).toBe("zh");
  });

  it("builds localized slash commands for Chinese and English", () => {
    expect(getMarkweaveMessages("zh").floatingToolbar.linkPlaceholder).toBe("粘贴链接...");
    expect(getMarkweaveMessages("en").floatingToolbar.linkPlaceholder).toBe("Paste a link...");
    expect(getMarkweaveMessages("zh").table.commands["add-row-before"]).toBe("插入上方行");
    expect(getMarkweaveMessages("en").table.commands["add-row-before"]).toBe("Insert Row Above");

    expect(getLocalizedSlashCommandSpecs("zh").find((command) => command.id === "image")).toMatchObject({
      label: "图片",
      group: "上传",
    });
    expect(getLocalizedSlashCommandSpecs("en").find((command) => command.id === "image")).toMatchObject({
      label: "Image",
      group: "Upload",
    });
  });

  it("keeps slash command search bilingual in both languages", () => {
    const zhCommands = getLocalizedSlashCommandSpecs("zh");
    const enCommands = getLocalizedSlashCommandSpecs("en");

    expect(filterSlashCommands("图片", zhCommands).map((command) => command.id)).toContain("image");
    expect(filterSlashCommands("image", zhCommands).map((command) => command.id)).toContain("image");
    expect(filterSlashCommands("图片", enCommands).map((command) => command.id)).toContain("image");
    expect(filterSlashCommands("image", enCommands).map((command) => command.id)).toContain("image");
  });
});
