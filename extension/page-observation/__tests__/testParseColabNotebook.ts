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

test("Parses a Colab notebook properly even when the lines are out of order in the DOM tree", () => {
  // To reproduce a DOM tree with out-of-order lines, can do the following:
  // - Create a Colab cell and type 2 lines of text in it
  // - Copy the 2 lines
  // - Add some blank lines at the top of the cell
  // - Paste the 2 lines at the top of the cell
  document.body.innerHTML = fs.readFileSync(
    `${process.env.PROJECT_ROOT}/testdata/colab_snapshot_lines_out_of_order.html`,
    "utf8"
  );

  const cellTexts = getCurrentCellTextsForColab();
  expect(cellTexts.map((cellText) => cellText.split("\n"))).toEqual([
    [
      "# Preview the image at /tmp/output.jpg in Colab.",
      "# Let's think step by step.",
      "# Step 1 is to go and",
      "",
      "from IPython.display import Image",
      "",
      'Image("/tmp/output.jpg")',
    ],
  ]);

  // In this HTML snapshot, the cell is not being edited.
  expect(getCurrentCaretPositionInfoForColab(cellTexts)).toEqual(null);
});
