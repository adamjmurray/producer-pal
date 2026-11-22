// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contextModelName,
  ensureOllamaContextModel,
} from "./ollama-context-model.ts";

const BASE = "http://localhost:11434/v1";

type Reply = { status?: number; body?: unknown };

/** Answer each endpoint by path; unlisted paths are 404 with a non-JSON body */
function stubServer(routes: Record<string, Reply>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: URL) => {
    const route = routes[url.pathname];
    const status = route?.status ?? (route ? 200 : 404);
    const text =
      route?.body === undefined
        ? "404 page not found"
        : typeof route.body === "string"
          ? route.body
          : JSON.stringify(route.body);

    return new Response(text, { status });
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

const OLLAMA: Record<string, Reply> = {
  "/api/version": { body: { version: "0.40.17" } },
  "/api/show": { body: { model_info: { "lfm2moe.context_length": 128000 } } },
  "/api/create": { body: { status: "success" } },
};

describe("ensureOllamaContextModel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates the copy and returns its name", async () => {
    const fetchMock = stubServer(OLLAMA);

    await expect(ensureOllamaContextModel("lfm2.5", 65536, BASE)).resolves.toBe(
      "lfm2.5-ctx65536",
    );

    const create = fetchMock.mock.calls.find(
      ([url]) => (url as URL).pathname === "/api/create",
    );

    expect(create?.[0].href).toBe("http://localhost:11434/api/create");
    expect(JSON.parse(create?.[1].body as string)).toStrictEqual({
      model: "lfm2.5-ctx65536",
      from: "lfm2.5",
      parameters: { num_ctx: 65536 },
      stream: false,
    });
  });

  it("allows a size equal to the model's maximum", async () => {
    stubServer(OLLAMA);

    await expect(
      ensureOllamaContextModel("lfm2.5", 128000, BASE),
    ).resolves.toBe("lfm2.5-ctx128000");
  });

  it("creates the copy when the model reports no maximum", async () => {
    stubServer({ ...OLLAMA, "/api/show": { body: { model_info: {} } } });

    await expect(
      ensureOllamaContextModel("lfm2.5", 999999, BASE),
    ).resolves.toBe("lfm2.5-ctx999999");
  });

  it("creates the copy when the show reply has no model_info", async () => {
    stubServer({ ...OLLAMA, "/api/show": { body: {} } });

    await expect(ensureOllamaContextModel("lfm2.5", 4096, BASE)).resolves.toBe(
      "lfm2.5-ctx4096",
    );
  });

  it("refuses a server that isn't Ollama", async () => {
    stubServer({});

    await expect(
      ensureOllamaContextModel("lfm2.5", 65536, BASE),
    ).rejects.toThrow(
      "--context only works with Ollama, and http://localhost:11434 isn't one (no /api/version).",
    );
  });

  it("refuses a version reply that has no version", async () => {
    stubServer({ "/api/version": { body: { other: 1 } } });

    await expect(
      ensureOllamaContextModel("lfm2.5", 65536, BASE),
    ).rejects.toThrow("--context only works with Ollama");
  });

  it("reports a missing model with the server's error", async () => {
    stubServer({
      ...OLLAMA,
      "/api/show": { status: 404, body: { error: "model 'nope' not found" } },
    });

    await expect(ensureOllamaContextModel("nope", 65536, BASE)).rejects.toThrow(
      `Model "nope" not found on Ollama at http://localhost:11434: model 'nope' not found`,
    );
  });

  it("reports a missing model whose error isn't JSON", async () => {
    stubServer({ ...OLLAMA, "/api/show": { status: 500, body: "boom\n" } });

    await expect(ensureOllamaContextModel("nope", 65536, BASE)).rejects.toThrow(
      "not found on Ollama at http://localhost:11434: boom",
    );
  });

  it("reports an empty error body", async () => {
    stubServer({ ...OLLAMA, "/api/show": { status: 500, body: "" } });

    await expect(ensureOllamaContextModel("nope", 65536, BASE)).rejects.toThrow(
      "http://localhost:11434: no details",
    );
  });

  it("refuses a size above the model's maximum, naming both", async () => {
    const fetchMock = stubServer(OLLAMA);

    await expect(
      ensureOllamaContextModel("lfm2.5", 200000, BASE),
    ).rejects.toThrow(
      `--context 200000 is more than "lfm2.5" supports (128000).`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a failed create with the server's error", async () => {
    stubServer({
      ...OLLAMA,
      "/api/create": { status: 400, body: { error: "bad parameter" } },
    });

    await expect(
      ensureOllamaContextModel("lfm2.5", 65536, BASE),
    ).rejects.toThrow(
      `Couldn't create "lfm2.5-ctx65536" from "lfm2.5": bad parameter`,
    );
  });

  it("reports a create that answers without success", async () => {
    stubServer({ ...OLLAMA, "/api/create": { body: [1, 2] } });

    await expect(
      ensureOllamaContextModel("lfm2.5", 65536, BASE),
    ).rejects.toThrow(`Couldn't create "lfm2.5-ctx65536" from "lfm2.5": [1,2]`);
  });

  it("reports an unreachable server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(
      ensureOllamaContextModel("lfm2.5", 65536, BASE),
    ).rejects.toThrow(
      "Can't reach Ollama at http://localhost:11434: fetch failed",
    );
  });

  it("includes the underlying cause code when there is one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed", {
          cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }),
        });
      }),
    );

    await expect(
      ensureOllamaContextModel("lfm2.5", 65536, BASE),
    ).rejects.toThrow(
      "Can't reach Ollama at http://localhost:11434: fetch failed (ECONNREFUSED)",
    );
  });

  it("reports a timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timed out", "TimeoutError");
      }),
    );

    await expect(
      ensureOllamaContextModel("lfm2.5", 65536, BASE),
    ).rejects.toThrow(
      "Ollama at http://localhost:11434 didn't answer /api/version within 10s.",
    );
  });

  it("reports a timeout of the create call with its longer limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        if (url.pathname === "/api/create") {
          throw new DOMException("timed out", "TimeoutError");
        }

        return new Response(
          JSON.stringify(
            url.pathname === "/api/version"
              ? { version: "0.40.17" }
              : { model_info: {} },
          ),
        );
      }),
    );

    await expect(
      ensureOllamaContextModel("lfm2.5", 65536, BASE),
    ).rejects.toThrow("didn't answer /api/create within 60s.");
  });

  it("reports a thrown non-Error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject("down")),
    );

    await expect(
      ensureOllamaContextModel("lfm2.5", 65536, BASE),
    ).rejects.toThrow("Can't reach Ollama at http://localhost:11434: down");
  });
});

describe("contextModelName", () => {
  it("puts the suffix after a bare id", () => {
    expect(contextModelName("lfm2.5", 65536)).toBe("lfm2.5-ctx65536");
  });

  it("puts the suffix before the tag", () => {
    expect(contextModelName("muse-glimmer:30b-mlx", 65536)).toBe(
      "muse-glimmer-ctx65536:30b-mlx",
    );
    expect(contextModelName("lfm2.5:latest", 8192)).toBe(
      "lfm2.5-ctx8192:latest",
    );
  });

  it("keeps slashes in the name", () => {
    expect(contextModelName("qwen/qwen3.8-27b", 65536)).toBe(
      "qwen/qwen3.8-27b-ctx65536",
    );
    expect(contextModelName("qwen/qwen3.8-27b:q4", 65536)).toBe(
      "qwen/qwen3.8-27b-ctx65536:q4",
    );
  });

  it("doesn't mistake a registry port for a tag", () => {
    expect(contextModelName("host:5000/model", 4096)).toBe(
      "host:5000/model-ctx4096",
    );
  });
});
