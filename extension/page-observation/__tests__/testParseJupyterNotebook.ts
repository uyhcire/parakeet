import fs from "fs";
import path from "path";

import { CaretPositionInfo } from "../useCaretPositionInfo";

/**
 * Gets the content of a line of code in CodeMirror.
 * @param lineNode The line's DOM node, which should be a pre.CodeMirror-line
 */
const getLineContent = (lineNode: HTMLPreElement) => {
  const lineContent = lineNode.textContent ?? "";

  // Remove zero-width spaces.
  return lineContent.replace(/\u200b/g, "");
};

const getCurrentCaretPositionInfo = (): CaretPositionInfo | null => {
  // `focusedCellIndex`
  let cellFocusStates = [...document.querySelectorAll("div.cell")].map((cell) =>
    cell.className.split(" ").includes("selected")
  );
  if (!cellFocusStates.some((isFocused) => isFocused)) {
    // No cell is active.
    return null;
  }
  const focusedCellIndex = cellFocusStates.findIndex((isFocused) => isFocused);

  if (document.querySelector(".CodeMirror-selected") != null) {
    // Don't show a completion if the user is trying to select something.
    return null;
  }

  // Unlike Colab, Jupyter does not seem to expose selectionStart at all.
  // To infer selectionStart, we measure the bounding box position of the caret,
  // and we compare it against the bounding box positions of the lines of text in the cell.
  let selectionStart;
  {
    const selectedCellNode = document.querySelector("div.cell.selected")!;
    const lineNodes = [
      ...selectedCellNode.querySelectorAll("pre.CodeMirror-line"),
    ] as Array<HTMLPreElement>;
    const caretRect = selectedCellNode
      .querySelector("textarea")!
      .parentElement!.getBoundingClientRect();
    const lineTops = lineNodes.map(
      (lineNode) => lineNode.getBoundingClientRect().top
    );
    const caretLineNumber = lineTops.findIndex(
      (top) => top - caretRect.top < 0.0001
    );
    if (caretLineNumber === -1) {
      throw new Error("Could not determine the line number the caret is on");
    }
    const lineNode = lineNodes[caretLineNumber];
    const lineTextRect = lineNode
      // As far as I can tell from the Chrome inspector, this <span> is exactly as wide as the line's text.
      .querySelector("span[role=presentation]")!
      .getBoundingClientRect();
    const lineLength = getLineContent(lineNode).length;
    const characterWidth = lineTextRect.width / lineLength;
    const caretPositionInLine = Math.round(
      (caretRect.left - lineTextRect.left) / characterWidth
    );

    selectionStart = 0;
    for (const [i, lineNode] of lineNodes.entries()) {
      if (i < caretLineNumber) {
        selectionStart += getLineContent(lineNode).length;
      } else {
        // i === caretLineNumber
        selectionStart += caretPositionInLine;
      }
    }
  }

  return { focusedCellIndex, selectionStart };
};

const getCurrentCellTexts = (): Array<string> =>
  [...document.querySelectorAll("div.cell")].map((cell) => {
    if (cell.className.split(" ").includes("text_cell")) {
      // For now, ignore Markdown cells. If we want to parse them, we can use Showdown (https://www.npmjs.com/package/showdown).
      // But we'll need to be careful about: (1) limiting CPU load, (2) doing special handling of images and TeX
      return "";
    }

    const codeMirrorLinesNode = cell.querySelector("div.CodeMirror-lines");
    if (codeMirrorLinesNode == null) {
      // Unlike Colab, Jupyter does not do virtualized rendering, as far as we are aware.
      throw new Error("Expected all Jupyter code cells to be using CodeMirror");
    }

    const lineTexts = [];
    for (const lineNode of [
      ...cell.querySelectorAll("pre.CodeMirror-line"),
    ] as Array<HTMLPreElement>) {
      lineTexts.push(getLineContent(lineNode));
    }

    return lineTexts.join("\n");
  });

test("Extracts the cell texts of a Jupyter notebook", () => {
  document.body.innerHTML = fs.readFileSync(
    path.resolve(__dirname, "./jupyter_snapshot.html"),
    "utf8"
  );

  expect(getCurrentCellTexts().map((cellText) => cellText.split("\n"))).toEqual(
    [
      // Cell 1 (markdown)
      [""],
      // Cell 2 (blank)
      [""],
      // Cell 3 (focused)
      ["import numpy as"],
    ]
  );
});

test("Determines the active caret position in a Jupyter notebook", () => {
  document.body.innerHTML = fs.readFileSync(
    path.resolve(__dirname, "./jupyter_snapshot.html"),
    "utf8"
  );

  // jsdom does not have a layout engine, so we need to mock the positions of
  expect(
    document
      .querySelectorAll("div.cell")[2]
      .className.split(" ")
      .includes("selected")
  ).toBe(true);
  const presentationSpanNode = document
    .querySelector("div.cell.selected")!
    .querySelector("span[role=presentation]")!;
  presentationSpanNode.getBoundingClientRect = jest.fn(
    () =>
      ({
        x: 231.7421875,
        y: 247.421875,
        width: 126.1328125,
        height: 16,
        top: 247.421875,
        right: 357.875,
        bottom: 263.421875,
        left: 231.7421875,
      } as DOMRect)
  );

  // { caretPositionInLine: boundingRect.left }
  const caretLeftPositions = {
    0: 231.7421875,
    1: 240.1484375,
    2: 248.546875,
    13: 340.9765625,
    14: 349.3828125,
    15: 357.78125,
  };
  const caretNode = document
    .querySelector("div.cell.selected")!
    .querySelector("textarea")!.parentElement!;
  for (const [caretPositionInLine, leftPosition] of Object.entries(
    caretLeftPositions
  )) {
    // We should be robust to small deviations in the caret's bounding box position
    for (const deviation of [-0.001, 0, +0.001]) {
      caretNode.getBoundingClientRect = jest.fn(
        () =>
          ({
            x: 357.78125,
            y: 246.921875,
            width: 3,
            height: 0,
            top: 246.921875,
            right: leftPosition + deviation + 3, // this is what I saw in my browser, but this is not actually used
            bottom: 246.921875,
            left: leftPosition + deviation,
          } as DOMRect)
      );
      expect(getCurrentCaretPositionInfo()).toEqual({
        focusedCellIndex: 2,
        selectionStart: Number(caretPositionInLine), // the cell in this particular snapshot only has one line
      });
    }
  }
});
