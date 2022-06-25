import { CaretPositionInfo } from "../page-observation/types";

const constructPrompt = (
  caretPositionInfo: CaretPositionInfo,
  cellTexts: Array<string>
): string | null => {
  // Don't request a completion if the caret is in the middle of a line
  const cellTextAfterCaret = cellTexts[
    caretPositionInfo.focusedCellIndex
  ].slice(caretPositionInfo.selectionStart);
  const isCaretAtEndOfLine =
    cellTextAfterCaret.length === 0 || cellTextAfterCaret[0] === "\n";
  if (!isCaretAtEndOfLine) {
    return null;
  }

  const { focusedCellIndex } = caretPositionInfo;

  let prompt = "";
  cellTexts?.forEach((cellText, i) => {
    if (i < focusedCellIndex) {
      prompt += cellText;
      prompt += "\n\n";
    } else if (i === focusedCellIndex) {
      prompt += cellText.slice(0, caretPositionInfo.selectionStart);
    } else {
      // i > focusedCellIndex
      return;
    }
  });

  return prompt;
};

export default constructPrompt;
