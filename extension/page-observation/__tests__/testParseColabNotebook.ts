import fs from "fs";
import path from "path";

import { getCurrentCaretPositionInfoForColab } from "../useCaretPositionInfo";
import { getCurrentCellTextsForColab } from "../useCellTexts";

test("Parses a Colab notebook properly", () => {
  document.body.innerHTML = fs.readFileSync(
    path.resolve(__dirname, "./colab_snapshot.html"),
    "utf8"
  );

  expect(
    getCurrentCellTextsForColab().map((cellText) => cellText.split("\n"))
  ).toEqual([
    // Cell 1
    ["# Define x.", "x = 1"],
    // Cell 2 (blank)
    [""],
    // Cell 3 (focused)
    ["# Define y.", "y = 2"],
  ]);

  expect(getCurrentCaretPositionInfoForColab()).toEqual({
    focusedCellIndex: 2,
    // The real selectionStart is generally not 0, but the selectionStart is set by Monaco's JS code which this test doesn't have access to.
    selectionStart: 0,
  });
});
