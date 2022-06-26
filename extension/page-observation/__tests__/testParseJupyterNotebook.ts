import fs from "fs";

import {
  getCurrentCaretPositionInfoForJupyter,
  mockableJupyterMeasurer,
} from "../useCaretPositionInfo";
import { getCurrentCellTextsForJupyter } from "../useCellTexts";

// jsdom does not have a layout engine, so we need to mock the positions of everything.
let mockGetElementPositions: jest.SpyInstance;
beforeEach(() => {
  mockGetElementPositions = jest.spyOn(
    mockableJupyterMeasurer,
    "getElementPositions"
  );
});

afterEach(() => {
  mockGetElementPositions.mockReset();
});

test("Extracts the cell texts of a Jupyter notebook", () => {
  document.body.innerHTML = fs.readFileSync(
    `${process.env.PROJECT_ROOT}/testdata/jupyter_snapshot.html`,
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

// Measured this in the browser by logging the return value of `getElementPositions`
const MEASURED_ELEMENT_POSITIONS = {
  caretRect: {
    x: 476.78125,
    y: 243.109375,
    width: 1.3984375,
    height: 17,
    top: 243.109375,
    right: 478.1796875,
    bottom: 260.109375,
    left: 476.78125,
  } as DOMRect,
  lineRects: [
    {
      x: 346.7421875,
      y: 243.109375,
      width: 1001.2578125,
      height: 17,
      top: 243.109375,
      right: 1348,
      bottom: 260.109375,
      left: 346.7421875,
    } as DOMRect,
  ],
  lineTextRects: [
    {
      x: 350.7421875,
      y: 243.609375,
      width: 126.1328125,
      height: 16,
      top: 243.609375,
      right: 476.875,
      bottom: 259.609375,
      left: 350.7421875,
    } as DOMRect,
  ],
};

test("Determines the active caret position in a Jupyter notebook", () => {
  document.body.innerHTML = fs.readFileSync(
    `${process.env.PROJECT_ROOT}/testdata/jupyter_snapshot.html`,
    "utf8"
  );

  const testPositions = [
    // If the caret is in the middle of the line, `isAtEnd` should be false.
    { deviation: -10, shouldBeAtEnd: false },
    // We should be robust to small deviations in the caret's bounding box position.
    { deviation: -0.2, shouldBeAtEnd: true },
    { deviation: 0, shouldBeAtEnd: true },
    { deviation: +0.2, shouldBeAtEnd: true },
    // If the caret is far to the right of the line for some reason, `isAtEnd` should be false.
    { deviation: +10, shouldBeAtEnd: false },
  ];
  for (const { deviation, shouldBeAtEnd } of testPositions) {
    mockGetElementPositions.mockReturnValue({
      ...MEASURED_ELEMENT_POSITIONS,
      caretRect: {
        ...MEASURED_ELEMENT_POSITIONS.caretRect,
        right: MEASURED_ELEMENT_POSITIONS.caretRect.right + deviation,
        left: MEASURED_ELEMENT_POSITIONS.caretRect.left + deviation,
      },
    });

    expect(getCurrentCaretPositionInfoForJupyter()).toEqual({
      focusedCellIndex: 2,
      focusedCellType: "CODE",
      // In the snapshot we're testing, the focused cell only has one line.
      currentLineInfo: {
        lineNumber: 0,
        isAtEnd: shouldBeAtEnd,
      },
    });
  }
});
