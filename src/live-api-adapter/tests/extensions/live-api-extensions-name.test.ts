// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveAPI } from "#src/test/mocks/mock-live-api.ts";
import "../../live-api-extensions.ts";

describe("LiveAPI extensions - getName", () => {
  let api: LiveAPI;

  beforeEach(() => {
    api = LiveAPI.from("live_set");
    vi.resetAllMocks();
  });

  it("returns a string name unchanged", () => {
    api.getProperty = vi.fn().mockReturnValue("Verse");
    expect(api.getName()).toBe("Verse");
  });

  it("converts an all-digit name (Live returns it as a number) to a string", () => {
    api.getProperty = vi.fn().mockReturnValue(5678);
    expect(api.getName()).toBe("5678");
  });

  it("returns an empty string when the object has no name property", () => {
    api.getProperty = vi.fn().mockReturnValue(undefined);
    expect(api.getName()).toBe("");
  });
});
