// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { siblingUrl } from "#evals/shared/config.ts";

describe("siblingUrl", () => {
  it("swaps the trailing /mcp segment", () => {
    expect(siblingUrl("http://localhost:3350/mcp", "config")).toBe(
      "http://localhost:3350/config",
    );
  });

  it("leaves a mcp in the host alone", () => {
    expect(siblingUrl("http://mcp.local:3350/mcp", "config")).toBe(
      "http://mcp.local:3350/config",
    );
  });

  it("leaves a /mcp earlier in the path alone", () => {
    expect(siblingUrl("http://host:3350/mcp/proxy/mcp", "config")).toBe(
      "http://host:3350/mcp/proxy/config",
    );
  });

  it("leaves a URL that does not end in /mcp as it is", () => {
    expect(siblingUrl("http://host:3350/other", "config")).toBe(
      "http://host:3350/other",
    );
  });
});
