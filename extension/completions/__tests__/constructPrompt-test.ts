import { CaretPositionInfo } from "../../page-observation/types";
import constructPrompt from "../constructPrompt";

test("constructPrompt", () => {
  const cellTexts = ["foo", "bar!!\nbar bar"];
  const caretPositionInfo: CaretPositionInfo = {
    focusedCellIndex: 1,
    focusedCellType: "CODE",
    selectionStart: 5,
  };
  expect(constructPrompt(caretPositionInfo, cellTexts)).toEqual("foo\n\nbar!!");
});
