import React from "react";
import { CodexEngine, createEngine, EngineType, GPTJEngine } from "./engine";

interface EngineInfo {
  engineType: EngineType;
  name: string;
}

interface CredentialsState {
  availableEngines: Array<EngineInfo>;
  currentEngineCreds: {
    engineType: EngineType;
    apiKey: string;
    apiKeyStatus: "VALID" | "INVALID" | "UNKNOWN";
  };
}

const AVAILABLE_ENGINES: Array<EngineInfo> = [
  { engineType: EngineType.GPTJ, name: GPTJEngine.engineName },
  { engineType: EngineType.CODEX, name: CodexEngine.engineName },
];
const DEFAULT_ENGINE_TYPE = EngineType.CODEX;

/**
 * Provide an API to access and store API keys for the available language model engines.
 *
 * The returned credentials are kept up to date with the state of Chrome's storage,
 * and whatever is submitted to setSelectedEngine/setApiKey gets written out to Chrome's storage as well.
 */
const useCredentials = ():
  | (CredentialsState & {
      setSelectedEngine: (engineType: EngineType) => void;
      setApiKey: (newApiKey: string) => void;
    })
  // null if still loading
  | null => {
  const [currentEngineCreds, setCurrentEngineCreds] = React.useState<
    CredentialsState["currentEngineCreds"] | null
  >(null);
  const fetchCredentials = React.useCallback((): Promise<
    CredentialsState["currentEngineCreds"]
  > => {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get("PARAKEET_SELECTED_ENGINE_TYPE", (items) => {
        let engineInfo;
        if (items["PARAKEET_SELECTED_ENGINE_TYPE"]) {
          engineInfo =
            AVAILABLE_ENGINES.find(
              (engine) =>
                engine.engineType === items["PARAKEET_SELECTED_ENGINE_TYPE"]
            ) ?? null;
        } else {
          engineInfo =
            AVAILABLE_ENGINES.find(
              (engine) => engine.engineType === DEFAULT_ENGINE_TYPE
            ) ?? null;
        }

        if (engineInfo == null) {
          reject("Default engine Codex is missing");
          return;
        }

        const { engineType } = engineInfo;

        const apiKeyStorageKey = `PARAKEET_API_KEY.${engineType}`;

        chrome.storage.sync.get(apiKeyStorageKey, (items) => {
          const storedApiKey = items[apiKeyStorageKey] ?? "";
          resolve({
            engineType,
            apiKey: storedApiKey,
            apiKeyStatus: storedApiKey.length > 0 ? "VALID" : "UNKNOWN",
          });
        });
      });
    });
  }, []);
  React.useEffect(() => {
    fetchCredentials().then(setCurrentEngineCreds);
  }, [fetchCredentials, setCurrentEngineCreds]);

  // This hook is used not just by the popup but also by the content script.
  // If the API key is updated while this content script is running,
  // the new API key should be usable without refreshing the page.
  type StorageChangeCallback = Parameters<
    typeof chrome.storage.onChanged.addListener
  >[0];
  const onStorageChanged = React.useCallback<StorageChangeCallback>(() => {
    fetchCredentials().then(setCurrentEngineCreds);
  }, [fetchCredentials, setCurrentEngineCreds]);
  React.useEffect(() => {
    chrome.storage.onChanged.addListener(onStorageChanged);
    return () => {
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, [onStorageChanged]);

  const isLoading = currentEngineCreds == null;

  const setSelectedEngine = React.useCallback(
    async (engineType: EngineType) => {
      if (isLoading) {
        return;
      }

      const engineInfo = AVAILABLE_ENGINES.find(
        (engine) => engine.engineType === engineType
      );
      if (engineInfo == null) {
        throw new Error(`Invalid engine type ${engineType}`);
      }

      chrome.storage.sync.set({
        PARAKEET_SELECTED_ENGINE_TYPE: engineType,
      });
      const apiKeyStorageKey = `PARAKEET_API_KEY.${engineInfo.engineType}`;
      chrome.storage.sync.get(apiKeyStorageKey, (items) => {
        const storedApiKey = items[apiKeyStorageKey] ?? "";
        setCurrentEngineCreds({
          engineType: engineInfo.engineType,
          apiKey: storedApiKey,
          apiKeyStatus: storedApiKey.length > 0 ? "VALID" : "UNKNOWN",
        });
      });
    },
    [isLoading, setCurrentEngineCreds]
  );

  const currentEngineType = currentEngineCreds?.engineType;
  const setApiKey = React.useCallback(
    async (newApiKey: string) => {
      if (isLoading) {
        return;
      }

      setCurrentEngineCreds((currentEngineCreds) => ({
        ...currentEngineCreds!,
        apiKey: newApiKey,
        apiKeyStatus: "UNKNOWN",
      }));

      // Validate the API key, and store it in Chrome storage if it's valid.
      if (newApiKey.length === 0) {
        return;
      }

      const engineInfo = AVAILABLE_ENGINES.find(
        (engine) => engine.engineType === currentEngineType
      );
      if (engineInfo == null) {
        throw new Error(`Invalid engine type ${currentEngineType}`);
      }

      const engine = createEngine(engineInfo.engineType, newApiKey);
      const apiKeyStorageKey = `PARAKEET_API_KEY.${engineInfo.engineType}`;
      const couldConnect = await engine.testConnection(newApiKey);
      if (couldConnect) {
        chrome.storage.sync.set({ [apiKeyStorageKey]: newApiKey }, () => {
          setCurrentEngineCreds((currentEngineCreds) => ({
            ...currentEngineCreds!,
            apiKeyStatus: "VALID",
          }));
        });
      } else {
        // Could not connect to the API. THe API key may be invalid.
        setCurrentEngineCreds((currentEngineCreds) => ({
          ...currentEngineCreds!,
          apiKeyStatus: "INVALID",
        }));
      }
    },
    [currentEngineType, isLoading, setCurrentEngineCreds]
  );

  return !isLoading
    ? {
        availableEngines: AVAILABLE_ENGINES,
        currentEngineCreds,
        setSelectedEngine,
        setApiKey,
      }
    : null;
};

export default useCredentials;
