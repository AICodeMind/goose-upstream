import {
  IconArrowRight,
  IconCheck,
  IconExternalLink,
  IconPlugConnected,
} from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { getProviderIcon } from "@/shared/ui/icons/ProviderIcons";
import { Spinner } from "@/shared/ui/spinner";
import type { TFunctionLike } from "../types";

interface ProviderStepProps {
  apiKey: string;
  isConfigured: boolean;
  credentialLoading: boolean;
  savingApiKey: boolean;
  syncingApiKey: boolean;
  inventoryWarning?: string | null;
  providerError: string;
  onApiKeyChange: (value: string) => void;
  onSaveApiKey: () => void;
  onContinue: () => void;
  onOpenApiKeyConsole: () => void;
  t: TFunctionLike;
}

export function ProviderStep({
  apiKey,
  isConfigured,
  credentialLoading,
  savingApiKey,
  syncingApiKey,
  inventoryWarning,
  providerError,
  onApiKeyChange,
  onSaveApiKey,
  onContinue,
  onOpenApiKeyConsole,
  t,
}: ProviderStepProps) {
  const isBusy = credentialLoading || savingApiKey;

  return (
    <section className="flex w-full flex-col items-center">
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-[14px]",
          isConfigured
            ? "bg-green-100/40 text-green-300"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isConfigured ? (
          <IconCheck className="size-7" strokeWidth={2.25} />
        ) : (
          <IconPlugConnected className="size-6" strokeWidth={1.75} />
        )}
      </div>
      <h2 className="mt-6 text-[22px] font-semibold tracking-tight text-foreground">
        {isConfigured ? t("provider.readyTitle") : t("provider.title")}
      </h2>
      <p className="mt-2 max-w-[420px] text-sm leading-6 text-muted-foreground">
        {isConfigured
          ? t("provider.readyDescription")
          : t("provider.description")}
      </p>

      <div className="mt-8 w-full rounded-[14px] border border-border p-4 text-left">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-muted text-foreground">
            {getProviderIcon("xingyun", "size-4") ?? (
              <IconPlugConnected className="size-4" strokeWidth={1.75} />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {t("provider.xingyunName")}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {t("provider.fixedProviderDescription")}
            </span>
          </span>
        </div>

        {credentialLoading ? (
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3 text-foreground" />
            {t("provider.checking")}
          </p>
        ) : null}

        {isConfigured ? (
          <p className="mt-4 rounded-[10px] bg-green-100/40 px-3 py-2 text-xs text-green-700">
            {t("provider.apiKeyConfigured")}
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            <label
              htmlFor="xingyun-api-key"
              className="text-xs font-medium text-foreground"
            >
              {t("provider.apiKeyLabel")}
            </label>
            <Input
              id="xingyun-api-key"
              type="password"
              value={apiKey}
              placeholder={t("provider.apiKeyPlaceholder")}
              onChange={(event) => onApiKeyChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSaveApiKey();
                }
              }}
              disabled={isBusy}
              autoComplete="off"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {t("provider.apiKeyHelp")}
            </p>

            <div className="mt-3 rounded-[10px] border border-border/70 bg-background-secondary/40 p-3 text-left text-xs leading-5">
              <p className="text-foreground">
                {t("provider.getKeyIntro")}{" "}
                <button
                  type="button"
                  onClick={onOpenApiKeyConsole}
                  className="inline-flex items-center gap-0.5 text-brand underline-offset-2 hover:underline"
                >
                  {t("provider.getKeyLink")}
                  <IconExternalLink
                    aria-hidden
                    className="size-3"
                    strokeWidth={1.75}
                  />
                </button>
              </p>
              <p className="mt-2 text-muted-foreground">
                {t("provider.groupHintIntro")}
              </p>
              <ul className="mt-1.5 space-y-1.5 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-[1px] inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                    CodeMind
                  </span>
                  <span>{t("provider.groupCodeMind")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-[1px] inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                    CodeMind-China
                  </span>
                  <span>{t("provider.groupCodeMindChina")}</span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {providerError ? (
        <p
          role="alert"
          className="mt-4 w-full rounded-[10px] bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {providerError}
        </p>
      ) : null}

      {syncingApiKey ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3 text-foreground" />
          {t("provider.loadingModels")}
        </p>
      ) : null}

      {inventoryWarning ? (
        <p className="mt-3 w-full rounded-[10px] bg-background-warning/20 px-3 py-2 text-xs text-text-warning">
          {t("provider.modelRefreshWarning", { message: inventoryWarning })}
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-center">
        <Button
          type="button"
          onClick={isConfigured ? onContinue : onSaveApiKey}
          disabled={isBusy || (!isConfigured && !apiKey.trim())}
          rightIcon={savingApiKey ? undefined : <IconArrowRight />}
        >
          {savingApiKey ? (
            <Spinner className="size-3 text-primary-foreground" />
          ) : null}
          {isConfigured
            ? t("provider.continue")
            : t("provider.saveAndContinue")}
        </Button>
      </div>
    </section>
  );
}
