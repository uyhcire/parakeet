/**
 * Gets the content of a line of code in CodeMirror.
 * @param lineNode The line's DOM node, which should be a pre.CodeMirror-line
 */
const getJupyterLineContent = (lineNode: HTMLPreElement) => {
  const lineContent = lineNode.textContent ?? "";

  // Remove zero-width spaces.
  return lineContent.replace(/\u200b/g, "");
};

export default getJupyterLineContent;
