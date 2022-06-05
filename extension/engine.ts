// For now, we're using GPT-J, but we can extend this class to support other language models as well.
class Engine {
  async testConnection(apiKey: string): Promise<boolean> {
    const response = await fetch("https://api.goose.ai/v1/engines/gpt-j-6b", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.status === 200) {
      return true;
    } else {
      return false;
    }
  }

  async requestLineCompletion(apiKey: string, prompt: string): Promise<string> {
    const completionResponse = await fetch(
      "https://api.goose.ai/v1/engines/gpt-j-6b/completions",
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

    return (await completionResponse.json()).choices[0].text.split("\n")[0];
  }
}

export default Engine;
