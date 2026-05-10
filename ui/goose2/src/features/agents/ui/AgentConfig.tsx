import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type {
  Agent,
  Persona,
  AgentConnectionType,
  CreateAgentRequest,
} from "@/shared/types/agents";

const XINGYUN_AGENT_PROVIDER = "goose";
const XINGYUN_DEFAULT_MODEL = "qwen3.6-plus";

interface AgentConfigProps {
  agent?: Agent;
  personas: Persona[];
  onSave: (config: CreateAgentRequest) => void;
  onCancel: () => void;
}

export function AgentConfig({
  agent,
  personas,
  onSave,
  onCancel,
}: AgentConfigProps) {
  const { t } = useTranslation(["agents", "common"]);

  const [name, setName] = useState(agent?.name ?? "");
  const [personaId, setPersonaId] = useState(agent?.personaId ?? "");
  const connectionType: AgentConnectionType = "builtin";
  const provider = XINGYUN_AGENT_PROVIDER;
  const [model, setModel] = useState(agent?.model ?? XINGYUN_DEFAULT_MODEL);
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? "");
  const [promptExpanded, setPromptExpanded] = useState(false);

  const selectedPersona = useMemo(
    () => personas.find((p) => p.id === personaId),
    [personas, personaId],
  );

  // Sync inherited fields when persona changes
  useEffect(() => {
    if (selectedPersona) {
      setModel(selectedPersona.model ?? XINGYUN_DEFAULT_MODEL);
      setSystemPrompt(selectedPersona.systemPrompt);
    }
  }, [selectedPersona]);

  const isValid = name.trim().length > 0;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!isValid) return;

      const config: CreateAgentRequest = {
        name: name.trim(),
        personaId: personaId || undefined,
        provider,
        model: model.trim() || XINGYUN_DEFAULT_MODEL,
        systemPrompt: systemPrompt.trim() || undefined,
        connectionType,
      };
      onSave(config);
    },
    [isValid, name, personaId, model, systemPrompt, onSave],
  );

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={t("config.ariaLabel")}
      className="space-y-4"
    >
      {/* Name */}
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("config.name")} <span className="text-destructive">*</span>
        </Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder={t("config.namePlaceholder")}
        />
      </div>

      {/* Persona selector */}
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("config.persona")}
        </Label>
        <Select
          value={personaId || "__none__"}
          onValueChange={(v: string) => setPersonaId(v === "__none__" ? "" : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("common:labels.none")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t("common:labels.none")}</SelectItem>
            {personas.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.displayName}
                {p.isBuiltin
                  ? ` (${t("common:labels.builtIn").toLowerCase()})`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model override */}
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("config.model")}
          {selectedPersona?.model && (
            <span className="ml-1 text-muted-foreground">
              {t("config.fromPersona", { value: selectedPersona.model })}
            </span>
          )}
        </Label>
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={t("config.modelPlaceholder")}
        />
      </div>

      {/* System prompt override */}
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setPromptExpanded((v) => !v)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {promptExpanded
            ? t("config.systemPromptOverrideExpanded")
            : t("config.systemPromptOverrideCollapsed")}
        </button>
        {promptExpanded && (
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={5}
            placeholder={t("config.systemPromptPlaceholder")}
            className="leading-relaxed"
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={!isValid}>
          {agent ? t("config.updateAgent") : t("config.createAgent")}
        </Button>
      </div>
    </form>
  );
}
