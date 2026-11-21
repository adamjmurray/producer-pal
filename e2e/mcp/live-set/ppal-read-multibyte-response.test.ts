// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for a response that crosses several Max message chunks and is full
 * of multi-byte text. Max drops everything past ~32K UTF-8 bytes in a message,
 * and a chunk cut through an emoji comes back as U+FFFD.
 * Uses: e2e-test-set (tracks t0-t8)
 * See: e2e/live-sets/specs/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-read-multibyte-response
 */
import { describe, expect, it } from "vitest";
import { MAX_CHUNK_SIZE } from "#src/shared/mcp-responses.ts";
import {
  extractToolResultText,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

interface LiveSetResult {
  tracks?: Array<{ id: string; name: string }>;
}

/** Hiragana, kanji and katakana: 3 bytes each in UTF-8, 1 UTF-16 unit. */
const JAPANESE =
  "あいうえお日本語の長いトラック名をここに書きますカタカナ音楽制作";

/**
 * Text of exactly `length` UTF-16 units, cycling through Japanese characters.
 * @param length - Units wanted
 * @returns The text
 */
function japanese(length: number): string {
  return JAPANESE.repeat(Math.ceil(length / JAPANESE.length)).slice(0, length);
}

/**
 * Rename tracks t0..t8: six emoji-only names (4,000 UTF-16 units each) that
 * fill the first chunk edges, then three Japanese ones. The first name gets
 * `pad` ahead of it, which moves every later chunk edge by that many units.
 * Emoji are 2 units, so an edge inside an emoji-only name splits a pair on
 * every other offset: with a pad of 0 and of 1, one of the two reads has it.
 * @param pad - Text to put before the first name
 * @returns The names written, by track index
 */
async function renameTracks(pad: string): Promise<string[]> {
  const emoji = "😀🎹🎶🎧".repeat(500);
  const names = [
    pad + emoji,
    ...Array.from({ length: 5 }, () => emoji),
    ...Array.from({ length: 3 }, () => japanese(3000)),
  ];

  for (const [index, name] of names.entries()) {
    const result = await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { path: `t${index}`, name },
    });

    expect(isToolError(result)).toBe(false);
  }

  await sleep(100);

  return names;
}

describe("a read that crosses several chunks", () => {
  it.each([
    ["", "no pad"],
    ["a", "one unit of pad"],
  ])(
    "round-trips Japanese and emoji track names intact (%j: %s)",
    async (pad) => {
      const names = await renameTracks(pad);

      const result = await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: { include: ["tracks"] },
      });
      const text = extractToolResultText(result);

      // Proves the read really spanned several chunks.
      expect(text.length).toBeGreaterThan(MAX_CHUNK_SIZE * 3);

      const { tracks } = parseToolResult<LiveSetResult>(result);

      for (const [index, name] of names.entries()) {
        expect(tracks![index]!.name).toBe(name);
      }

      expect(text).not.toContain("�");
    },
  );
});
