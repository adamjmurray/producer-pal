// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";

import { formatCodexTurn } from "./format-codex-turn.ts";

describe("formatCodexTurn", () => {
  const turn = {
    text: "Added a kick pattern.",
    toolCalls: [
      { name: "ppal-connect", args: {}, result: "connected" },
      { name: "ppal-create-clip", args: { trackIndex: 0 }, result: "created" },
    ],
  };

  it("renders tool calls, results, and the reply", () => {
    const output = formatCodexTurn(turn, false);

    expect(output).toBe(
      "🔧 ppal-connect({})\n" +
        "   ↳ connected\n" +
        "🔧 ppal-create-clip({ trackIndex: 0 })\n" +
        "   ↳ created\n" +
        "\n" +
        "Added a kick pattern.\n",
    );
  });

  it("drops the trailing newline when a usage line follows", () => {
    expect(formatCodexTurn(turn, true)).toMatch(/Added a kick pattern\.$/);
  });

  it("omits the result line for a call that never reported one", () => {
    const output = formatCodexTurn(
      { text: "", toolCalls: [{ name: "ppal-connect", args: {} }] },
      false,
    );

    expect(output).toBe("🔧 ppal-connect({})\n\n");
  });

  it("renders reply-only turns without a leading blank line", () => {
    expect(
      formatCodexTurn({ text: "No tools needed.", toolCalls: [] }, false),
    ).toBe("No tools needed.\n");
  });

  it("returns nothing for an empty turn", () => {
    expect(formatCodexTurn({ text: "", toolCalls: [] }, false)).toBe("");
  });
});
