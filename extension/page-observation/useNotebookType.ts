import React from "react";
import { useMutationObserver } from "rooks";

import { NotebookType } from "./types";

const useNotebookType = (): NotebookType | null => {
  const [notebookType, setNotebookType] = React.useState<NotebookType | null>(
    null
  );

  // Detect Colab.
  React.useEffect(() => {
    if (notebookType != null) {
      // The notebook type never changes, so there's no need to update it.
      return;
    }

    if (window.location.host.endsWith("colab.research.google.com")) {
      setNotebookType(NotebookType.COLAB);
    }
  }, [notebookType]);

  // Jupyter is a bit trickier to detect.
  const bodyRef = React.useRef<HTMLElement | null>(document.body);
  useMutationObserver(bodyRef, (mutations) => {
    if (mutations.length > 0) {
      if (document.querySelector("div[id=ipython-main-app]") != null) {
        setNotebookType(NotebookType.JUPYTER);
        // The notebook type never changes, so there's no need to update it any more.
        bodyRef.current = null;
      }
    }
  });

  return notebookType;
};

export default useNotebookType;
