import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  setMarkweaveTableMenuAxisTarget,
  type MarkweaveMenuCopyPayload,
} from "../../../plugins/table/table-clipboard";
import { type TableCommandId } from "../../../plugins/table/table-command-spec";
import { getTableFocusState } from "../../../plugins/table/table-focus-state";
import {
  initialTableInteractionState,
  type TableInteractionState,
} from "../../../plugins/table/table-interaction-layer";
import {
  calculateAnchoredTableMenuPosition,
  calculateTableControlsPosition,
  calculateTableEdgeHandlePosition,
  calculateTableMenuPosition,
  canRunTableCommand,
  executeTableMenuCommand,
  formatTableCopyFeedback,
  getActiveTableElement,
  getAvailableCellMenuCommandSpecs,
  getTableAxisTargetRect,
  getTableAxisSelectionModel,
  getTableControlAxisSelectionModel,
  getTableCommandSnapshot,
  getTableCopyFeedbackSnapshot,
  getTableEditWithAiRequest,
  getTableMenuItemGroup,
  getTableMenuItemLabel,
  getTableMenuItems,
  getTableSelectionTargetRect,
  runTableCommand,
  selectTableAxisFromCell,
  tableCopyFeedbackTimeoutMs,
  tableMenuLabel,
  writeMarkweaveMenuPayloadToClipboard,
  type TableCopyFeedbackSnapshot,
  type TableEdgeHandlePosition,
  type TableMenuAnchor,
  type TableMenuKind,
  type TableMenuPosition,
} from "../../../plugins/table/table-ui-model";
import { getMarkweaveMessages, type MarkweaveMessages } from "../../../i18n";
import type { TableCommandResult, TableEditWithAiRequest } from "../../../core/public-types";

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
}

const defaultTableMessages = getMarkweaveMessages("zh");

export function TableControls({
  active,
  editor,
  interactionState = initialTableInteractionState,
  messages = defaultTableMessages,
  onCopyPayload,
  onCommandResult,
  onEditWithAi,
}: TableControlsProps) {
  const [openMenu, setOpenMenu] = useState<TableMenuKind | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<TableMenuAnchor>("row-edge");
  const [menuPosition, setMenuPosition] = useState<TableMenuPosition | null>(null);
  const [rowEdgePosition, setRowEdgePosition] = useState<TableEdgeHandlePosition | null>(null);
  const [columnEdgePosition, setColumnEdgePosition] = useState<TableEdgeHandlePosition | null>(null);
  const [selectionEdgePosition, setSelectionEdgePosition] = useState<TableEdgeHandlePosition | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<TableCopyFeedbackSnapshot | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
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

  useLayoutEffect(() => {
    if (!active) {
      setRowEdgePosition(null);
      setColumnEdgePosition(null);
      setSelectionEdgePosition(null);
      setCopyFeedback(null);
      return undefined;
    }

    const updateEdgePositions = () => {
      const frameElement = editor.view.dom.closest<HTMLElement>(".markweave-editor-frame") ?? editor.view.dom.parentElement;
      const rowAxisModel = getTableControlAxisSelectionModel(editor, interactionState, "row", focusState?.activeCellPos ?? null);
      const columnAxisModel = getTableControlAxisSelectionModel(editor, interactionState, "column", focusState?.activeCellPos ?? null);
      const rowAxisRect = rowAxisModel ? getTableAxisTargetRect(editor, rowAxisModel) : null;
      const columnAxisRect = columnAxisModel ? getTableAxisTargetRect(editor, columnAxisModel) : null;
      const selectionRect = getAvailableCellMenuCommandSpecs(editor).length > 0 ? getTableSelectionTargetRect(editor) : null;

      if (!frameElement) {
        setRowEdgePosition(null);
        setColumnEdgePosition(null);
        setSelectionEdgePosition(null);
        return;
      }

      const frameRect = frameElement.getBoundingClientRect();

      if (rowAxisRect) {
        setRowEdgePosition(
          calculateTableEdgeHandlePosition({
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
          calculateTableEdgeHandlePosition({
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
          calculateTableEdgeHandlePosition({
            targetRect: selectionRect,
            frameRect,
            kind: "selection",
          }),
        );
      } else if (!(openMenu === "selection" && menuAnchor === "selection-edge")) {
        setSelectionEdgePosition(null);
      }
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
      const anchorMenuPosition = calculateAnchoredTableMenuPosition({
        anchorRect,
        frameRect,
        menuSize: {
          width: menuRect.width || 204,
          height: menuRect.height || 220,
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

  useEffect(() => {
    if (!active || !openMenu) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setOpenMenu(null);
      editor.view.focus();
    };

    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (event.target instanceof Node && controlsRef.current?.contains(event.target)) {
        return;
      }

      setOpenMenu(null);
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsidePointer);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsidePointer);
    };
  }, [active, editor, openMenu]);

  if (!active) {
    return null;
  }

  const toggleMenu = (menu: TableMenuKind, anchor: TableMenuAnchor) => {
    const shouldClose = openMenu === menu && menuAnchor === anchor;
    setMenuAnchor(anchor);
    setOpenMenu(shouldClose ? null : menu);
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
  const cellMenuCommands = getAvailableCellMenuCommandSpecs(editor);
  const hasCellMenuCommands = cellMenuCommands.length > 0;
  const menuItems = openMenu ? getTableMenuItems(editor, openMenu) : [];
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

  const runEditWithAi = (source: TableEditWithAiRequest["source"]) => {
    const request = getTableEditWithAiRequest(editor, source);

    if (request) {
      onEditWithAi?.(request);
    }

    setOpenMenu(null);
    editor.view.focus();
  };

  return (
    <div
      ref={controlsRef}
      className="markweave-table-controls"
      data-testid="markweave-table-controls"
      aria-label={messages.table.controlsAriaLabel}
      data-open-menu={openMenu ?? "none"}
      data-positioned={rowEdgePosition || columnEdgePosition || selectionEdgePosition ? "true" : "false"}
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
          style={{ left: rowEdgePosition.left, top: rowEdgePosition.top }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            openAxisMenuFromEdge("row", "row-edge");
          }}
        >
          <span aria-hidden="true">...</span>
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
          style={{ left: columnEdgePosition.left, top: columnEdgePosition.top }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            openAxisMenuFromEdge("column", "column-edge");
          }}
        >
          <span aria-hidden="true">...</span>
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
          style={{ left: selectionEdgePosition.left, top: selectionEdgePosition.top }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openSelectionMenuFromEdge}
        >
          <span aria-hidden="true">...</span>
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
          style={menuPosition ? { left: menuPosition.left, top: menuPosition.top } : undefined}
        >
          {menuItems.map((item, index) => {
            const group = getTableMenuItemGroup(item);
            const previousGroup = index === 0 ? group : getTableMenuItemGroup(menuItems[index - 1]);
            const startsGroup = index > 0 && previousGroup !== group;
            const enabled = item.commandId === null ? Boolean(onEditWithAi) : canRunTableCommand(editor, item.commandId);
            const label = getTableMenuItemLabel(item, messages);

            return (
              <button
                key={`${item.id}-${index}`}
                type="button"
                role="menuitem"
                aria-label={label}
                aria-disabled={!enabled}
                disabled={!enabled}
                data-menu-group={group}
                data-starts-group={startsGroup ? "true" : "false"}
                data-command-enabled={enabled ? "true" : "false"}
                data-testid={
                  item.commandId
                    ? `markweave-table-menu-command-${item.commandId}`
                    : `markweave-table-menu-command-edit-with-ai`
                }
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (!enabled) {
                    return;
                  }

                  if (item.commandId === null) {
                    runEditWithAi(openMenu === "row" || openMenu === "column" ? openMenu : "selection");
                    return;
                  }

                  void runMenuCommand(item.commandId).finally(() => setOpenMenu(null));
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
