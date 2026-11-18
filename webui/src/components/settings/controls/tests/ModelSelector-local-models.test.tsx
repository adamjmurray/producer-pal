// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type LocalModel } from "#webui/chat/sdk/provider/local-model/local-model-catalog";
import { ModelSelector } from "#webui/components/settings/controls/ModelSelector";
import { useLocalModels } from "#webui/hooks/settings/helpers/use-local-models";

vi.mock(import("#webui/hooks/settings/helpers/use-local-models"), () => ({
  useLocalModels: vi.fn(),
}));

const SERVER_MODELS: LocalModel[] = [
  { id: "qwen/qwen3.8-27b", loaded: true, contextLength: 24064 },
  { id: "google/gemma-4-e4b", loaded: false },
  { id: "mistral/devstral", loaded: true },
];

function renderWith(
  models: LocalModel[] | undefined,
  provider: "lmstudio" | "ollama",
  model: string,
): ReturnType<typeof vi.fn> {
  vi.mocked(useLocalModels).mockReturnValue(models);

  const setModel = vi.fn();

  render(
    <ModelSelector
      provider={provider}
      model={model}
      setModel={setModel}
      baseUrl="http://localhost:1234"
    />,
  );

  return setModel;
}

const select = (): HTMLSelectElement =>
  screen.getByRole("combobox") as HTMLSelectElement;

afterEach(() => {
  vi.mocked(useLocalModels).mockReset();
});

describe("ModelSelector with a local server's models", () => {
  it.each(["lmstudio", "ollama"] as const)(
    "lists %s's models, marking the loaded ones, then Other...",
    (provider) => {
      renderWith(SERVER_MODELS, provider, "google/gemma-4-e4b");

      expect([...select().options].map((o) => [o.value, o.text])).toStrictEqual(
        [
          ["qwen/qwen3.8-27b", "qwen/qwen3.8-27b (loaded, 24.1K context)"],
          ["google/gemma-4-e4b", "google/gemma-4-e4b"],
          ["mistral/devstral", "mistral/devstral (loaded)"],
          ["OTHER", "Other..."],
        ],
      );
      expect(select().value).toBe("google/gemma-4-e4b");
      expect(useLocalModels).toHaveBeenCalledWith(
        provider,
        "http://localhost:1234",
      );
    },
  );

  it("sets the model picked from the list", () => {
    const setModel = renderWith(SERVER_MODELS, "lmstudio", "mistral/devstral");

    fireEvent.change(select(), { target: { value: "qwen/qwen3.8-27b" } });

    expect(setModel).toHaveBeenCalledWith("qwen/qwen3.8-27b");
  });

  it("opens the text input for a model the server doesn't list", () => {
    renderWith(SERVER_MODELS, "lmstudio", "not/downloaded");

    expect(select().value).toBe("OTHER");
    expect(screen.getByRole("textbox")).toHaveProperty(
      "value",
      "not/downloaded",
    );
  });

  it.each([
    ["can't be read", undefined],
    ["lists nothing", []],
  ])("keeps LM Studio's text input when the server %s", (_name, models) => {
    renderWith(models, "lmstudio", "my/model");

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("textbox")).toHaveProperty("value", "my/model");
  });

  it("keeps Ollama's presets when the server can't be read", () => {
    renderWith(undefined, "ollama", "qwen3.8");

    expect(screen.getByRole("option", { name: "gemma4" })).toBeDefined();
    expect(select().value).toBe("qwen3.8");
  });
});
