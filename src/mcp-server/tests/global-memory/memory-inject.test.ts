// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { rememberMemory } from "#src/mcp-server/helpers/memory/global-memory-store.ts";
import { withMemory } from "#src/mcp-server/helpers/memory/memory-inject.ts";
import { type McpResponse } from "#src/mcp-server/max-api-adapter.ts";
import { useTempConfigDir } from "../config-dir-test-helpers.ts";

useTempConfigDir();

/**
 * Build a fake inner callLiveApi that resolves to the given response.
 * @param response - The McpResponse the fake should resolve with
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
 * Run withMemory over a ppal-connect call and return the appended block text.
 * @returns The appended memory block, or undefined when none was appended
 */
async function appendedBlock(): Promise<string | undefined> {
  const result = await withMemory(fakeInner(connectResponse()))(
    "ppal-connect",
    {},
  );

  return result.content.length > 1 ? result.content[1]?.text : undefined;
}

describe("withMemory", () => {
  it("injects eager bodies and lazy hooks in one labeled block", async () => {
    rememberMemory({
      name: "prefers-c-minor",
      type: "user",
      description: "default key",
      body: "Composes mostly in C minor.",
    });
    rememberMemory({
      name: "loose-drums",
      type: "feedback",
      description: "swing/humanize",
      body: "Never hard-quantize hats.",
    });
    rememberMemory({
      name: "album-nyx",
      type: "project",
      description: "dark ambient, 60bpm",
      body: "The Nyx album body.",
    });

    const block = (await appendedBlock()) ?? "";

    // Eager: full bodies under headings.
    expect(block).toContain("### prefers-c-minor\nComposes mostly in C minor.");
    expect(block).toContain("### loose-drums\nNever hard-quantize hats.");
    // Lazy: index hook only, not the body.
    expect(block).toContain("- `album-nyx` — dark ambient, 60bpm");
    expect(block).not.toContain("The Nyx album body.");
    expect(block).toContain("Always in context:");
    expect(block).toContain("Available on demand");
  });

  it("omits the on-demand section when every memory is eager", async () => {
    rememberMemory({ name: "u", type: "user", description: "d", body: "b" });

    const block = (await appendedBlock()) ?? "";

    expect(block).toContain("Always in context:");
    expect(block).not.toContain("Available on demand");
  });

  it("omits the always-in-context section when every memory is lazy", async () => {
    rememberMemory({
      name: "r",
      type: "reference",
      description: "",
      body: "b",
    });

    const block = (await appendedBlock()) ?? "";

    expect(block).not.toContain("Always in context:");
    expect(block).toContain("Available on demand");
    // A lazy entry with no description renders without a trailing dash.
    expect(block).toContain("- `r`");
    expect(block).not.toContain("- `r` —");
  });

  it("does not inject when there are no memories", async () => {
    const result = await withMemory(fakeInner(connectResponse()))(
      "ppal-connect",
      {},
    );

    expect(result.content).toHaveLength(1);
  });

  it("leaves non-connect tool responses untouched", async () => {
    rememberMemory({ name: "u", type: "user", description: "d", body: "b" });

    const result = await withMemory(fakeInner(connectResponse()))(
      "ppal-read-track",
      {},
    );

    expect(result.content).toHaveLength(1);
  });
});
