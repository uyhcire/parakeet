import { Configuration as OAIConfiguration, OpenAIApi } from "openai";

export abstract class Engine {
  static engineName: string;

  abstract testConnection(apiKey: string): Promise<boolean>;

  abstract requestLineCompletion(
    apiKey: string,
    prompt: string
  ): Promise<
    | string
    | { error: "SERVER_ERROR" }
    // Null means that no completion is available, but no noteworthy error has occurred.
    // For example, the server may have rejected our request with code 429 (we are temporarily rate-limited).
    | null
  >;
}

export enum EngineType {
  GPTJ = "GPTJ",
  CODEX = "CODEX",
}

export class GPTJEngine implements Engine {
  static engineName = "GPT-J";
  static _baseUrl = "https://api.goose.ai/v1/engines/gpt-j-6b";

  _apiKey: string;

  constructor(apiKey: string) {
    this._apiKey = apiKey;
  }

  async testConnection(): Promise<boolean> {
    const response = await fetch(GPTJEngine._baseUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._apiKey}`,
      },
    });

    if (response.status === 200) {
      return true;
    } else {
      return false;
    }
  }

  async requestLineCompletion(
    apiKey: string,
    prompt: string
  ): Promise<string | { error: "SERVER_ERROR" } | null> {
    const completionResponse = await fetch(
      `${GPTJEngine._baseUrl}/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt,
          max_tokens: 80,
          temperature: 0.0,
          stop: ["\n"],
        }),
      }
    );

    if (completionResponse.status !== 200) {
      return { error: "SERVER_ERROR" };
    }

    return (await completionResponse.json()).choices[0].text.split("\n")[0];
  }
}

export class CodexEngine implements Engine {
  static engineName = "Codex";

  // cushman takes only ~140 ms while davinci takes ~500 ms, which is a noticeable drag in a notebook setting.
  static model = "code-cushman-001";

  _api: OpenAIApi;

  constructor(apiKey: string) {
    this._api = new OpenAIApi(new OAIConfiguration({ apiKey }));
  }

  async testConnection(): Promise<boolean> {
    try {
      // If the API key is invalid, the browser will show the native login dialog (https://stackoverflow.com/a/29082416).
      // There is no way to prevent this. Fortunately, the API key will soon be managed by a server, and users will no longer need to enter an API key at all.
      await this._api.retrieveModel(CodexEngine.model);
      return true;
    } catch {
      return false;
    }
  }

  async requestLineCompletion(
    apiKey: string,
    prompt: string
  ): Promise<string | { error: "SERVER_ERROR" } | null> {
    try {
      const completionResponse = await this._api.createCompletion({
        model: CodexEngine.model,
        prompt,
        max_tokens: 80,
        temperature: 0.0,
        stop: ["\n"],
      });

      return completionResponse.data.choices![0].text!.split("\n")[0];
    } catch (error) {
      // @ts-expect-error - this is safe because this is only for Axios errors
      if (error.isAxiosError && error.response.status === 429) {
        // We are rate-limited. Return null to indicate that no completion is available at the moment.
        return null;
      } else {
        return { error: "SERVER_ERROR" };
      }
    }
  }
}

export const createEngine = (
  engineType: EngineType,
  apiKey: string
): Engine => {
  if (engineType === EngineType.GPTJ) {
    return new GPTJEngine(apiKey);
  } else if (engineType === EngineType.CODEX) {
    return new CodexEngine(apiKey);
  } else {
    throw new Error("Unsupported engine type");
  }
};
