import { Markdown } from "@tiptap/markdown";
import { normalizeMarkweaveMarkdownDocument } from "./normalize-markdown-document";

export const MarkweaveMarkdown = Markdown.extend({
  onBeforeCreate(event) {
    this.parent?.(event);
    const manager = this.editor.markdown;
    if (!manager) return;

    const parse = manager.parse.bind(manager);
    manager.parse = (markdown) => normalizeMarkweaveMarkdownDocument(this.editor.schema, parse(markdown));

    // Tiptap's parent hook has already parsed the initial Markdown. Subsequent
    // set/insert commands use the same per-editor parser above.
    const content = this.editor.options.content;
    if (this.editor.options.contentType === "markdown" &&
        content && typeof content === "object" && !Array.isArray(content)) {
      this.editor.options.content = normalizeMarkweaveMarkdownDocument(this.editor.schema, content);
    }
  },
});
