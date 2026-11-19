// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchLocalModels,
  type LocalModel,
} from "#webui/chat/sdk/provider/local-model/local-model-catalog";
import { ModelSelector } from "#webui/components/settings/controls/ModelSelector";
import { LOCAL_MODELS_DEBOUNCE_MS } from "#webui/hooks/settings/helpers/use-local-models";
import { type Provider } from "#webui/types/settings";

// The real hook, so the list arrives after a load like it does in the app.
vi.mock(
  import("#webui/chat/sdk/provider/local-model/local-model-catalog"),
  () => ({ fetchLocalModels: vi.fn() }),
);

const LMSTUDIO_MODELS: LocalModel[] = [
  { id: "qwen/qwen3.8-27b", loaded: true },
  { id: "mistral/devstral", loaded: false },
];

function Harness({ provider, model }: { provider: Provider; model: string }) {
  return (
    <div>
      <input data-testid="url" />
      <ModelSelector
        provider={provider}
        model={model}
        setModel={vi.fn()}
        baseUrl="http://localhost:1234"
      />
    </div>
  );
}

/** Render, focus the URL field, then let the model list arrive. */
async function renderFocusedOnUrl(provider: Provider, model: string) {
  const result = render(<Harness provider={provider} model={model} />);
  const url = screen.getByTestId("url");

  url.focus();
  await settle();

  return { ...result, url };
}

async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(LOCAL_MODELS_DEBOUNCE_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetchLocalModels).mockImplementation(async (provider) =>
    provider === "lmstudio" ? LMSTUDIO_MODELS : [],
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(fetchLocalModels).mockReset();
});

describe("ModelSelector focus", () => {
  it("leaves focus alone when LM Studio's list arrives with no model set", async () => {
    const { url } = await renderFocusedOnUrl("lmstudio", "");

    expect(screen.getByRole("combobox")).toHaveProperty("value", "OTHER");
    expect(document.activeElement).toBe(url);
  });

  it("leaves focus alone when the list arrives without the saved model", async () => {
    const { url } = await renderFocusedOnUrl("lmstudio", "not/downloaded");

    expect(screen.getByRole("combobox")).toHaveProperty("value", "OTHER");
    expect(screen.getByDisplayValue("not/downloaded")).toBeDefined();
    expect(document.activeElement).toBe(url);
  });

  it("leaves focus alone when switching provider with a list loaded", async () => {
    const { url, rerender } = await renderFocusedOnUrl(
      "lmstudio",
      "qwen/qwen3.8-27b",
    );

    rerender(<Harness provider="ollama" model="qwen3.8" />);
    expect(document.activeElement).toBe(url);

    await settle();
    expect(document.activeElement).toBe(url);
  });

  it("focuses the text input when the user picks Other...", async () => {
    await renderFocusedOnUrl("lmstudio", "qwen/qwen3.8-27b");

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "OTHER" },
    });

    expect(document.activeElement).toBe(
      screen.getByDisplayValue("qwen/qwen3.8-27b"),
    );
  });
});
