import { initializeApp } from "firebase/app";
import { EmailAuthProvider, getAuth } from "firebase/auth";
import React from "react";
import { createRoot } from "react-dom/client";
import StyledFirebaseAuth from "react-firebaseui/StyledFirebaseAuth";

import firebaseConfig from "./config/firebaseConfig";
import getCustomAuthToken from "./getCustomAuthToken";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const Message = ({
  emoji,
  title,
  body,
}: {
  emoji: string;
  title: string;
  body: string;
}): JSX.Element => {
  return (
    <div
      style={{
        padding: "24px",
        fontFamily: "Roboto,arial,sans-serif",
        textAlign: "center",
      }}
    >
      <div
        role="img"
        style={{
          fontSize: "64px",
          marginBottom: "24px",
        }}
      >
        {emoji}
      </div>
      <div
        style={{
          fontSize: "20px",
          lineHeight: "24px",
          marginBottom: "16px",
        }}
      >
        <strong>{title}</strong>
      </div>
      <div>{body}</div>
    </div>
  );
};

const SignInPage = (): JSX.Element => {
  const [status, setStatus] = React.useState<
    "INITIAL" | "IN_PROGRESS" | "ERROR" | "DONE"
  >("INITIAL");

  if (status === "IN_PROGRESS") {
    return <Message emoji="⌛" title="Finishing up..." body="" />;
  }

  if (status === "ERROR") {
    // white frowning face emoji
    return <Message emoji="☹️" title="Error" body="Something went wrong." />;
  }

  if (status === "DONE") {
    return (
      <Message
        emoji="🎉"
        title="Successfully signed in!"
        body="You can now close this tab."
      />
    );
  }

  return (
    <StyledFirebaseAuth
      firebaseAuth={auth}
      uiConfig={{
        // The basic email/password auth provider is the only one that works out of the box; Google and "magic link" auth are much more finicky.
        signInOptions: [EmailAuthProvider.PROVIDER_ID],

        callbacks: {
          signInSuccessWithAuthResult: () => {
            setStatus("IN_PROGRESS");

            getCustomAuthToken(app)
              .then((customAuthToken) => {
                // Send to the background script, which will be responsible for maintaining the session
                chrome.runtime
                  .sendMessage({ customAuthToken })

                  .then(() => {
                    setStatus("DONE");
                  });
              })
              .catch(() => {
                setStatus("ERROR");
              });

            return false;
          },
        },
      }}
    />
  );
};

const authContainer = document.getElementById("firebaseui-auth-container")!;
const reactRoot = createRoot(authContainer);
reactRoot.render(
  <div
    style={{
      width: "100vw",
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div style={{ width: 500, height: 800 }}>
      <SignInPage />
    </div>
  </div>
);
