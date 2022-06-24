/**
 * A simplified representation of "where the user is" in their notebook.
 */
export interface CaretPositionInfo {
  focusedCellIndex: number;
  selectionStart: number;
}

export enum NotebookType {
  COLAB = "colab",
  JUPYTER = "jupyter",
}
