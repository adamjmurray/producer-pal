// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DECIDER_PROVIDERS,
  defaultConcurrency,
  ollamaBaseUrl,
  parseDeciderSpec,
  resolveDecider,
} from "../decider-provider.ts";
import { stubKeys } from "./decider-test-helpers.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseDeciderSpec", () => {
  it("reads bare jev as the default hosted provider and model", () => {
    expect(parseDeciderSpec("jev")).toStrictEqual({});
  });

  it.each(["typesafe", "openrouter", "vercel"] as const)(
    "reads bare %s as that provider with the default model",
    (provider) => {
      expect(parseDeciderSpec(provider)).toStrictEqual({ provider });
    },
  );

  it("splits provider/model at the first slash only", () => {
    expect(parseDeciderSpec("ollama/autotrust-jev")).toStrictEqual({
      provider: "ollama",
      model: "autotrust-jev",
    });
    expect(parseDeciderSpec("ollama/pplx-decider-flash:latest")).toStrictEqual({
      provider: "ollama",
      model: "pplx-decider-flash:latest",
    });
    expect(parseDeciderSpec("openrouter/typesafe/jev-1")).toStrictEqual({
      provider: "openrouter",
      model: "typesafe/jev-1",
    });
    expect(parseDeciderSpec("vercel/jev-latest")).toStrictEqual({
      provider: "vercel",
      model: "jev-latest",
    });
  });

  it("rejects an unknown provider, naming the choices", () => {
    expect(() => parseDeciderSpec("nowhere")).toThrow(
      /Unknown --decider=nowhere; use jev, typesafe, openrouter, vercel/,
    );
    expect(() => parseDeciderSpec("jev/x", "--d")).toThrow("Unknown --d=jev/x");
  });

  it("rejects ollama with no model, and an empty model", () => {
    expect(() => parseDeciderSpec("ollama")).toThrow(
      "--decider=ollama needs a model",
    );
    expect(() => parseDeciderSpec("ollama/")).toThrow('no model after the "/"');
  });
});

describe("resolveDecider", () => {
  it("defaults to the first hosted provider with a key", () => {
    stubKeys({ OPENROUTER_KEY: "o", VERCEL_AI_GATEWAY_KEY: "v" });
    expect(resolveDecider().provider).toBe("openrouter");

    stubKeys({ VERCEL_AI_GATEWAY_KEY: "v" });
    expect(resolveDecider().provider).toBe("vercel");

    stubKeys({ TYPESAFE_KEY: "t", OPENROUTER_KEY: "o" });
    expect(resolveDecider().provider).toBe("typesafe");
  });

  it("uses the named provider even when an earlier one has a key", () => {
    stubKeys({ TYPESAFE_KEY: "t", VERCEL_AI_GATEWAY_KEY: "v" });

    expect(resolveDecider({ provider: "vercel" })).toStrictEqual({
      provider: "vercel",
      model: "jev-latest",
      url: "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
      apiKey: "v",
    });
  });

  it("uses the named model", () => {
    stubKeys({ TYPESAFE_KEY: "t" });

    expect(resolveDecider({ model: "jev-x" }).model).toBe("jev-x");
  });

  it("names the missing variable for a named provider", () => {
    stubKeys({ TYPESAFE_KEY: "t" });

    expect(() => resolveDecider({ provider: "openrouter" })).toThrow(
      /OPENROUTER_KEY is not set.*--decider openrouter/,
    );
  });

  it("names every key variable when no hosted provider has one", () => {
    stubKeys();

    expect(() => resolveDecider()).toThrow(
      /TYPESAFE_KEY, OPENROUTER_KEY, VERCEL_AI_GATEWAY_KEY/,
    );
  });

  it("sends an explicit key to TypeSafe unless a provider is given", () => {
    stubKeys();

    expect(resolveDecider(undefined, "k")).toStrictEqual({
      provider: "typesafe",
      model: "jev-latest",
      url: "https://api.typesafe.ai/v1/systemone",
      apiKey: "k",
    });
    expect(resolveDecider({ provider: "vercel" }, "k").apiKey).toBe("k");
  });

  it("needs no key for ollama, and no model is an error", () => {
    stubKeys();
    vi.stubEnv("OLLAMA_HOST", "");

    expect(
      resolveDecider({ provider: "ollama", model: "m:latest" }),
    ).toStrictEqual({
      provider: "ollama",
      model: "m:latest",
      url: "http://localhost:11434/v1/systemone",
    });
    expect(() => resolveDecider({ provider: "ollama" })).toThrow(
      "ollama needs a model",
    );
  });

  it("follows OLLAMA_HOST at call time", () => {
    vi.stubEnv("OLLAMA_HOST", "https://gpu.example.com");

    expect(resolveDecider({ provider: "ollama", model: "m" }).url).toBe(
      "https://gpu.example.com/v1/systemone",
    );
  });
});

describe("ollamaBaseUrl", () => {
  it.each([
    [undefined, "http://localhost:11434"],
    ["", "http://localhost:11434"],
    ["  ", "http://localhost:11434"],
    ["gpu-box", "http://gpu-box:11434"],
    ["0.0.0.0:8080", "http://0.0.0.0:8080"],
    ["http://gpu-box:11434/", "http://gpu-box:11434"],
    ["https://gpu.example.com", "https://gpu.example.com"],
    ["HTTP://Host", "HTTP://Host"],
  ])("turns %j into %s", (host, url) => {
    expect(ollamaBaseUrl(host)).toBe(url);
  });
});

describe("provider limits", () => {
  it("runs one call at a time for ollama and four for hosted providers", () => {
    expect(defaultConcurrency({ provider: "ollama", model: "m" })).toBe(1);
    expect(defaultConcurrency({ provider: "vercel" })).toBe(4);
    expect(defaultConcurrency({})).toBe(4);
  });

  it("caps the state lower for ollama, which also caps the request", () => {
    expect(DECIDER_PROVIDERS.typesafe.maxStateChars).toBe(80_000);
    expect(DECIDER_PROVIDERS.ollama.maxStateChars).toBe(48_000);
    expect(DECIDER_PROVIDERS.ollama.maxRequestBytes).toBeLessThan(65_536);
    expect(DECIDER_PROVIDERS.typesafe.maxRequestBytes).toBeUndefined();
  });
});
