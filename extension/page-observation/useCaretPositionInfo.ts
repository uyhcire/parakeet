import React from "react";
import { useMutationObserver } from "rooks";

import { CaretPositionInfo, NotebookType } from "./types";

export const getCurrentCaretPositionInfoForColab = (
  cellTexts: Array<string> | null
): CaretPositionInfo | null => {
  if (cellTexts == null) {
    return null;
  }

  // `focusedCellIndex`
  const cellFocusStates: Array<boolean> = [
    ...document.querySelectorAll("div.cell"),
  ].map((cell) =>
    Boolean(
      // Checking for `.cell.focused` is not sufficient, because it is `focused` even when the cell is merely selected and not actively being edited.
      // Checking for `.monaco-editor.focused`, on the other hand, does in fact give us what we need.
      cell.querySelector("div.monaco-editor.focused")
    )
  );
  if (!cellFocusStates.some((isFocused) => isFocused)) {
    // No cell is active.
    return null;
  }
  const focusedCellIndex = cellFocusStates.findIndex((isFocused) => isFocused);
  const focusedCellNode =
    document.querySelectorAll("div.cell")[focusedCellIndex];

  // Get the `selectionStart` of the focused cell
  const inputAreas: Array<HTMLTextAreaElement | null> = [
    ...document.querySelectorAll("div.cell"),
  ].map((cell) => cell.querySelector("textarea.inputarea"));
  // `null` if the focused cell is off-screen; in that case, it's okay to not show a completion.
  const selectionStart = inputAreas[focusedCellIndex]?.selectionStart;
  const selectionEnd = inputAreas[focusedCellIndex]?.selectionEnd;
  if (selectionStart == null || selectionEnd !== selectionStart) {
    // Don't show a completion if there is no caret, or if the user is trying to select something.
    return null;
  }

  // Use the `selectionStart` to infer line info
  const cellTextBeforeCaret = cellTexts[focusedCellIndex].slice(
    0,
    selectionStart
  );
  // https://stackoverflow.com/a/43820645
  const lineNumberInCell = cellTextBeforeCaret.match(/\n/g)?.length ?? 0;
  const cellTextAfterCaret = cellTexts[focusedCellIndex].slice(selectionStart);
  const isCaretAtEndOfLine =
    cellTextAfterCaret.length === 0 || cellTextAfterCaret[0] === "\n";

  return {
    focusedCellIndex,
    focusedCellType: focusedCellNode.classList.contains("code")
      ? "CODE"
      : "TEXT",
    currentLineInfo: {
      lineNumber: lineNumberInCell,
      isAtEnd: isCaretAtEndOfLine,
    },
  };
};

export const mockableJupyterMeasurer = {
  /**
   * Measure all the relevant element positions in a Jupyter notebook.
   *
   * These measurements are centralized in one place so as to be easier to mock.
   */
  getElementPositions: (
    focusedCellNode: Element
  ): {
    caretRect: DOMRect;
    lineRects: Array<DOMRect>;
    lineTextRects: Array<DOMRect>;
  } => {
    const lineNodes = [
      ...focusedCellNode.querySelectorAll("pre.CodeMirror-line"),
    ];
    const lineRects = lineNodes.map((node) => node.getBoundingClientRect());

    const lineTextRects = lineNodes.map((node) =>
      // As far as I can tell from the Chrome inspector, this <span> is exactly as wide as the line's text.
      node.querySelector("span[role=presentation]")!.getBoundingClientRect()
    );

    const caretRect = focusedCellNode
      .querySelector("textarea")!
      .parentElement!.getBoundingClientRect();

    return {
      caretRect,
      lineRects,
      lineTextRects,
    };
  },
};

const getJupyterLineInfo = (
  focusedCellNode: Element
): { lineNumber: number; isAtEnd: boolean } => {
  const { caretRect, lineRects, lineTextRects } =
    mockableJupyterMeasurer.getElementPositions(focusedCellNode);

  const lineTops = lineRects.map((lineRect) => lineRect.top);
  const caretLineNumber = lineTops.findIndex(
    (top) => Math.abs(top - caretRect.top) < 0.0001
  );
  if (caretLineNumber === -1) {
    throw new Error("Could not determine the line number the caret is on");
  }
  const lineTextRect = lineTextRects[caretLineNumber];

  return {
    lineNumber: caretLineNumber,
    // Unlike Colab, Jupyter does not seem to expose selectionStart at all, so we have to rely on measuring positions.
    // In practice, it is safe to assume that the caret is at the end of the line if it is within one pixel of the right edge of the line's text.
    // Even if not technically correct, it's unlikely to be a surprise to the user.
    isAtEnd: Math.abs(caretRect.left - lineTextRect.right) < 1,
  };
};

export const getCurrentCaretPositionInfoForJupyter =
  (): CaretPositionInfo | null => {
    // `focusedCellIndex`
    const cellFocusStates: Array<boolean> = [
      ...document.querySelectorAll("div.cell"),
    ].map((cell) =>
      // Checking for `.cell.focused` is not sufficient, because it is `focused` even when the cell is merely selected and not actively being edited.
      // Checking for `.CodeMirror.CodeMirror-focused`, on the other hand, does in fact give us what we need.
      Boolean(cell.querySelector("div.CodeMirror.CodeMirror-focused"))
    );
    if (!cellFocusStates.some((isFocused) => isFocused)) {
      // No cell is active.
      return null;
    }
    const focusedCellIndex = cellFocusStates.findIndex(
      (isFocused) => isFocused
    );
    const focusedCellNode =
      document.querySelectorAll("div.cell")[focusedCellIndex];

    if (document.querySelector(".CodeMirror-selected") != null) {
      // Don't show a completion if the user is trying to select something.
      return null;
    }

    return {
      focusedCellIndex,
      focusedCellType: focusedCellNode.classList.contains("code_cell")
        ? "CODE"
        : "TEXT",
      currentLineInfo: getJupyterLineInfo(focusedCellNode),
    };
  };

/**
 * Provides the user's most up-to-date caret position.
 */
const useCaretPositionInfo = (
  notebookType: NotebookType,
  cellTexts: Array<string> | null
): CaretPositionInfo | null => {
  const [caretPositionInfo, setCaretPositionInfo] =
    React.useState<CaretPositionInfo | null>(
      getCurrentCaretPositionInfoForColab(cellTexts)
    );

  // Stay up to date with DOM additions and deletions, as well as caret movements.
  const bodyRef = React.useRef(document.body);
  const refreshCaretPosition = React.useCallback(
    (mutations: Array<MutationRecord>) => {
      if (mutations.length > 0) {
        const newCaretPositionInfo =
          notebookType === NotebookType.COLAB
            ? getCurrentCaretPositionInfoForColab(cellTexts)
            : getCurrentCaretPositionInfoForJupyter();
        setCaretPositionInfo(newCaretPositionInfo);
      }
    },
    [cellTexts, notebookType, setCaretPositionInfo]
  );
  useMutationObserver(bodyRef, refreshCaretPosition);

  return caretPositionInfo;
};

export default useCaretPositionInfo;
