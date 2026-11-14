// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLocalModelInfo } from "./local-model-info.ts";
import { fetchOllamaModelInfo } from "./ollama-model-info.ts";

const BASE = "http://localhost:11434/v1";

// Shape copied from a real Ollama `/api/ps` response
const LOADED = {
  name: "qwen3.8:latest",
  digest: "aaee06c39dcf2437cde036998d960e1fc1494b8191be7cc9657d01e509097813",
  size: 18982214040,
  context_length: 262144,
  runner: "llamacpp",
  details: {
    parent_model: "",
    format: "gguf",
    family: "qwen35",
    parameter_size: "27.3B",
    quantization_level: "Q4_K_M",
  },
};

const SHOW = {
  details: {
    format: "safetensors",
    parameter_size: "35B",
    quantization_level: "nvfp4",
    runner: "mlx",
  },
  parameters: "top_k 20\nnum_ctx 65536\ntemperature 0.6",
};

/** Answer each endpoint by path; unlisted paths are 404 */
function stubServer(routes: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: URL) => {
    const body = routes[url.pathname];

    return body === undefined
      ? { ok: false }
      : { ok: true, json: async () => body };
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

describe("fetchOllamaModelInfo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("describes a loaded model from /api/ps, leaving out empty fields", async () => {
    stubServer({ "/api/ps": { models: [LOADED] } });

    expect(await fetchOllamaModelInfo("qwen3.8:latest", BASE)).toStrictEqual({
      variant: "qwen3.8:latest",
      quantization: "Q4_K_M",
      format: "gguf",
      params: "27.3B",
      runner: "llamacpp",
      digest: LOADED.digest,
      memoryBytes: 18982214040,
      contextLength: 262144,
    });
  });

  it("treats a bare id as :latest, case-insensitively", async () => {
    stubServer({ "/api/ps": { models: [LOADED] } });

    const info = await fetchOllamaModelInfo("Qwen3.8", BASE);

    expect(info?.variant).toBe("qwen3.8:latest");
  });

  it("keeps an explicit tag and tags a namespaced bare id", async () => {
    const fetchMock = stubServer({});

    await fetchOllamaModelInfo("library/qwen3.8:q8_0", BASE);
    await fetchOllamaModelInfo("library/qwen3.8", BASE);

    const models = fetchMock.mock.calls
      .map((c) => c[1]?.body)
      .filter((b) => b != null);

    expect(models).toStrictEqual([
      JSON.stringify({ model: "library/qwen3.8:q8_0" }),
      JSON.stringify({ model: "library/qwen3.8:latest" }),
    ]);
  });

  it("falls back to /api/show when the model isn't loaded", async () => {
    stubServer({
      "/api/ps": { models: [{ ...LOADED, name: "other:latest" }] },
      "/api/show": SHOW,
    });

    expect(await fetchOllamaModelInfo("qwen3.8-mlx", BASE)).toStrictEqual({
      variant: "qwen3.8-mlx:latest",
      quantization: "nvfp4",
      format: "safetensors",
      params: "35B",
      runner: "mlx",
      contextLength: 65536,
    });
  });

  it("omits context length when /api/show has no num_ctx", async () => {
    stubServer({
      "/api/show": { ...SHOW, parameters: undefined },
    });

    const info = await fetchOllamaModelInfo("qwen3.8", BASE);

    expect(info?.quantization).toBe("nvfp4");
    expect(info).not.toHaveProperty("contextLength");
  });

  it("returns undefined when neither endpoint knows the model", async () => {
    stubServer({ "/api/ps": { models: [] }, "/api/show": {} });

    expect(await fetchOllamaModelInfo("qwen3.8", BASE)).toBeUndefined();
    stubServer({});
    expect(await fetchOllamaModelInfo("qwen3.8", BASE)).toBeUndefined();
  });

  it("returns undefined when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("refused")));

    expect(await fetchOllamaModelInfo("qwen3.8", BASE)).toBeUndefined();
  });
});

describe("fetchLocalModelInfo with Ollama", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to Ollama when LM Studio's API is missing", async () => {
    stubServer({ "/api/ps": { models: [LOADED] } });

    const info = await fetchLocalModelInfo("qwen3.8", BASE);

    expect(info?.variant).toBe("qwen3.8:latest");
    expect(info?.memoryBytes).toBe(18982214040);
  });
});
