import React from "react";
import { useMutationObserver } from "rooks";

import { NOTEBOOK_TYPE } from "../config/env";

export const getCurrentCellTexts = (): Array<string> =>
  [...document.querySelectorAll("div.cell")].map((cell) => {
    if (cell.querySelector(".markdown") != null) {
      // For now, ignore Markdown cells. If we want to parse them, we can use Showdown (https://www.npmjs.com/package/showdown).
      // But we'll need to be careful about: (1) limiting CPU load, (2) doing special handling of images and TeX
      return "";
    }

    const cellEditor = cell.querySelector("div.lazy-editor");
    if (cellEditor == null) {
      throw new Error("Expected code cell to have an editor component");
    }

    let visible = Boolean(cellEditor.querySelector(".monaco"));
    if (visible) {
      return [...cellEditor.querySelectorAll(".view-line")]
        .map((lineNode) => {
          let innerContent = lineNode.querySelector("span")?.textContent ?? "";
          // Colab displays non-breaking spaces rather than regular spaces. We need to convert them back.
          // Snippet is from https://stackoverflow.com/a/1496863
          innerContent = innerContent.replace(/\u00a0/g, " ");
          return innerContent;
        })
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
  });

/**
 * Provides the text value of each notebook cell cell. The text values are extracted by parsing the notebook's DOM structure.
 *
 * A big complication for Colab notebooks is that Colab "virtualizes" its cells.
 * Off-screen cells are rendered differently, and they require special handling.
 */
const useCellTexts = (): Array<string> | null => {
  if (NOTEBOOK_TYPE !== "colab") {
    throw new Error("Only Colab is supported for now");
  }

  const [cellTexts, setCellTexts] = React.useState<Array<string> | null>(null);

  // Stay up to date with DOM additions and deletions, as well as caret movements.
  const bodyRef = React.useRef(document.body);
  useMutationObserver(bodyRef, (mutations) => {
    if (mutations.length > 0) {
      setCellTexts(getCurrentCellTexts());
    }
  });

  return cellTexts;
};

export default useCellTexts;
