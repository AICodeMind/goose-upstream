import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Persona } from "@/shared/types/agents";
import { PersonaEditor } from "../PersonaEditor";

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: "p1",
    displayName: "Coder",
    systemPrompt: "You review code.",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    isBuiltin: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("PersonaEditor", () => {
  it("does not show provider or model selection when creating a persona", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(<PersonaEditor isOpen={true} onClose={vi.fn()} onSave={onSave} />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("e.g. Code Reviewer"), "Coder");
    await user.type(
      screen.getByPlaceholderText("You are a helpful assistant that..."),
      "You review code.",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(onSave).toHaveBeenCalledWith({
      displayName: "Coder",
      avatar: undefined,
      systemPrompt: "You review code.",
      provider: "goose",
      model: "qwen3.6-plus",
    });
  });

  it("does not show provider or model fields in persona details", () => {
    render(
      <PersonaEditor
        isOpen={true}
        mode="details"
        persona={makePersona()}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText("Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Model")).not.toBeInTheDocument();
    expect(screen.getAllByText("Coder")).not.toHaveLength(0);
  });
});
