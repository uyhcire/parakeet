import React, { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { useDebounce, useEventListenerRef, useMutationObserver } from "rooks";
import { Alert, Snackbar } from "@mui/material";
// @ts-ignore
import useOnlineStatus from "@rehooks/online-status";

import { NOTEBOOK_TYPE } from "./config/env";
import Engine from "./engine";
import useCaretPositionInfo, {
  CaretPositionInfo,
} from "./page-observation/useCaretPositionInfo";
import useCellTexts from "./page-observation/useCellTexts";

/**
 * Reduce network errors by only mounting the given component when the browser can connect to the Internet.
 */
const OnlyIfOnline = ({
  children,
}: {
  children: JSX.Element;
}): JSX.Element | null => {
  const isOnline = useOnlineStatus();

  return isOnline ? children : null;
};

const useDebouncedLMCompletion = (
  prompt: string | null
): string | null | { error: "SERVER_ERROR" } => {
  const [completion, setCompletion] = React.useState<
    string | null | { error: "SERVER_ERROR" }
  >(null);

  const [apiKey, setApiKey] = React.useState<string | null>(null);
  // Initial value
  React.useEffect(() => {
    chrome.storage.sync.get("PARAKEET_API_KEY", (items) => {
      setApiKey(items["PARAKEET_API_KEY"] ?? null);
    });
  }, []);
  // If the API key is updated while this content script is running,
  // the new API key should be usable without refreshing the page.
  type StorageChangeCallback = Parameters<
    typeof chrome.storage.onChanged.addListener
  >[0];
  const onStorageChanged = React.useCallback<StorageChangeCallback>(
    (changes) => {
      const newApiKey: string | null =
        changes["PARAKEET_API_KEY"]?.newValue ?? null;
      if (newApiKey != null && apiKey == null) {
        setApiKey(newApiKey);
      }
    },
    [apiKey, setApiKey]
  );
  React.useEffect(() => {
    chrome.storage.onChanged.addListener(onStorageChanged);
    return () => {
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, [onStorageChanged]);

  const engine = new Engine();

  const doRequestCompletion = React.useCallback(
    async (prompt_: string) => {
      if (apiKey == null) {
        return;
      }

      // At least with GPT-J, an empty prompt results in a tokenization error.
      // So if the prompt is empty, we shouldn't try to request a completion.
      if (prompt_ === "") {
        return;
      }

      const newCompletion = await engine.requestLineCompletion(apiKey, prompt_);
      setCompletion(newCompletion);
    },
    [setCompletion, apiKey]
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
  const cellTexts = useCellTexts();
  const caretPositionInfo: CaretPositionInfo | null = useCaretPositionInfo();

  const maybeCompletionText = useDebouncedLMCompletion(
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
          prompt += "\n\n";
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
  if (
    typeof maybeCompletionText === "object" &&
    maybeCompletionText?.error === "SERVER_ERROR"
  ) {
    // The user may no longer have access to their language model provider.
    // For example, they may have exceeded their quota for the billing period.
    return (
      <Snackbar
        open={true}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error">
          Parakeet error: our request was rejected by the language model
          provider! You may want to check if you still have access.
        </Alert>
      </Snackbar>
    );
  }

  if (
    // Bail if there is no completion to show
    maybeCompletionText == null ||
    maybeCompletionText == "" ||
    // Bail if there is not enough information to position the completion
    caretPositionInfo == null ||
    cellTexts == null
  ) {
    return null;
  }

  const completionText = maybeCompletionText as string;

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
root.render(
  <OnlyIfOnline>
    <Parakeet />
  </OnlyIfOnline>
);
