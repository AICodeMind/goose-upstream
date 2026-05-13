import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  ProviderInventoryEntryDto,
  ProviderInventoryModelDto,
} from "@aaif/goose-sdk";
import { useAgentStore } from "@/features/agents/stores/agentStore";
import { setStoredModelPreference } from "@/features/chat/lib/modelPreferences";
import { syncProviderInventory } from "@/features/providers/api/inventorySync";
import { useCredentials } from "@/features/providers/hooks/useCredentials";
import { useProviderInventoryStore } from "@/features/providers/stores/providerInventoryStore";
import { saveDefaults } from "../api/onboarding";
import type {
  OnboardingReadiness,
  SelectedSetup,
  TFunctionLike,
} from "../types";

const XINGYUN_PROVIDER_ID = "xingyun";
const XINGYUN_PREFERRED_MODEL_IDS = ["qwen3.6-plus", "gpt-5.5"];
const XINGYUN_API_KEY = "XINGYUN_API_KEY";
const XINGYUN_API_KEY_URL = "https://aiapi.xing-yun.cn/console/token";

function chooseXingyunModel(
  models: ProviderInventoryModelDto[],
): ProviderInventoryModelDto | null {
  for (const modelId of XINGYUN_PREFERRED_MODEL_IDS) {
    const model = models.find((item) => item.id === modelId);
    if (model) {
      return model;
    }
  }

  return models[0] ?? null;
}

function xingyunEntryFromSyncResult(
  entries: ProviderInventoryEntryDto[],
): ProviderInventoryEntryDto | null {
  return (
    entries.find((entry) => entry.providerId === XINGYUN_PROVIDER_ID) ?? null
  );
}

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
  const mergeInventoryEntries = useProviderInventoryStore(
    (state) => state.mergeEntries,
  );

  const {
    configuredIds,
    loading: credentialLoading,
    savingProviderIds,
    syncingProviderIds,
    inventoryWarnings,
    save,
  } = useCredentials();

  async function selectAvailableXingyunModel() {
    const result = await syncProviderInventory([XINGYUN_PROVIDER_ID], {
      onEntries: mergeInventoryEntries,
    });
    const entry = xingyunEntryFromSyncResult(result.entries);

    const selectedModel = chooseXingyunModel(entry?.models ?? []);
    if (!selectedModel) {
      if (!result.settled && entry?.refreshing) {
        throw new Error(t("onboarding:provider.modelSyncTimeout"));
      }

      if (entry?.lastRefreshError) {
        throw new Error(
          t("onboarding:provider.modelRefreshFailed", {
            message: entry.lastRefreshError,
          }),
        );
      }

      throw new Error(t("onboarding:provider.noAvailableModels"));
    }

    return {
      providerId: XINGYUN_PROVIDER_ID,
      modelId: selectedModel.id,
      modelName: selectedModel.name || selectedModel.id,
    };
  }

  async function applyXingyunSetup() {
    const setup = await selectAvailableXingyunModel();
    await saveDefaults({
      providerId: XINGYUN_PROVIDER_ID,
      modelId: setup.modelId,
    });
    setStoredModelPreference("goose", setup);
    agentStore.setSelectedProvider("goose");
    onSelectedSetup(setup);
    onReady();
  }

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
      await applyXingyunSetup();
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
    setProviderError("");
    setSavingApiKey(true);
    try {
      await applyXingyunSetup();
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
