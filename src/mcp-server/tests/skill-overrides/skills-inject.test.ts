// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { type McpResponse } from "#src/mcp-server/max-api-adapter.ts";
import { withSkills } from "#src/mcp-server/helpers/skills-inject.ts";
import { writeSkillOverride } from "#src/mcp-server/helpers/skill-overrides-store.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import { useTempConfigDir } from "../config-dir-test-helpers.ts";

useTempConfigDir();

/**
 * A fake inner callLiveApi that resolves to the given response.
 * @param response - The response the fake resolves with
 * @returns A vi.fn matching the callLiveApi signature
 */
function fakeInner(response: McpResponse) {
  return vi.fn(async () => response);
}

/**
 * A minimal successful connect-style response with a single content block.
 * @returns A fresh McpResponse
 */
function connectResponse(): McpResponse {
  return { content: [{ type: "text", text: "{connected:true}" }] };
}

/**
 * The last content block's text (the injected skills block, when present).
 * @param result - The wrapped call's response
 * @returns The last block's text, or "" when empty
 */
function lastText(result: McpResponse): string {
  return result.content.at(-1)?.text ?? "";
}

describe("withSkills", () => {
  it("appends the assembled skills block to a ppal-connect response", async () => {
    const wrapped = withSkills(fakeInner(connectResponse()), () => ({}));

    const result = await wrapped("ppal-connect", {});

    expect(result.content).toHaveLength(2);
    expect(lastText(result)).toBe(buildSkills({}));
    expect(lastText(result).startsWith("# Producer Pal Skills")).toBe(true);
  });

  it("assembles for the notation/small-model context from getContext", async () => {
    const wrapped = withSkills(fakeInner(connectResponse()), () => ({
      notation: "stark",
      smallModelMode: true,
    }));

    const result = await wrapped("ppal-connect", {});

    expect(lastText(result)).toBe(
      buildSkills({ notation: "stark", smallModelMode: true }),
    );
  });

  it("applies a user fragment override read from disk", async () => {
    writeSkillOverride("barbeat-standard", "MY OVERRIDDEN HEAD");
    const wrapped = withSkills(fakeInner(connectResponse()), () => ({}));

    const result = await wrapped("ppal-connect", {});

    expect(lastText(result)).toContain("MY OVERRIDDEN HEAD");
    expect(lastText(result)).toBe(
      buildSkills({}, { "barbeat-standard": "MY OVERRIDDEN HEAD" }),
    );
  });

  it("passes the original tool, args, and overrides through to the inner", async () => {
    const inner = fakeInner(connectResponse());
    const overrides = { timeoutMs: 5000 };

    await withSkills(inner, () => ({}))("ppal-connect", { foo: 1 }, overrides);

    expect(inner).toHaveBeenCalledWith("ppal-connect", { foo: 1 }, overrides);
  });

  it("leaves non-connect tool responses untouched", async () => {
    const wrapped = withSkills(fakeInner(connectResponse()), () => ({}));

    const result = await wrapped("ppal-read-track", {});

    expect(result.content).toHaveLength(1);
  });

  it("does not inject when the connect response is an error", async () => {
    const wrapped = withSkills(
      fakeInner({ content: [{ type: "text", text: "boom" }], isError: true }),
      () => ({}),
    );

    const result = await wrapped("ppal-connect", {});

    expect(result.content).toHaveLength(1);
  });
});
