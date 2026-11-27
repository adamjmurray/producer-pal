// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { relayLocalAiUrl } from "#webui/chat/sdk/provider/local-model/local-ai-relay";
import { fetchLocalModels } from "#webui/chat/sdk/provider/local-model/local-model-catalog";
import { getBaseUrl } from "#webui/utils/provider-url";
import { servePageAt } from "#webui/test-utils/page-origin-test-helpers";

const PHONE_PAGE = "http://192.168.1.20:3350";

describe("relayLocalAiUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("on a page opened from another device", () => {
    it.each([
      ["ollama", "http://localhost:11434", `${PHONE_PAGE}/local-ai/ollama`],
      ["ollama", "http://localhost:11434/", `${PHONE_PAGE}/local-ai/ollama`],
      [
        "ollama",
        "http://127.0.0.1:11434/v1",
        `${PHONE_PAGE}/local-ai/ollama/v1`,
      ],
      ["lmstudio", "http://localhost:1234", `${PHONE_PAGE}/local-ai/lmstudio`],
      [
        "lmstudio",
        "http://[::1]:1234/v1/",
        `${PHONE_PAGE}/local-ai/lmstudio/v1`,
      ],
    ])("relays %s at %s", (provider, url, relayed) => {
      servePageAt(PHONE_PAGE);

      expect(relayLocalAiUrl(provider, url)).toBe(relayed);
    });

    it("uses the tunnel's own address", () => {
      servePageAt("https://abc.trycloudflare.com");

      expect(relayLocalAiUrl("ollama", "http://localhost:11434/v1")).toBe(
        "https://abc.trycloudflare.com/local-ai/ollama/v1",
      );
    });

    it.each([
      ["a custom port", "ollama", "http://localhost:11435"],
      ["another provider's port", "ollama", "http://localhost:1234"],
      ["https", "ollama", "https://localhost:11434"],
      ["a path prefix", "ollama", "http://localhost:11434/ollama/v1"],
      ["a query", "ollama", "http://localhost:11434/v1?x=1"],
      ["another computer", "ollama", "http://192.168.1.5:11434"],
      ["the custom provider", "custom", "http://localhost:11434/v1"],
      ["a cloud provider", "openai", "http://localhost:11434/v1"],
      ["an invalid URL", "ollama", "not a url"],
    ])("leaves %s alone", (_label, provider, url) => {
      servePageAt(PHONE_PAGE);

      expect(relayLocalAiUrl(provider, url)).toBe(url);
    });
  });

  it.each(["http://localhost:3350", "http://127.0.0.1:3350"])(
    "calls directly on a page on Live's computer at %s",
    (origin) => {
      servePageAt(origin);

      expect(relayLocalAiUrl("ollama", "http://localhost:11434")).toBe(
        "http://localhost:11434",
      );
    },
  );
});

describe("local AI URLs on a page opened from another device", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["ollama", undefined, `${PHONE_PAGE}/local-ai/ollama/v1`],
    ["lmstudio", "", `${PHONE_PAGE}/local-ai/lmstudio/v1`],
    ["ollama", "http://localhost:11434", `${PHONE_PAGE}/local-ai/ollama/v1`],
    ["ollama", "http://10.0.0.2:11434", "http://10.0.0.2:11434/v1"],
  ])(
    "getBaseUrl gives %s with setting %s the URL %s",
    (provider, url, base) => {
      servePageAt(PHONE_PAGE);

      expect(getBaseUrl(provider, url)).toBe(base);
    },
  );

  it("lists Ollama's models through the relay", async () => {
    servePageAt(PHONE_PAGE);

    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ models: [] })),
    );

    vi.stubGlobal("fetch", fetchMock);

    await fetchLocalModels("ollama", "http://localhost:11434");

    expect(fetchMock.mock.calls.map(([url]) => url)).toStrictEqual([
      `${PHONE_PAGE}/local-ai/ollama/api/tags`,
      `${PHONE_PAGE}/local-ai/ollama/api/ps`,
    ]);
  });
});
