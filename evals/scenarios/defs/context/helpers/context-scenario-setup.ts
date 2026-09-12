// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Fixtures and the setup/teardown pair every ppal-context scenario shares.
 *
 * Seeding note: the project layer is a config value (`config.projectContext`),
 * which the runner reverts via resetConfig(). The global and memory layers are
 * REAL FILES under ~/.producer-pal/ on the machine running Live, and the eval
 * process (which talks to that server over HTTP) cannot redirect them with
 * PRODUCER_PAL_CONFIG_DIR. So they are seeded through the tool itself in
 * `setup` and restored in `teardown` — see `seedContext`.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText, parseToolResult } from "#evals/chat/mcp.ts";
import { CONNECT_MESSAGE } from "../../../helpers/seed-connect/seed-connect.ts";
import {
  type EvalScenario,
  type ScenarioRequirements,
} from "../../../types.ts";
import { clearClipSlots } from "../../clip/helpers/clip-turn-readers.ts";

/** Connect tool name (turn-0 connect assertion). */
export const TOOL_CONNECT = "ppal-connect";

/** The context/memory tool under evaluation. */
export const TOOL_CONTEXT = "ppal-context";

/** Standard turn-0 message that opens a connection to Live. */
export const MSG_CONNECT = CONNECT_MESSAGE;

/** The Live Set every context scenario shares, so they can reuse one open. */
export const CONTEXT_LIVE_SET = "basic-midi-4-track";

/** Lead is track 3 in basic-midi-4-track — a melodic (non-drum) track. */
export const LEAD_TRACK = 3;

/** Clip slot the clip-writing context scenarios fill (and clear in setup). */
export const LEAD_SLOT = `${LEAD_TRACK}/0`;

/**
 * Memory entries are hidden from small models (`name`/`description` have
 * `smallModel: null`, and the `memory` scope + `delete` action are dropped from
 * their enums), so every memory scenario must SKIP rather than fail there.
 */
export const REQUIRES_MEMORY: ScenarioRequirements = { params: ["name"] };

/** A memory entry to seed before a scenario runs. */
export interface SeedMemory {
  name: string;
  description: string;
  content: string;
}

/**
 * Build the `setup`/`teardown` pair for a context scenario. EVERY context
 * scenario must use this, even one that seeds nothing (`seedContext({})`) —
 * it's the safety net that keeps evals out of the developer's real
 * ~/.producer-pal, and it protects against two different leaks:
 *
 *  - **Global context** is always snapshotted and always restored, whether or
 *    not we seeded it. The write-layer scenarios exist precisely to make the
 *    MODEL write the global document; without an unconditional restore, a
 *    passing eval would overwrite the developer's own context.md.
 *  - **Memory** is snapshotted whole and put back: setup reads every entry,
 *    empties the store, then seeds; teardown clears whatever is there and
 *    rewrites the snapshot. Leaving the developer's real entries in place is
 *    not neutral — ANY stored memory makes connect treat the user as known, so
 *    the onboarding next step never fires and the scenarios that grade it fail
 *    on a populated machine and pass on an empty one.
 *
 * Restoring by snapshot rather than by diff also deletes what the MODEL wrote
 * under a name we could not have predicted, since the run ends with the store
 * reset to exactly what setup saw.
 *
 * Also clears any `clearSlots`, which is what lets these scenarios set
 * `reuseLiveSet` — they start from a clean slate without a fresh Live Set open.
 *
 * @param seed - What to seed
 * @param seed.global - Global context document to install for the run
 * @param seed.memories - Memory entries to install for the run
 * @param seed.clearSlots - Session clip slots to empty before the first turn
 * @returns The scenario's `setup` and `teardown` hooks
 */
export function seedContext(seed: {
  global?: string;
  memories?: SeedMemory[];
  clearSlots?: string[];
}): Pick<EvalScenario, "setup" | "teardown"> {
  const memories = seed.memories ?? [];
  // State held between setup and teardown. A Map rather than `let` bindings:
  // writing an awaited value back into a closure variable is a lost-update
  // hazard (and ESLint's require-atomic-updates rejects it).
  const saved = new Map<"global" | "memories", string>();

  return {
    setup: async (mcpClient) => {
      if (seed.clearSlots?.length) {
        await clearClipSlots(mcpClient, seed.clearSlots);
      }

      // Snapshot BOTH layers before touching either, so teardown can restore
      // them regardless of who writes during the run — us, or the model.
      saved.set(
        "global",
        await callContext(mcpClient, { action: "read", scope: "global" }),
      );

      const storedMemories = await readMemories(mcpClient);

      // null ⇒ the memory scope isn't reachable (small-model mode strips it from
      // the enum). Nothing can write memory in that run, so there's nothing to
      // clean up — record no snapshot and teardown will skip the restore.
      if (storedMemories != null) {
        saved.set("memories", JSON.stringify(storedMemories));
        await clearMemories(mcpClient);
      }

      // Always install a KNOWN global document — defaulting to empty, not to
      // "whatever this developer happens to have". Global context is injected on
      // every connect and instructs behavior directly, so inheriting the real
      // one makes results depend on the machine the eval ran on.
      // `force` on both the seed and the restore below: these REPLACE the
      // document wholesale, which is exactly what the tool's clobber guard
      // skips for a model. Setup/teardown are the deliberate case it exists to
      // let through.
      await callContext(mcpClient, {
        action: "write",
        scope: "global",
        content: seed.global ?? "",
        force: true,
      });

      for (const memory of memories) {
        await callContext(mcpClient, {
          action: "write",
          scope: "memory",
          name: memory.name,
          description: memory.description,
          content: memory.content,
        });
      }
    },

    teardown: async (mcpClient) => {
      const snapshot = saved.get("memories");

      // Absent ⇒ memory was unreachable this run (see setup); nothing to undo.
      if (snapshot != null) {
        await clearMemories(mcpClient);

        for (const memory of JSON.parse(snapshot) as SeedMemory[]) {
          await callContext(mcpClient, {
            action: "write",
            scope: "memory",
            name: memory.name,
            description: memory.description,
            content: memory.content,
          });
        }
      }

      const originalGlobal = saved.get("global");

      if (originalGlobal != null) {
        await callContext(mcpClient, {
          action: "write",
          scope: "global",
          content: originalGlobal,
          force: true,
        });
      }

      saved.clear();
    },
  };
}

/**
 * Every stored memory, whole, so teardown can put the store back exactly.
 *
 * The index renders one `` - `name` — description `` line per entry, which is
 * where the name and description come from; the body needs a read per entry,
 * since a read returns only the content.
 *
 * Returns null when the memory scope isn't reachable at all: small-model mode
 * strips "memory" from the `scope` enum, so the call comes back as an error
 * string rather than a result. That must not blow up the non-memory context
 * scenarios (follow/write-layer/preserve), which DO run in small-model mode —
 * and since nothing can write memory in such a run, "no index" is the truthful
 * answer, not a failure.
 *
 * @param mcpClient - The scenario's MCP client
 * @returns Every stored memory, or null when the memory scope is unavailable
 */
async function readMemories(mcpClient: Client): Promise<SeedMemory[] | null> {
  let index: string;

  try {
    index = await callContext(mcpClient, { action: "read", scope: "memory" });
  } catch {
    return null;
  }

  const listed = [...index.matchAll(/^-\s+`([^`]+)`\s+—\s+(.*)$/gm)].map(
    (match) => ({ name: match[1] as string, description: match[2] as string }),
  );
  const stored: SeedMemory[] = [];

  for (const entry of listed) {
    stored.push({
      ...entry,
      content: await callContext(mcpClient, {
        action: "read",
        scope: "memory",
        name: entry.name,
      }),
    });
  }

  return stored;
}

/**
 * Empty the memory store. Called in setup so the run starts from a KNOWN store
 * rather than the developer's, and in teardown before the snapshot goes back.
 *
 * @param mcpClient - The scenario's MCP client
 */
async function clearMemories(mcpClient: Client): Promise<void> {
  for (const memory of (await readMemories(mcpClient)) ?? []) {
    await callContext(mcpClient, {
      action: "delete",
      scope: "memory",
      name: memory.name,
    });
  }
}

/**
 * Call ppal-context directly (setup/teardown path, not the model's path).
 *
 * @param mcpClient - The scenario's MCP client
 * @param args - Tool arguments
 * @returns The tool result's `content` string
 */
async function callContext(
  mcpClient: Client,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await mcpClient.callTool({
    name: TOOL_CONTEXT,
    arguments: args,
  });
  const parsed = parseToolResult(extractToolResultText(result)) as {
    content?: string;
  };

  return parsed.content ?? "";
}
