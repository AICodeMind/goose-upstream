import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAgentStore } from "@/features/agents/stores/agentStore";
import { setStoredModelPreference } from "@/features/chat/lib/modelPreferences";
import { useCredentials } from "@/features/providers/hooks/useCredentials";
import { saveDefaults } from "../api/onboarding";
import type {
  OnboardingReadiness,
  SelectedSetup,
  TFunctionLike,
} from "../types";

const XINGYUN_PROVIDER_ID = "xingyun";
const XINGYUN_DEFAULT_MODEL_ID = "qwen3.6-plus";
const XINGYUN_DEFAULT_MODEL_NAME = "qwen3.6-plus";
const XINGYUN_API_KEY = "XINGYUN_API_KEY";
const XINGYUN_API_KEY_URL = "https://aiapi.xing-yun.cn/console/token";

interface UseOnboardingProviderStepParams {
  readiness: OnboardingReadiness;
  t: TFunctionLike;
  onSelectedSetup: (setup: SelectedSetup) => void;
  onReady: () => void;
}

export function useOnboardingProviderStep({
  readiness,
  t,
  onSelectedSetup,
  onReady,
}: UseOnboardingProviderStepParams) {
  const [providerError, setProviderError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [savingApiKey, setSavingApiKey] = useState(false);
  const agentStore = useAgentStore();

  const {
    configuredIds,
    loading: credentialLoading,
    savingProviderIds,
    syncingProviderIds,
    inventoryWarnings,
    save,
  } = useCredentials();

  async function saveXingyunApiKey() {
    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey) {
      setProviderError(t("onboarding:provider.apiKeyRequired"));
      return;
    }

    setProviderError("");
    setSavingApiKey(true);
    try {
      await save(XINGYUN_PROVIDER_ID, [
        {
          key: XINGYUN_API_KEY,
          value: trimmedApiKey,
          isSecret: true,
        },
      ]);
      await saveDefaults({
        providerId: XINGYUN_PROVIDER_ID,
        modelId: XINGYUN_DEFAULT_MODEL_ID,
      });
      const setup = {
        providerId: XINGYUN_PROVIDER_ID,
        modelId: XINGYUN_DEFAULT_MODEL_ID,
        modelName: XINGYUN_DEFAULT_MODEL_NAME,
      };
      setStoredModelPreference("goose", setup);
      agentStore.setSelectedProvider("goose");
      onSelectedSetup(setup);
      onReady();
    } catch (error) {
      setProviderError(
        error instanceof Error
          ? error.message
          : t("onboarding:provider.saveFailed"),
      );
    } finally {
      setSavingApiKey(false);
    }
  }

  async function continueWithCurrentDefault() {
    const setup = {
      providerId: XINGYUN_PROVIDER_ID,
      modelId: XINGYUN_DEFAULT_MODEL_ID,
      modelName: XINGYUN_DEFAULT_MODEL_NAME,
    };

    setProviderError("");
    setSavingApiKey(true);
    try {
      await saveDefaults({
        providerId: XINGYUN_PROVIDER_ID,
        modelId: XINGYUN_DEFAULT_MODEL_ID,
      });
      setStoredModelPreference("goose", setup);
      agentStore.setSelectedProvider("goose");
      onSelectedSetup(setup);
      onReady();
    } catch (error) {
      setProviderError(
        error instanceof Error
          ? error.message
          : t("onboarding:provider.selectFailed"),
      );
    } finally {
      setSavingApiKey(false);
    }
  }

  return {
    apiKey,
    isConfigured:
      readiness.providerId === XINGYUN_PROVIDER_ID ||
      configuredIds.has(XINGYUN_PROVIDER_ID),
    credentialLoading,
    savingApiKey: savingApiKey || savingProviderIds.has(XINGYUN_PROVIDER_ID),
    syncingApiKey: syncingProviderIds.has(XINGYUN_PROVIDER_ID),
    inventoryWarning: inventoryWarnings.get(XINGYUN_PROVIDER_ID),
    providerError,
    onApiKeyChange: setApiKey,
    onSaveApiKey: () => void saveXingyunApiKey(),
    onContinue: () => void continueWithCurrentDefault(),
    onOpenApiKeyConsole: () => {
      void openUrl(XINGYUN_API_KEY_URL);
    },
  };
}
