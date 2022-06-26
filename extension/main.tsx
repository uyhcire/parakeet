import { SnackbarProvider, useSnackbar } from "notistack";
import React, { KeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import { useOnline } from "rooks";
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

const Inserter = ({ completion }: { completion: string }) => {
  // Capture *all* Tab keypresses if a completion is available,
  // to prevent any funny business from the notebook's native Tab handlers.
  // There are many such handlers that can interfere with Parakeet, since Tab
  // is a very common keyboard shortcut for autocomplete-related functionality.
  //
  // Source for the idea: https://stackoverflow.com/a/19780264
  const tabHandler = React.useCallback(
    (e: KeyboardEvent) => {
      // Don't interfere with normal tab handling if no completion is being shown
      if (completion.length === 0) {
        return;
      }

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
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    },
    [completion]
  );
  React.useEffect(() => {
    document.body.addEventListener<"keydown">(
      "keydown",
      // @ts-expect-error - there is a subtle mismatch in event types, but it's harmless
      tabHandler,
      true /* capture */
    );
    return () => {
      document.body.removeEventListener(
        "keydown",
        // @ts-expect-error - there is a subtle mismatch in event types, but it's harmless
        tabHandler,
        true /* capture */
      );
    };
  }, [tabHandler]);

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
  const { enqueueSnackbar } = useSnackbar();

  // Extract the text of each cell and the position of the user's caret
  const cellTexts = useCellTexts(notebookType);
  const caretPositionInfo: CaretPositionInfo | null = useCaretPositionInfo(
    notebookType,
    cellTexts
  );

  let prompt: string | null = null;
  if (
    cellTexts != null &&
    caretPositionInfo != null &&
    // Don't show completions for Markdown cells. (There's no fundamental reason why we can't, but it's not worth the complexity for now.)
    caretPositionInfo.focusedCellType === "CODE"
  ) {
    prompt = constructPrompt(caretPositionInfo, cellTexts);
  }

  const completion = useCompletion({
    accessToken,
    enqueueSnackbar,
    invalidateAccessToken,
    prompt,
  });

  // Bail if there is not enough information to position the completion
  if (completion == null) {
    return null;
  }
  // This condition is never met, but checking this makes TypeScript happy
  if (cellTexts == null || caretPositionInfo == null) {
    return null;
  }

  return (
    <>
      <Completion
        notebookType={notebookType}
        focusedCellIndex={caretPositionInfo.focusedCellIndex}
        lineNumberInCell={caretPositionInfo.currentLineInfo.lineNumber}
        text={completion}
      />
      <Inserter completion={completion} />
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
