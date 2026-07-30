import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDown,
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpZA,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  ChevronRight,
  Copy,
  MoreVertical,
  PaintBucket,
  Plus,
  SquareX,
  Sparkles,
  TableCellsMerge,
  TableCellsSplit,
  Trash2,
  Type as TypeIcon,
  type LucideIcon,
} from "lucide-react";
import {
  setMarkweaveTableMenuAxisTarget,
  type MarkweaveMenuCopyPayload,
} from "markweave/internal/plugins/table/table-clipboard";
import {
  type TableCommandId,
  type TableMenuIconId,
  type TableMenuSubmenuId,
} from "markweave/internal/plugins/table/table-command-spec";
import { getTableFocusState } from "markweave/internal/plugins/table/table-focus-state";
import {
  initialTableInteractionState,
  tableInteractionPluginKey,
  type TableInteractionState,
} from "markweave/internal/plugins/table/table-interaction-layer";
import {
  calculateAnchoredTableMenuPosition,
  calculateAnchoredTableSubmenuPosition,
  calculateTableAxisHandleLayout,
  calculateTableControlsPosition,
  calculateTableEdgeHandlePosition,
  calculateTableExtendButtonLayout,
  calculateTableMenuPosition,
  canRunTableCommand,
  executeTableMenuCommand,
  formatTableCopyFeedback,
  getActiveTableElement,
  getAvailableCellMenuCommandSpecs,
  getTableAxisTargetRect,
  getTableAxisFormattingState,
  getTableAxisDropIndexAtPoint,
  getTableAxisSelectionModel,
  getTableControlAxisSelectionModel,
  getTableCommandSnapshot,
  getTableCopyFeedbackSnapshot,
  getTableEditWithAiRequest,
  getTableMenuItemGroup,
  getTableMenuItemLabel,
  getTableMenuItems,
  getTableMenuBoundaryRect,
  getTableSelectionTargetRect,
  applyTableAxisAlignment,
  applyTableAxisBackgroundColor,
  applyTableAxisTextColor,
  moveTargetedTableAxis,
  runTableCommand,
  selectTableAxisFromCell,
  targetTableAxisFromCell,
  tableCopyFeedbackTimeoutMs,
  tableMenuLabel,
  tableColorOptions,
  tableHorizontalAlignmentOptions,
  tableVerticalAlignmentOptions,
  writeMarkweaveMenuPayloadToClipboard,
  type TableCopyFeedbackSnapshot,
  type TableAlignmentId,
  type TableAxisHandleLayout,
  type TableColorId,
  type TableMenuAnchor,
  type TableMenuKind,
  type TableFloatingMenuPosition,
  type TableSubmenuPosition,
} from "markweave/internal/plugins/table/table-ui-model";
import { getMarkweaveMessages, type MarkweaveMessages } from "markweave/internal/i18n";
import type { TableCommandResult, TableEditWithAiRequest } from "markweave/internal/core/public-types";
import type { MarkweaveAskAiConfig } from "markweave/internal/core/public-types";
import {
  canStartMarkweaveAskAiTableTarget,
  startMarkweaveAskAiTableTarget,
} from "markweave/internal/plugins/ask-ai/ask-ai-session";

export {
  calculateTableControlsPosition,
  calculateTableEdgeHandlePosition,
  calculateTableMenuPosition,
  canRunTableCommand,
  formatTableCopyFeedback,
  getAvailableCellMenuCommandSpecs,
  getTableAxisSelectionModel,
  getTableCopyFeedbackSnapshot,
  getTableCommandSnapshot,
  getTableEditWithAiRequest,
  runTableCommand,
  selectTableAxisFromCell,
  writeMarkweaveMenuPayloadToClipboard,
};

interface TableControlsProps {
  readonly editor: Editor;
  readonly active: boolean;
  readonly interactionState?: TableInteractionState;
  readonly messages?: MarkweaveMessages;
  readonly onCopyPayload?: (payload: MarkweaveMenuCopyPayload) => void;
  readonly onCommandResult?: (result: TableCommandResult) => void;
  readonly onEditWithAi?: (request: TableEditWithAiRequest) => void;
  readonly askAi?: MarkweaveAskAiConfig;
}

const defaultTableMessages = getMarkweaveMessages("zh");

const tableMenuIcons: Readonly<Record<TableMenuIconId, LucideIcon>> = {
  "move-left": ArrowLeft,
  "move-right": ArrowRight,
  "move-up": ArrowUp,
  "move-down": ArrowDown,
  "insert-left": BetweenVerticalStart,
  "insert-right": BetweenVerticalEnd,
  "insert-above": BetweenHorizontalStart,
  "insert-below": BetweenHorizontalEnd,
  "sort-asc": ArrowDownAZ,
  "sort-desc": ArrowUpZA,
  color: PaintBucket,
  alignment: AlignLeft,
  clear: SquareX,
  duplicate: Copy,
  copy: Copy,
  merge: TableCellsMerge,
  split: TableCellsSplit,
  "ask-ai": Sparkles,
  delete: Trash2,
};

const tableAlignmentIcons: Readonly<Record<TableAlignmentId, LucideIcon>> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  top: AlignVerticalJustifyStart,
  middle: AlignVerticalJustifyCenter,
  bottom: AlignVerticalJustifyEnd,
};

export function TableControls({
  active,
  editor,
  interactionState = initialTableInteractionState,
  messages = defaultTableMessages,
  onCopyPayload,
  onCommandResult,
  askAi,
}: TableControlsProps) {
  const [openMenu, setOpenMenu] = useState<TableMenuKind | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<TableMenuSubmenuId | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<TableMenuAnchor>("row-edge");
  const [menuPosition, setMenuPosition] = useState<TableFloatingMenuPosition | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<TableSubmenuPosition | null>(null);
  const [rowEdgePosition, setRowEdgePosition] = useState<TableAxisHandleLayout | null>(null);
  const [columnEdgePosition, setColumnEdgePosition] = useState<TableAxisHandleLayout | null>(null);
  const [selectionEdgePosition, setSelectionEdgePosition] = useState<TableAxisHandleLayout | null>(null);
  const [rowExtendPosition, setRowExtendPosition] = useState<TableAxisHandleLayout | null>(null);
  const [columnExtendPosition, setColumnExtendPosition] = useState<TableAxisHandleLayout | null>(null);
  const [, setFormatRevision] = useState(0);
  const dragOriginRef = useRef<{ readonly axis: "row" | "column"; readonly index: number } | null>(null);
  const dragTargetRef = useRef<number | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<TableCopyFeedbackSnapshot | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuScrollRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const rowEdgeRef = useRef<HTMLButtonElement | null>(null);
  const columnEdgeRef = useRef<HTMLButtonElement | null>(null);
  const selectionEdgeRef = useRef<HTMLButtonElement | null>(null);
  const focusState = active ? getTableFocusState(editor.state) : null;

  useEffect(() => {
    if (!copyFeedback) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setCopyFeedback(null);
    }, tableCopyFeedbackTimeoutMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copyFeedback]);

  useEffect(() => {
    const handleAxisDragOver = (event: globalThis.DragEvent) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      const target = getTableAxisDropIndexAtPoint(editor, origin.axis, event.clientX, event.clientY);
      if (target === null) return;
      event.preventDefault();
      dragTargetRef.current = target;
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    };

    const handleAxisDrop = (event: globalThis.DragEvent) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      const target = getTableAxisDropIndexAtPoint(editor, origin.axis, event.clientX, event.clientY) ?? dragTargetRef.current;
      event.preventDefault();
      dragOriginRef.current = null;
      dragTargetRef.current = null;
      if (target !== null) moveTargetedTableAxis(editor, origin.axis, origin.index, target);
    };

    document.addEventListener("dragover", handleAxisDragOver);
    document.addEventListener("drop", handleAxisDrop);
    return () => {
      document.removeEventListener("dragover", handleAxisDragOver);
      document.removeEventListener("drop", handleAxisDrop);
    };
  }, [editor]);

  useLayoutEffect(() => {
    if (!active) {
      setRowEdgePosition(null);
      setColumnEdgePosition(null);
      setSelectionEdgePosition(null);
      setRowExtendPosition(null);
      setColumnExtendPosition(null);
      setCopyFeedback(null);
      return undefined;
    }

    const updateEdgePositions = () => {
      const frameElement = editor.view.dom.closest<HTMLElement>(".markweave-editor-frame") ?? editor.view.dom.parentElement;
      const rowAxisModel = getTableControlAxisSelectionModel(editor, interactionState, "row", focusState?.activeCellPos ?? null);
      const columnAxisModel = getTableControlAxisSelectionModel(editor, interactionState, "column", focusState?.activeCellPos ?? null);
      const rowAxisRect = rowAxisModel ? getTableAxisTargetRect(editor, rowAxisModel) : null;
      const columnAxisRect = columnAxisModel ? getTableAxisTargetRect(editor, columnAxisModel) : null;
      const selectionRect = getTableMenuItems(editor, "selection").length > 0 ? getTableSelectionTargetRect(editor) : null;
      const tableRect = getActiveTableElement(editor)?.getBoundingClientRect() ?? null;

      if (!frameElement) {
        setRowEdgePosition(null);
        setColumnEdgePosition(null);
        setSelectionEdgePosition(null);
        setRowExtendPosition(null);
        setColumnExtendPosition(null);
        return;
      }

      const frameRect = frameElement.getBoundingClientRect();

      if (rowAxisRect) {
        setRowEdgePosition(
          calculateTableAxisHandleLayout({
            targetRect: rowAxisRect,
            frameRect,
            kind: "row",
          }),
        );
      } else if (!(openMenu === "row" && menuAnchor === "row-edge")) {
        setRowEdgePosition(null);
      }

      if (columnAxisRect) {
        setColumnEdgePosition(
          calculateTableAxisHandleLayout({
            targetRect: columnAxisRect,
            frameRect,
            kind: "column",
          }),
        );
      } else if (!(openMenu === "column" && menuAnchor === "column-edge")) {
        setColumnEdgePosition(null);
      }

      if (selectionRect) {
        setSelectionEdgePosition(
          calculateTableAxisHandleLayout({
            targetRect: selectionRect,
            frameRect,
            kind: "selection",
          }),
        );
      } else if (!(openMenu === "selection" && menuAnchor === "selection-edge")) {
        setSelectionEdgePosition(null);
      }

      const hoveringLastRow = interactionState.hoverCellPos !== null && Boolean(rowAxisModel && rowAxisModel.index === rowAxisModel.visualHeight - 1);
      const hoveringLastColumn = interactionState.hoverCellPos !== null && Boolean(columnAxisModel && columnAxisModel.index === columnAxisModel.visualWidth - 1);

      setRowExtendPosition(
        tableRect && hoveringLastRow
          ? calculateTableExtendButtonLayout({ tableRect, frameRect, kind: "row" })
          : null,
      );
      setColumnExtendPosition(
        tableRect && hoveringLastColumn
          ? calculateTableExtendButtonLayout({ tableRect, frameRect, kind: "column" })
          : null,
      );
    };

    updateEdgePositions();
    window.addEventListener("resize", updateEdgePositions);
    window.addEventListener("scroll", updateEdgePositions, true);

    return () => {
      window.removeEventListener("resize", updateEdgePositions);
      window.removeEventListener("scroll", updateEdgePositions, true);
    };
  }, [
    active,
    editor,
    focusState?.activeCellPos,
    focusState?.selectionFrom,
    focusState?.selectionTo,
    interactionState.hoverCellPos,
    interactionState.hoverVisualColumnIndex,
    interactionState.hoverVisualRowIndex,
    menuAnchor,
    openMenu,
  ]);

  useLayoutEffect(() => {
    if (!active || !openMenu) {
      setMenuPosition(null);
      return undefined;
    }

    const updateMenuPosition = () => {
      const frameElement = editor.view.dom.closest<HTMLElement>(".markweave-editor-frame") ?? editor.view.dom.parentElement;
      const anchorElement =
        menuAnchor === "row-edge" ? rowEdgeRef.current : menuAnchor === "column-edge" ? columnEdgeRef.current : selectionEdgeRef.current;
      const menuElement = menuRef.current;

      if (!frameElement || !anchorElement || !menuElement) {
        setMenuPosition(null);
        return;
      }

      const rawAnchorRect = anchorElement.getBoundingClientRect();
      const tableRect = openMenu === "row" ? getActiveTableElement(editor)?.getBoundingClientRect() : null;
      const anchorRect = tableRect
        ? {
            left: rawAnchorRect.left,
            top: tableRect.top,
            width: rawAnchorRect.width,
            height: rawAnchorRect.height,
          }
        : rawAnchorRect;
      const frameRect = frameElement.getBoundingClientRect();
      const menuRect = menuElement.getBoundingClientRect();
      const scrollHeight = menuScrollRef.current?.scrollHeight ?? 0;
      const naturalMenuHeight = scrollHeight > 0 ? scrollHeight + 12 : 0;
      const anchorMenuPosition = calculateAnchoredTableMenuPosition({
        anchorRect,
        frameRect,
        boundaryRect: getTableMenuBoundaryRect(frameElement),
        menuSize: {
          width: menuRect.width || 254,
          height: naturalMenuHeight || menuRect.height || 410,
        },
        kind: openMenu,
      });

      setMenuPosition(anchorMenuPosition);
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [active, editor, menuAnchor, openMenu, rowEdgePosition, columnEdgePosition, selectionEdgePosition]);

  useLayoutEffect(() => {
    if (!active || !openMenu || !openSubmenu || !menuPosition) {
      setSubmenuPosition(null);
      return undefined;
    }

    const updateSubmenuPosition = () => {
      const frameElement = editor.view.dom.closest<HTMLElement>(".markweave-editor-frame") ?? editor.view.dom.parentElement;
      const menuElement = menuRef.current;
      const submenuElement = submenuRef.current;
      const triggerElement = menuElement?.querySelector<HTMLElement>(`[data-submenu-trigger="${openSubmenu}"]`);

      if (!frameElement || !menuElement || !submenuElement || !triggerElement) {
        setSubmenuPosition(null);
        return;
      }

      const submenuRect = submenuElement.getBoundingClientRect();
      const naturalSubmenuHeight = Math.max(submenuElement.scrollHeight + 2, submenuRect.height);
      setSubmenuPosition(
        calculateAnchoredTableSubmenuPosition({
          triggerRect: triggerElement.getBoundingClientRect(),
          parentMenuRect: menuElement.getBoundingClientRect(),
          boundaryRect: getTableMenuBoundaryRect(frameElement),
          submenuSize: {
            width: submenuRect.width || 238,
            height: naturalSubmenuHeight || 410,
          },
        }),
      );
    };

    updateSubmenuPosition();
    const scrollElement = menuScrollRef.current;
    scrollElement?.addEventListener("scroll", updateSubmenuPosition);
    window.addEventListener("resize", updateSubmenuPosition);
    window.addEventListener("scroll", updateSubmenuPosition, true);

    return () => {
      scrollElement?.removeEventListener("scroll", updateSubmenuPosition);
      window.removeEventListener("resize", updateSubmenuPosition);
      window.removeEventListener("scroll", updateSubmenuPosition, true);
    };
  }, [active, editor, menuPosition, openMenu, openSubmenu]);

  useEffect(() => {
    if (!active || !openMenu) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (openSubmenu) {
        setOpenSubmenu(null);
        return;
      }

      setOpenMenu(null);
      setOpenSubmenu(null);
      editor.view.focus();
    };

    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (event.target instanceof Node && controlsRef.current?.contains(event.target)) {
        return;
      }

      setOpenMenu(null);
      setOpenSubmenu(null);
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsidePointer);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsidePointer);
    };
  }, [active, editor, openMenu, openSubmenu]);

  if (!active) {
    return null;
  }

  const toggleMenu = (menu: TableMenuKind, anchor: TableMenuAnchor) => {
    const shouldClose = openMenu === menu && menuAnchor === anchor;
    setMenuAnchor(anchor);
    setOpenMenu(shouldClose ? null : menu);
    setOpenSubmenu(null);
  };

  const clearMenuAxisTarget = () => {
    editor.view.dispatch(setMarkweaveTableMenuAxisTarget(editor.state.tr, null));
  };

  const openAxisMenuFromEdge = (menu: "row" | "column", anchor: Extract<TableMenuAnchor, "row-edge" | "column-edge">) => {
    const targetCellPos = interactionState.hoverCellPos ?? focusState?.activeCellPos ?? null;
    const visualIndex = interactionState.hoverCellPos === null ? null : menu === "row" ? interactionState.hoverVisualRowIndex : interactionState.hoverVisualColumnIndex;

    if (targetCellPos !== null) {
      selectTableAxisFromCell(editor, targetCellPos, menu, { visualIndex });
    }

    toggleMenu(menu, anchor);
  };

  const openSelectionMenuFromEdge = () => {
    clearMenuAxisTarget();
    toggleMenu("selection", "selection-edge");
  };

  const rowAxisModel = getTableControlAxisSelectionModel(editor, interactionState, "row", focusState?.activeCellPos ?? null);
  const columnAxisModel = getTableControlAxisSelectionModel(editor, interactionState, "column", focusState?.activeCellPos ?? null);
  const askAiEnabled = askAi?.enabled === true && typeof askAi.handler === "function";
  const hasCellMenuCommands = getTableMenuItems(editor, "selection", { askAiEnabled }).length > 0;
  const menuItems = openMenu ? getTableMenuItems(editor, openMenu, { askAiEnabled }) : [];
  const runMenuCommand = async (commandId: TableCommandId, menuOverride?: TableMenuKind) => {
    const result = await executeTableMenuCommand({
      editor,
      commandId,
      menu: menuOverride ?? openMenu ?? "selection",
      messages,
    });

    if (result.copyFeedback) {
      setCopyFeedback(result.copyFeedback);
      if (result.copyPayload) {
        onCopyPayload?.(result.copyPayload);
      }
    } else {
      setCopyFeedback(null);
    }

    onCommandResult?.(result.commandResult);
    return result.success;
  };

  const runAskAi = (source: TableEditWithAiRequest["source"]) => {
    if (!askAiEnabled || !startMarkweaveAskAiTableTarget(editor, source)) {
      return;
    }
    setOpenMenu(null);
    setOpenSubmenu(null);
  };

  const runAxisFormatting = (callback: (axis: "row" | "column") => boolean) => {
    if (openMenu !== "row" && openMenu !== "column") {
      return;
    }

    if (callback(openMenu)) {
      setFormatRevision((revision) => revision + 1);
    }
  };

  const runExtendCommand = (axis: "row" | "column") => {
    const model = axis === "row" ? rowAxisModel : columnAxisModel;
    const targetCellPos = interactionState.hoverCellPos ?? focusState?.activeCellPos ?? null;

    if (!model || targetCellPos === null) {
      return;
    }

    if (targetTableAxisFromCell(editor, targetCellPos, axis, { visualIndex: model.index })) {
      void runMenuCommand(axis === "row" ? "add-row-after" : "add-column-after", axis);
    }
  };

  const startAxisDrag = (axis: "row" | "column", index: number, event: DragEvent<HTMLButtonElement>) => {
    dragOriginRef.current = { axis, index };
    dragTargetRef.current = index;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-markweave-table-axis", `${axis}:${index}`);
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const menu = event.currentTarget;
    const itemRoot = menu.classList.contains("markweave-table-menu")
      ? menu.querySelector<HTMLElement>(":scope > .markweave-table-menu-scroll") ?? menu
      : menu;
    const items = Array.from(
      itemRoot.querySelectorAll<HTMLButtonElement>(
        ':scope > button[role="menuitem"]:not(:disabled), :scope > button[role="menuitemradio"]:not(:disabled)',
      ),
    );
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = currentIndex < 0 ? 0 : Math.min(items.length - 1, Math.max(0, currentIndex + delta));
      items[nextIndex]?.focus();
    }
  };

  const formattingState = openMenu === "row" || openMenu === "column" ? getTableAxisFormattingState(editor, openMenu) : null;

  return (
    <div
      ref={controlsRef}
      className="markweave-table-controls"
      data-testid="markweave-table-controls"
      aria-label={messages.table.controlsAriaLabel}
      data-open-menu={openMenu ?? "none"}
      data-positioned={rowEdgePosition || columnEdgePosition || selectionEdgePosition ? "true" : "false"}
      onMouseLeave={() => {
        editor.view.dispatch(editor.state.tr.setMeta(tableInteractionPluginKey, { type: "clear-hover" }));
      }}
    >
      {copyFeedback ? (
        <div
          className="markweave-table-copy-feedback"
          role="status"
          aria-live="polite"
          data-testid="markweave-table-copy-feedback"
          data-copy-kind={copyFeedback.kind}
          data-text-length={copyFeedback.textLength}
          data-html-length={copyFeedback.htmlLength}
        >
          {formatTableCopyFeedback(copyFeedback)}
        </div>
      ) : null}
      {rowEdgePosition ? (
        <button
          type="button"
          ref={rowEdgeRef}
          className="markweave-table-edge-handle markweave-table-edge-handle--row"
          aria-label={messages.table.activeRowActions}
          aria-expanded={openMenu === "row" && menuAnchor === "row-edge"}
          aria-haspopup="menu"
          title={messages.table.rowActions}
          data-testid="markweave-table-hover-row-handle"
          data-axis-index={rowAxisModel?.index ?? ""}
          data-axis-selected-cells={rowAxisModel?.selectedCellCount ?? ""}
          data-axis-visual-cells={rowAxisModel?.visualCellCount ?? ""}
          data-axis-visual-size={rowAxisModel?.visualHeight ?? ""}
          style={{ left: rowEdgePosition.left, top: rowEdgePosition.top, width: rowEdgePosition.width, height: rowEdgePosition.height }}
          draggable
          onDragStart={(event) => startAxisDrag("row", rowAxisModel?.index ?? 0, event)}
          onDragEnd={() => {
            dragOriginRef.current = null;
            dragTargetRef.current = null;
          }}
          onClick={() => {
            openAxisMenuFromEdge("row", "row-edge");
          }}
        >
          <MoreVertical aria-hidden="true" size={14} />
        </button>
      ) : null}
      {columnEdgePosition ? (
        <button
          type="button"
          ref={columnEdgeRef}
          className="markweave-table-edge-handle markweave-table-edge-handle--column"
          aria-label={messages.table.activeColumnActions}
          aria-expanded={openMenu === "column" && menuAnchor === "column-edge"}
          aria-haspopup="menu"
          title={messages.table.columnActions}
          data-testid="markweave-table-hover-column-handle"
          data-axis-index={columnAxisModel?.index ?? ""}
          data-axis-selected-cells={columnAxisModel?.selectedCellCount ?? ""}
          data-axis-visual-cells={columnAxisModel?.visualCellCount ?? ""}
          data-axis-visual-size={columnAxisModel?.visualWidth ?? ""}
          style={{ left: columnEdgePosition.left, top: columnEdgePosition.top, width: columnEdgePosition.width, height: columnEdgePosition.height }}
          draggable
          onDragStart={(event) => startAxisDrag("column", columnAxisModel?.index ?? 0, event)}
          onDragEnd={() => {
            dragOriginRef.current = null;
            dragTargetRef.current = null;
          }}
          onClick={() => {
            openAxisMenuFromEdge("column", "column-edge");
          }}
        >
          <MoreVertical aria-hidden="true" size={14} />
        </button>
      ) : null}
      {rowExtendPosition ? (
        <button
          type="button"
          className="markweave-table-extend-button markweave-table-extend-button--row"
          aria-label={messages.table.addRow}
          title={messages.table.addRow}
          data-testid="markweave-table-add-row"
          style={{ left: rowExtendPosition.left, top: rowExtendPosition.top, width: rowExtendPosition.width, height: rowExtendPosition.height }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runExtendCommand("row")}
        >
          <Plus aria-hidden="true" size={16} />
        </button>
      ) : null}
      {columnExtendPosition ? (
        <button
          type="button"
          className="markweave-table-extend-button markweave-table-extend-button--column"
          aria-label={messages.table.addColumn}
          title={messages.table.addColumn}
          data-testid="markweave-table-add-column"
          style={{ left: columnExtendPosition.left, top: columnExtendPosition.top, width: columnExtendPosition.width, height: columnExtendPosition.height }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runExtendCommand("column")}
        >
          <Plus aria-hidden="true" size={16} />
        </button>
      ) : null}
      {hasCellMenuCommands && selectionEdgePosition ? (
        <button
          type="button"
          ref={selectionEdgeRef}
          className="markweave-table-edge-handle markweave-table-edge-handle--selection"
          aria-label={messages.table.selectionActions}
          aria-expanded={openMenu === "selection" && menuAnchor === "selection-edge"}
          aria-haspopup="menu"
          title={messages.table.selectionActions}
          data-testid="markweave-table-cell-handle"
          style={{ left: selectionEdgePosition.left, top: selectionEdgePosition.top, width: selectionEdgePosition.width, height: selectionEdgePosition.height }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openSelectionMenuFromEdge}
        >
          <MoreVertical aria-hidden="true" size={14} />
        </button>
      ) : null}
      {openMenu ? (
        <div
          ref={menuRef}
          className="markweave-table-menu"
          role="menu"
          aria-label={tableMenuLabel(openMenu, messages)}
          data-testid="markweave-table-menu"
          data-positioned={menuPosition ? "true" : "false"}
          data-placement={menuPosition?.placement}
          data-submenu={openSubmenu ?? "none"}
          style={menuPosition ? { left: menuPosition.left, top: menuPosition.top } : undefined}
          onKeyDown={handleMenuKeyDown}
        >
          <div
            ref={menuScrollRef}
            className="markweave-table-menu-scroll"
            style={menuPosition ? { maxHeight: Math.max(1, menuPosition.maxHeight - 12) } : undefined}
          >
            {menuItems.map((item, index) => {
            const group = getTableMenuItemGroup(item);
            const previousGroup = index === 0 ? group : getTableMenuItemGroup(menuItems[index - 1]);
            const startsGroup = index > 0 && previousGroup !== group;
            const source = openMenu === "row" || openMenu === "column" ? openMenu : "selection";
            const enabled = item.submenuId
              ? true
              : item.id === "edit-with-ai"
                ? askAiEnabled && canStartMarkweaveAskAiTableTarget(editor, source)
                : item.commandId === null
                  ? false
                  : canRunTableCommand(editor, item.commandId);
            const label = getTableMenuItemLabel(item, messages);
            const ItemIcon = tableMenuIcons[item.icon];

            return (
              <button
                key={`${item.id}-${index}`}
                type="button"
                role="menuitem"
                aria-label={label}
                aria-disabled={!enabled}
                aria-haspopup={item.submenuId ? "menu" : undefined}
                aria-expanded={item.submenuId ? openSubmenu === item.submenuId : undefined}
                disabled={!enabled}
                title={item.id === "edit-with-ai" && askAiEnabled && !enabled ? messages.askAi.tableMergedUnsupported : undefined}
                data-menu-group={group}
                data-starts-group={startsGroup ? "true" : "false"}
                data-command-enabled={enabled ? "true" : "false"}
                data-submenu-trigger={item.submenuId ?? undefined}
                data-testid={
                  item.commandId
                    ? `markweave-table-menu-command-${item.commandId}`
                    : item.submenuId
                      ? `markweave-table-menu-submenu-${item.submenuId}`
                      : `markweave-table-menu-command-edit-with-ai`
                }
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (enabled && item.id === "edit-with-ai") {
                    runAskAi(source);
                  }
                }}
                onMouseEnter={() => setOpenSubmenu(item.submenuId)}
                onClick={(event) => {
                  if (!enabled) {
                    return;
                  }

                  if (item.submenuId) {
                    setOpenSubmenu(item.submenuId);
                    return;
                  }

                  if (item.commandId === null) {
                    if (event.detail === 0) {
                      runAskAi(source);
                    }
                    return;
                  }

                  void runMenuCommand(item.commandId).finally(() => {
                    setOpenMenu(null);
                    setOpenSubmenu(null);
                  });
                }}
              >
                <span className="markweave-table-menu-item-icon" aria-hidden="true">
                  <ItemIcon size={18} strokeWidth={1.8} />
                </span>
                <span className="markweave-table-menu-item-label">{label}</span>
                {item.submenuId ? <ChevronRight className="markweave-table-menu-chevron" aria-hidden="true" size={16} /> : null}
              </button>
            );
            })}
          </div>
          {openSubmenu === "color" && (openMenu === "row" || openMenu === "column") ? (
            <div
              ref={submenuRef}
              className="markweave-table-submenu markweave-table-color-menu"
              role="menu"
              aria-label={messages.table.submenus.color}
              data-testid="markweave-table-color-menu"
              data-positioned={submenuPosition ? "true" : "false"}
              data-placement={submenuPosition?.placement}
              style={
                submenuPosition
                  ? { left: submenuPosition.left, top: submenuPosition.top, maxHeight: submenuPosition.maxHeight }
                  : undefined
              }
              onKeyDown={handleMenuKeyDown}
            >
              <div className="markweave-table-submenu-title">{messages.table.submenus.textColor}</div>
              {tableColorOptions.map((option) => (
                <button
                  key={`text-${option.id}`}
                  type="button"
                  role="menuitemradio"
                  aria-checked={formattingState?.textColorId === option.id}
                  data-active={formattingState?.textColorId === option.id ? "true" : "false"}
                  data-testid={`markweave-table-text-color-${option.id}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runAxisFormatting((axis) => applyTableAxisTextColor(editor, axis, option.id as TableColorId))}
                >
                  <span
                    className="markweave-table-color-swatch markweave-table-text-color-swatch"
                    aria-hidden="true"
                    style={{ backgroundColor: option.textColor ?? "var(--markweave-text)" }}
                  />
                  <span>{messages.table.colors[option.id].text}</span>
                </button>
              ))}
              <div className="markweave-table-submenu-separator" />
              <div className="markweave-table-submenu-title">{messages.table.submenus.backgroundColor}</div>
              {tableColorOptions.map((option) => (
                <button
                  key={`background-${option.id}`}
                  type="button"
                  role="menuitemradio"
                  aria-checked={formattingState?.backgroundColorId === option.id}
                  data-active={formattingState?.backgroundColorId === option.id ? "true" : "false"}
                  data-testid={`markweave-table-background-color-${option.id}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runAxisFormatting((axis) => applyTableAxisBackgroundColor(editor, axis, option.id as TableColorId))}
                >
                  <span className="markweave-table-color-swatch" aria-hidden="true" style={{ backgroundColor: option.backgroundColor }} />
                  <span>{messages.table.colors[option.id].background}</span>
                </button>
              ))}
            </div>
          ) : null}
          {openSubmenu === "alignment" && (openMenu === "row" || openMenu === "column") ? (
            <div
              ref={submenuRef}
              className="markweave-table-submenu markweave-table-alignment-menu"
              role="menu"
              aria-label={messages.table.submenus.alignment}
              data-testid="markweave-table-alignment-menu"
              data-positioned={submenuPosition ? "true" : "false"}
              data-placement={submenuPosition?.placement}
              style={
                submenuPosition
                  ? { left: submenuPosition.left, top: submenuPosition.top, maxHeight: submenuPosition.maxHeight }
                  : undefined
              }
              onKeyDown={handleMenuKeyDown}
            >
              {tableHorizontalAlignmentOptions.map((alignment) => {
                const AlignmentIcon = tableAlignmentIcons[alignment];
                const activeAlignment = formattingState?.textAlign === alignment;
                return (
                  <button
                    key={alignment}
                    type="button"
                    role="menuitemradio"
                    aria-checked={activeAlignment}
                    data-active={activeAlignment ? "true" : "false"}
                    data-testid={`markweave-table-alignment-${alignment}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runAxisFormatting((axis) => applyTableAxisAlignment(editor, axis, alignment))}
                  >
                    <AlignmentIcon aria-hidden="true" size={18} strokeWidth={1.8} />
                    <span>{messages.table.alignments[alignment]}</span>
                  </button>
                );
              })}
              <div className="markweave-table-submenu-separator" />
              {tableVerticalAlignmentOptions.map((alignment) => {
                const AlignmentIcon = tableAlignmentIcons[alignment];
                const activeAlignment = formattingState?.verticalAlign === alignment;
                return (
                  <button
                    key={alignment}
                    type="button"
                    role="menuitemradio"
                    aria-checked={activeAlignment}
                    data-active={activeAlignment ? "true" : "false"}
                    data-testid={`markweave-table-alignment-${alignment}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runAxisFormatting((axis) => applyTableAxisAlignment(editor, axis, alignment))}
                  >
                    <AlignmentIcon aria-hidden="true" size={18} strokeWidth={1.8} />
                    <span>{messages.table.alignments[alignment]}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
