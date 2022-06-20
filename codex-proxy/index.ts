import * as cors from "cors";
import * as express from "express";
import { auth } from "express-oauth2-jwt-bearer";
import fetch from "node-fetch";

const config = require("./config.json");

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: true,
    // Greatly improves user-experienced latency by allowing the browser to cache this OPTIONS response.
    // We set it to 2 hours, the maximum for Chrome. https://netbasal.com/reduce-response-latency-by-caching-preflight-requests-2c450b6f9cb6
    maxAge: 2 * 60 * 60,
  })
);

const checkJwt = auth({
  audience: "codex-proxy",
  issuerBaseURL: `https://${config.auth0_domain}/`,
});

app.post(
  "/codex",
  checkJwt,
  async (req: express.Request, res: express.Response) => {
    // We can use `sub` to identify the user, as it is guaranteed to be unique.
    const userSubId = req.auth?.payload?.sub;
    if (!userSubId) {
      res
        .status(403)
        .send(
          "To access the OpenAI API, you must be authenticated as a specific user."
        );
    }

    const prompt = req.body?.prompt;
    if (prompt == null) {
      res.status(400).send("`prompt` is required");
      return;
    }

    const startTime = new Date();

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
        user: userSubId,
      }),
    });
    const lmResponseJson = (await lmResponse.json()) as any;

    const lmInferenceMillis = new Date().getTime() - startTime.getTime();
    console.log(`LM inference call took ${lmInferenceMillis}ms`);

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
      completion: lmResponseJson.choices![0].text!.split("\n")[0],
      lmInferenceMillis,
    });
  }
);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));
