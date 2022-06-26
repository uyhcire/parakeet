import fs from "fs";

import { getCurrentCaretPositionInfoForColab } from "../useCaretPositionInfo";
import { getCurrentCellTextsForColab } from "../useCellTexts";

test("Parses a Colab notebook properly", () => {
  document.body.innerHTML = fs.readFileSync(
    `${process.env.PROJECT_ROOT}/testdata/colab_snapshot.html`,
    "utf8"
  );

  const cellTexts = getCurrentCellTextsForColab();
  expect(cellTexts.map((cellText) => cellText.split("\n"))).toEqual([
    // Cell 1
    ["# Define x.", "x = 1"],
    // Cell 2 (blank)
    [""],
    // Cell 3 (focused)
    ["# Define y.", "y = 2"],
  ]);

  expect(getCurrentCaretPositionInfoForColab(cellTexts)).toEqual({
    focusedCellIndex: 2,
    focusedCellType: "CODE",
    // The caret looks like it is at the very beginning of the cell,
    // because the `selectionStart` is 0 in this test. `selectionStart` is normally set by Monaco's JS code,
    // but the Monaco JS code is not included in the HTML snapshot.
    currentLineInfo: {
      lineNumber: 0,
      isAtEnd: false,
    },
  });
});
