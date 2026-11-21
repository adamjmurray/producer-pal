// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

describe("test setup network guard", () => {
  it("refuses a remote host, as a string, URL or Request", async () => {
    const url = "https://api.github.com/repos/x/y/releases/latest";

    await expect(fetch(url)).rejects.toThrow(/must not reach the network/);
    await expect(fetch(new URL(url))).rejects.toThrow(/must not reach/);
    await expect(fetch(new Request(url))).rejects.toThrow(/must not reach/);
  });

  it("lets a local server through", async () => {
    // Nothing listens on port 1, so this fails to connect: not our guard.
    await expect(fetch("http://127.0.0.1:1/")).rejects.not.toThrow(
      /must not reach/,
    );
  });
});
