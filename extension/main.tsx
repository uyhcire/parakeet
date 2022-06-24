import { SnackbarProvider } from "notistack";
import React, { KeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import { useEventListenerRef, useMutationObserver, useOnline } from "rooks";
import { Zoom } from "@mui/material";

import Completion from "./completions/Completion";
import constructPrompt from "./completions/constructPrompt";
import useCompletion from "./completions/useCompletion";
import useCaretPositionInfo from "./page-observation/useCaretPositionInfo";
import { CaretPositionInfo, NotebookType } from "./page-observation/types";
import useCellTexts from "./page-observation/useCellTexts";
import useNotebookType from "./page-observation/useNotebookType";

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

  const completion = useCompletion({
    accessToken,
    invalidateAccessToken,
    prompt: constructPrompt(caretPositionInfo, cellTexts),
  });

  // Bail if there is not enough information to position the completion
  if (caretPositionInfo == null || cellTexts == null || completion == null) {
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
        notebookType={notebookType}
        focusedCellIndex={caretPositionInfo.focusedCellIndex}
        lineNumberInCell={lineNumberInCell}
        text={completion}
      />
      <Inserter
        notebookType={notebookType}
        focusedCellIndex={caretPositionInfo.focusedCellIndex}
        completion={completion}
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
