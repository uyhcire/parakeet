import React from "react";
import { useMutationObserver } from "rooks";

import queryColabCellLines from "./queryColabCellLines";
import { CaretPositionInfo, NotebookType } from "./types";

/**
 * Measure the caret position in Colab.
 *
 * Works by measuring the layout of the relevant elements. This is a bit complex to do,
 * but it seems to be the only way to get the information we need. Monaco does expose
 * a `selectionStart` on the cell's textarea, but from experience it is not reliable.
 * In particular, the `selectionStart` value is often much smaller than the actual position of the caret in the cell.
 *
 * This function is not unit tested -- it relies heavily on `getBoundingClientRect(...)`, which is not available in the testing environment.
 * Instead, this function was tested manually in Colab.
 */
export const getCurrentCaretPositionInfoForColab =
  (): CaretPositionInfo | null => {
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
    const focusedCellIndex = cellFocusStates.findIndex(
      (isFocused) => isFocused
    );
    const focusedCellNode =
      document.querySelectorAll("div.cell")[focusedCellIndex];

    // Estimate the caret position by measuring the layout of the relevant elements.
    const lineNodes = queryColabCellLines(focusedCellNode);
    const lineTops = lineNodes.map(
      (lineNode) => lineNode.getBoundingClientRect().top
    );
    const caretNode = focusedCellNode.querySelector("div.cursor");
    if (caretNode == null) {
      throw new Error("Expected caret to exist when cell is focused");
    }
    const { left: caretLeft, top: caretTop } =
      caretNode.getBoundingClientRect();
    const caretLineNumber = lineTops.findIndex(
      (top) => Math.abs(top - caretTop) < 1.0 // within 1 pixel
    );
    const lineSpanRight = lineNodes[caretLineNumber]
      .querySelector("span")!
      .getBoundingClientRect().right;

    return {
      focusedCellIndex,
      focusedCellType: focusedCellNode.classList.contains("code")
        ? "CODE"
        : "TEXT",
      currentLineInfo: {
        lineNumber: caretLineNumber,
        // Empirically, this heuristic works for any line length up to at least 2000 characters or so.
        // Longer lines may result in false negatives, but that's okay, because such lines are rare
        // and users don't expect us to always show a completion.
        isAtEnd: Math.abs(caretLeft - lineSpanRight) < 3.0,
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
      .querySelector(".CodeMirror-cursor")!
      .getBoundingClientRect();

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
  notebookType: NotebookType
): CaretPositionInfo | null => {
  const [caretPositionInfo, setCaretPositionInfo] =
    React.useState<CaretPositionInfo | null>(
      notebookType === NotebookType.COLAB
        ? getCurrentCaretPositionInfoForColab()
        : getCurrentCaretPositionInfoForJupyter()
    );

  // Stay up to date with DOM additions and deletions, as well as caret movements.
  const bodyRef = React.useRef(document.body);
  const refreshCaretPosition = React.useCallback(
    (mutations: Array<MutationRecord>) => {
      if (mutations.length > 0) {
        const newCaretPositionInfo =
          notebookType === NotebookType.COLAB
            ? getCurrentCaretPositionInfoForColab()
            : getCurrentCaretPositionInfoForJupyter();
        setCaretPositionInfo(newCaretPositionInfo);
      }
    },
    [notebookType, setCaretPositionInfo]
  );
  useMutationObserver(bodyRef, refreshCaretPosition);

  return caretPositionInfo;
};

export default useCaretPositionInfo;
