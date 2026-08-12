// Preserve the Tiptap command and Markdown module augmentations across the
// published core package boundary. Adapter declaration builds consume the
// generated Markweave types instead of compiling these extensions from source.
import "@tiptap/extension-highlight";
import "@tiptap/extension-link";
import "@tiptap/extension-text-style";
import "@tiptap/extension-underline";
import "@tiptap/markdown";
import "@tiptap/starter-kit";

