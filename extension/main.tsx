import React, { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { useDebounce, useEventListenerRef, useMutationObserver } from "rooks";

// TODO: add Jupyter support
const NOTEBOOK_TYPE = "colab";

/**
 * A simplified representation of "where the user is" in their notebook.
 */
interface CaretPositionInfo {
  focusedCellIndex: number;
  selectionStart: number;
}

/**
 * Provides the user's most up-to-date caret position.
 */
const useCaretPositionInfo = (): CaretPositionInfo | null => {
  if (NOTEBOOK_TYPE !== "colab") {
    throw new Error("Only Colab is supported for now");
  }

  // Hook into the currently-focused cell's index and the `selectionStart`
  const getCurrentCaretPositionInfo = (): CaretPositionInfo | null => {
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
      // Don't show a completion if there is no caret, or if the user is trying to select something.
      return null;
    }

    return { focusedCellIndex, selectionStart };
  };
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

/**
 * Provides the text value of each Colab cell. The text values are extracted by parsing Colab's DOM structure.
 *
 * The main complication is that Colab "virtualizes" its cells.
 * Off-screen cells are rendered differently, and we must account for that.
 */
const useColabCellTexts = (): Array<string> | null => {
  if (NOTEBOOK_TYPE !== "colab") {
    throw new Error("Only Colab is supported for now");
  }

  const [cellTexts, setCellTexts] = React.useState<Array<string> | null>(null);

  // Stay up to date with DOM additions and deletions, as well as caret movements.
  const bodyRef = React.useRef(document.body);
  useMutationObserver(bodyRef, (mutations) => {
    if (mutations.length > 0) {
      setCellTexts(
        (() =>
          [...document.querySelectorAll("div.lazy-editor")].map(
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
          ))()
      );
    }
  });

  return cellTexts;
};

const useDebouncedLMCompletion = (prompt: string | null) => {
  const [completion, setCompletion] = React.useState<string | null>(null);

  const doRequestCompletion = React.useCallback(
    async (prompt_: string) => {
      const completionResponse = await fetch(
        "https://api.goose.ai/v1/engines/gpt-j-6b/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.API_KEY}`,
          },
          body: JSON.stringify({
            prompt: prompt_,
            max_tokens: 80,
            temperature: 0.0,
            stop: ["\n"],
          }),
        }
      );
      setCompletion(
        (await completionResponse.json()).choices[0].text.split("\n")[0]
      );
    },
    [setCompletion]
  );
  const doRequestCompletionDebounced = useDebounce(doRequestCompletion, 1000);
  React.useEffect(() => {
    setCompletion(null);
    if (prompt != null) {
      doRequestCompletionDebounced(prompt);
    }
  }, [doRequestCompletionDebounced, prompt]);

  return completion;
};

/**
 * Show a completion next to the caret in the currently active cell.
 *
 * The completion is absolutely positioned, outside of the cell's DOM tree.
 * It could instead be inserted right into the DOM of the cell, but this is very tricky to do for Monaco,
 * because Monaco errors and stops displaying anything if you mutate the parts of the DOM that it is managing.
 *
 * The completion must be positioned and styled carefully, so that it can blend in well with the cell's existing code.
 */
const Completion = ({
  focusedCellIndex,
  lineNumberInCell,

  text,
}: {
  focusedCellIndex: number;
  lineNumberInCell: number;

  text: string;
}) => {
  if (NOTEBOOK_TYPE !== "colab") {
    throw new Error("Only Colab is supported for now");
  }

  const lineNode = document
    .querySelectorAll("div.cell") // `focusedCellIndex` is inclusive of cells that are off the screen, so need to query for `div.cell` in order to include off-screen cells and not just on-screen ones
    [focusedCellIndex].querySelectorAll("div.view-line")[lineNumberInCell];
  const lineComputedStyle = getComputedStyle(lineNode);

  if (
    lineNode.children.length !== 1 ||
    lineNode.children[0].tagName !== "SPAN"
  ) {
    throw new Error("Expected every Monaco line to have one top-level span");
  }
  // This could theoretically get out of date, but over a day or so of testing I haven't seen that happen at all.
  const lineSpanRect = lineNode.children[0].getBoundingClientRect();

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
  if (notebookScrollContainerRef.current == null) {
    // There is nowhere to put the completion yet
    return null;
  }
  const notebookScrollContainerRect =
    notebookScrollContainerRef.current.getBoundingClientRect();

  return createPortal(
    <div
      style={{
        /* Appearance */

        color: "gray", // looks pretty good in Colab, but may need to be different for Jupyter

        fontFamily: lineComputedStyle.fontFamily,
        fontFeatureSettings: lineComputedStyle.fontFeatureSettings,
        fontSize: lineComputedStyle.fontSize,
        height: lineComputedStyle.height,
        letterSpacing: lineComputedStyle.letterSpacing,
        lineHeight: lineComputedStyle.lineHeight,
        whiteSpace: "pre",

        /* Positioning */

        position: "absolute",
        // The completion is positioned relative to the notebook content's scroll container, rather than the whole viewport.
        // This way, the completion will move naturally with the page content as you scroll.
        // The last term is needed to adjust for the container's margin.
        left: `calc(${lineSpanRect.right}px - ${
          notebookScrollContainerRect.left
        }px + ${
          getComputedStyle(notebookScrollContainerRef.current).marginLeft
        }`,
        // The last term is needed because for some reason, this `top` specifies the top of the text, not the top of the div.
        top: `calc(${lineSpanRect.top}px
          - ${notebookScrollContainerRect.top}px
          + ${lineComputedStyle.height} - ${lineComputedStyle.fontSize})`,
        zIndex: 1,
      }}
    >
      {text}
    </div>,
    notebookScrollContainerRef.current
  );
};

const Inserter = ({
  focusedCellIndex,
  completion,
}: {
  focusedCellIndex: number;
  completion: string;
}) => {
  if (NOTEBOOK_TYPE !== "colab") {
    throw new Error("Only Colab is supported for now");
  }

  const ref = useEventListenerRef("keydown", function (e: KeyboardEvent) {
    if (
      e.key === "Tab" &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.shiftKey
    ) {
      // Although `execCommand` is deprecated, it is the best option we have, and it is unlikely to go away any time soon.
      // See: https://stackoverflow.com/questions/60581285/execcommand-is-now-obsolete-whats-the-alternative
      document.execCommand(
        "insertText",
        false /* doesn't matter */,
        completion
      );
      e.preventDefault(); // keep the cell focused
      e.stopPropagation(); // don't actually type a Tab in the cell
    }
  });
  const updateCaretRef = React.useCallback(() => {
    const inputAreas: Array<HTMLTextAreaElement | null> = [
      ...document.querySelectorAll("div.cell"),
    ].map((cell) => cell.querySelector("textarea.inputarea"));
    ref(inputAreas[focusedCellIndex]);
  }, [focusedCellIndex, ref]);
  // Stay up to date with DOM additions and deletions, as well as caret movements.
  const bodyRef = React.useRef(document.body);
  useMutationObserver(bodyRef, (mutations) => {
    if (mutations.length > 0) {
      updateCaretRef();
    }
  });
  React.useEffect(() => {
    updateCaretRef();
  }, [focusedCellIndex, updateCaretRef]);

  return null;
};

/**
 * Top-level controller for Parakeet.
 *
 * Displays a completion when appropriate, and inserts the completion into the cell if the user confirms.
 */
const Parakeet = (): JSX.Element | null => {
  // The selectors we're using are all Colab-specific. To support Jupyter, we'll need to rewrite much of this component's code.
  if (NOTEBOOK_TYPE !== "colab") {
    throw new Error("Only Colab is supported for now");
  }

  // Extract the text of each cell and the position of the user's caret
  const cellTexts = useColabCellTexts();
  const caretPositionInfo: CaretPositionInfo | null = useCaretPositionInfo();

  let completionText = useDebouncedLMCompletion(
    // Prompt:
    ((): string | null => {
      // Don't request a completion if we don't know what's before the caret
      if (caretPositionInfo == null || cellTexts == null) {
        return null;
      }

      // Don't request a completion if the caret is in the middle of a line
      const cellTextAfterCaret = cellTexts[
        caretPositionInfo.focusedCellIndex
      ].slice(caretPositionInfo.selectionStart);
      const isCaretAtEndOfLine =
        cellTextAfterCaret.length === 0 || cellTextAfterCaret[0] === "\n";
      if (!isCaretAtEndOfLine) {
        return null;
      }

      const { focusedCellIndex } = caretPositionInfo;

      let prompt = "";
      cellTexts?.forEach((cellText, i) => {
        if (i < focusedCellIndex) {
          prompt += cellText;
        } else if (i === focusedCellIndex) {
          prompt += cellText.slice(0, caretPositionInfo.selectionStart);
        } else {
          // i > focusedCellIndex
          return;
        }
      });

      return prompt;
    })()
  );
  if (completionText != null) {
    // For some reason, GPT-J sometimes likes to use non-breaking spaces instead of regular spaces.
    // We need to replace those spaces, or else the user will run into syntax errors.
    // Snippet is from https://stackoverflow.com/a/1496863
    completionText = completionText.replace(/\u00a0/g, " ");
  }

  if (
    // Bail if there is no completion to show
    completionText == null ||
    completionText == "" ||
    // Bail if there is not enough information to position the completion
    caretPositionInfo == null ||
    cellTexts == null
  ) {
    return null;
  }

  const cellTextBeforeCaret = cellTexts[
    caretPositionInfo.focusedCellIndex
  ].slice(0, caretPositionInfo.selectionStart);
  // https://stackoverflow.com/a/43820645
  const lineNumberInCell = cellTextBeforeCaret.match(/\n/g)?.length ?? 0;

  return (
    <>
      <Completion
        focusedCellIndex={caretPositionInfo.focusedCellIndex}
        lineNumberInCell={lineNumberInCell}
        text={completionText}
      />
      <Inserter
        focusedCellIndex={caretPositionInfo.focusedCellIndex}
        completion={completionText}
      />
    </>
  );
};

const rootNode = document.createElement("div");
rootNode.setAttribute("id", "parakeet-root");
document.body.appendChild(rootNode);
const root = createRoot(document.getElementById("parakeet-root")!);
root.render(<Parakeet />);
