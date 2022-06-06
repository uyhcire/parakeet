import React from "react";
import { useMutationObserver } from "rooks";

import { NOTEBOOK_TYPE } from "../config/env";

/**
 * A simplified representation of "where the user is" in their notebook.
 */
export interface CaretPositionInfo {
  focusedCellIndex: number;
  selectionStart: number;
}

export const getCurrentCaretPositionInfo = (): CaretPositionInfo | null => {
  // `focusedCellIndex`
  let cellFocusStates = [...document.querySelectorAll("div.cell")].map((cell) =>
    cell.className.split(" ").includes("focused")
  );
  if (!cellFocusStates.some((isFocused) => isFocused)) {
    // No cell is active.
    return null;
  }
  const focusedCellIndex = cellFocusStates.findIndex((isFocused) => isFocused);

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

/**
 * Provides the user's most up-to-date caret position.
 */
const useCaretPositionInfo = (): CaretPositionInfo | null => {
  if (NOTEBOOK_TYPE !== "colab") {
    throw new Error("Only Colab is supported for now");
  }

  const [caretPositionInfo, setCaretPositionInfo] =
    React.useState<CaretPositionInfo | null>(getCurrentCaretPositionInfo());

  // Stay up to date with DOM additions and deletions, as well as caret movements.
  const bodyRef = React.useRef(document.body);
  useMutationObserver(bodyRef, (mutations) => {
    if (mutations.length > 0) {
      setCaretPositionInfo(getCurrentCaretPositionInfo());
    }
  });

  return caretPositionInfo;
};

export default useCaretPositionInfo;
