import { defineComponent, h } from "./vue2-compat";

export type LucideIcon = unknown;

function pathForIcon(name: string) {
  if (name.includes("ChevronDown")) {
    return [h("path", { d: "m6 9 6 6 6-6" })];
  }
  if (name.includes("ChevronUp")) {
    return [h("path", { d: "m6 15 6-6 6 6" })];
  }
  if (name.includes("Bold")) {
    return [h("path", { d: "M7 5h6a3 3 0 0 1 0 6H7z" }), h("path", { d: "M7 11h7a3 3 0 0 1 0 6H7z" })];
  }
  if (name.includes("Italic")) {
    return [h("path", { d: "M10 5h6" }), h("path", { d: "M8 19h6" }), h("path", { d: "m14 5-4 14" })];
  }
  if (name.includes("Underline")) {
    return [h("path", { d: "M7 5v6a5 5 0 0 0 10 0V5" }), h("path", { d: "M5 21h14" })];
  }
  if (name.includes("Strikethrough")) {
    return [h("path", { d: "M5 12h14" }), h("path", { d: "M16 6.5A5 5 0 0 0 12 5c-3 0-5 1.5-5 3.5 0 4 10 2 10 6 0 2-2 3.5-5 3.5a6 6 0 0 1-5-2" })];
  }
  if (name.includes("Link")) {
    return [h("path", { d: "M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" }), h("path", { d: "M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" })];
  }
  if (name.includes("ListOrdered")) {
    return [h("path", { d: "M10 6h10" }), h("path", { d: "M10 12h10" }), h("path", { d: "M10 18h10" }), h("path", { d: "M4 6h1v4" }), h("path", { d: "M4 14h2l-2 3h2" })];
  }
  if (name.includes("ListChecks")) {
    return [h("path", { d: "m3 6 1.5 1.5L7 5" }), h("path", { d: "m3 12 1.5 1.5L7 11" }), h("path", { d: "M10 6h10" }), h("path", { d: "M10 12h10" }), h("path", { d: "M10 18h10" })];
  }
  if (name.includes("List")) {
    return [h("path", { d: "M8 6h12" }), h("path", { d: "M8 12h12" }), h("path", { d: "M8 18h12" }), h("path", { d: "M4 6h.01" }), h("path", { d: "M4 12h.01" }), h("path", { d: "M4 18h.01" })];
  }
  if (name.includes("AlignLeft")) {
    return [h("path", { d: "M4 6h16" }), h("path", { d: "M4 12h10" }), h("path", { d: "M4 18h14" })];
  }
  if (name.includes("AlignCenter")) {
    return [h("path", { d: "M4 6h16" }), h("path", { d: "M7 12h10" }), h("path", { d: "M5 18h14" })];
  }
  if (name.includes("AlignRight")) {
    return [h("path", { d: "M4 6h16" }), h("path", { d: "M10 12h10" }), h("path", { d: "M6 18h14" })];
  }
  if (name.includes("AlignJustify")) {
    return [h("path", { d: "M4 6h16" }), h("path", { d: "M4 12h16" }), h("path", { d: "M4 18h16" })];
  }
  if (name.includes("Image")) {
    return [h("rect", { x: "4", y: "5", width: "16", height: "14", rx: "2" }), h("path", { d: "m4 15 4-4 4 4 2-2 6 6" }), h("circle", { cx: "9", cy: "9", r: "1" })];
  }
  if (name.includes("Video")) {
    return [h("rect", { x: "4", y: "6", width: "12", height: "12", rx: "2" }), h("path", { d: "m16 10 4-2v8l-4-2" })];
  }
  if (name.includes("Table")) {
    return [h("rect", { x: "4", y: "5", width: "16", height: "14", rx: "2" }), h("path", { d: "M4 10h16" }), h("path", { d: "M10 5v14" })];
  }
  if (name.includes("Trash") || name.includes("CircleX")) {
    return [h("path", { d: "M4 7h16" }), h("path", { d: "M9 7V5h6v2" }), h("path", { d: "M7 7l1 13h8l1-13" })];
  }
  if (name.includes("Download")) {
    return [h("path", { d: "M12 4v10" }), h("path", { d: "m8 10 4 4 4-4" }), h("path", { d: "M5 20h14" })];
  }
  if (name.includes("Upload")) {
    return [h("path", { d: "M12 20V10" }), h("path", { d: "m8 14 4-4 4 4" }), h("path", { d: "M5 4h14" })];
  }
  if (name.includes("Quote")) {
    return [h("path", { d: "M7 17a4 4 0 0 0 4-4V7H5v6h4" }), h("path", { d: "M17 17a4 4 0 0 0 4-4V7h-6v6h4" })];
  }
  if (name.includes("Heading1")) {
    return [h("path", { d: "M4 6v12" }), h("path", { d: "M12 6v12" }), h("path", { d: "M4 12h8" }), h("path", { d: "M17 10l2-1v9" })];
  }
  if (name.includes("Heading2")) {
    return [h("path", { d: "M4 6v12" }), h("path", { d: "M12 6v12" }), h("path", { d: "M4 12h8" }), h("path", { d: "M17 10h3l-3 4h3" })];
  }
  if (name.includes("Heading3")) {
    return [h("path", { d: "M4 6v12" }), h("path", { d: "M12 6v12" }), h("path", { d: "M4 12h8" }), h("path", { d: "M17 10h3l-2 3h2l-3 4" })];
  }
  if (name.includes("ExternalLink")) {
    return [h("path", { d: "M14 4h6v6" }), h("path", { d: "m10 14 10-10" }), h("path", { d: "M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" })];
  }
  if (name.includes("Minus")) {
    return [h("path", { d: "M5 12h14" })];
  }
  if (name.includes("Check")) {
    return [h("path", { d: "m5 12 4 4L19 6" })];
  }
  if (name.includes("Alert")) {
    return [h("path", { d: "M12 4 3 20h18L12 4Z" }), h("path", { d: "M12 9v4" }), h("path", { d: "M12 17h.01" })];
  }
  if (name.includes("Info") || name.includes("Lightbulb")) {
    return [h("circle", { cx: "12", cy: "12", r: "9" }), h("path", { d: "M12 10v6" }), h("path", { d: "M12 7h.01" })];
  }
  return [h("circle", { cx: "12", cy: "12", r: "8" }), h("path", { d: "M8 12h8" })];
}

function createIconComponent(name: string) {
  return defineComponent({
    name: `MarkweaveVue2Icon${name}`,
    props: {
      size: { type: [Number, String], default: 18 },
      strokeWidth: { type: [Number, String], default: 1.8 },
      absoluteStrokeWidth: { type: Boolean, default: false },
    },
    setup(props) {
      return () =>
        h(
          "svg",
          {
            viewBox: "0 0 24 24",
            width: props.size,
            height: props.size,
            fill: "none",
            stroke: "currentColor",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            "stroke-width": props.strokeWidth,
            "aria-hidden": "true",
            focusable: "false",
          },
          pathForIcon(name),
        );
    },
  });
}

export const AlignCenter = createIconComponent("AlignCenter");
export const AlignJustify = createIconComponent("AlignJustify");
export const AlignLeft = createIconComponent("AlignLeft");
export const AlignRight = createIconComponent("AlignRight");
export const AlertTriangle = createIconComponent("AlertTriangle");
export const Bold = createIconComponent("Bold");
export const Braces = createIconComponent("Braces");
export const Captions = createIconComponent("Captions");
export const CheckCircle2 = createIconComponent("CheckCircle2");
export const ChevronDown = createIconComponent("ChevronDown");
export const ChevronUp = createIconComponent("ChevronUp");
export const CircleX = createIconComponent("CircleX");
export const Code2 = createIconComponent("Code2");
export const CornerDownLeft = createIconComponent("CornerDownLeft");
export const Download = createIconComponent("Download");
export const Eye = createIconComponent("Eye");
export const ExternalLink = createIconComponent("ExternalLink");
export const Heading1 = createIconComponent("Heading1");
export const Heading2 = createIconComponent("Heading2");
export const Heading3 = createIconComponent("Heading3");
export const Image = createIconComponent("Image");
export const ImageUp = createIconComponent("ImageUp");
export const IndentDecrease = createIconComponent("IndentDecrease");
export const IndentIncrease = createIconComponent("IndentIncrease");
export const Info = createIconComponent("Info");
export const Italic = createIconComponent("Italic");
export const Lightbulb = createIconComponent("Lightbulb");
export const Link2 = createIconComponent("Link2");
export const List = createIconComponent("List");
export const ListChecks = createIconComponent("ListChecks");
export const ListOrdered = createIconComponent("ListOrdered");
export const Minus = createIconComponent("Minus");
export const MoreVertical = createIconComponent("MoreVertical");
export const Paperclip = createIconComponent("Paperclip");
export const PencilLine = createIconComponent("PencilLine");
export const Quote = createIconComponent("Quote");
export const Replace = createIconComponent("Replace");
export const Sigma = createIconComponent("Sigma");
export const SmilePlus = createIconComponent("SmilePlus");
export const Strikethrough = createIconComponent("Strikethrough");
export const Subscript = createIconComponent("Subscript");
export const Superscript = createIconComponent("Superscript");
export const Table2 = createIconComponent("Table2");
export const Text = createIconComponent("Text");
export const Trash2 = createIconComponent("Trash2");
export const Type = createIconComponent("Type");
export const Underline = createIconComponent("Underline");
export const Upload = createIconComponent("Upload");
export const Video = createIconComponent("Video");
