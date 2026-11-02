// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Grading how a model used the memory layer: which entries it loaded, which it
 * left alone, and which it deleted.
 */

import { splitEntries } from "#src/tools/shared/validation/lists/split-entries.ts";
import { argText } from "../../arg-text.ts";
import { type EvalAssertion } from "../../../types.ts";
import { contextCalls } from "./context-write-assertions.ts";

/**
 * Assert the model loaded a memory entry BY NAME — the point of the layer: only
 * the index is in context, so it must judge from the description alone.
 * @param name - The entry that should have been read
 * @param turn - Turn to check
 * @returns Custom assertion
 */
export function assertMemoryRead(
  name: string,
  turn: number | "any",
): EvalAssertion {
  return {
    type: "custom",
    description: `read memory "${name}" by name`,
    assert: (turns) => {
      const reads = contextCalls(turns, turn, "read", "memory");

      if (!reads.some((args) => namesIn(args.name).includes(name))) {
        const seen = reads.flatMap((args) => {
          const names = namesIn(args.name);

          return names.length > 0 ? names : ["(index)"];
        });
        const detail =
          seen.length > 0 ? `read ${seen.join(", ")} instead` : "read nothing";

        throw new Error(`did not load memory "${name}" — ${detail}`);
      }

      return true;
    },
  };
}

/**
 * Assert the model loaded NO memory bodies. Reading every entry "just in case"
 * defeats lazy loading and burns the context window each turn; reading the
 * index itself is fine.
 * @param turn - Turn that should load no memory bodies
 * @returns Custom assertion
 */
export function assertNoMemoryRead(turn: number | "any"): EvalAssertion {
  return {
    type: "custom",
    description: "did not load any memory bodies",
    assert: (turns) => {
      const bodies = contextCalls(turns, turn, "read", "memory").flatMap(
        (args) => namesIn(args.name),
      );

      if (bodies.length > 0) {
        throw new Error(
          `loaded irrelevant memory bodies: ${bodies.join(", ")}`,
        );
      }

      return true;
    },
  };
}

/**
 * Assert the model deleted a memory entry by name.
 *
 * @param name - The entry that should have been deleted
 * @param turn - Turn to check
 * @returns Custom assertion
 */
export function assertMemoryDeleted(
  name: string,
  turn: number | "any",
): EvalAssertion {
  return {
    type: "custom",
    description: `deleted memory "${name}"`,
    assert: (turns) => {
      const deletes = contextCalls(turns, turn, "delete", "memory");

      if (!deletes.some((args) => namesIn(args.name).includes(name))) {
        throw new Error(`did not delete memory "${name}"`);
      }

      return true;
    },
  };
}

// --- Helpers below main exports ---

/**
 * The memory names a call's `name` arg lists. A read or delete takes a
 * comma-separated list, with `\,` for a comma inside a name.
 * @param value - The raw `name` arg
 * @returns The trimmed, non-empty names
 */
function namesIn(value: unknown): string[] {
  return splitEntries(argText(value))
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}
