import fs from "fs";
import path from "path";

import { getCurrentCaretPositionInfoForJupyter } from "../useCaretPositionInfo";
import { getCurrentCellTextsForJupyter } from "../useCellTexts";

test("Extracts the cell texts of a Jupyter notebook", () => {
  document.body.innerHTML = fs.readFileSync(
    path.resolve(__dirname, "./jupyter_snapshot.html"),
    "utf8"
  );

  expect(
    getCurrentCellTextsForJupyter().map((cellText) => cellText.split("\n"))
  ).toEqual([
    // Cell 1 (markdown)
    [""],
    // Cell 2 (blank)
    [""],
    // Cell 3 (focused)
    ["import numpy as"],
  ]);
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
      expect(getCurrentCaretPositionInfoForJupyter()).toEqual({
        focusedCellIndex: 2,
        selectionStart: Number(caretPositionInLine), // the cell in this particular snapshot only has one line
      });
    }
  }
});
