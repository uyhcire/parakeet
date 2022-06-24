import { Link } from "@mui/material";
import { useSnackbar } from "notistack";
import React from "react";
import { useDebounce } from "rooks";

import config from "../config.json";

const useCompletion = ({
  accessToken,
  invalidateAccessToken,
  prompt,
}: {
  accessToken: string | null;
  invalidateAccessToken: () => void;
  prompt: string | null;
}): string | null => {
  const { enqueueSnackbar } = useSnackbar();

  type CompletionResultInfo = {
    prompt: string;
    completion: string;
    requestStartTime: Date;
  };
  const [completionResultInfo, _setCompletionResultInfo] =
    React.useState<CompletionResultInfo | null>(null);
  // Helper that updates the completion only if the new completion is not stale.
  const updateCompletionResultInfo = React.useCallback(
    (newCompletionResultInfo: CompletionResultInfo) => {
      _setCompletionResultInfo((oldCompletionResultInfo) => {
        // Ignore the new completion if it is stale.
        if (
          oldCompletionResultInfo &&
          oldCompletionResultInfo.requestStartTime >
            newCompletionResultInfo.requestStartTime
        ) {
          return oldCompletionResultInfo;
        }

        return newCompletionResultInfo;
      });
    },
    []
  );

  const processPrompt = React.useCallback(
    async (
      prompt_: string,
      completionResultInfo_: CompletionResultInfo | null,
      startTimePreDebounce: Date
    ): Promise<void> => {
      const noCompletion = {
        prompt: prompt_,
        completion: "",
      };

      if (accessToken == null) {
        updateCompletionResultInfo({
          ...noCompletion,
          requestStartTime: new Date(),
        });
        return;
      }

      // Empty prompts are not likely to give good results.
      if (prompt_ === "") {
        updateCompletionResultInfo({
          ...noCompletion,
          requestStartTime: new Date(),
        });
        return;
      }

      // Handle the cases where the completion can be determined without a request, using the cached previous completion.
      //
      // Case 1:
      //
      // If the user accepts a completion, we should not make another request to LM right away, but only after additional input has been entered.
      //
      // If we make another request without rating, the returned completion will simply be blank, which is not helpful. (It is blank because
      // the previous request has already completed the entire line, and we are still on the same line.)
      //
      // This optimization is very important, because it can save *up to 2x* on the number of requests made to the LM,
      // which makes it much easier to stay within OpenAI's rate limits.
      if (
        completionResultInfo_ != null &&
        prompt_ ===
          completionResultInfo_.prompt + completionResultInfo_.completion
      ) {
        updateCompletionResultInfo({
          ...noCompletion,
          requestStartTime: new Date(),
        });
        return;
      }
      //
      // Case 2:
      //
      // If the prompt is the same as before, the completion is the same too.
      if (
        completionResultInfo_ != null &&
        prompt_ === completionResultInfo_.prompt
      ) {
        return; // no state update needed, since nothing has changed
      }

      const requestStartTime = new Date();
      const response = await fetch(`https://${config.flyio_domain}/codex`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ prompt: prompt_ }),
      });

      switch (response.status) {
        case 200: {
          const { completion: newCompletion } = await response.json();

          console.log(
            `Parakeet: LM request (including the wait for debouncing) took ${
              new Date().getTime() - startTimePreDebounce.getTime()
            }ms`
          );

          updateCompletionResultInfo({
            prompt: prompt_,
            completion: newCompletion,
            requestStartTime,
          });
          return;
        }
        case 401: {
          invalidateAccessToken();
          enqueueSnackbar(
            <span>
              You must{" "}
              <Link
                onClick={() => {
                  chrome.runtime.sendMessage("signIn");
                }}
              >
                sign in
              </Link>{" "}
              (or sign back in) to use Parakeet.
            </span>,
            { variant: "warning", persist: true }
          );

          updateCompletionResultInfo({ ...noCompletion, requestStartTime });
          return;
        }
        case 429: {
          enqueueSnackbar(
            "Parakeet completions will be available again in a few moments.",
            { variant: "info" }
          );

          updateCompletionResultInfo({ ...noCompletion, requestStartTime });
          return;
        }
        default: {
          enqueueSnackbar(
            <span>
              Parakeet ran into an unexpected error. If this continues, you can
              file an issue{" "}
              <Link href="https://github.com/uyhcire/parakeet/issues/new/choose">
                on GitHub
              </Link>
              .
            </span>,
            { variant: "error" }
          );

          updateCompletionResultInfo({ ...noCompletion, requestStartTime });
          return;
        }
      }
    },
    [
      accessToken,
      enqueueSnackbar,
      invalidateAccessToken,
      updateCompletionResultInfo,
    ]
  );
  const processPromptDebounced: typeof processPrompt = useDebounce(
    processPrompt,
    500
  );

  const completionResultInfoJson = JSON.stringify(completionResultInfo);
  React.useEffect(() => {
    const startTimePreDebounce = new Date();
    if (prompt != null) {
      processPromptDebounced(
        prompt,
        JSON.parse(completionResultInfoJson),
        startTimePreDebounce
      );
    }
  }, [completionResultInfoJson, processPromptDebounced, prompt]);

  const completion =
    completionResultInfo != null && completionResultInfo.prompt === prompt
      ? completionResultInfo.completion
      : // The completion is unavailable or it is out of date
        null;
  return completion;
};

export default useCompletion;
