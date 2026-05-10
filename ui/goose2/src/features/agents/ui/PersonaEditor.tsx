import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import {
  Avatar as AvatarRoot,
  AvatarImage,
  AvatarFallback,
} from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { useAvatarSrc } from "@/shared/hooks/useAvatarSrc";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import type { Persona, Avatar } from "@/shared/types/agents";
import type {
  CreatePersonaRequest,
  UpdatePersonaRequest,
} from "@/shared/types/agents";
import {
  getPersonaSource,
  isPersonaReadOnly,
} from "@/features/agents/lib/personaPresentation";
import { AvatarDropZone } from "./AvatarDropZone";
import { PersonaDetails } from "./PersonaDetails";

const XINGYUN_AGENT_PROVIDER = "goose";
const XINGYUN_DEFAULT_MODEL = "qwen3.6-plus";

interface PersonaEditorProps {
  persona?: Persona;
  isOpen: boolean;
  mode?: "create" | "edit" | "details";
  onClose: () => void;
  onSave: (data: CreatePersonaRequest | UpdatePersonaRequest) => void;
  onDuplicate?: (persona: Persona) => void;
  onEdit?: (persona: Persona) => void;
  onDelete?: (persona: Persona) => void;
  isPending?: boolean;
}

export function PersonaEditor({
  persona,
  isOpen,
  mode = "create",
  onClose,
  onSave,
  onDuplicate,
  onEdit,
  onDelete,
  isPending = false,
}: PersonaEditorProps) {
  const { t } = useTranslation(["agents", "common"]);
  const isEditing = mode === "edit";
  const detailsMode = mode === "details";
  const readOnlyBySource = persona ? isPersonaReadOnly(persona) : false;
  const isReadOnly = detailsMode || readOnlyBySource;
  const personaSource = persona ? getPersonaSource(persona) : "custom";
  const canEditPersona = personaSource === "custom";
  const canDeletePersona = personaSource !== "builtin";

  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");

  useEffect(() => {
    if (isOpen && persona) {
      setDisplayName(persona.displayName);
      setAvatar(persona.avatar ?? null);
      setSystemPrompt(persona.systemPrompt);
    } else if (isOpen) {
      setDisplayName("");
      setAvatar(null);
      setSystemPrompt("");
    }
  }, [isOpen, persona]);

  const isValid =
    displayName.trim().length > 0 && systemPrompt.trim().length > 0;
  const avatarSrc = useAvatarSrc(avatar);

  const readOnlyDescription = readOnlyBySource
    ? personaSource === "builtin"
      ? t("editor.readOnlyBuiltIn")
      : t("editor.readOnlyFile")
    : null;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!isValid || isReadOnly) return;

      const data: CreatePersonaRequest | UpdatePersonaRequest = {
        displayName: displayName.trim(),
        avatar: avatar ?? undefined,
        systemPrompt: systemPrompt.trim(),
        provider: XINGYUN_AGENT_PROVIDER,
        model: XINGYUN_DEFAULT_MODEL,
      };
      onSave(data);
    },
    [isValid, isReadOnly, displayName, avatar, systemPrompt, onSave],
  );

  const initials = displayName.charAt(0).toUpperCase() || "?";

  // For new personas, use a temporary ID for the avatar upload
  const avatarPersonaId = persona?.id ?? "new-persona";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 px-5 py-4">
          <DialogTitle className="text-sm">
            {detailsMode
              ? persona?.displayName
              : isEditing
                ? t("editor.editTitle")
                : t("editor.newTitle")}
          </DialogTitle>
          {readOnlyDescription ? (
            <p className="text-xs text-muted-foreground">
              {readOnlyDescription}
            </p>
          ) : null}
        </DialogHeader>

        {detailsMode ? (
          <PersonaDetails
            avatar={avatar}
            displayName={displayName}
            personaSource={personaSource}
            systemPrompt={systemPrompt}
          />
        ) : (
          <form
            id="persona-form"
            onSubmit={handleSubmit}
            className="min-h-0 flex-1 overflow-y-auto space-y-4 px-5 pb-5"
          >
            <div className="flex justify-center">
              {isReadOnly ? (
                <AvatarRoot className="h-16 w-16 border border-border">
                  <AvatarImage
                    src={avatarSrc ?? undefined}
                    alt={t("avatar.previewAlt")}
                  />
                  <AvatarFallback className="text-lg font-semibold">
                    {initials}
                  </AvatarFallback>
                </AvatarRoot>
              ) : (
                <AvatarDropZone
                  personaId={avatarPersonaId}
                  avatar={avatar}
                  onChange={setAvatar}
                  disabled={isReadOnly}
                />
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("editor.displayName")}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                readOnly={isReadOnly}
                required
                placeholder={t("editor.displayNamePlaceholder")}
                className={cn(isReadOnly && "opacity-70 cursor-not-allowed")}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t("editor.systemPrompt")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  {t("common:labels.characterCount", {
                    count: systemPrompt.length,
                  })}
                </span>
              </div>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                readOnly={isReadOnly}
                required
                rows={6}
                placeholder={t("editor.systemPromptPlaceholder")}
                className={cn(
                  "leading-relaxed",
                  isReadOnly && "opacity-70 cursor-not-allowed",
                )}
              />
            </div>
          </form>
        )}

        <DialogFooter className="shrink-0 border-t px-5 py-4">
          {detailsMode && persona ? (
            <>
              {onEdit && canEditPersona ? (
                <Button
                  type="button"
                  variant="outline-flat"
                  size="sm"
                  onClick={() => onEdit(persona)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("common:actions.edit")}
                </Button>
              ) : null}
              {onDuplicate ? (
                <Button
                  type="button"
                  variant="outline-flat"
                  size="sm"
                  onClick={() => onDuplicate(persona)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t("editor.duplicate")}
                </Button>
              ) : null}
              {onDelete && canDeletePersona ? (
                <Button
                  type="button"
                  variant="destructive-flat"
                  size="sm"
                  onClick={() => onDelete(persona)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("common:actions.delete")}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                {t("common:actions.close")}
              </Button>
            </>
          ) : isReadOnly && onDuplicate && persona ? (
            <>
              <Button
                type="button"
                variant="outline-flat"
                size="sm"
                onClick={() => onDuplicate(persona)}
              >
                <Copy className="h-3.5 w-3.5" />
                {t("editor.duplicate")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                {t("common:actions.close")}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                {t("common:actions.cancel")}
              </Button>
              <Button
                type="submit"
                form="persona-form"
                size="sm"
                disabled={!isValid || isPending}
              >
                {isPending
                  ? t("editor.saving")
                  : isEditing
                    ? t("common:actions.saveChanges")
                    : t("editor.create")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
