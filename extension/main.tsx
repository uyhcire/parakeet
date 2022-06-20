import { SnackbarProvider, useSnackbar } from "notistack";
import React, { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  useDebounce,
  useEventListenerRef,
  useMutationObserver,
  useOnline,
} from "rooks";
import { Link, Zoom } from "@mui/material";

import config from "./config.json";
import useCaretPositionInfo, {
  CaretPositionInfo,
} from "./page-observation/useCaretPositionInfo";
import useCellTexts from "./page-observation/useCellTexts";
import useNotebookType, { NotebookType } from "./page-observation/useNotebookType";

const useAccessToken = (): {
  accessToken: string | null;
  invalidateAccessToken: () => void;
} => {
  const [accessToken, setAccessToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    chrome.storage.sync.get(["auth0AccessToken"], (result) => {
      setAccessToken(result.auth0AccessToken);
    });
  }, []);

  React.useEffect(() => {
    const listener = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if ("auth0AccessToken" in changes) {
        // If the user logs in, this will make their access token available to Parakeet.
        // If the user logs out, this will take Parakeet's access token away.
        setAccessToken(changes.auth0AccessToken.newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const invalidateAccessToken = React.useCallback(() => {
    setAccessToken(null);
  }, []);

  return {
    accessToken,
    invalidateAccessToken,
  };
};

/**
 * Reduce network errors by only mounting the given component when the browser can connect to the Internet.
 */
const OnlyIfOnline = ({
  children,
}: {
  children: JSX.Element;
}): JSX.Element | null => {
  const isOnline = useOnline();

  return isOnline ? children : null;
};

const NotebookTypeProvider = ({
  children,
}: {
  children: (notebookType: NotebookType) => JSX.Element;
}): JSX.Element | null => {
  const notebookType = useNotebookType();

  return notebookType != null ? children(notebookType) : null;
};

const useDebouncedLMCompletion = ({
  accessToken,
  invalidateAccessToken,
  prompt,
}: {
  accessToken: string | null;
  invalidateAccessToken: () => void;
  prompt: string | null;
}): string | null => {
  const { enqueueSnackbar } = useSnackbar();

  const [completion, setCompletion] = React.useState<string | null>(null);

  const doRequestCompletion = React.useCallback(
    async (prompt_: string, startTimePreDebounce: Date) => {
      if (accessToken == null) {
        return;
      }

      // Empty prompts are not likely to give good results.
      if (prompt_ === "") {
        return;
      }

      const response = await fetch(`https://${config.flyio_domain}/codex`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ prompt: prompt_ }),
      });

      switch (response.status) {
        case 200: {
          const { completion: newCompletion } = await response.json();

          console.log(
            `Parakeet: LM request (including the wait for debouncing) took ${
              new Date().getTime() - startTimePreDebounce.getTime()
            }ms`
          );

          setCompletion(newCompletion);

          return;
        }
        case 401: {
          invalidateAccessToken();
          enqueueSnackbar(
            <span>
              You must{" "}
              <Link
                onClick={() => {
                  chrome.runtime.sendMessage("signIn");
                }}
              >
                sign in
              </Link>{" "}
              (or sign back in) to use Parakeet.
            </span>,
            { variant: "warning", persist: true }
          );
          return;
        }
        case 429: {
          enqueueSnackbar(
            "Parakeet completions will be available again in a few moments.",
            { variant: "info" }
          );
          return;
        }
        default:
          enqueueSnackbar(
            <span>
              Parakeet ran into an unexpected error. If this continues, you can
              file an issue{" "}
              <Link href="https://github.com/uyhcire/parakeet/issues/new/choose">
                on GitHub
              </Link>
              .
            </span>,
            { variant: "error" }
          );
          return;
      }
    },
    [accessToken, enqueueSnackbar, invalidateAccessToken, setCompletion]
  );
  const doRequestCompletionDebounced = useDebounce(doRequestCompletion, 500);
  React.useEffect(() => {
    setCompletion(null);
    if (prompt != null) {
      const startTimePreDebounce = new Date();
      doRequestCompletionDebounced(prompt, startTimePreDebounce);
    }
  }, [doRequestCompletionDebounced, prompt]);

  return completion;
};

interface LineDisplayInfo {
  computedStyle: CSSStyleDeclaration;
  right: number;
  top: number;
}

const useLineDisplayInfo = (
  notebookType: NotebookType,
  focusedCellIndex: number,
  lineNumberInCell: number
): LineDisplayInfo => {
  const getLineDisplayInfo = React.useCallback((): LineDisplayInfo => {
    let lineNode;
    if (notebookType === NotebookType.COLAB) {
      const cellNode = document.querySelectorAll("div.cell")[focusedCellIndex]; // `focusedCellIndex` is inclusive of cells that are off the screen, so need to query for `div.cell` in order to include off-screen cells and not just on-screen ones
      lineNode = cellNode.querySelectorAll("div.view-line")[lineNumberInCell];
    } else if (notebookType === NotebookType.JUPYTER) {
      const cellNode = document.querySelectorAll("div.cell")[focusedCellIndex];
      lineNode = cellNode.querySelectorAll("pre.CodeMirror-line")[
        lineNumberInCell
      ];
    } else {
      throw new Error(`Unknown notebook type ${notebookType}`);
    }
    const computedStyle = getComputedStyle(lineNode);

    let lineSpanRect: DOMRect;
    if (notebookType === NotebookType.COLAB) {
      if (
        lineNode.children.length !== 1 ||
        lineNode.children[0].tagName !== "SPAN"
      ) {
        throw new Error(
          "Expected every Monaco line to have one top-level span"
        );
      }
      lineSpanRect = lineNode.children[0].getBoundingClientRect();
    } else if (notebookType === NotebookType.JUPYTER) {
      lineSpanRect = lineNode
        .querySelector("span[role=presentation]")!
        .getBoundingClientRect();
    } else {
      throw new Error(`Unknown notebook type ${notebookType}`);
    }
    const { right, top } = lineSpanRect;

    return { computedStyle, right, top };
  }, [focusedCellIndex, lineNumberInCell, notebookType]);

  const [lineDisplayInfo, setLineDisplayInfo] = React.useState<LineDisplayInfo>(
    getLineDisplayInfo()
  );

  React.useEffect(() => {
    setLineDisplayInfo(getLineDisplayInfo());
  }, [getLineDisplayInfo, setLineDisplayInfo]);

  // This mutation observer is rather aggressive,
  // but it doesn't seem to lower the overall framerate too much.
  const bodyRef = React.useRef(document.body);
  useMutationObserver(bodyRef, (mutations) => {
    if (mutations.length > 0) {
      setLineDisplayInfo(getLineDisplayInfo());
    }
  });

  return lineDisplayInfo;
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
  notebookType,

  focusedCellIndex,
  lineNumberInCell,

  text,
}: {
  notebookType: NotebookType;

  focusedCellIndex: number;
  lineNumberInCell: number;

  text: string;
}) => {
  const {
    computedStyle: lineComputedStyle,
    right: lineRight,
    top: lineTop,
  } = useLineDisplayInfo(notebookType, focusedCellIndex, lineNumberInCell);

  // Locate the notebook's main content, so that the displayed completion can be positioned relative to it.
  let notebookScrollContainerSelector: string;
  if (notebookType === NotebookType.COLAB) {
    notebookScrollContainerSelector = "div.notebook-content";
  } else if (notebookType === NotebookType.JUPYTER) {
    notebookScrollContainerSelector = 'div[id="notebook-container"]';
  } else {
    throw new Error(`Unknown notebook type ${notebookType}`);
  }
  const bodyRef = React.useRef(document.body);
  const notebookScrollContainerRef = React.useRef(
    document.querySelector(notebookScrollContainerSelector)
  );
  useMutationObserver(bodyRef, (mutations) => {
    if (notebookScrollContainerRef.current) {
      return; // we already know where the scroll container is
    }
    if (mutations.length > 0 && mutations[0].type === "childList") {
      notebookScrollContainerRef.current = document.querySelector(
        notebookScrollContainerSelector
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
      data-parakeet="completion"
      style={{
        /* Appearance */

        color: "gray", // this looks good in both Colab (in dark mode) and Jupyter

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
        left: `calc(${lineRight}px - ${notebookScrollContainerRect.left}px + ${
          getComputedStyle(notebookScrollContainerRef.current).marginLeft
        }`,
        // To debug the positioning, compare the top of the completion ([data-parakeet=completion]) to the top of the line.
        // For example, in Jupyter, the line's DOM node is `document.querySelectorAll("div.cell")[...].querySelectorAll("pre.CodeMirror-line")[...].querySelector("span[role=presentation]")`.
        top: (() => {
          if (notebookType === NotebookType.COLAB) {
            // This formula works, but I have no idea why.
            return (
              "calc(" +
              [
                `${lineTop}px`,
                `- ${notebookScrollContainerRect.top}px`,
                `+ ${lineComputedStyle.height}`,
                `- ${lineComputedStyle.fontSize}`,
              ].join(" ") +
              ")"
            );
          } else if (notebookType === NotebookType.JUPYTER) {
            // This formula works, but I have no idea why.
            return (
              "calc(" +
              [
                `${lineTop}px`,
                `- ${notebookScrollContainerRect.top}px`,
                `+ ${lineComputedStyle.height}`,
                // Why does Jupyter need this extra term, while Colab doesn't?
                `+ ${lineComputedStyle.height}`,
                `- ${lineComputedStyle.fontSize}`,
              ].join(" ") +
              ")"
            );
          } else {
            throw new Error(`Unknown notebook type ${notebookType}`);
          }
        })(),
        zIndex: 1,
      }}
    >
      {text}
    </div>,
    notebookScrollContainerRef.current
  );
};

const Inserter = ({
  notebookType,
  focusedCellIndex,
  completion,
}: {
  notebookType: NotebookType;
  focusedCellIndex: number;
  completion: string;
}) => {
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

  // Attach the event listener to the caret, which in both Colab and Jupyter is a DOM node.
  const updateCaretRef = React.useCallback(() => {
    if (notebookType === NotebookType.COLAB) {
      const inputAreas: Array<HTMLTextAreaElement | null> = [
        ...document.querySelectorAll("div.cell"),
      ].map((cell) => cell.querySelector("textarea.inputarea"));
      ref(inputAreas[focusedCellIndex]);
    } else if (notebookType === NotebookType.JUPYTER) {
      ref(
        document
          .querySelector("div.cell.selected")
          ?.querySelector("textarea") ?? null
      );
    } else {
      throw new Error(`Unknown notebook type ${notebookType}`);
    }
  }, [focusedCellIndex, notebookType, ref]);
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
const Parakeet = ({
  notebookType,
}: {
  notebookType: NotebookType;
}): JSX.Element | null => {
  const { accessToken, invalidateAccessToken } = useAccessToken();

  // Extract the text of each cell and the position of the user's caret
  const cellTexts = useCellTexts(notebookType);
  const caretPositionInfo: CaretPositionInfo | null =
    useCaretPositionInfo(notebookType);

  const maybeCompletionText = useDebouncedLMCompletion({
    accessToken,
    invalidateAccessToken,
    prompt: ((): string | null => {
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
    })(),
  });

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
        notebookType={notebookType}
        focusedCellIndex={caretPositionInfo.focusedCellIndex}
        lineNumberInCell={lineNumberInCell}
        text={completionText}
      />
      <Inserter
        notebookType={notebookType}
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
    <SnackbarProvider
      anchorOrigin={{
        vertical: "top",
        horizontal: "center",
      }}
      preventDuplicate
      TransitionComponent={Zoom}
    >
      <NotebookTypeProvider>
        {(notebookType) => <Parakeet notebookType={notebookType} />}
      </NotebookTypeProvider>
    </SnackbarProvider>
  </OnlyIfOnline>
);
