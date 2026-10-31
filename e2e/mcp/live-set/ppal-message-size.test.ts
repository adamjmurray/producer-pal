// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for the one-message size cap on tool-call args. Max cuts a message
 * past 32,767 UTF-8 bytes; Producer Pal refuses at MAX_NODE_TO_V8_BYTES
 * rather than send one that would arrive truncated.
 * Uses: e2e-test-set (track t0)
 *
 * Run with: npm run e2e:mcp -- ppal-message-size
 */
import { describe, expect, it } from "vitest";
import { MAX_NODE_TO_V8_BYTES } from "#src/shared/mcp-responses.ts";
import {
  extractToolResultText,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

interface ReadTrackResult {
  name: string;
}

/** 3 bytes in UTF-8, so the cap is about bytes, not characters. */
const CHAR = "あ";
const CHAR_BYTES = 3;

/**
 * A track name that makes the call's args about `bytes` UTF-8 bytes.
 * @param bytes - Wanted size of the name
 * @returns The name
 */
function nameOfBytes(bytes: number): string {
  return CHAR.repeat(Math.floor(bytes / CHAR_BYTES));
}

async function readName(): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-track",
    arguments: { path: "t0" },
  });

  return parseToolResult<ReadTrackResult>(result).name;
}

async function renameTrack(name: string) {
  return await ctx.client!.callTool({
    name: "ppal-update-track",
    arguments: { path: "t0", name },
  });
}

describe("a call that nears Max's one-message size limit", () => {
  it("runs a call just under the cap", async () => {
    const name = nameOfBytes(MAX_NODE_TO_V8_BYTES - 200);
    const result = await renameTrack(name);

    expect(isToolError(result) ? extractToolResultText(result) : "").toBe("");

    await sleep(100);

    expect(await readName()).toBe(name);
  });

  it("refuses a call just over the cap and changes nothing", async () => {
    const originalName = await readName();
    const result = await renameTrack(nameOfBytes(MAX_NODE_TO_V8_BYTES + 200));

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "too large for a single Max IPC message",
    );
    expect(getToolErrorMessage(result)).toMatch(/Nothing changed\.$/);

    await sleep(100);

    expect(await readName()).toBe(originalName);
  });
});
