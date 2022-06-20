import React from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";

import config from "./config.json";

const Message = ({
  emoji,
  title,
  body,
}: {
  emoji: string;
  title: string;
  body: string | React.ReactNode;
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

const LoginRedirector = () => {
  const { getAccessTokenSilently, loginWithRedirect, logout } = useAuth0();
  // Start in logged-out mode if the `logout` query param is set.
  // Otherwise, start by attempting to get an access token.
  const isLogoutUrl =
    new URLSearchParams(window.location.search).get("logout") === "true" &&
    // If you log out and then lock back in, Auth0 includes the `logout` query param
    // when redirecting back to this page. So we can't determine `logout` status based on the query param
    // alone. We also need to check that the current page was not opened from a redirect,
    // which we do by looking at the `code` query param that Auth0 adds on redirect.
    new URLSearchParams(window.location.search).get("code") == null;
  const [status, setStatus] = React.useState<
    "STARTING" | "IN_PROGRESS" | "DONE" | "LOGOUT"
  >(isLogoutUrl ? "LOGOUT" : "STARTING");

  React.useEffect(() => {
    if (status !== "STARTING") {
      return;
    }

    (async () => {
      let auth0AccessToken: string;
      try {
        setStatus("IN_PROGRESS");
        auth0AccessToken = await getAccessTokenSilently();
        chrome.storage.sync.set({ auth0AccessToken });
        setStatus("DONE");
      } catch (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e: any
      ) {
        if ("error" in e && e.error === "login_required") {
          await loginWithRedirect();
          return;
        } else {
          throw e;
        }
      }
    })();
  }, [getAccessTokenSilently, loginWithRedirect, status]);

  switch (status) {
    case "STARTING":
      return null;
    case "IN_PROGRESS":
      return <Message emoji="🔑" title="Logging in..." body="" />;
    case "DONE":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Message
            emoji="🎉"
            title="Successfully signed in!"
            body="You can now close this tab."
          />
          <button
            onClick={async () => {
              await logout({
                returnTo:
                  "chrome-extension://kfcajalofajngnlomhfplkapaijhmdba/options_auth0.915298d6.html?logout=true",
              });
              // Content scripts will no longer have access to the Codex endpoint.
              chrome.storage.sync.set({ auth0AccessToken: null });
            }}
          >
            Log out
          </button>
        </div>
      );
    case "LOGOUT":
      return (
        <Message
          emoji="🌴"
          title="Logged out"
          body={
            <button
              onClick={() => {
                setStatus("STARTING");
              }}
            >
              Log back in
            </button>
          }
        />
      );
  }
};

const authContainer = document.getElementById("root")!;
const reactRoot = createRoot(authContainer);
reactRoot.render(
  <Auth0Provider
    domain={config.auth0_domain}
    clientId={config.auth0_client_id}
    redirectUri={window.location.href}
    audience="codex-proxy"
  >
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
        <LoginRedirector />
      </div>
    </div>
  </Auth0Provider>
);
