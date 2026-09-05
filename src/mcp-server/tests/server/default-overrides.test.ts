// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { withDefaultOverrides } from "#src/mcp-server/helpers/request-overrides/default-overrides.ts";
import { type Notation } from "#src/shared/notation.ts";

/**
 * Wrap a stub tool handler with the given per-request defaults.
 *
 * @param defaults - Getter for the overrides the wrapper contributes
 * @returns The stub handler and the wrapper around it
 */
function wrapStub(defaults: Parameters<typeof withDefaultOverrides>[1]) {
  const inner = vi.fn().mockResolvedValue({ content: [] });

  return { inner, wrapped: withDefaultOverrides(inner, defaults) };
}

describe("withDefaultOverrides", () => {
  it("carries the current notation on every call", async () => {
    const { inner, wrapped } = wrapStub(() => ({ notation: "stark" }));

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
    let notation: Notation = "barbeat";
    const { inner, wrapped } = wrapStub(() => ({ notation }));

    await wrapped("ppal-read-clip", {});
    notation = "midi-json";
    await wrapped("ppal-read-clip", {});

    expect(inner.mock.calls[0]?.[2]).toStrictEqual({ notation: "barbeat" });
    expect(inner.mock.calls[1]?.[2]).toStrictEqual({ notation: "midi-json" });
  });

  it("preserves the caller's other overrides", async () => {
    // REST's ?format= / ?timeoutMs= params ride the same blob.
    const { inner, wrapped } = wrapStub(() => ({ notation: "stark" }));

    await wrapped("ppal-read-clip", {}, { compactOutput: false, timeoutMs: 5 });

    expect(inner).toHaveBeenCalledWith(
      "ppal-read-clip",
      {},
      { notation: "stark", compactOutput: false, timeoutMs: 5 },
    );
  });

  it("lets an explicit caller notation win", async () => {
    const { inner, wrapped } = wrapStub(() => ({ notation: "stark" }));

    await wrapped("ppal-read-clip", {}, { notation: "midi-json" });

    expect(inner).toHaveBeenCalledWith(
      "ppal-read-clip",
      {},
      { notation: "midi-json" },
    );
  });

  it("carries a compact-output default alongside notation", async () => {
    // POST /mcp's x-producer-pal-format header lands here, not on a query param.
    const { inner, wrapped } = wrapStub(() => ({
      notation: "stark",
      compactOutput: true,
    }));

    await wrapped("ppal-read-clip", {});

    expect(inner.mock.calls[0]?.[2]).toStrictEqual({
      notation: "stark",
      compactOutput: true,
    });
  });

  it("returns the inner result untouched", async () => {
    const result = { content: [{ type: "text", text: "ok" }] };
    const wrapped = withDefaultOverrides(
      vi.fn().mockResolvedValue(result),
      () => ({ notation: "barbeat" }),
    );

    expect(await wrapped("ppal-read-clip", {})).toBe(result);
  });
});
