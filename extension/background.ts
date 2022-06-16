import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";

import firebaseConfig from "./config/firebaseConfig";
import getCustomAuthToken from "./getCustomAuthToken";

chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Maintain a Firebase session, and use Chrome's storage API to provide custom auth tokens to the extension's content scripts.
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
chrome.runtime.onMessage.addListener((request, sender) => {
  const isMessageFromExtension = !!sender.tab;
  if (isMessageFromExtension && request.customAuthToken) {
    // We could potentially sign in multiple times, but that shouldn't cause problems.
    signInWithCustomToken(auth, request.customAuthToken).then(() => {
      // Periodically fetch a *new* custom auth token for content scripts to access,
      // since the original one remains valid for only an hour or so.
      chrome.storage.sync.set({ customAuthToken: request.customAuthToken });
      setInterval(
        async () => {
          const customAuthToken = await getCustomAuthToken(app);
          chrome.storage.sync.set({ customAuthToken });
        },
        // Fetch a new custom auth token every half an hour or so
        1000 * 1000
      );
    });
  }
});
