// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { withNotationOverride } from "#src/mcp-server/helpers/request-overrides/notation-override.ts";
import { type Notation } from "#src/shared/notation.ts";

describe("withNotationOverride", () => {
  it("carries the current notation on every call", async () => {
    const inner = vi.fn().mockResolvedValue({ content: [] });
    const wrapped = withNotationOverride(inner, () => "stark");

    await wrapped("ppal-read-clip", { clipId: "1" });

    expect(inner).toHaveBeenCalledWith(
      "ppal-read-clip",
      { clipId: "1" },
      { notation: "stark" },
    );
  });

  it("re-reads the getter per call, so a later request sees its own notation", async () => {
    // createMcpServer is rebuilt per POST /mcp, but REST routes share one
    // wrapper over the live global — neither may be pinned at build time.
    const inner = vi.fn().mockResolvedValue({ content: [] });
    let notation: Notation = "barbeat";
    const wrapped = withNotationOverride(inner, () => notation);

    await wrapped("ppal-read-clip", {});
    notation = "midi-json";
    await wrapped("ppal-read-clip", {});

    expect(inner.mock.calls[0]?.[2]).toStrictEqual({ notation: "barbeat" });
    expect(inner.mock.calls[1]?.[2]).toStrictEqual({ notation: "midi-json" });
  });

  it("preserves the caller's other overrides", async () => {
    // REST's ?format= / ?timeoutMs= params ride the same blob.
    const inner = vi.fn().mockResolvedValue({ content: [] });
    const wrapped = withNotationOverride(inner, () => "stark");

    await wrapped("ppal-read-clip", {}, { compactOutput: false, timeoutMs: 5 });

    expect(inner).toHaveBeenCalledWith(
      "ppal-read-clip",
      {},
      { notation: "stark", compactOutput: false, timeoutMs: 5 },
    );
  });

  it("lets an explicit caller notation win", async () => {
    const inner = vi.fn().mockResolvedValue({ content: [] });
    const wrapped = withNotationOverride(inner, () => "stark");

    await wrapped("ppal-read-clip", {}, { notation: "midi-json" });

    expect(inner).toHaveBeenCalledWith(
      "ppal-read-clip",
      {},
      { notation: "midi-json" },
    );
  });

  it("returns the inner result untouched", async () => {
    const result = { content: [{ type: "text", text: "ok" }] };
    const wrapped = withNotationOverride(
      vi.fn().mockResolvedValue(result),
      () => "barbeat",
    );

    expect(await wrapped("ppal-read-clip", {})).toBe(result);
  });
});
