import React from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { useIntervalWhen, useMutationObserver } from "rooks";

// TODO: add Jupyter support
const NOTEBOOK_TYPE = "colab";

/**
 * A simplified representation of "where the user is" in their notebook.
 */
interface CursorPositionInfo {
  focusedCellIndex: number;
  selectionStart: number;
}

/**
 * Provides the user's most up-to-date cursor position.
 */
const useCursorPositionInfo = (): CursorPositionInfo | null => {
  if (NOTEBOOK_TYPE !== "colab") {
    throw new Error("Only Colab is supported for now");
  }

  // Hook into the currently-focused cell's index and the `selectionStart`
  const getCurrentCursorPositionInfo = (): CursorPositionInfo | null => {
    // `focusedCellIndex`
    let cellFocusStates = [
      ...document.querySelectorAll("colab-run-button"),
    ].map((cellRunButton) =>
      // This will yield `false` if the cell is off-screen and virtualized. It's safe to assume that such a cell is not focused.
      Boolean(
        cellRunButton.shadowRoot
          ?.querySelector("div.cell-execution")
          ?.classList.contains("focused")
      )
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
      // Don't show a completion if there is no cursor, or if the user is trying to select something.
      return null;
    }

    return { focusedCellIndex, selectionStart };
  };
  const [cursorPositionInfo, setCursorPositionInfo] =
    React.useState<CursorPositionInfo | null>(getCurrentCursorPositionInfo());

  // Stay up to date with DOM additions and deletions, as well as caret movements.
  const bodyRef = React.useRef(document.body);
  useMutationObserver(bodyRef, (mutations) => {
    if (mutations.length > 0) {
      setCursorPositionInfo(getCurrentCursorPositionInfo());
    }
  });

  return cursorPositionInfo;
};

/**
 * Parse Colab's DOM structure to extract the text of each cell.
 *
 * The main complication is that Colab "virtualizes" its cells.
 * Off-screen cells are rendered differently, and we must account for that.
 */
const extractColabCellTexts = (): Array<string> => {
  return [...document.querySelectorAll("div.lazy-editor")].map(
    (cellEditor): string => {
      let visible = Boolean(cellEditor.querySelector(".monaco"));
      if (visible) {
        return [...cellEditor.querySelectorAll(".view-line")]
          .map(({ textContent }) => textContent)
          .join("\n");
      } else {
        const contentNode = cellEditor.querySelector(
          "pre.lazy-virtualized > pre.monaco-colorized"
        );
        if (!contentNode) {
          throw new Error(
            'Expected each off-screen non-rendered cell to have a <pre class="lazy-virtualized..."> element'
          );
        }

        let cellValue = "";
        for (const subNode of contentNode.children) {
          if (subNode.tagName === "SPAN") {
            cellValue += subNode.textContent;
          } else if (subNode.tagName === "BR") {
            cellValue += "\n";
          } else {
            throw new Error(`Unexpected tag type '${subNode.tagName}'`);
          }
        }
        return cellValue;
      }
    }
  );
};

const getCompletionPrompt = (
  cursorPositionInfo: CursorPositionInfo
): string => {
  if (NOTEBOOK_TYPE !== "colab") {
    throw new Error("Only Colab is supported for now");
  }

  // Extract the text in each cell
  let cellTexts = extractColabCellTexts();

  // Ignore everything after the user's cursor
  const { focusedCellIndex, selectionStart } = cursorPositionInfo;
  cellTexts = cellTexts.filter((_, i) => i <= focusedCellIndex);
  cellTexts[focusedCellIndex] = cellTexts[focusedCellIndex].slice(
    0,
    selectionStart
  );

  // Separate the text from different cells. The separator is arbitrary.
  return cellTexts.join("\n\n########################################\n\n");
};

/**
 * Show a completion next to the cursor in the currently active cell.
 *
 * The completion is added to the DOM as a direct child of the <body>.
 * It could instead be inserted right into the DOM of the cell, but this is very tricky to do for Monaco,
 * because Monaco errors and stops displaying anything if you mutate the parts of the DOM that it is managing.
 */
const Completion = (): JSX.Element | null => {
  // The selectors we're using are all Colab-specific. To support Jupyter, we'll need to rewrite much of this component's code.
  if (NOTEBOOK_TYPE !== "colab") {
    throw new Error("Only Colab is supported for now");
  }

  // Extract all the cell text that comes before the user's cursor
  const cursorPositionInfo: CursorPositionInfo | null = useCursorPositionInfo();
  const [promptLength, setPromptLength] = React.useState<number | null>(null);
  useIntervalWhen(() => {
    if (!cursorPositionInfo) {
      // No cell is active, so we can't show a completion.
      return;
    }
    setPromptLength(getCompletionPrompt(cursorPositionInfo)?.length ?? null);
  }, 1000);

  // Locate the notebook's main content, so that the displayed completion can be positioned relative to it.
  const bodyRef = React.useRef(document.body);
  const notebookScrollContainerRef = React.useRef(
    document.querySelector("div.notebook-content")
  );
  useMutationObserver(bodyRef, (mutations) => {
    if (notebookScrollContainerRef.current) {
      return; // we already know where the scroll container is
    }
    if (mutations.length > 0 && mutations[0].type === "childList") {
      notebookScrollContainerRef.current = document.querySelector(
        "div.notebook-content"
      );
    }
  });

  if (!cursorPositionInfo) {
    // No cell is active, so we can't show a completion.
    return null;
  }
  const { focusedCellIndex } = cursorPositionInfo;

  const cursorRect = [
    // `focusedCellIndex` is inclusive of cells that are off the screen, so need to query for `div.cell` in order to include off-screen cells and not just on-screen ones
    ...document.querySelectorAll("div.cell"),
  ][focusedCellIndex]
    .querySelector(".cursor.monaco-mouse-cursor-text")!
    .getBoundingClientRect();
  const cursorX = cursorRect.x;
  const cursorY = cursorRect.y;
  const notebookScrollContainerRect = document
    .querySelector("div.notebook-content")!
    .getBoundingClientRect();

  return !notebookScrollContainerRef.current
    ? null // there is nowhere to put the completion yet
    : createPortal(
        <span
          style={{
            position: "absolute",
            // The completion is positioned relative to the notebook content's scroll container, rather than the whole viewport.
            // This way, the completion will move naturally with the page content as you scroll.
            left: `${cursorX - notebookScrollContainerRect.x}px`,
            top: `${cursorY - notebookScrollContainerRect.y}px`,
            zIndex: 1,
          }}
        >
          {promptLength} character(s) in prompt
        </span>,
        notebookScrollContainerRef.current
      );
};

const rootNode = document.createElement("div");
rootNode.setAttribute("id", "parakeet-root");
document.body.appendChild(rootNode);
const root = createRoot(document.getElementById("parakeet-root")!);
root.render(<Completion />);
