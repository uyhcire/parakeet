import constructPrompt from "../constructPrompt";

test("constructPrompt", () => {
  const cellTexts = ["foo", "bar!!\nbar bar"];
  const caretPositionInfo = {
    focusedCellIndex: 1,
    selectionStart: 5,
  };
  expect(constructPrompt(caretPositionInfo, cellTexts)).toEqual("foo\n\nbar!!");
});
