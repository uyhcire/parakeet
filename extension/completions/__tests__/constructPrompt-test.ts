import { CaretPositionInfo } from "../../page-observation/types";
import constructPrompt from "../constructPrompt";

test("constructPrompt", () => {
  const cellTexts = ["foo", "bar!!\nbar bar"];
  const caretPositionInfo: CaretPositionInfo = {
    focusedCellIndex: 1,
    focusedCellType: "CODE",
    currentLineInfo: {
      lineNumber: 0,
      isAtEnd: true,
    },
  };
  expect(constructPrompt(caretPositionInfo, cellTexts)).toEqual("foo\n\nbar!!");
});
