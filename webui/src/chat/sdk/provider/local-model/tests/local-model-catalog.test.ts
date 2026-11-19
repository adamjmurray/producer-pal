// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contextLengthLookup,
  fetchLocalModels,
} from "#webui/chat/sdk/provider/local-model/local-model-catalog";

type Routes = Record<string, unknown>;

/**
 * Answer fetches by URL; anything unlisted is a 404.
 * @param routes - JSON bodies keyed by full URL
 * @returns The fetch mock
 */
function serve(routes: Routes): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url in routes
        ? new Response(JSON.stringify(routes[url]))
        : new Response("", { status: 404 }),
    ),
  );

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLocalModels for LM Studio", () => {
  const URL = "http://localhost:1234/api/v1/models";

  it("lists chat models with the loaded one's context length", async () => {
    serve({
      [URL]: {
        models: [
          {
            key: "qwen/qwen3.8-27b",
            type: "llm",
            loaded_instances: [{ config: { context_length: 24064 } }],
          },
          { key: "google/gemma-4-e4b", type: "llm", loaded_instances: [] },
          { key: "nomic-embed", type: "embedding" },
        ],
      },
    });

    expect(await fetchLocalModels("lmstudio", "")).toStrictEqual([
      { id: "qwen/qwen3.8-27b", loaded: true, contextLength: 24064 },
      { id: "google/gemma-4-e4b", loaded: false },
    ]);
  });

  it.each([
    ["http://studio.local:9000/v1", "http://studio.local:9000"],
    ["http://studio.local:9000/v1/", "http://studio.local:9000"],
    ["http://studio.local:9000", "http://studio.local:9000"],
    ["http://studio.local:9000//", "http://studio.local:9000"],
    ["https://host/lmstudio/v1", "https://host/lmstudio"],
    ["https://host/lmstudio/", "https://host/lmstudio"],
  ])("asks %s's server at %s", async (baseUrl, root) => {
    const fetchMock = serve({ [`${root}/api/v1/models`]: { models: [] } });

    expect(await fetchLocalModels("lmstudio", baseUrl)).toStrictEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${root}/api/v1/models`,
      expect.anything(),
    );
  });

  it("leaves the context length out when a loaded instance doesn't give one", async () => {
    serve({ [URL]: { models: [{ key: "m", loaded_instances: [{}] }] } });

    expect(await fetchLocalModels("lmstudio", undefined)).toStrictEqual([
      { id: "m", loaded: true },
    ]);
  });

  it.each([
    ["an error status", {}],
    ["an unexpected body", { [URL]: { data: [] } }],
  ])("gives undefined for %s", async (_name, routes) => {
    serve(routes);

    expect(await fetchLocalModels("lmstudio", "")).toBeUndefined();
  });

  it("gives undefined when the server can't be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("down"))),
    );

    expect(await fetchLocalModels("lmstudio", "")).toBeUndefined();
  });

  it("gives undefined for a URL that doesn't parse", async () => {
    const fetchMock = serve({});

    expect(await fetchLocalModels("lmstudio", "not a url")).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchLocalModels for Ollama", () => {
  const TAGS = "http://localhost:11434/api/tags";
  const PS = "http://localhost:11434/api/ps";

  it("lists chat models, bare for :latest, with the loaded one's context length", async () => {
    serve({
      [TAGS]: {
        models: [
          { name: "qwen3.8:latest", capabilities: ["completion", "tools"] },
          { name: "gemma4:12b" },
          { name: "nomic-embed-text:latest", capabilities: ["embedding"] },
        ],
      },
      [PS]: { models: [{ name: "qwen3.8:latest", context_length: 8192 }] },
    });

    expect(await fetchLocalModels("ollama", "")).toStrictEqual([
      { id: "qwen3.8", loaded: true, contextLength: 8192 },
      { id: "gemma4:12b", loaded: false },
    ]);
  });

  it("lists every model as unloaded when /api/ps fails", async () => {
    serve({ [TAGS]: { models: [{ name: "qwen3.8:latest" }] } });

    expect(await fetchLocalModels("ollama", "")).toStrictEqual([
      { id: "qwen3.8", loaded: false },
    ]);
  });

  it("gives undefined when /api/tags fails", async () => {
    serve({ [PS]: { models: [] } });

    expect(await fetchLocalModels("ollama", "")).toBeUndefined();
  });

  it("keeps a path prefix in front of the server's own API", async () => {
    serve({
      "https://host/ollama/api/tags": { models: [{ name: "gemma4:12b" }] },
      "https://host/api/tags": { models: [{ name: "another-service" }] },
    });

    expect(
      await fetchLocalModels("ollama", "https://host/ollama/v1"),
    ).toStrictEqual([{ id: "gemma4:12b", loaded: false }]);
  });
});

describe("contextLengthLookup", () => {
  const LM_STUDIO = {
    "http://localhost:1234/api/v1/models": {
      models: [
        {
          key: "qwen/qwen3.8-27b",
          loaded_instances: [{ config: { context_length: 24064 } }],
        },
        { key: "google/gemma-4-e4b", loaded_instances: [] },
      ],
    },
  };
  const OLLAMA = {
    "http://localhost:11434/api/tags": {
      models: [{ name: "qwen3.8:latest" }],
    },
    "http://localhost:11434/api/ps": {
      models: [{ name: "qwen3.8:latest", context_length: 8192 }],
    },
  };

  it("has no lookup for a cloud provider", () => {
    expect(contextLengthLookup("openai", undefined, "gpt-5.2")).toBeUndefined();
  });

  it.each(["qwen/qwen3.8-27b", "Qwen/Qwen3.8-27B", "qwen/qwen3.8-27b@q4_k_m"])(
    "reads LM Studio's loaded context length for %s",
    async (model) => {
      serve(LM_STUDIO);

      expect(await contextLengthLookup("lmstudio", "", model)?.()).toBe(24064);
    },
  );

  it.each(["qwen3.8", "qwen3.8:latest"])(
    "reads Ollama's loaded context length for %s",
    async (model) => {
      serve(OLLAMA);

      expect(await contextLengthLookup("ollama", "", model)?.()).toBe(8192);
    },
  );

  it("reads nothing for a model that isn't loaded", async () => {
    serve(LM_STUDIO);

    expect(
      await contextLengthLookup("lmstudio", "", "google/gemma-4-e4b")?.(),
    ).toBeUndefined();
  });

  it("reads nothing when the server can't be reached", async () => {
    serve({});

    expect(
      await contextLengthLookup("ollama", "", "qwen3.8")?.(),
    ).toBeUndefined();
  });
});
