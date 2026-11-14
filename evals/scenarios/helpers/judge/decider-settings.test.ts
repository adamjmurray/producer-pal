// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { stubKeys } from "#evals/decider/tests/decider-test-helpers.ts";
import {
  resolveDeciderSettings,
  withLegacyDecider,
} from "./decider-settings.ts";

describe("resolveDeciderSettings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off without --decider, whatever keys are set", () => {
    stubKeys({ TYPESAFE_KEY: "k" });

    expect(resolveDeciderSettings({})).toBeUndefined();
  });

  it("takes bare jev as the first hosted provider with a key", () => {
    stubKeys({ OPENROUTER_KEY: "k" });

    expect(resolveDeciderSettings({ decider: "jev" })).toStrictEqual({
      provider: "openrouter",
      model: "jev-latest",
    });
  });

  it("takes a bare hosted provider name with the default model", () => {
    stubKeys({ TYPESAFE_KEY: "a", VERCEL_AI_GATEWAY_KEY: "b" });

    expect(resolveDeciderSettings({ decider: "vercel" })).toStrictEqual({
      provider: "vercel",
      model: "jev-latest",
    });
  });

  it("takes provider/model, splitting at the first slash", () => {
    stubKeys();

    expect(
      resolveDeciderSettings({ decider: "ollama/pplx-decider-flash:latest" }),
    ).toStrictEqual({ provider: "ollama", model: "pplx-decider-flash:latest" });
    expect(
      resolveDeciderSettings({ decider: "ollama/autotrust-jev" }),
    ).toStrictEqual({ provider: "ollama", model: "autotrust-jev" });
  });

  it("runs a hosted provider with a model of its own", () => {
    stubKeys({ OPENROUTER_KEY: "k" });

    expect(
      resolveDeciderSettings({ decider: "openrouter/jev-1.14.0" }),
    ).toStrictEqual({ provider: "openrouter", model: "jev-1.14.0" });
  });

  it("fails at startup when no hosted provider has a key", () => {
    stubKeys();

    expect(() => resolveDeciderSettings({ decider: "jev" })).toThrow(
      "No decider API key set: set one of TYPESAFE_KEY, OPENROUTER_KEY, VERCEL_AI_GATEWAY_KEY",
    );
  });

  it("fails at startup when the named provider has no key", () => {
    stubKeys({ TYPESAFE_KEY: "k" });

    expect(() => resolveDeciderSettings({ decider: "vercel" })).toThrow(
      "VERCEL_AI_GATEWAY_KEY is not set",
    );
  });

  it("rejects an unknown provider, naming the flag", () => {
    expect(() => resolveDeciderSettings({ decider: "nowhere" })).toThrow(
      /Unknown --decider=nowhere; use jev, typesafe, openrouter, vercel/,
    );
  });

  it("rejects ollama with no model", () => {
    expect(() => resolveDeciderSettings({ decider: "ollama" })).toThrow(
      "--decider=ollama needs a model",
    );
  });

  it("lets --skip-judge win, without needing a key", () => {
    stubKeys();

    expect(
      resolveDeciderSettings({ decider: "jev", skipJudge: true }),
    ).toBeUndefined();
  });
});

describe("withLegacyDecider", () => {
  it("turns --jev into --decider jev", () => {
    expect(withLegacyDecider({ jev: true, judge: "x" })).toStrictEqual({
      judge: "x",
      decider: "jev",
    });
  });

  it("turns --jev-via into the provider it named", () => {
    expect(withLegacyDecider({ jev: true, jevVia: "vercel" })).toStrictEqual({
      decider: "vercel",
    });
  });

  it("leaves options with no jev alone, and drops a stray jevVia", () => {
    expect(withLegacyDecider({ judge: "x" })).toStrictEqual({ judge: "x" });
    expect(withLegacyDecider({ decider: "jev" })).toStrictEqual({
      decider: "jev",
    });
    expect(withLegacyDecider({ jev: false, jevVia: "vercel" })).toStrictEqual(
      {},
    );
  });
});
