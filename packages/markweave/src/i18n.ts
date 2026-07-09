import type { SlashCommandSpec } from "./plugins/slash-command/command-spec";
import type { TableMenuCopyKind } from "./plugins/table/table-clipboard";
import type { TableCommandId } from "./plugins/table/table-command-spec";

export type MarkweaveLang = "zh" | "en";

export interface MarkweaveEmojiMessage {
  readonly emoji: string;
  readonly label: string;
  readonly terms: readonly string[];
}

export interface MarkweaveMessages {
  readonly common: {
    readonly editorAriaLabel: string;
    readonly back: string;
    readonly cancel: string;
    readonly insert: string;
    readonly file: string;
  };
  readonly floatingToolbar: {
    readonly buttons: Record<string, string>;
    readonly blockTypes: Record<"paragraph" | "heading-1" | "heading-2" | "heading-3", string>;
    readonly turnIntoTitle: string;
    readonly turnInto: Record<string, string>;
    readonly textColorTitle: string;
    readonly highlightColorTitle: string;
    readonly textColors: Record<string, string>;
    readonly highlightColors: Record<string, string>;
    readonly moreActions: Record<string, string>;
    readonly linkUrlLabel: string;
    readonly linkPlaceholder: string;
    readonly applyLink: string;
    readonly openLink: string;
    readonly removeLink: string;
  };
  readonly slash: {
    readonly ariaLabel: string;
    readonly filterPlaceholder: string;
    readonly noResults: string;
    readonly emojiTitle: string;
    readonly emojiSearchPlaceholder: string;
    readonly uploadValueLabel: string;
    readonly uploadValuePlaceholder: string;
    readonly uploadRequiredError: string;
    readonly uploadFailedError: string;
    readonly uploadKindLabels: Record<"image" | "video" | "attachment" | "upload", string>;
    readonly groups: Record<"Style" | "Callout" | "Insert" | "Upload", string>;
    readonly emojiItems: readonly MarkweaveEmojiMessage[];
    readonly commands: Record<string, LocalizedSlashCommandText>;
  };
  readonly image: {
    readonly uploadFailedError: string;
    readonly uploadRequiredError: string;
    readonly clickToUpload: string;
    readonly dragAndDrop: string;
    readonly uploadNote: string;
    readonly uploadInputPlaceholder: string;
    readonly uploadInputAriaLabel: string;
    readonly toolsAriaLabel: string;
    readonly alignLeft: string;
    readonly alignCenter: string;
    readonly alignRight: string;
    readonly caption: string;
    readonly download: string;
    readonly replace: string;
    readonly delete: string;
    readonly captionPlaceholder: string;
    readonly captionAriaLabel: string;
    readonly resizeLeft: string;
    readonly resizeRight: string;
  };
  readonly video: {
    readonly uploadFailedError: string;
    readonly unsupportedUrlError: string;
    readonly nodeAriaLabel: string;
    readonly selectAriaLabel: string;
    readonly clickToUpload: string;
    readonly dragAndDrop: string;
    readonly uploadNote: string;
    readonly uploadInputPlaceholder: string;
    readonly uploadInputAriaLabel: string;
  };
  readonly table: {
    readonly controlsAriaLabel: string;
    readonly rowActions: string;
    readonly columnActions: string;
    readonly selectionActions: string;
    readonly activeRowActions: string;
    readonly activeColumnActions: string;
    readonly commands: Record<TableCommandId | "edit-with-ai", string>;
    readonly copyFeedback: Record<TableMenuCopyKind, string>;
  };
  readonly toc: {
    readonly ariaLabel: string;
    readonly itemAriaLabel: string;
  };
  readonly math: {
    readonly label: string;
    readonly inlineTitle: string;
    readonly blockTitle: string;
    readonly latexLabel: string;
    readonly latexPlaceholder: string;
    readonly previewLabel: string;
    readonly apply: string;
    readonly delete: string;
    readonly cancel: string;
    readonly invalidPreview: string;
  };
}

interface LocalizedSlashCommandText {
  readonly label: string;
  readonly description: string;
  readonly searchTerms: readonly string[];
  readonly disabledReason?: string;
}

const baseSlashCommandSpecs = [
  {
    id: "paragraph",
    category: "structure",
    executionKind: "editor",
    icon: "type",
  },
  {
    id: "heading-1",
    category: "structure",
    executionKind: "editor",
    icon: "heading-1",
  },
  {
    id: "heading-2",
    category: "structure",
    executionKind: "editor",
    icon: "heading-2",
  },
  {
    id: "heading-3",
    category: "structure",
    executionKind: "editor",
    icon: "heading-3",
  },
  {
    id: "bullet-list",
    category: "structure",
    executionKind: "editor",
    icon: "bullet-list",
  },
  {
    id: "ordered-list",
    category: "structure",
    executionKind: "editor",
    icon: "ordered-list",
  },
  {
    id: "task-list",
    category: "structure",
    executionKind: "editor",
    icon: "task-list",
  },
  {
    id: "blockquote",
    category: "structure",
    executionKind: "editor",
    icon: "blockquote",
  },
  {
    id: "code-block",
    category: "structure",
    executionKind: "editor",
    icon: "code-block",
  },
  {
    id: "callout-info",
    category: "callout",
    executionKind: "editor",
    icon: "info",
    calloutType: "info",
  },
  {
    id: "callout-tip",
    category: "callout",
    executionKind: "editor",
    icon: "tip",
    calloutType: "tip",
  },
  {
    id: "callout-warning",
    category: "callout",
    executionKind: "editor",
    icon: "warning",
    calloutType: "warning",
  },
  {
    id: "callout-error",
    category: "callout",
    executionKind: "editor",
    icon: "error",
    calloutType: "error",
  },
  {
    id: "callout-success",
    category: "callout",
    executionKind: "editor",
    icon: "success",
    calloutType: "success",
  },
  {
    id: "emoji",
    category: "insert",
    executionKind: "editor",
    icon: "emoji",
    inputKind: "emoji",
  },
  {
    id: "table",
    category: "table",
    executionKind: "editor",
    icon: "table",
  },
  {
    id: "separator",
    category: "insert",
    executionKind: "editor",
    icon: "separator",
  },
  {
    id: "block-math",
    category: "insert",
    executionKind: "editor",
    icon: "math",
  },
  {
    id: "image",
    category: "upload",
    executionKind: "editor",
    icon: "image",
    uploadKind: "image",
  },
  {
    id: "video",
    category: "upload",
    executionKind: "editor",
    icon: "video",
    uploadKind: "video",
  },
  {
    id: "attachment",
    category: "upload",
    executionKind: "editor",
    icon: "attachment",
    inputKind: "upload",
    uploadKind: "attachment",
    disabled: true,
  },
] as const;

const slashCommandGroupsById: Record<string, keyof MarkweaveMessages["slash"]["groups"]> = {
  paragraph: "Style",
  "heading-1": "Style",
  "heading-2": "Style",
  "heading-3": "Style",
  "bullet-list": "Style",
  "ordered-list": "Style",
  "task-list": "Style",
  blockquote: "Style",
  "code-block": "Style",
  "callout-info": "Callout",
  "callout-tip": "Callout",
  "callout-warning": "Callout",
  "callout-error": "Callout",
  "callout-success": "Callout",
  emoji: "Insert",
  table: "Insert",
  separator: "Insert",
  "block-math": "Insert",
  image: "Upload",
  video: "Upload",
  attachment: "Upload",
};

const englishEmojiItems = [
  { emoji: "😀", label: "Grinning", terms: ["smile", "happy", "face", "开心", "笑脸"] },
  { emoji: "😂", label: "Joy", terms: ["laugh", "tears", "大笑"] },
  { emoji: "😍", label: "Heart eyes", terms: ["love", "heart", "喜欢", "爱心"] },
  { emoji: "👍", label: "Thumbs up", terms: ["yes", "approve", "赞", "同意"] },
  { emoji: "🙏", label: "Thanks", terms: ["pray", "please", "感谢"] },
  { emoji: "🔥", label: "Fire", terms: ["hot", "ship", "火"] },
  { emoji: "✨", label: "Sparkles", terms: ["magic", "polish", "闪光"] },
  { emoji: "✅", label: "Done", terms: ["check", "success", "完成"] },
  { emoji: "⚠️", label: "Warning", terms: ["alert", "caution", "警告"] },
  { emoji: "💡", label: "Idea", terms: ["tip", "light", "想法"] },
  { emoji: "🚀", label: "Rocket", terms: ["launch", "ship", "发布"] },
  { emoji: "📌", label: "Pin", terms: ["note", "important", "固定"] },
  { emoji: "📎", label: "Attachment", terms: ["file", "paperclip", "附件"] },
  { emoji: "🧠", label: "Brain", terms: ["think", "idea", "思考"] },
  { emoji: "🎯", label: "Target", terms: ["goal", "focus", "目标"] },
] as const;

const chineseEmojiItems = [
  { emoji: "😀", label: "开心", terms: ["smile", "happy", "face", "grinning", "笑脸"] },
  { emoji: "😂", label: "大笑", terms: ["laugh", "tears", "joy"] },
  { emoji: "😍", label: "喜欢", terms: ["love", "heart", "heart eyes", "爱心"] },
  { emoji: "👍", label: "赞", terms: ["yes", "approve", "thumbs up", "同意"] },
  { emoji: "🙏", label: "感谢", terms: ["pray", "please", "thanks"] },
  { emoji: "🔥", label: "火", terms: ["hot", "ship", "fire"] },
  { emoji: "✨", label: "闪光", terms: ["magic", "polish", "sparkles"] },
  { emoji: "✅", label: "完成", terms: ["check", "success", "done"] },
  { emoji: "⚠️", label: "警告", terms: ["alert", "caution", "warning"] },
  { emoji: "💡", label: "想法", terms: ["tip", "light", "idea"] },
  { emoji: "🚀", label: "发布", terms: ["launch", "ship", "rocket"] },
  { emoji: "📌", label: "固定", terms: ["note", "important", "pin"] },
  { emoji: "📎", label: "附件", terms: ["file", "paperclip", "attachment"] },
  { emoji: "🧠", label: "思考", terms: ["think", "idea", "brain"] },
  { emoji: "🎯", label: "目标", terms: ["goal", "focus", "target"] },
] as const;

const slashCommandsZh: Record<string, LocalizedSlashCommandText> = {
  paragraph: {
    label: "正文",
    description: "将当前块转换为普通正文。",
    searchTerms: ["paragraph", "text", "normal", "plain", "正文", "段落"],
  },
  "heading-1": {
    label: "标题 1",
    description: "一级章节标题。",
    searchTerms: ["heading", "h1", "title", "标题", "一级标题"],
  },
  "heading-2": {
    label: "标题 2",
    description: "二级章节标题。",
    searchTerms: ["heading", "h2", "subtitle", "标题", "二级标题"],
  },
  "heading-3": {
    label: "标题 3",
    description: "三级章节标题。",
    searchTerms: ["heading", "h3", "subtitle", "标题", "三级标题"],
  },
  "bullet-list": {
    label: "项目符号列表",
    description: "开始一个无序列表。",
    searchTerms: ["bullet", "ul", "list", "dash", "列表", "无序列表", "项目符号"],
  },
  "ordered-list": {
    label: "编号列表",
    description: "开始一个编号列表。",
    searchTerms: ["ordered", "ol", "number", "list", "列表", "有序列表", "编号"],
  },
  "task-list": {
    label: "待办列表",
    description: "开始一个待办列表。",
    searchTerms: ["todo", "task", "checkbox", "check", "待办", "任务", "清单"],
  },
  blockquote: {
    label: "引用",
    description: "引用一段内容。",
    searchTerms: ["quote", "blockquote", "引用"],
  },
  "code-block": {
    label: "代码块",
    description: "插入围栏代码块。",
    searchTerms: ["code", "fence", "pre", "代码", "代码块"],
  },
  "callout-info": {
    label: "信息",
    description: "插入信息标注。",
    searchTerms: ["callout", "note", "info", "标注", "信息", "备注"],
  },
  "callout-tip": {
    label: "提示",
    description: "插入提示标注。",
    searchTerms: ["callout", "tip", "hint", "标注", "提示"],
  },
  "callout-warning": {
    label: "警告",
    description: "插入警告标注。",
    searchTerms: ["callout", "warning", "caution", "标注", "警告"],
  },
  "callout-error": {
    label: "错误",
    description: "插入错误标注。",
    searchTerms: ["callout", "error", "danger", "标注", "错误", "危险"],
  },
  "callout-success": {
    label: "成功",
    description: "插入成功标注。",
    searchTerms: ["callout", "success", "done", "标注", "成功", "完成"],
  },
  emoji: {
    label: "表情",
    description: "插入一个表情。",
    searchTerms: ["emoji", "smile", "emote", "表情"],
  },
  table: {
    label: "表格",
    description: "插入一个带表头的 3x3 表格。",
    searchTerms: ["table", "grid", "cell", "row", "column", "表格", "网格", "单元格"],
  },
  separator: {
    label: "分割线",
    description: "插入一条水平分割线。",
    searchTerms: ["separator", "divider", "horizontal", "rule", "line", "分割线", "横线"],
  },
  "block-math": {
    label: "块公式",
    description: "插入独立的数学公式块。",
    searchTerms: ["math", "formula", "latex", "equation", "block math", "数学", "公式", "块公式"],
  },
  image: {
    label: "图片",
    description: "插入图片。",
    searchTerms: ["image", "picture", "photo", "upload", "图片", "图像", "照片", "上传"],
  },
  video: {
    label: "视频",
    description: "插入视频。",
    searchTerms: ["video", "movie", "upload", "youtube", "bilibili", "视频", "上传"],
  },
  attachment: {
    label: "附件",
    description: "插入文件附件。",
    disabledReason: "暂不可用。",
    searchTerms: ["attachment", "file", "upload", "附件", "文件", "上传"],
  },
};

const slashCommandsEn: Record<string, LocalizedSlashCommandText> = {
  paragraph: {
    label: "Text",
    description: "Convert the current block to plain text.",
    searchTerms: ["paragraph", "text", "normal", "plain", "正文", "段落"],
  },
  "heading-1": {
    label: "Heading 1",
    description: "Large section heading.",
    searchTerms: ["h1", "title", "标题", "一级标题"],
  },
  "heading-2": {
    label: "Heading 2",
    description: "Medium section heading.",
    searchTerms: ["h2", "subtitle", "标题", "二级标题"],
  },
  "heading-3": {
    label: "Heading 3",
    description: "Small section heading.",
    searchTerms: ["h3", "subtitle", "标题", "三级标题"],
  },
  "bullet-list": {
    label: "Bullet list",
    description: "Start an unordered list.",
    searchTerms: ["ul", "list", "dash", "列表", "无序列表", "项目符号"],
  },
  "ordered-list": {
    label: "Numbered list",
    description: "Start a numbered list.",
    searchTerms: ["ol", "number", "list", "列表", "有序列表", "编号"],
  },
  "task-list": {
    label: "To-do list",
    description: "Start a task list.",
    searchTerms: ["todo", "task", "checkbox", "check", "待办", "任务", "清单"],
  },
  blockquote: {
    label: "Blockquote",
    description: "Quote a paragraph.",
    searchTerms: ["quote", "blockquote", "引用"],
  },
  "code-block": {
    label: "Code Block",
    description: "Insert a fenced code block.",
    searchTerms: ["code", "fence", "pre", "代码", "代码块"],
  },
  "callout-info": {
    label: "Info",
    description: "Insert an info callout.",
    searchTerms: ["callout", "note", "info", "标注", "信息", "备注"],
  },
  "callout-tip": {
    label: "Tip",
    description: "Insert a tip callout.",
    searchTerms: ["callout", "tip", "hint", "标注", "提示"],
  },
  "callout-warning": {
    label: "Warning",
    description: "Insert a warning callout.",
    searchTerms: ["callout", "warning", "caution", "标注", "警告"],
  },
  "callout-error": {
    label: "Error",
    description: "Insert an error callout.",
    searchTerms: ["callout", "error", "danger", "标注", "错误", "危险"],
  },
  "callout-success": {
    label: "Success",
    description: "Insert a success callout.",
    searchTerms: ["callout", "success", "done", "标注", "成功", "完成"],
  },
  emoji: {
    label: "Emoji",
    description: "Insert an emoji.",
    searchTerms: ["emoji", "smile", "emote", "表情"],
  },
  table: {
    label: "Table",
    description: "Insert a 3 by 3 table with a header row.",
    searchTerms: ["grid", "cell", "row", "column", "表格", "网格", "单元格"],
  },
  separator: {
    label: "Separator",
    description: "Insert a horizontal divider.",
    searchTerms: ["divider", "horizontal", "rule", "separator", "line", "分割线", "横线"],
  },
  "block-math": {
    label: "Math block",
    description: "Insert a standalone LaTeX formula block.",
    searchTerms: ["math", "formula", "latex", "equation", "block math", "数学", "公式", "块公式"],
  },
  image: {
    label: "Image",
    description: "Insert an image.",
    searchTerms: ["image", "picture", "photo", "upload", "图片", "图像", "照片", "上传"],
  },
  video: {
    label: "Video",
    description: "Insert a video.",
    searchTerms: ["video", "movie", "upload", "youtube", "bilibili", "视频", "上传"],
  },
  attachment: {
    label: "Attachment",
    description: "Insert a file attachment.",
    disabledReason: "Temporarily unavailable.",
    searchTerms: ["attachment", "file", "upload", "附件", "文件", "上传"],
  },
};

const messagesByLang: Record<MarkweaveLang, MarkweaveMessages> = {
  zh: {
    common: {
      editorAriaLabel: "Markweave 编辑器",
      back: "返回",
      cancel: "取消",
      insert: "插入",
      file: "文件",
    },
    floatingToolbar: {
      buttons: {
        improve: "润色",
        "block-type": "块类型",
        bold: "加粗",
        italic: "斜体",
        underline: "下划线",
        strike: "删除线",
        "inline-code": "行内代码",
        link: "链接",
        color: "颜色",
        more: "更多",
      },
      blockTypes: {
        paragraph: "正文",
        "heading-1": "标题 1",
        "heading-2": "标题 2",
        "heading-3": "标题 3",
      },
      turnIntoTitle: "转换为",
      turnInto: {
        paragraph: "正文",
        "heading-1": "标题 1",
        "heading-2": "标题 2",
        "heading-3": "标题 3",
        "bullet-list": "项目符号列表",
        "numbered-list": "编号列表",
        "todo-list": "待办列表",
        quote: "引用",
        "code-block": "代码块",
      },
      textColorTitle: "文字颜色",
      highlightColorTitle: "高亮颜色",
      textColors: {
        default: "默认文字",
        gray: "灰色文字",
        brown: "棕色文字",
        orange: "橙色文字",
        yellow: "黄色文字",
        green: "绿色文字",
        blue: "蓝色文字",
        purple: "紫色文字",
        pink: "粉色文字",
        red: "红色文字",
      },
      highlightColors: {
        default: "默认高亮",
        gray: "灰色高亮",
        brown: "棕色高亮",
        orange: "橙色高亮",
        yellow: "黄色高亮",
        green: "绿色高亮",
        blue: "蓝色高亮",
        purple: "紫色高亮",
        pink: "粉色高亮",
        red: "红色高亮",
      },
      moreActions: {
        superscript: "上标",
        subscript: "下标",
        "inline-math": "行内公式",
        "align-left": "左对齐",
        "align-center": "居中对齐",
        "align-right": "右对齐",
        "align-justify": "两端对齐",
        "decrease-indent": "减少缩进",
        "increase-indent": "增加缩进",
      },
      linkUrlLabel: "链接地址",
      linkPlaceholder: "粘贴链接...",
      applyLink: "应用链接",
      openLink: "打开链接",
      removeLink: "移除链接",
    },
    slash: {
      ariaLabel: "Slash 命令",
      filterPlaceholder: "筛选...",
      noResults: "无结果",
      emojiTitle: "表情",
      emojiSearchPlaceholder: "搜索表情...",
      uploadValueLabel: "URL / 路径 / Base64",
      uploadValuePlaceholder: "https://..., /path/file, data:...",
      uploadRequiredError: "请输入 URL、路径或 Base64。",
      uploadFailedError: "上传失败。",
      uploadKindLabels: {
        image: "图片",
        video: "视频",
        attachment: "附件",
        upload: "上传",
      },
      groups: {
        Style: "样式",
        Callout: "标注",
        Insert: "插入",
        Upload: "上传",
      },
      emojiItems: chineseEmojiItems,
      commands: slashCommandsZh,
    },
    image: {
      uploadFailedError: "图片上传失败。",
      uploadRequiredError: "请输入 URL、路径或 Base64。",
      clickToUpload: "点击上传",
      dragAndDrop: " 或拖拽到此处",
      uploadNote: "URL、路径、Base64 或一个本地图片文件",
      uploadInputPlaceholder: "https://..., /path/file, data:...",
      uploadInputAriaLabel: "图片 URL、路径或 Base64",
      toolsAriaLabel: "图片工具",
      alignLeft: "图片左对齐",
      alignCenter: "图片居中对齐",
      alignRight: "图片右对齐",
      caption: "题注",
      download: "下载图片",
      replace: "替换图片",
      delete: "删除图片",
      captionPlaceholder: "写入题注...",
      captionAriaLabel: "图片题注",
      resizeLeft: "调整图片左侧尺寸",
      resizeRight: "调整图片右侧尺寸",
    },
    video: {
      uploadFailedError: "视频上传失败。",
      unsupportedUrlError: "请输入 YouTube、Bilibili 或直接视频链接。",
      nodeAriaLabel: "视频",
      selectAriaLabel: "选择视频",
      clickToUpload: "点击上传",
      dragAndDrop: " 或拖拽到此处",
      uploadNote: "YouTube/Bilibili 链接或嵌入地址、直接视频链接，或一个本地视频文件",
      uploadInputPlaceholder: "https://www.youtube.com/embed/..., //player.bilibili.com/..., https://.../video.mp4",
      uploadInputAriaLabel: "视频链接",
    },
    table: {
      controlsAriaLabel: "表格控件",
      rowActions: "行操作",
      columnActions: "列操作",
      selectionActions: "选区操作",
      activeRowActions: "当前行操作",
      activeColumnActions: "当前列操作",
      commands: {
        "edit-with-ai": "使用 AI 编辑",
        "add-row-before": "插入上方行",
        "add-row-after": "插入下方行",
        "move-row-up": "上移行",
        "move-row-down": "下移行",
        "add-column-before": "插入左侧列",
        "add-column-after": "插入右侧列",
        "move-column-left": "左移列",
        "move-column-right": "右移列",
        "copy-row": "复制行",
        "copy-column": "复制列",
        "copy-table": "复制表格",
        "delete-row": "删除行",
        "delete-column": "删除列",
        "merge-cells": "合并单元格",
        "split-cell": "拆分单元格",
        "delete-table": "删除表格",
      },
      copyFeedback: {
        row: "行已复制到剪贴板",
        column: "列已复制到剪贴板",
        table: "表格已复制到剪贴板",
      },
    },
    toc: {
      ariaLabel: "文档目录",
      itemAriaLabel: "跳转到标题",
    },
    math: {
      label: "公式",
      inlineTitle: "编辑行内公式",
      blockTitle: "编辑块公式",
      latexLabel: "LaTeX",
      latexPlaceholder: "\\\\frac{1}{2} 或 a^2 + b^2 = c^2",
      previewLabel: "预览",
      apply: "应用公式",
      delete: "删除公式",
      cancel: "取消",
      invalidPreview: "公式暂时无法渲染，请检查 LaTeX。",
    },
  },
  en: {
    common: {
      editorAriaLabel: "Markweave editor",
      back: "Back",
      cancel: "Cancel",
      insert: "Insert",
      file: "File",
    },
    floatingToolbar: {
      buttons: {
        improve: "Improve",
        "block-type": "Block type",
        bold: "Bold",
        italic: "Italic",
        underline: "Underline",
        strike: "Strikethrough",
        "inline-code": "Inline code",
        link: "Link",
        color: "Color",
        more: "More",
      },
      blockTypes: {
        paragraph: "Text",
        "heading-1": "Heading 1",
        "heading-2": "Heading 2",
        "heading-3": "Heading 3",
      },
      turnIntoTitle: "Turn Into",
      turnInto: {
        paragraph: "Text",
        "heading-1": "Heading 1",
        "heading-2": "Heading 2",
        "heading-3": "Heading 3",
        "bullet-list": "Bulleted list",
        "numbered-list": "Numbered list",
        "todo-list": "To-do list",
        quote: "Blockquote",
        "code-block": "Code block",
      },
      textColorTitle: "Text Color",
      highlightColorTitle: "Highlight Color",
      textColors: {
        default: "Default text",
        gray: "Gray text",
        brown: "Brown text",
        orange: "Orange text",
        yellow: "Yellow text",
        green: "Green text",
        blue: "Blue text",
        purple: "Purple text",
        pink: "Pink text",
        red: "Red text",
      },
      highlightColors: {
        default: "Default highlight",
        gray: "Gray highlight",
        brown: "Brown highlight",
        orange: "Orange highlight",
        yellow: "Yellow highlight",
        green: "Green highlight",
        blue: "Blue highlight",
        purple: "Purple highlight",
        pink: "Pink highlight",
        red: "Red highlight",
      },
      moreActions: {
        superscript: "Superscript",
        subscript: "Subscript",
        "inline-math": "Inline math",
        "align-left": "Align left",
        "align-center": "Align center",
        "align-right": "Align right",
        "align-justify": "Justify",
        "decrease-indent": "Decrease indent",
        "increase-indent": "Increase indent",
      },
      linkUrlLabel: "Link URL",
      linkPlaceholder: "Paste a link...",
      applyLink: "Apply link",
      openLink: "Open link",
      removeLink: "Remove link",
    },
    slash: {
      ariaLabel: "Slash commands",
      filterPlaceholder: "Filter...",
      noResults: "No results",
      emojiTitle: "Emoji",
      emojiSearchPlaceholder: "Search emoji...",
      uploadValueLabel: "URL / path / Base64",
      uploadValuePlaceholder: "https://..., /path/file, data:...",
      uploadRequiredError: "Enter a URL, path, or Base64 value.",
      uploadFailedError: "Upload failed.",
      uploadKindLabels: {
        image: "Image",
        video: "Video",
        attachment: "Attachment",
        upload: "Upload",
      },
      groups: {
        Style: "Style",
        Callout: "Callout",
        Insert: "Insert",
        Upload: "Upload",
      },
      emojiItems: englishEmojiItems,
      commands: slashCommandsEn,
    },
    image: {
      uploadFailedError: "Image upload failed.",
      uploadRequiredError: "Enter a URL, path, or Base64 value.",
      clickToUpload: "Click to upload",
      dragAndDrop: " or drag and drop",
      uploadNote: "URL, path, Base64, or one local image file",
      uploadInputPlaceholder: "https://..., /path/file, data:...",
      uploadInputAriaLabel: "Image URL, path, or Base64",
      toolsAriaLabel: "Image tools",
      alignLeft: "Image align left",
      alignCenter: "Image align center",
      alignRight: "Image align right",
      caption: "Caption",
      download: "Download image",
      replace: "Replace image",
      delete: "Delete image",
      captionPlaceholder: "Write a caption...",
      captionAriaLabel: "Image caption",
      resizeLeft: "Resize image left",
      resizeRight: "Resize image right",
    },
    video: {
      uploadFailedError: "Video upload failed.",
      unsupportedUrlError: "Enter a YouTube, Bilibili, or direct video URL.",
      nodeAriaLabel: "Video",
      selectAriaLabel: "Select video",
      clickToUpload: "Click to upload",
      dragAndDrop: " or drag and drop",
      uploadNote: "YouTube/Bilibili link or embed URL, direct video URL, or one local video file",
      uploadInputPlaceholder: "https://www.youtube.com/embed/..., //player.bilibili.com/..., https://.../video.mp4",
      uploadInputAriaLabel: "Video URL",
    },
    table: {
      controlsAriaLabel: "Table controls",
      rowActions: "Row actions",
      columnActions: "Column actions",
      selectionActions: "Selection actions",
      activeRowActions: "Active row actions",
      activeColumnActions: "Active column actions",
      commands: {
        "edit-with-ai": "Edit with AI",
        "add-row-before": "Insert Row Above",
        "add-row-after": "Insert Row Below",
        "move-row-up": "Move Row Up",
        "move-row-down": "Move Row Down",
        "add-column-before": "Insert Column Left",
        "add-column-after": "Insert Column Right",
        "move-column-left": "Move Column Left",
        "move-column-right": "Move Column Right",
        "copy-row": "Copy Row",
        "copy-column": "Copy Column",
        "copy-table": "Copy Table",
        "delete-row": "Delete Row",
        "delete-column": "Delete Column",
        "merge-cells": "Merge",
        "split-cell": "Split",
        "delete-table": "Delete Table",
      },
      copyFeedback: {
        row: "Row copied to clipboard",
        column: "Column copied to clipboard",
        table: "Table copied to clipboard",
      },
    },
    toc: {
      ariaLabel: "Document outline",
      itemAriaLabel: "Jump to heading",
    },
    math: {
      label: "Formula",
      inlineTitle: "Edit inline formula",
      blockTitle: "Edit math block",
      latexLabel: "LaTeX",
      latexPlaceholder: "\\\\frac{1}{2} or a^2 + b^2 = c^2",
      previewLabel: "Preview",
      apply: "Apply formula",
      delete: "Delete formula",
      cancel: "Cancel",
      invalidPreview: "Formula cannot be rendered yet. Check the LaTeX.",
    },
  },
} as const;

export function normalizeMarkweaveLang(lang: unknown): MarkweaveLang {
  return lang === "en" ? "en" : "zh";
}

export function getMarkweaveMessages(lang: unknown = "zh"): MarkweaveMessages {
  return messagesByLang[normalizeMarkweaveLang(lang)];
}

export function getLocalizedSlashCommandSpecs(lang: unknown = "zh"): readonly SlashCommandSpec[] {
  const messages = getMarkweaveMessages(lang);

  return baseSlashCommandSpecs.map((command) => {
    const commandText = messages.slash.commands[command.id];
    const group = messages.slash.groups[slashCommandGroupsById[command.id]];

    return {
      ...command,
      label: commandText.label,
      description: commandText.description,
      group,
      searchTerms: commandText.searchTerms,
      disabledReason: commandText.disabledReason,
    } satisfies SlashCommandSpec;
  });
}
