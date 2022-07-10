const parseOffsetTop = (topAttr: string): number => {
  const parseResult = /^([0-9.]+)px$/.exec(topAttr);
  if (parseResult == null) {
    throw new Error(`Unexpected format of CSS \`top\` attribute: "${topAttr}"`);
  }

  return parseFloat(parseResult[1]);
};

/**
 * Get the `.view-lines` nodes of a Colab cell, in order.
 *
 * The cells are sometimes NOT in order in the DOM tree, so we need to sort them by their actual positions on the screen.
 */
const queryColabCellLines = (cell: Element): Array<Element> => {
  const lineNodes = [...cell.querySelectorAll(".view-line")];

  lineNodes.sort((line1, line2) => {
    return (
      parseOffsetTop(window.getComputedStyle(line1).top) -
      parseOffsetTop(window.getComputedStyle(line2).top)
    );
  });

  return lineNodes;
};

export default queryColabCellLines;
