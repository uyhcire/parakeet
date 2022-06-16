import * as cors from "cors";
import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import fetch from "node-fetch";

import { validateFirebaseIdToken } from "./validateFirebaseIdToken";

admin.initializeApp({});

const app = express();

app.use(
  cors({
    origin: true,
    // Greatly improves user-experienced latency by allowing the browser to cache this OPTIONS response.
    // We set it to 2 hours, the maximum for Chrome. https://netbasal.com/reduce-response-latency-by-caching-preflight-requests-2c450b6f9cb6
    maxAge: 2 * 60 * 60,
  })
);
// @ts-ignore - it is apparently common for some middleware types to be slightly incompatible, but this middleware works fine
app.use(validateFirebaseIdToken);

// Firebase always uses POST for Callable Functions.
app.post("/codex", async (req, res) => {
  const { userUid } = req;
  if (!userUid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "To access the OpenAI API, you must be authenticated as a specific user."
    );
  }

  const prompt = req.body.data.prompt;
  if (prompt == null) {
    res.status(400).send("`prompt` is required");
    return;
  }

  const startTimeMillis = new Date().getMilliseconds();

  const lmResponse = await fetch("https://api.openai.com/v1/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "code-cushman-001",
      prompt,
      max_tokens: 80,
      temperature: 0.0,
      stop: ["\n"],
      // Required by OpenAI to assist in detecting abuse
      user: userUid,
    }),
  });
  const lmResponseJson = (await lmResponse.json()) as any;

  functions.logger.log(
    `LM inference call took ${new Date().getMilliseconds() - startTimeMillis}ms`
  );

  if (lmResponse.status !== 200) {
    res
      .status(
        lmResponse.status === 429
          ? 429
          : // No other kind of error is expected
            500
      )
      .header("Content-Type", "application/json")
      .send(
        { data: {} } // avoid giving away any sensitive information
      );
    return;
  }

  res.header("Content-Type", "application/json").send({
    data: {
      completion: lmResponseJson.choices![0].text!.split("\n")[0],
    },
  });
});

// Firebase always uses POST for Callable Functions.
app.post("/getCustomAuthToken", (req, res) => {
  const { userUid } = req;
  if (!userUid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be authenticated to create a custom auth token for yourself."
    );
  }

  functions.logger.log("Generating custom auth token for user:", userUid);

  admin
    .auth()
    .createCustomToken(userUid)
    .then((customAuthToken) => {
      functions.logger.log("Returning custom auth token", customAuthToken);
      res.send({ data: { customAuthToken } });
    });
});

exports.parakeet = functions.https.onRequest(app);
