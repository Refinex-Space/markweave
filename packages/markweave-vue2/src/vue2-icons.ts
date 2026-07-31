import { defineComponent, h } from "./vue2-compat";

type LucideIconAttrs = Readonly<Record<string, string>>;
type LucideIconNode = readonly (readonly [tag: string, attrs: LucideIconAttrs])[];

const lucideIcons = {
  "AlignVerticalJustifyCenter": {
    iconName: "align-vertical-justify-center",
    node: [
      ["rect", { width: "14", height: "6", x: "5", y: "16", rx: "2", key: "1i8z2d" }],
      ["rect", { width: "10", height: "6", x: "7", y: "2", rx: "2", key: "ypihtt" }],
      ["path", { d: "M2 12h20", key: "9i4pu4" }],
    ],
  },
  "AlignVerticalJustifyEnd": {
    iconName: "align-vertical-justify-end",
    node: [
      ["rect", { width: "14", height: "6", x: "5", y: "12", rx: "2", key: "4l4tp2" }],
      ["rect", { width: "10", height: "6", x: "7", y: "2", rx: "2", key: "ypihtt" }],
      ["path", { d: "M2 22h20", key: "272qi7" }],
    ],
  },
  "AlignVerticalJustifyStart": {
    iconName: "align-vertical-justify-start",
    node: [
      ["rect", { width: "14", height: "6", x: "5", y: "16", rx: "2", key: "1i8z2d" }],
      ["rect", { width: "10", height: "6", x: "7", y: "6", rx: "2", key: "13squh" }],
      ["path", { d: "M2 2h20", key: "1ennik" }],
    ],
  },
  "ArrowDown": {
    iconName: "arrow-down",
    node: [["path", { d: "M12 5v14", key: "s699le" }], ["path", { d: "m19 12-7 7-7-7", key: "1idqje" }]],
  },
  "ArrowDownAZ": {
    iconName: "arrow-down-a-z",
    node: [["path", { d: "m3 16 4 4 4-4", key: "1co6wj" }], ["path", { d: "M7 20V4", key: "1yoxec" }], ["path", { d: "M20 8h-5", key: "1vsyxs" }], ["path", { d: "M15 10V6.5a2.5 2.5 0 0 1 5 0V10", key: "ag13bf" }], ["path", { d: "M15 14h5l-5 6h5", key: "ur5jdg" }]],
  },
  "ArrowLeft": {
    iconName: "arrow-left",
    node: [["path", { d: "m12 19-7-7 7-7", key: "1l729n" }], ["path", { d: "M19 12H5", key: "x3x0zl" }]],
  },
  "ArrowRight": {
    iconName: "arrow-right",
    node: [["path", { d: "M5 12h14", key: "1ays0h" }], ["path", { d: "m12 5 7 7-7 7", key: "xquz4c" }]],
  },
  "ArrowUp": {
    iconName: "arrow-up",
    node: [["path", { d: "m5 12 7-7 7 7", key: "hav0vg" }], ["path", { d: "M12 19V5", key: "x0mq9r" }]],
  },
  "ArrowUpZA": {
    iconName: "arrow-up-z-a",
    node: [["path", { d: "m3 8 4-4 4 4", key: "11wl7u" }], ["path", { d: "M7 4v16", key: "1glfcx" }], ["path", { d: "M15 4h5l-5 6h5", key: "8asdl1" }], ["path", { d: "M15 20v-3.5a2.5 2.5 0 0 1 5 0V20", key: "r6l5cz" }], ["path", { d: "M20 18h-5", key: "18j1r2" }]],
  },
  "BetweenHorizontalEnd": {
    iconName: "between-horizontal-end",
    node: [["rect", { width: "13", height: "7", x: "3", y: "3", rx: "1", key: "11xb64" }], ["path", { d: "m22 15-3-3 3-3", key: "26chmm" }], ["rect", { width: "13", height: "7", x: "3", y: "14", rx: "1", key: "k6ky7n" }]],
  },
  "BetweenHorizontalStart": {
    iconName: "between-horizontal-start",
    node: [["rect", { width: "13", height: "7", x: "8", y: "3", rx: "1", key: "pkso9a" }], ["path", { d: "m2 9 3 3-3 3", key: "1agib5" }], ["rect", { width: "13", height: "7", x: "8", y: "14", rx: "1", key: "1q5fc1" }]],
  },
  "BetweenVerticalEnd": {
    iconName: "between-vertical-end",
    node: [["rect", { width: "7", height: "13", x: "3", y: "3", rx: "1", key: "1fdu0f" }], ["path", { d: "m9 22 3-3 3 3", key: "17z65a" }], ["rect", { width: "7", height: "13", x: "14", y: "3", rx: "1", key: "1squn4" }]],
  },
  "BetweenVerticalStart": {
    iconName: "between-vertical-start",
    node: [["rect", { width: "7", height: "13", x: "3", y: "8", rx: "1", key: "1fjrkv" }], ["path", { d: "m15 2-3 3-3-3", key: "1uh6eb" }], ["rect", { width: "7", height: "13", x: "14", y: "8", rx: "1", key: "w3fjg8" }]],
  },
  "ChevronRight": {
    iconName: "chevron-right",
    node: [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]],
  },
  "Copy": {
    iconName: "copy",
    node: [["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2", key: "17jyea" }], ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2", key: "zix9uf" }]],
  },
  "PaintBucket": {
    iconName: "paint-bucket",
    node: [["path", { d: "m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z", key: "irua1i" }], ["path", { d: "m5 2 5 5", key: "1lls2c" }], ["path", { d: "M2 13h15", key: "1hkzvu" }], ["path", { d: "M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z", key: "xk76lq" }]],
  },
  "Plus": {
    iconName: "plus",
    node: [["path", { d: "M5 12h14", key: "1ays0h" }], ["path", { d: "M12 5v14", key: "s699le" }]],
  },
  "Square": {
    iconName: "square",
    node: [["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }]],
  },
  "SquareX": {
    iconName: "square-x",
    node: [["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2", key: "1m3agn" }], ["path", { d: "m15 9-6 6", key: "1uzhvr" }], ["path", { d: "m9 9 6 6", key: "z0biqf" }]],
  },
  "TableCellsMerge": {
    iconName: "table-cells-merge",
    node: [["path", { d: "M12 21v-6", key: "lihzve" }], ["path", { d: "M12 9V3", key: "da5inc" }], ["path", { d: "M3 15h18", key: "5xshup" }], ["path", { d: "M3 9h18", key: "1pudct" }], ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }]],
  },
  "TableCellsSplit": {
    iconName: "table-cells-split",
    node: [["path", { d: "M12 15V9", key: "8c7uyn" }], ["path", { d: "M3 15h18", key: "5xshup" }], ["path", { d: "M3 9h18", key: "1pudct" }], ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }]],
  },
  "AlignCenter": {
    iconName: "text-align-center",
    node: [
  ["path", { d: "M21 5H3", key: "1fi0y6" }],
  ["path", { d: "M17 12H7", key: "16if0g" }],
  ["path", { d: "M19 19H5", key: "vjpgq2" }]
],
  },
  "AlignJustify": {
    iconName: "text-align-justify",
    node: [
  ["path", { d: "M3 5h18", key: "1u36vt" }],
  ["path", { d: "M3 12h18", key: "1i2n21" }],
  ["path", { d: "M3 19h18", key: "awlh7x" }]
],
  },
  "AlignLeft": {
    iconName: "text-align-start",
    node: [
  ["path", { d: "M21 5H3", key: "1fi0y6" }],
  ["path", { d: "M15 12H3", key: "6jk70r" }],
  ["path", { d: "M17 19H3", key: "z6ezky" }]
],
  },
  "AlignRight": {
    iconName: "text-align-end",
    node: [
  ["path", { d: "M21 5H3", key: "1fi0y6" }],
  ["path", { d: "M21 12H9", key: "dn1m92" }],
  ["path", { d: "M21 19H7", key: "4cu937" }]
],
  },
  "AlertTriangle": {
    iconName: "triangle-alert",
    node: [
  [
    "path",
    {
      d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      key: "wmoenq"
    }
  ],
  ["path", { d: "M12 9v4", key: "juzpu7" }],
  ["path", { d: "M12 17h.01", key: "p32p05" }]
],
  },
  "Bold": {
    iconName: "bold",
    node: [
  [
    "path",
    { d: "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8", key: "mg9rjx" }
  ]
],
  },
  "Braces": {
    iconName: "braces",
    node: [
  [
    "path",
    { d: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1", key: "ezmyqa" }
  ],
  [
    "path",
    {
      d: "M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1",
      key: "e1hn23"
    }
  ]
],
  },
  "Captions": {
    iconName: "captions",
    node: [
  ["rect", { width: "18", height: "14", x: "3", y: "5", rx: "2", ry: "2", key: "12ruh7" }],
  ["path", { d: "M7 15h4M15 15h2M7 11h2M13 11h4", key: "1ueiar" }]
],
  },
  "Check": {
    iconName: "check",
    node: [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]],
  },
  "CheckCircle2": {
    iconName: "circle-check",
    node: [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
],
  },
  "ChevronDown": {
    iconName: "chevron-down",
    node: [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]],
  },
  "ChevronUp": {
    iconName: "chevron-up",
    node: [["path", { d: "m18 15-6-6-6 6", key: "153udz" }]],
  },
  "CircleX": {
    iconName: "circle-x",
    node: [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m15 9-6 6", key: "1uzhvr" }],
  ["path", { d: "m9 9 6 6", key: "z0biqf" }]
],
  },
  "Code2": {
    iconName: "code-xml",
    node: [
  ["path", { d: "m18 16 4-4-4-4", key: "1inbqp" }],
  ["path", { d: "m6 8-4 4 4 4", key: "15zrgr" }],
  ["path", { d: "m14.5 4-5 16", key: "e7oirm" }]
],
  },
  "CornerDownLeft": {
    iconName: "corner-down-left",
    node: [
  ["path", { d: "M20 4v7a4 4 0 0 1-4 4H4", key: "6o5b7l" }],
  ["path", { d: "m9 10-5 5 5 5", key: "1kshq7" }]
],
  },
  "Download": {
    iconName: "download",
    node: [
  ["path", { d: "M12 15V3", key: "m9g1x1" }],
  ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }],
  ["path", { d: "m7 10 5 5 5-5", key: "brsn70" }]
],
  },
  "Eye": {
    iconName: "eye",
    node: [
  [
    "path",
    {
      d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
      key: "1nclc0"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
],
  },
  "ExternalLink": {
    iconName: "external-link",
    node: [
  ["path", { d: "M15 3h6v6", key: "1q9fwt" }],
  ["path", { d: "M10 14 21 3", key: "gplh6r" }],
  ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", key: "a6xqqp" }]
],
  },
  "Heading1": {
    iconName: "heading-1",
    node: [
  ["path", { d: "M4 12h8", key: "17cfdx" }],
  ["path", { d: "M4 18V6", key: "1rz3zl" }],
  ["path", { d: "M12 18V6", key: "zqpxq5" }],
  ["path", { d: "m17 12 3-2v8", key: "1hhhft" }]
],
  },
  "Heading2": {
    iconName: "heading-2",
    node: [
  ["path", { d: "M4 12h8", key: "17cfdx" }],
  ["path", { d: "M4 18V6", key: "1rz3zl" }],
  ["path", { d: "M12 18V6", key: "zqpxq5" }],
  ["path", { d: "M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1", key: "9jr5yi" }]
],
  },
  "Heading3": {
    iconName: "heading-3",
    node: [
  ["path", { d: "M4 12h8", key: "17cfdx" }],
  ["path", { d: "M4 18V6", key: "1rz3zl" }],
  ["path", { d: "M12 18V6", key: "zqpxq5" }],
  ["path", { d: "M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2", key: "68ncm8" }],
  ["path", { d: "M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2", key: "1ejuhz" }]
],
  },
  "Image": {
    iconName: "image",
    node: [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2", key: "1m3agn" }],
  ["circle", { cx: "9", cy: "9", r: "2", key: "af1f0g" }],
  ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21", key: "1xmnt7" }]
],
  },
  "ImageUp": {
    iconName: "image-up",
    node: [
  [
    "path",
    {
      d: "M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21",
      key: "9csbqa"
    }
  ],
  ["path", { d: "m14 19.5 3-3 3 3", key: "9vmjn0" }],
  ["path", { d: "M17 22v-5.5", key: "1aa6fl" }],
  ["circle", { cx: "9", cy: "9", r: "2", key: "af1f0g" }]
],
  },
  "IndentDecrease": {
    iconName: "list-indent-decrease",
    node: [
  ["path", { d: "M21 5H11", key: "us1j55" }],
  ["path", { d: "M21 12H11", key: "wd7e0v" }],
  ["path", { d: "M21 19H11", key: "saa85w" }],
  ["path", { d: "m7 8-4 4 4 4", key: "o5hrat" }]
],
  },
  "IndentIncrease": {
    iconName: "list-indent-increase",
    node: [
  ["path", { d: "M21 5H11", key: "us1j55" }],
  ["path", { d: "M21 12H11", key: "wd7e0v" }],
  ["path", { d: "M21 19H11", key: "saa85w" }],
  ["path", { d: "m3 8 4 4-4 4", key: "1a3j6y" }]
],
  },
  "Info": {
    iconName: "info",
    node: [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 16v-4", key: "1dtifu" }],
  ["path", { d: "M12 8h.01", key: "e9boi3" }]
],
  },
  "Italic": {
    iconName: "italic",
    node: [
  ["line", { x1: "19", x2: "10", y1: "4", y2: "4", key: "15jd3p" }],
  ["line", { x1: "14", x2: "5", y1: "20", y2: "20", key: "bu0au3" }],
  ["line", { x1: "15", x2: "9", y1: "4", y2: "20", key: "uljnxc" }]
],
  },
  "Lightbulb": {
    iconName: "lightbulb",
    node: [
  [
    "path",
    {
      d: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
      key: "1gvzjb"
    }
  ],
  ["path", { d: "M9 18h6", key: "x1upvd" }],
  ["path", { d: "M10 22h4", key: "ceow96" }]
],
  },
  "Link2": {
    iconName: "link-2",
    node: [
  ["path", { d: "M9 17H7A5 5 0 0 1 7 7h2", key: "8i5ue5" }],
  ["path", { d: "M15 7h2a5 5 0 1 1 0 10h-2", key: "1b9ql8" }],
  ["line", { x1: "8", x2: "16", y1: "12", y2: "12", key: "1jonct" }]
],
  },
  "List": {
    iconName: "list",
    node: [
  ["path", { d: "M3 5h.01", key: "18ugdj" }],
  ["path", { d: "M3 12h.01", key: "nlz23k" }],
  ["path", { d: "M3 19h.01", key: "noohij" }],
  ["path", { d: "M8 5h13", key: "1pao27" }],
  ["path", { d: "M8 12h13", key: "1za7za" }],
  ["path", { d: "M8 19h13", key: "m83p4d" }]
],
  },
  "ListChecks": {
    iconName: "list-checks",
    node: [
  ["path", { d: "M13 5h8", key: "a7qcls" }],
  ["path", { d: "M13 12h8", key: "h98zly" }],
  ["path", { d: "M13 19h8", key: "c3s6r1" }],
  ["path", { d: "m3 17 2 2 4-4", key: "1jhpwq" }],
  ["path", { d: "m3 7 2 2 4-4", key: "1obspn" }]
],
  },
  "ListOrdered": {
    iconName: "list-ordered",
    node: [
  ["path", { d: "M11 5h10", key: "1cz7ny" }],
  ["path", { d: "M11 12h10", key: "1438ji" }],
  ["path", { d: "M11 19h10", key: "11t30w" }],
  ["path", { d: "M4 4h1v5", key: "10yrso" }],
  ["path", { d: "M4 9h2", key: "r1h2o0" }],
  ["path", { d: "M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02", key: "xtkcd5" }]
],
  },
  "Minus": {
    iconName: "minus",
    node: [["path", { d: "M5 12h14", key: "1ays0h" }]],
  },
  "MoreVertical": {
    iconName: "ellipsis-vertical",
    node: [
  ["circle", { cx: "12", cy: "12", r: "1", key: "41hilf" }],
  ["circle", { cx: "12", cy: "5", r: "1", key: "gxeob9" }],
  ["circle", { cx: "12", cy: "19", r: "1", key: "lyex9k" }]
],
  },
  "Paperclip": {
    iconName: "paperclip",
    node: [
  [
    "path",
    {
      d: "m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551",
      key: "1miecu"
    }
  ]
],
  },
  "PencilLine": {
    iconName: "pencil-line",
    node: [
  ["path", { d: "M13 21h8", key: "1jsn5i" }],
  ["path", { d: "m15 5 4 4", key: "1mk7zo" }],
  [
    "path",
    {
      d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
      key: "1a8usu"
    }
  ]
],
  },
  "Quote": {
    iconName: "quote",
    node: [
  [
    "path",
    {
      d: "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
      key: "rib7q0"
    }
  ],
  [
    "path",
    {
      d: "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
      key: "1ymkrd"
    }
  ]
],
  },
  "Replace": {
    iconName: "replace",
    node: [
  ["path", { d: "M14 4a1 1 0 0 1 1-1", key: "dhj8ez" }],
  ["path", { d: "M15 10a1 1 0 0 1-1-1", key: "1mnyi5" }],
  ["path", { d: "M21 4a1 1 0 0 0-1-1", key: "sfs9ap" }],
  ["path", { d: "M21 9a1 1 0 0 1-1 1", key: "mp6qeo" }],
  ["path", { d: "m3 7 3 3 3-3", key: "x25e72" }],
  ["path", { d: "M6 10V5a2 2 0 0 1 2-2h2", key: "15xut4" }],
  ["rect", { x: "3", y: "14", width: "7", height: "7", rx: "1", key: "1bkyp8" }]
],
  },
  "Sigma": {
    iconName: "sigma",
    node: [
  [
    "path",
    {
      d: "M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2",
      key: "wuwx1p"
    }
  ]
],
  },
  "SmilePlus": {
    iconName: "smile-plus",
    node: [
  ["path", { d: "M22 11v1a10 10 0 1 1-9-10", key: "ew0xw9" }],
  ["path", { d: "M8 14s1.5 2 4 2 4-2 4-2", key: "1y1vjs" }],
  ["line", { x1: "9", x2: "9.01", y1: "9", y2: "9", key: "yxxnd0" }],
  ["line", { x1: "15", x2: "15.01", y1: "9", y2: "9", key: "1p4y9e" }],
  ["path", { d: "M16 5h6", key: "1vod17" }],
  ["path", { d: "M19 2v6", key: "4bpg5p" }]
],
  },
  "Strikethrough": {
    iconName: "strikethrough",
    node: [
  ["path", { d: "M16 4H9a3 3 0 0 0-2.83 4", key: "43sutm" }],
  ["path", { d: "M14 12a4 4 0 0 1 0 8H6", key: "nlfj13" }],
  ["line", { x1: "4", x2: "20", y1: "12", y2: "12", key: "1e0a9i" }]
],
  },
  "Subscript": {
    iconName: "subscript",
    node: [
  ["path", { d: "m4 5 8 8", key: "1eunvl" }],
  ["path", { d: "m12 5-8 8", key: "1ah0jp" }],
  [
    "path",
    {
      d: "M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07",
      key: "e8ta8j"
    }
  ]
],
  },
  "Superscript": {
    iconName: "superscript",
    node: [
  ["path", { d: "m4 19 8-8", key: "hr47gm" }],
  ["path", { d: "m12 19-8-8", key: "1dhhmo" }],
  [
    "path",
    {
      d: "M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06",
      key: "1dfcux"
    }
  ]
],
  },
  "Table2": {
    iconName: "table-2",
    node: [
  [
    "path",
    {
      d: "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18",
      key: "gugj83"
    }
  ]
],
  },
  "Text": {
    iconName: "text-align-start",
    node: [
  ["path", { d: "M21 5H3", key: "1fi0y6" }],
  ["path", { d: "M15 12H3", key: "6jk70r" }],
  ["path", { d: "M17 19H3", key: "z6ezky" }]
],
  },
  "Trash2": {
    iconName: "trash-2",
    node: [
  ["path", { d: "M10 11v6", key: "nco0om" }],
  ["path", { d: "M14 11v6", key: "outv1u" }],
  ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }]
],
  },
  "Type": {
    iconName: "type",
    node: [
  ["path", { d: "M12 4v16", key: "1654pz" }],
  ["path", { d: "M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2", key: "e0r10z" }],
  ["path", { d: "M9 20h6", key: "s66wpe" }]
],
  },
  "Underline": {
    iconName: "underline",
    node: [
  ["path", { d: "M6 4v6a6 6 0 0 0 12 0V4", key: "9kb039" }],
  ["line", { x1: "4", x2: "20", y1: "20", y2: "20", key: "nun2al" }]
],
  },
  "Upload": {
    iconName: "upload",
    node: [
  ["path", { d: "M12 3v12", key: "1x0j5s" }],
  ["path", { d: "m17 8-5-5-5 5", key: "7q97r8" }],
  ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }]
],
  },
  "RotateCcw": {
    iconName: "rotate-ccw",
    node: [["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }], ["path", { d: "M3 3v5h5", key: "1xhq8a" }]],
  },
  "Sparkles": {
    iconName: "sparkles",
    node: [
      ["path", { d: "m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z", key: "nraa5p" }],
      ["path", { d: "M5 3v4", key: "bklmnn" }],
      ["path", { d: "M19 17v4", key: "iiml17" }],
      ["path", { d: "M3 5h4", key: "nem4j1" }],
      ["path", { d: "M17 19h4", key: "lbex7p" }],
    ],
  },
  "Video": {
    iconName: "video",
    node: [
  [
    "path",
    {
      d: "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5",
      key: "ftymec"
    }
  ],
  ["rect", { x: "2", y: "6", width: "14", height: "12", rx: "2", key: "158x01" }]
  ],
  },
  "X": {
    iconName: "x",
    node: [["path", { d: "M18 6 6 18", key: "1bl5f8" }], ["path", { d: "m6 6 12 12", key: "d8bk6v" }]],
  },
} as const satisfies Record<string, { readonly iconName: string; readonly node: LucideIconNode }>;

export type LucideIcon = ReturnType<typeof createIconComponent>;

function renderIconNode(node: LucideIconNode) {
  return node.map(([tag, attrs]) => h(tag, attrs));
}

function createIconComponent(name: keyof typeof lucideIcons) {
  return defineComponent({
    name: `MarkweaveVue2Icon${name}`,
    props: {
      size: { type: [Number, String], default: 18 },
      strokeWidth: { type: [Number, String], default: 2 },
      absoluteStrokeWidth: { type: Boolean, default: false },
    },
    setup(props) {
      const icon = lucideIcons[name];
      return () =>
        h(
          "svg",
          {
            class: `lucide lucide-${icon.iconName}`,
            viewBox: "0 0 24 24",
            width: props.size,
            height: props.size,
            fill: "none",
            stroke: "currentColor",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            "stroke-width": props.absoluteStrokeWidth && props.size ? (Number(props.strokeWidth) * 24) / Number(props.size) : props.strokeWidth,
            "aria-hidden": "true",
            focusable: "false",
          },
          renderIconNode(icon.node),
        );
    },
  });
}

export const AlignCenter = createIconComponent("AlignCenter");
export const AlignJustify = createIconComponent("AlignJustify");
export const AlignLeft = createIconComponent("AlignLeft");
export const AlignRight = createIconComponent("AlignRight");
export const AlignVerticalJustifyCenter = createIconComponent("AlignVerticalJustifyCenter");
export const AlignVerticalJustifyEnd = createIconComponent("AlignVerticalJustifyEnd");
export const AlignVerticalJustifyStart = createIconComponent("AlignVerticalJustifyStart");
export const AlertTriangle = createIconComponent("AlertTriangle");
export const ArrowDown = createIconComponent("ArrowDown");
export const ArrowDownAZ = createIconComponent("ArrowDownAZ");
export const ArrowLeft = createIconComponent("ArrowLeft");
export const ArrowRight = createIconComponent("ArrowRight");
export const ArrowUp = createIconComponent("ArrowUp");
export const ArrowUpZA = createIconComponent("ArrowUpZA");
export const BetweenHorizontalEnd = createIconComponent("BetweenHorizontalEnd");
export const BetweenHorizontalStart = createIconComponent("BetweenHorizontalStart");
export const BetweenVerticalEnd = createIconComponent("BetweenVerticalEnd");
export const BetweenVerticalStart = createIconComponent("BetweenVerticalStart");
export const Bold = createIconComponent("Bold");
export const Braces = createIconComponent("Braces");
export const Captions = createIconComponent("Captions");
export const Check = createIconComponent("Check");
export const CheckCircle2 = createIconComponent("CheckCircle2");
export const ChevronDown = createIconComponent("ChevronDown");
export const ChevronRight = createIconComponent("ChevronRight");
export const ChevronUp = createIconComponent("ChevronUp");
export const CircleX = createIconComponent("CircleX");
export const Code2 = createIconComponent("Code2");
export const CornerDownLeft = createIconComponent("CornerDownLeft");
export const Copy = createIconComponent("Copy");
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
export const PaintBucket = createIconComponent("PaintBucket");
export const Paperclip = createIconComponent("Paperclip");
export const PencilLine = createIconComponent("PencilLine");
export const Plus = createIconComponent("Plus");
export const Quote = createIconComponent("Quote");
export const Replace = createIconComponent("Replace");
export const RotateCcw = createIconComponent("RotateCcw");
export const Sigma = createIconComponent("Sigma");
export const SmilePlus = createIconComponent("SmilePlus");
export const Sparkles = createIconComponent("Sparkles");
export const Square = createIconComponent("Square");
export const SquareX = createIconComponent("SquareX");
export const Strikethrough = createIconComponent("Strikethrough");
export const Subscript = createIconComponent("Subscript");
export const Superscript = createIconComponent("Superscript");
export const Table2 = createIconComponent("Table2");
export const TableCellsMerge = createIconComponent("TableCellsMerge");
export const TableCellsSplit = createIconComponent("TableCellsSplit");
export const Text = createIconComponent("Text");
export const Trash2 = createIconComponent("Trash2");
export const Type = createIconComponent("Type");
export const Underline = createIconComponent("Underline");
export const Upload = createIconComponent("Upload");
export const Video = createIconComponent("Video");
export const X = createIconComponent("X");
