import type { ProviderInventoryEntryDto } from "@aaif/goose-sdk";
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
  syncProviderInventory: vi.fn(),
}));

vi.mock("../api/onboarding", () => ({
  saveDefaults: mocks.saveDefaults,
}));

vi.mock("@/features/providers/api/inventorySync", () => ({
  syncProviderInventory: mocks.syncProviderInventory,
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

function xingyunInventoryEntry(
  models: ProviderInventoryEntryDto["models"],
  overrides: Partial<ProviderInventoryEntryDto> = {},
): ProviderInventoryEntryDto {
  return {
    providerId: "xingyun",
    providerName: "XingYun AI",
    description: "XingYun model service",
    defaultModel: models[0]?.id ?? "",
    configured: true,
    providerType: "Declarative",
    category: "model",
    configKeys: [],
    setupSteps: [],
    supportsRefresh: true,
    refreshing: false,
    models,
    stale: false,
    ...overrides,
  };
}

function mockSyncedModels(models: ProviderInventoryEntryDto["models"]) {
  mocks.syncProviderInventory.mockResolvedValue({
    settled: true,
    entries: [xingyunInventoryEntry(models)],
  });
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
    mockSyncedModels([
      {
        id: "qwen3.6-plus",
        name: "Qwen 3.6 Plus",
      },
    ]);
    useAgentStore.setState({
      selectedProvider: "goose",
      providers: [],
    });
    useProviderInventoryStore.setState({
      entries: new Map(),
      loading: false,
    });
  });

  it("saves the XingYun API key and selects qwen3.6-plus when available", async () => {
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
    expect(mocks.syncProviderInventory).toHaveBeenCalledWith(["xingyun"], {
      onEntries: expect.any(Function),
    });
    expect(mocks.saveDefaults).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
    });
    expect(onSelectedSetup).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
      modelName: "Qwen 3.6 Plus",
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
    expect(mocks.syncProviderInventory).toHaveBeenCalledWith(["xingyun"], {
      onEntries: expect.any(Function),
    });
    expect(mocks.saveDefaults).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
    });
    expect(onSelectedSetup).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
      modelName: "Qwen 3.6 Plus",
    });
    expect(useAgentStore.getState().selectedProvider).toBe("goose");
    expect(getStoredModelPreference("goose")).toMatchObject({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
    });
  });

  it("falls back to gpt-5.5 when qwen3.6-plus is unavailable", async () => {
    mockSyncedModels([
      {
        id: "gpt-5.5",
        name: "GPT 5.5",
      },
      {
        id: "other-model",
        name: "Other Model",
      },
    ]);

    const { result, onReady, onSelectedSetup } = renderProviderStep(
      readyReadiness(),
    );

    act(() => {
      result.current.onContinue();
    });

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(mocks.saveDefaults).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "gpt-5.5",
    });
    expect(onSelectedSetup).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "gpt-5.5",
      modelName: "GPT 5.5",
    });
  });

  it("uses the first available model when preferred models are unavailable", async () => {
    mockSyncedModels([
      {
        id: "custom-model",
        name: "Custom Model",
      },
    ]);

    const { result, onReady, onSelectedSetup } = renderProviderStep(
      readyReadiness(),
    );

    act(() => {
      result.current.onContinue();
    });

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(mocks.saveDefaults).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "custom-model",
    });
    expect(onSelectedSetup).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "custom-model",
      modelName: "Custom Model",
    });
  });

  it("continues with available models when model refresh reports an error", async () => {
    mocks.syncProviderInventory.mockResolvedValue({
      settled: true,
      entries: [
        xingyunInventoryEntry(
          [
            {
              id: "qwen3.6-plus",
              name: "Qwen 3.6 Plus",
            },
          ],
          {
            lastRefreshError: "refresh failed",
          },
        ),
      ],
    });

    const { result, onReady, onSelectedSetup } = renderProviderStep(
      readyReadiness(),
    );

    act(() => {
      result.current.onContinue();
    });

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(mocks.saveDefaults).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
    });
    expect(onSelectedSetup).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
      modelName: "Qwen 3.6 Plus",
    });
  });

  it("continues with available models when model refresh times out", async () => {
    mocks.syncProviderInventory.mockResolvedValue({
      settled: false,
      entries: [
        xingyunInventoryEntry(
          [
            {
              id: "qwen3.6-plus",
              name: "Qwen 3.6 Plus",
            },
          ],
          {
            refreshing: true,
          },
        ),
      ],
    });

    const { result, onReady, onSelectedSetup } = renderProviderStep(
      readyReadiness(),
    );

    act(() => {
      result.current.onContinue();
    });

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(mocks.saveDefaults).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
    });
    expect(onSelectedSetup).toHaveBeenCalledWith({
      providerId: "xingyun",
      modelId: "qwen3.6-plus",
      modelName: "Qwen 3.6 Plus",
    });
  });

  it("does not complete onboarding when the API key has no available models", async () => {
    mockSyncedModels([]);

    const { result, onReady, onSelectedSetup } = renderProviderStep(
      readyReadiness(),
    );

    act(() => {
      result.current.onContinue();
    });

    await waitFor(() =>
      expect(result.current.providerError).toBe(
        "onboarding:provider.noAvailableModels",
      ),
    );
    expect(onReady).not.toHaveBeenCalled();
    expect(onSelectedSetup).not.toHaveBeenCalled();
    expect(mocks.saveDefaults).not.toHaveBeenCalled();
  });
});
