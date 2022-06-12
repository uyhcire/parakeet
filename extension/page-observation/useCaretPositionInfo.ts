import React from "react";
import { useMutationObserver } from "rooks";

import { NotebookType } from "../config/useNotebookType";
import getJupyterLineContent from "./getJupyterLineContent";

/**
 * A simplified representation of "where the user is" in their notebook.
 */
export interface CaretPositionInfo {
  focusedCellIndex: number;
  selectionStart: number;
}

export const getCurrentCaretPositionInfoForColab =
  (): CaretPositionInfo | null => {
    // `focusedCellIndex`
    const cellFocusStates = [...document.querySelectorAll("div.cell")].map(
      (cell) => cell.className.split(" ").includes("focused")
    );
    if (!cellFocusStates.some((isFocused) => isFocused)) {
      // No cell is active.
      return null;
    }
    const focusedCellIndex = cellFocusStates.findIndex(
      (isFocused) => isFocused
    );

    // `selectionStart`
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

    return { focusedCellIndex, selectionStart };
  };

export const getCurrentCaretPositionInfoForJupyter =
  (): CaretPositionInfo | null => {
    // `focusedCellIndex`
    const cellFocusStates = [...document.querySelectorAll("div.cell")].map(
      (cell) => cell.className.split(" ").includes("selected")
    );
    if (!cellFocusStates.some((isFocused) => isFocused)) {
      // No cell is active.
      return null;
    }
    const focusedCellIndex = cellFocusStates.findIndex(
      (isFocused) => isFocused
    );

    if (document.querySelector(".CodeMirror-selected") != null) {
      // Don't show a completion if the user is trying to select something.
      return null;
    }

    // Unlike Colab, Jupyter does not seem to expose selectionStart at all.
    // To infer selectionStart, we measure the bounding box position of the caret,
    // and we compare it against the bounding box positions of the lines of text in the cell.

    // [1/3] Identify the relevant DOM nodes

    let lineNodes: Array<HTMLPreElement>,
      caretLineNumber: number,
      lineNode: HTMLPreElement,
      lineTextRect: DOMRect,
      caretRect: DOMRect;

    {
      const selectedCellNode = document.querySelector("div.cell.selected")!;
      lineNodes = [
        ...selectedCellNode.querySelectorAll("pre.CodeMirror-line"),
      ] as Array<HTMLPreElement>;
      caretRect = selectedCellNode
        .querySelector("textarea")!
        .parentElement!.getBoundingClientRect();
      const lineTops = lineNodes.map(
        (lineNode) => lineNode.getBoundingClientRect().top
      );
      caretLineNumber = lineTops.findIndex(
        (top) => Math.abs(top - caretRect.top) < 0.0001
      );
      if (caretLineNumber === -1) {
        throw new Error("Could not determine the line number the caret is on");
      }
      lineNode = lineNodes[caretLineNumber];
      lineTextRect = lineNode
        // As far as I can tell from the Chrome inspector, this <span> is exactly as wide as the line's text.
        .querySelector("span[role=presentation]")!
        .getBoundingClientRect();
    }

    // [2/3] Determine the caret position

    let caretPositionInLine: number;

    {
      const lineLength = getJupyterLineContent(lineNode).length;
      const characterWidth = lineTextRect.width / lineLength;
      caretPositionInLine = Math.round(
        (caretRect.left - lineTextRect.left) / characterWidth
      );
    }

    // [3/3] Compute selectionStart

    let selectionStart = 0;
    for (const [i, lineNode] of lineNodes.entries()) {
      if (i < caretLineNumber) {
        selectionStart += getJupyterLineContent(lineNode).length;
      } else if (i === caretLineNumber) {
        selectionStart += caretPositionInLine;
      } else {
        break;
      }
    }
    selectionStart += caretLineNumber; // account for newlines as well

    return { focusedCellIndex, selectionStart };
  };

/**
 * Provides the user's most up-to-date caret position.
 */
const useCaretPositionInfo = (
  notebookType: NotebookType
): CaretPositionInfo | null => {
  const [caretPositionInfo, setCaretPositionInfo] =
    React.useState<CaretPositionInfo | null>(
      getCurrentCaretPositionInfoForColab()
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
