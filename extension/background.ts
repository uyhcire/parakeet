chrome.runtime.onInstalled.addListener(function () {
  chrome.tabs.create({
    // We must pass the --no-content-hash flag to Parcel for this URL to be stable
    url: "popup.b7af9369.html",
  });
});
