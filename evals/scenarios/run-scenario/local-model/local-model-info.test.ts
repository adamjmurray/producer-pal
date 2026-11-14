// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLocalModelInfo, pickLocalModelInfo } from "./local-model-info.ts";

// Shape copied from a real LM Studio `/api/v1/models` response
const GEMMA = {
  key: "google/gemma-4-e4b",
  quantization: { name: "Q4_K_M", bits_per_weight: 4 },
  size_bytes: 6326938154,
  params_string: "7.5B",
  format: "gguf",
  variants: ["google/gemma-4-e4b@q4_k_m", "google/gemma-4-e4b@q8_0"],
  selected_variant: "google/gemma-4-e4b@q4_k_m",
  loaded_instances: [
    { id: "google/gemma-4-e4b", config: { context_length: 20224 } },
  ],
};

const GEMMA_INFO = {
  variant: "google/gemma-4-e4b@q4_k_m",
  quantization: "Q4_K_M",
  bitsPerWeight: 4,
  format: "gguf",
  params: "7.5B",
  sizeBytes: 6326938154,
  contextLength: 20224,
};

describe("pickLocalModelInfo", () => {
  it("describes the selected variant for a bare model key", () => {
    expect(pickLocalModelInfo([GEMMA], "google/gemma-4-e4b")).toStrictEqual(
      GEMMA_INFO,
    );
  });

  it("matches an explicit variant case-insensitively", () => {
    expect(
      pickLocalModelInfo([GEMMA], "Google/Gemma-4-E4B@Q4_K_M"),
    ).toStrictEqual(GEMMA_INFO);
  });

  it("leaves out quantization for a variant other than the selected one", () => {
    const info = pickLocalModelInfo([GEMMA], "google/gemma-4-e4b@q8_0");

    expect(info?.variant).toBe("google/gemma-4-e4b@q8_0");
    expect(info?.quantization).toBeUndefined();
    expect(info?.bitsPerWeight).toBeUndefined();
  });

  it("prefers the loaded instance whose id matches the request", () => {
    const model = {
      ...GEMMA,
      loaded_instances: [
        { id: "google/gemma-4-e4b", config: { context_length: 4096 } },
        { id: "google/gemma-4-e4b@q8_0", config: { context_length: 8192 } },
      ],
    };

    expect(
      pickLocalModelInfo([model], "google/gemma-4-e4b@q8_0")?.contextLength,
    ).toBe(8192);
  });

  it("omits context length when the model isn't loaded", () => {
    const model = { ...GEMMA, loaded_instances: [] };

    expect(
      pickLocalModelInfo([model], "google/gemma-4-e4b")?.contextLength,
    ).toBeUndefined();
  });

  it("returns undefined for an unlisted model or one with no variant", () => {
    const { selected_variant: _, ...noVariant } = GEMMA;

    expect(pickLocalModelInfo([GEMMA], "qwen/qwen3.5-9b")).toBeUndefined();
    expect(
      pickLocalModelInfo([noVariant], "google/gemma-4-e4b"),
    ).toBeUndefined();
  });
});

describe("fetchLocalModelInfo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queries LM Studio's native API at the base URL's origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [GEMMA] }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const info = await fetchLocalModelInfo(
      "google/gemma-4-e4b",
      "http://localhost:1234/v1",
    );

    expect(info).toStrictEqual(GEMMA_INFO);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:1234/api/v1/models",
    );
  });

  it("returns undefined when the server has no LM Studio API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    expect(await fetchLocalModelInfo("llama3", "http://x/v1")).toBeUndefined();
  });

  it("returns undefined on a body without models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );

    expect(await fetchLocalModelInfo("llama3", "http://x/v1")).toBeUndefined();
  });

  it("returns undefined when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("refused")));

    expect(await fetchLocalModelInfo("llama3", "http://x/v1")).toBeUndefined();
  });

  it("defaults to the local provider's base URL", async () => {
    vi.stubEnv("LOCAL_BASE_URL", "http://127.0.0.1:5555/v1");
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });

    vi.stubGlobal("fetch", fetchMock);
    await fetchLocalModelInfo("llama3");

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:5555/api/v1/models",
    );
    vi.unstubAllEnvs();
  });
});
