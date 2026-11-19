// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLocalModels } from "#webui/chat/sdk/provider/local-model/local-model-catalog";
import {
  LOCAL_MODELS_DEBOUNCE_MS,
  useLocalModels,
} from "#webui/hooks/settings/helpers/use-local-models";
import { type Provider } from "#webui/types/settings";

vi.mock(
  import("#webui/chat/sdk/provider/local-model/local-model-catalog"),
  () => ({ fetchLocalModels: vi.fn() }),
);

const MODELS = [{ id: "qwen3.8", loaded: true }];

/** Let the debounce run and the fetch settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(LOCAL_MODELS_DEBOUNCE_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetchLocalModels).mockResolvedValue(MODELS);
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(fetchLocalModels).mockReset();
});

describe("useLocalModels", () => {
  it("fetches a local provider's models after the debounce", async () => {
    const { result } = renderHook(() => useLocalModels("ollama", "http://x"));

    expect(result.current).toBeUndefined();
    await settle();

    expect(result.current).toStrictEqual(MODELS);
    expect(fetchLocalModels).toHaveBeenCalledWith("ollama", "http://x");
  });

  it("passes a null URL as undefined", async () => {
    renderHook(() => useLocalModels("lmstudio", null));
    await settle();

    expect(fetchLocalModels).toHaveBeenCalledWith("lmstudio", undefined);
  });

  it("fetches nothing for a cloud provider", async () => {
    const { result } = renderHook(() => useLocalModels("gemini", undefined));

    await settle();

    expect(result.current).toBeUndefined();
    expect(fetchLocalModels).not.toHaveBeenCalled();
  });

  it("asks once for a URL typed in quick succession", async () => {
    const { rerender } = renderHook(
      ({ url }) => useLocalModels("ollama", url),
      {
        initialProps: { url: "http://l" },
      },
    );

    rerender({ url: "http://lo" });
    rerender({ url: "http://loc" });
    await settle();

    expect(fetchLocalModels).toHaveBeenCalledTimes(1);
    expect(fetchLocalModels).toHaveBeenCalledWith("ollama", "http://loc");
  });

  it("drops the list when switching provider, and ignores a late answer", async () => {
    let answer: (models: typeof MODELS) => void = () => {};

    vi.mocked(fetchLocalModels).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    const { result, rerender } = renderHook(
      ({ provider }) => useLocalModels(provider, ""),
      { initialProps: { provider: "ollama" as Provider } },
    );

    await settle();
    rerender({ provider: "gemini" });
    await act(async () => {
      answer(MODELS);
      await Promise.resolve();
    });

    expect(result.current).toBeUndefined();
  });

  it.each([
    ["provider", { provider: "ollama" as Provider, url: "http://x" }],
    ["URL", { provider: "lmstudio" as Provider, url: "http://y" }],
  ])("never returns a list fetched for another %s", async (_name, next) => {
    const seen: [Provider, string, unknown][] = [];
    const { rerender } = renderHook(
      ({ provider, url }) => {
        const models = useLocalModels(provider, url);

        seen.push([provider, url, models]);

        return models;
      },
      { initialProps: { provider: "lmstudio" as Provider, url: "http://x" } },
    );

    await settle();
    expect(seen.at(-1)?.[2]).toStrictEqual(MODELS);

    rerender(next);

    const stale = seen.filter(
      ([provider, url, models]) =>
        provider === next.provider && url === next.url && models != null,
    );

    expect(stale).toStrictEqual([]);
  });
});
