/**
 * A simplified representation of "where the user is" in their notebook.
 */
export interface CaretPositionInfo {
  focusedCellIndex: number;
  focusedCellType: "CODE" | "TEXT";
  currentLineInfo: {
    lineNumber: number;
    isAtEnd: boolean;
  };
}

export enum NotebookType {
  COLAB = "colab",
  JUPYTER = "jupyter",
}
