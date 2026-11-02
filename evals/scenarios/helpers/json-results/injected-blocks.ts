// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Stores the context blocks a tool injected, once per run instead of once per
 * scenario.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
      if (call.injectedBlocks == null) {
        return call;
      }

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
 * Swap each stored hash back for the block text in `blocks/`, so judges read
 * the saved run the way the live judge read it. A hash with no file (the run
 * predates block storage, or the file was deleted) is dropped rather than
 * shown as if it were text.
 *
 * @param result - Result as read from disk, not modified
 * @param dir - Run directory the result was read from
 * @returns The result with block text in place of hashes
 */
export async function restoreInjectedBlocks(
  result: JsonEvalResult,
  dir: string,
): Promise<JsonEvalResult> {
  const turns = await Promise.all(
    result.turns.map(async (turn) => ({
      ...turn,
      toolCalls: await Promise.all(
        turn.toolCalls.map(async (call) => {
          if (call.injectedBlocks == null) {
            return call;
          }

          const texts = await Promise.all(
            call.injectedBlocks.map((hash) => readBlock(dir, hash)),
          );

          return {
            ...call,
            injectedBlocks: texts.filter((text) => text != null),
          };
        }),
      ),
    })),
  );

  return { ...result, turns };
}

/**
 * Read one stored block.
 *
 * @param dir - Run directory
 * @param hash - Block hash
 * @returns The text, or undefined when there is no such file
 */
async function readBlock(
  dir: string,
  hash: string,
): Promise<string | undefined> {
  // The hash comes from a result file, so keep it from naming a path.
  if (!/^[0-9a-f]+$/.test(hash)) {
    return undefined;
  }

  try {
    return await readFile(join(dir, "blocks", `${hash}.txt`), "utf8");
  } catch {
    return undefined;
  }
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
  if (texts.size === 0) {
    return;
  }

  const blocksDir = join(dir, "blocks");

  await mkdir(blocksDir, { recursive: true });

  await Promise.all(
    [...texts].map(([hash, text]) =>
      writeFile(join(blocksDir, `${hash}.txt`), text),
    ),
  );
}
