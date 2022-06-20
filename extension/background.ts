// Display the sign-in page when the extension is first installed.
chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Open the options page if we get a "signIn" message from a content script.
chrome.runtime.onMessage.addListener((message) => {
  if (message === "signIn") {
    chrome.runtime.openOptionsPage();
  }
});
