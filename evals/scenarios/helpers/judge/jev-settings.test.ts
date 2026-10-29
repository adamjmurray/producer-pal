// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { stubKeys } from "#evals/jev/tests/jev-test-helpers.ts";
import { resolveJevSettings } from "./jev-settings.ts";

describe("resolveJevSettings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off without --jev, whatever keys are set", () => {
    stubKeys({ TYPESAFE_KEY: "k" });

    expect(resolveJevSettings({})).toBeUndefined();
  });

  it("uses the first route with a key", () => {
    stubKeys({ OPENROUTER_KEY: "k" });

    expect(resolveJevSettings({ jev: true })).toStrictEqual({
      route: "openrouter",
    });
  });

  it("uses the route --jev-via names", () => {
    stubKeys({ TYPESAFE_KEY: "a", VERCEL_AI_GATEWAY_KEY: "b" });

    expect(resolveJevSettings({ jev: true, jevVia: "vercel" })).toStrictEqual({
      route: "vercel",
    });
  });

  it("fails at startup when no route has a key", () => {
    stubKeys();

    expect(() => resolveJevSettings({ jev: true })).toThrow(
      "No Jev API key set: set one of TYPESAFE_KEY, OPENROUTER_KEY, VERCEL_AI_GATEWAY_KEY",
    );
  });

  it("fails at startup when the named route has no key", () => {
    stubKeys({ TYPESAFE_KEY: "k" });

    expect(() => resolveJevSettings({ jev: true, jevVia: "vercel" })).toThrow(
      "VERCEL_AI_GATEWAY_KEY is not set",
    );
  });

  it("rejects an unknown route, naming the flag", () => {
    stubKeys({ TYPESAFE_KEY: "k" });

    expect(() => resolveJevSettings({ jev: true, jevVia: "nowhere" })).toThrow(
      "Unknown --jev-via=nowhere; use one of typesafe, openrouter, vercel",
    );
  });

  it("rejects --jev-via without --jev", () => {
    expect(() => resolveJevSettings({ jevVia: "vercel" })).toThrow(
      "--jev-via needs --jev",
    );
  });

  it("lets --skip-judge win, without needing a key", () => {
    stubKeys();

    expect(resolveJevSettings({ jev: true, skipJudge: true })).toBeUndefined();
  });
});
