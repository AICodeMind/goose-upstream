import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentStore } from "@/features/agents/stores/agentStore";
import { getStoredModelPreference } from "@/features/chat/lib/modelPreferences";
import { useProviderInventoryStore } from "@/features/providers/stores/providerInventoryStore";
import type { OnboardingReadiness } from "../types";
import { useOnboardingProviderStep } from "./useOnboardingProviderStep";

const mocks = vi.hoisted(() => ({
  saveDefaults: vi.fn(),
  saveProviderConfig: vi.fn(),
}));

vi.mock("../api/onboarding", () => ({
  saveDefaults: mocks.saveDefaults,
}));

vi.mock("@/features/providers/hooks/useCredentials", () => ({
  useCredentials: () => ({
    configuredIds: new Set<string>(),
    loading: false,
    savingProviderIds: new Set<string>(),
    syncingProviderIds: new Set<string>(),
    inventoryWarnings: new Map<string, string[]>(),
    getConfig: vi.fn(),
    save: mocks.saveProviderConfig,
    remove: vi.fn(),
    completeNativeSetup: vi.fn(),
  }),
}));

function readyReadiness(
  overrides: Partial<OnboardingReadiness> = {},
): OnboardingReadiness {
  return {
    hasCompletedOnboarding: true,
    isUsable: true,
    providerId: "anthropic",
    modelId: "claude-sonnet-4-5",
    modelName: "Claude Sonnet 4.5",
    reason: "ready",
    ...overrides,
  };
}

function renderProviderStep(readiness: OnboardingReadiness) {
  const onSelectedSetup = vi.fn();
  const onReady = vi.fn();

  const result = renderHook(() =>
    useOnboardingProviderStep({
      readiness,
      t: (key) => key,
      onSelectedSetup,
      onReady,
    }),
  );

  return {
    ...result,
    onReady,
    onSelectedSetup,
  };
}

describe("useOnboardingProviderStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.saveDefaults.mockResolvedValue({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
    });
    mocks.saveProviderConfig.mockResolvedValue(undefined);
    useAgentStore.setState({
      selectedProvider: "goose",
      providers: [],
    });
    useProviderInventoryStore.setState({
      entries: new Map(),
      loading: false,
    });
  });

  it("saves the XingYun API key and fixed default model", async () => {
    const { result, onReady, onSelectedSetup } = renderProviderStep(
      readyReadiness({ isUsable: false, providerId: null }),
    );

    act(() => {
      result.current.onApiKeyChange(" xy-key ");
    });

    act(() => {
      result.current.onSaveApiKey();
    });

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(mocks.saveProviderConfig).toHaveBeenCalledWith("xingyun", [
      {
        key: "XINGYUN_API_KEY",
        value: "xy-key",
        isSecret: true,
      },
    ]);
    expect(mocks.saveDefaults).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
    });
    expect(onSelectedSetup).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
      modelName: "qwen3.6-plus",
    });
    expect(useAgentStore.getState().selectedProvider).toBe("goose");
    expect(getStoredModelPreference("goose")).toMatchObject({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
    });
  });

  it("continues with XingYun defaults when a key is already configured", async () => {
    const { result, onReady, onSelectedSetup } = renderProviderStep(
      readyReadiness(),
    );

    act(() => {
      result.current.onContinue();
    });

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(mocks.saveProviderConfig).not.toHaveBeenCalled();
    expect(mocks.saveDefaults).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
    });
    expect(onSelectedSetup).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
      modelName: "qwen3.6-plus",
    });
    expect(useAgentStore.getState().selectedProvider).toBe("goose");
    expect(getStoredModelPreference("goose")).toMatchObject({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
    });
  });
});
