// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { recordToolResult } from "../agent-cli-stream.ts";
import { type ToolCall } from "../../shared/types.ts";

/**
 * A fresh tool call with no result yet.
 *
 * @returns An empty tool call for recordToolResult to fill in
 */
function makeCall(): ToolCall {
  return { name: "ppal-read-track", args: {} };
}

describe("recordToolResult — isError", () => {
  const content = [{ type: "text", text: "Error: no such track" }];

  it("stamps true from a raw CallToolResult", () => {
    const call = makeCall();

    recordToolResult(call, { content, isError: true });

    expect(call).toStrictEqual({
      name: "ppal-read-track",
      args: {},
      result: "Error: no such track",
      isError: true,
    });
  });

  it("stamps false from a raw CallToolResult", () => {
    const call = makeCall();

    recordToolResult(call, {
      content: [{ type: "text", text: "{}" }],
      isError: false,
    });

    expect(call.isError).toBe(false);
  });

  it("leaves isError unset for a bare content array", () => {
    // What Claude Code hands over — the flag lives on its own block instead.
    const call = makeCall();

    recordToolResult(call, content);

    expect(call).not.toHaveProperty("isError");
  });

  it("leaves isError unset for plain text", () => {
    const call = makeCall();

    recordToolResult(call, "no track at index 9");

    expect(call).not.toHaveProperty("isError");
  });
});
