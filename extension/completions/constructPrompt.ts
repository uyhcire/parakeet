import { CaretPositionInfo } from "../page-observation/types";

const constructPrompt = (
  caretPositionInfo: CaretPositionInfo,
  cellTexts: Array<string>
): string | null => {
  // Don't request a completion if the caret is in the middle of a line
  if (!caretPositionInfo.currentLineInfo.isAtEnd) {
    return null;
  }

  const { focusedCellIndex } = caretPositionInfo;

  let prompt = "";
  cellTexts?.forEach((cellText, i) => {
    if (i < focusedCellIndex) {
      prompt += cellText;
      prompt += "\n\n";
    } else if (i === focusedCellIndex) {
      prompt += cellText
        .split("\n")
        .slice(0, caretPositionInfo.currentLineInfo.lineNumber + 1)
        .join("\n");
    } else {
      // i > focusedCellIndex
      return;
    }
  });

  return prompt;
};

export default constructPrompt;
