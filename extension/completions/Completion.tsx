import React from "react";
import { createPortal } from "react-dom";
import { useMutationObserver } from "rooks";

import { NotebookType } from "../page-observation/types";

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

export default Completion;
