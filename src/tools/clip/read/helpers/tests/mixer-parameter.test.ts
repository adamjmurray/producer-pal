// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { mixerParameter } from "../clip-envelopes.ts";

describe("mixerParameter", () => {
  const track = (): LiveAPI => {
    registerMockObject("track-0", { path: livePath.track(0) });

    return LiveAPI.from(livePath.track(0));
  };

  it.each([
    ["volume", "volume"],
    ["pan", "panning"],
    ["send1", "sends 1"],
  ])("names the %s parameter", (name, child) => {
    expect(mixerParameter(track(), name)?.path).toBe(
      `${livePath.track(0)} mixer_device ${child}`,
    );
  });

  it.each([
    ["a name that is no mixer parameter", "cutoff"],
    ["no name", undefined],
  ])("finds nothing for %s", (_, name) => {
    expect(mixerParameter(track(), name)).toBeNull();
  });
});
