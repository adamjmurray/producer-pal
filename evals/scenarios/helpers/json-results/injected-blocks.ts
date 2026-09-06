// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Stores the context blocks a tool injected, once per run instead of once per
 * scenario.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type JsonEvalResult } from "./types.ts";

/**
 * Swap every recorded context block for its content hash, and write the text
 * out under `blocks/`.
 *
 * The skills `ppal-connect` injects run to ~90 KB and are byte-identical in
 * every scenario, so keeping them inline would cost megabytes a run to store
 * one copy's worth of information. Hashing collapses them to a single file.
 * One file per hash, rather than one shared index, so several scenarios can
 * write at once without a read-modify-write race.
 *
 * @param result - Result carrying block text, not modified
 * @param dir - Run directory the blocks belong to
 * @returns The result with each block replaced by its hash
 */
export async function externalizeInjectedBlocks(
  result: JsonEvalResult,
  dir: string,
): Promise<JsonEvalResult> {
  const texts = new Map<string, string>();

  const turns = result.turns.map((turn) => ({
    ...turn,
    toolCalls: turn.toolCalls.map((call) => {
      if (call.injectedBlocks == null) return call;

      return {
        ...call,
        injectedBlocks: call.injectedBlocks.map((text) => {
          const hash = blockHash(text);

          texts.set(hash, text);

          return hash;
        }),
      };
    }),
  }));

  await writeBlocks(dir, texts);

  return { ...result, turns };
}

/**
 * Short content hash naming a block's file.
 *
 * @param text - Block text
 * @returns 16 hex characters of its SHA-256
 */
function blockHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * Write each block to `blocks/<hash>.txt`. Rewriting a file that is already
 * there is a no-op by construction, since its name is its content.
 *
 * @param dir - Run directory
 * @param texts - Block text by hash
 */
async function writeBlocks(
  dir: string,
  texts: Map<string, string>,
): Promise<void> {
  if (texts.size === 0) return;

  const blocksDir = join(dir, "blocks");

  await mkdir(blocksDir, { recursive: true });

  await Promise.all(
    [...texts].map(([hash, text]) =>
      writeFile(join(blocksDir, `${hash}.txt`), text),
    ),
  );
}
