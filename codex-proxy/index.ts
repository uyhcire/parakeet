import * as cors from "cors";
import * as express from "express";
import { auth } from "express-oauth2-jwt-bearer";
import fetch from "node-fetch";
import * as redis from "redis";

const config = require("./config.json");

// The URL to connect to is documented at https://fly.io/docs/reference/redis/
const redisClient = redis.createClient({
  url: `redis://redis-rate-limiter.internal:6379`,
  username: "default",
  password: process.env.REDIS_PASSWORD,
});

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
    if (
      process.env.OPENAI_API_KEY == null ||
      process.env.OPENAI_API_KEY.length === 0
    ) {
      console.log(
        "No OpenAI API key was configured. You may need to run `flyctl secrets import`."
      );
      res.status(500).send(
        { data: {} } // avoid giving away any sensitive information
      );
      return;
    }

    // We can use `sub` to identify the user, as it is guaranteed to be unique.
    const userSubId = req.auth?.payload?.sub;
    if (!userSubId) {
      res
        .status(403)
        .send(
          "To access the OpenAI API, you must be authenticated as a specific user."
        );
      return;
    }

    // Enforce the rate limit.
    // Source for the Lua script: https://levelup.gitconnected.com/implementing-a-sliding-log-rate-limiter-with-redis-and-golang-79db8a297b9e
    const script: string = `
    -- Parse arguments
    local user_id = KEYS[1]
    local current_time = tonumber(ARGV[1])  -- in units of seconds
    local window_length = tonumber(ARGV[2])
    local per_window_limit = tonumber(ARGV[3])

    -- Remove keys that are no longer relevant
    local clearBefore = current_time - window_length
    redis.call('ZREMRANGEBYSCORE', user_id, 0, clearBefore)

    -- Return the number of allowed requests remaining,
    -- and account for the new request if it will go through
    local remaining_allowance = per_window_limit - redis.call('ZCARD', user_id)
    if remaining_allowance > 0 then
      redis.call('ZADD', user_id, current_time, current_time)
    end
    return remaining_allowance`;
    const remainingRequestsAllowed = (await redisClient.eval(script, {
      keys: [userSubId],
      arguments: [
        // The current time, in seconds
        String(new Date().getTime() / 1000),
        // Time window: 1 minute
        "60",
        // Maximum request count: 60
        "60",
      ],
    })) as number;
    if (remainingRequestsAllowed <= 0) {
      res.status(429).header("Content-Type", "application/json").send(
        { data: {} } // avoid giving away any sensitive information
      );
      return;
    }

    const prompt = req.body?.prompt;
    if (prompt == null) {
      res.status(400).send("`prompt` is required");
      return;
    }

    const lmRequestStartTime = new Date();

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

    const lmResponseJson = (await lmResponse.json()) as any;

    const lmInferenceMillis =
      new Date().getTime() - lmRequestStartTime.getTime();
    console.log(`LM inference call took ${lmInferenceMillis}ms`);

    const completion = lmResponseJson.choices![0].text!.split("\n")[0];
    let cfInferenceMillis: number | null = null;
    let isToxic: boolean = false;
    if (completion.length > 0) {
      const cfRequestStartTime = new Date();

      const cfResponse = await fetch("https://api.openai.com/v1/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "content-filter-alpha",
          prompt: `<|endoftext|>${completion}\n--\nLabel:`,
          max_tokens: 1,
          temperature: 0.0,
          top_p: 0,
          logprobs: 10,
          // Probably not necessary, but it doesn't hurt.
          user: userSubId,
        }),
      });

      if (cfResponse.status !== 200) {
        res
          .status(
            cfResponse.status === 429
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

      const cfResponseJson = (await cfResponse.json()) as any;

      cfInferenceMillis = new Date().getTime() - cfRequestStartTime.getTime();
      console.log(`Content filter inference call took ${cfInferenceMillis}ms`);

      const outputLabel = cfResponseJson.choices![0].text;
      const logprobs = cfResponseJson.choices![0].logprobs!.top_logprobs![0];
      const toxicThreshold = -0.355; // as recommended by OpenAI

      if (outputLabel === "2" && logprobs["2"] >= toxicThreshold) {
        isToxic = true;
      }
    }

    res.header("Content-Type", "application/json").send({
      completion: !isToxic ? completion : "",
      lmInferenceMillis,
      cfInferenceMillis,
    });
  }
);

const port = process.env.PORT || 3000;
redisClient
  .connect()
  .then(() => {
    app.listen(port, () => console.log(`Listening on port ${port}`));
  })
  .catch((err) => {
    throw new Error(`Could not connect to Redis. Error: "${err}"`);
  });
