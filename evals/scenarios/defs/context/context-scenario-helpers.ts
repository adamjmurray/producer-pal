// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared fixtures and assertions for the ppal-context evaluation scenarios.
 *
 * These scenarios grade BEHAVIOR — does the model follow what's in context, and
 * does it reach for the right layer when writing? The mechanics of each scope
 * (read/write/delete over the MCP protocol) are already pinned by
 * e2e/mcp/workflow/ppal-context.test.ts; nothing here re-tests those.
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
import { getToolCalls } from "../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
  type ScenarioRequirements,
} from "../../types.ts";
import { clearSessionSlots } from "../clip/clip-scenario-helpers.ts";

/** Connect tool name (turn-0 connect assertion). */
export const TOOL_CONNECT = "ppal-connect";

/** The context/memory tool under evaluation. */
export const TOOL_CONTEXT = "ppal-context";

/** Standard turn-0 message that opens a connection to Live. */
export const MSG_CONNECT = "Connect to Ableton Live";

/** The Live Set every context scenario shares, so they can reuse one open. */
export const CONTEXT_LIVE_SET = "basic-midi-4-track";

/** Lead is track 3 in basic-midi-4-track — a melodic (non-drum) track. */
export const LEAD_TRACK = 3;

/** Session slot the clip-writing context scenarios fill (and clear in setup). */
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
 *  - **Memory** is restored by DIFF, not by name: setup records the index up
 *    front, and teardown deletes every entry that wasn't there before. That
 *    covers seeded fixtures and — the case a name list can't — entries the model
 *    invents under names we cannot predict.
 *
 * Seeding a memory over a name that already holds something else throws rather
 * than clobbering it (see `assertMemoryNameFree`). Since the diff only ever
 * deletes entries that appeared during the run, a pre-existing real memory is
 * never deleted either.
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
  const saved = new Map<"global" | "memoryNames", string>();

  return {
    setup: async (mcpClient) => {
      if (seed.clearSlots?.length) {
        await clearSessionSlots(mcpClient, seed.clearSlots);
      }

      // Snapshot BOTH layers before touching either, so teardown can restore
      // them regardless of who writes during the run — us, or the model.
      saved.set(
        "global",
        await callContext(mcpClient, { action: "read", scope: "global" }),
      );

      const memoryNames = await readMemoryNames(mcpClient);

      // null ⇒ the memory scope isn't reachable (small-model mode strips it from
      // the enum). Nothing can write memory in that run, so there's nothing to
      // clean up — record no snapshot and teardown will skip the diff.
      if (memoryNames != null) {
        saved.set("memoryNames", JSON.stringify(memoryNames));
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
        await assertMemoryNameFree(mcpClient, memory);
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
      const snapshot = saved.get("memoryNames");

      // Absent ⇒ memory was unreachable this run (see setup); skip the diff.
      if (snapshot != null) {
        const before = new Set<string>(JSON.parse(snapshot) as string[]);

        for (const name of (await readMemoryNames(mcpClient)) ?? []) {
          if (!before.has(name)) {
            await callContext(mcpClient, {
              action: "delete",
              scope: "memory",
              name,
            });
          }
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
 * The names currently in the memory index. The index renders one
 * `` - `name` — description `` line per entry, so the backtick-quoted name is
 * the stable thing to parse.
 *
 * Returns null when the memory scope isn't reachable at all: small-model mode
 * strips "memory" from the `scope` enum, so the call comes back as an error
 * string rather than a result. That must not blow up the non-memory context
 * scenarios (follow/write-layer/preserve), which DO run in small-model mode —
 * and since nothing can write memory in such a run, "no index" is the truthful
 * answer, not a failure.
 *
 * @param mcpClient - The scenario's MCP client
 * @returns Every stored memory name, or null when the memory scope is unavailable
 */
async function readMemoryNames(mcpClient: Client): Promise<string[] | null> {
  let index: string;

  try {
    index = await callContext(mcpClient, { action: "read", scope: "memory" });
  } catch {
    return null;
  }

  return [...index.matchAll(/^-\s+`([^`]+)`/gm)].map((m) => m[1] as string);
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

/**
 * Refuse to seed over a memory name that already holds something else. The
 * Node route answers a missing entry with a fixed not-found sentence rather
 * than an error, which is what makes "is this name free?" checkable at all.
 *
 * @param mcpClient - The scenario's MCP client
 * @param memory - The entry about to be seeded
 * @throws If the name is taken by content we did not write
 */
async function assertMemoryNameFree(
  mcpClient: Client,
  memory: SeedMemory,
): Promise<void> {
  const existing = await callContext(mcpClient, {
    action: "read",
    scope: "memory",
    name: memory.name,
  });

  const absent = existing.trim() === `No memory found for "${memory.name}".`;
  const ours = existing.trim() === memory.content.trim();

  if (!absent && !ours) {
    throw new Error(
      `Refusing to seed eval memory "${memory.name}": a different memory ` +
        `already exists under that name in ~/.producer-pal/memory/. Rename the ` +
        `eval fixture so a real memory isn't overwritten.`,
    );
  }
}

/**
 * The scope a call targeted. Both `scope` and `action` have schema defaults, and
 * what a turn records is the model's RAW args — so an omitted `scope` still
 * means "project" and an omitted `action` still means "read". Normalizing here
 * keeps every assertion below from having to remember that.
 *
 * @param args - Raw tool-call arguments
 * @returns The targeted scope
 */
function scopeOf(args: Record<string, unknown>): string {
  return String(args.scope ?? "project");
}

/**
 * The action a call took, applying the schema default (see {@link scopeOf}).
 *
 * @param args - Raw tool-call arguments
 * @returns The action taken
 */
function actionOf(args: Record<string, unknown>): string {
  return String(args.action ?? "read");
}

/**
 * The ppal-context calls in a turn matching an action and scope.
 *
 * @param turns - All turn results
 * @param turn - Turn index, or "any" to search every turn
 * @param action - Action to match (read | write | delete)
 * @param scope - Scope to match (project | global | memory)
 * @returns Matching calls' arguments
 */
function contextCalls(
  turns: EvalTurnResult[],
  turn: number | "any",
  action: string,
  scope: string,
): Array<Record<string, unknown>> {
  return getToolCalls(turns, turn)
    .filter((c) => c.name === TOOL_CONTEXT)
    .map((c) => c.args)
    .filter((args) => actionOf(args) === action && scopeOf(args) === scope);
}

/**
 * Assert the model wrote to a specific context layer — the core
 * "reached for the right scope" check. Optionally pins the memory entry `name`,
 * which is how update-not-duplicate is graded (reusing an existing name is an
 * UPDATE; inventing a new one duplicates the fact).
 *
 * @param opts - What the write must look like
 * @param opts.scope - The layer that must have been written
 * @param opts.turn - Turn to check
 * @param opts.name - Required memory entry name (memory scope only)
 * @param opts.count - Exact number of matching writes expected
 * @returns Custom assertion
 */
export function assertContextWrite(opts: {
  scope: "project" | "global" | "memory";
  turn: number | "any";
  name?: string;
  count?: number;
}): EvalAssertion {
  const target = opts.name ? `${opts.scope} "${opts.name}"` : opts.scope;

  return {
    type: "custom",
    description: `wrote context scope:${target}`,
    assert: (turns) => {
      let writes = contextCalls(turns, opts.turn, "write", opts.scope);

      if (opts.name != null) {
        const wrongNames = writes
          .map((args) => String(args.name ?? ""))
          .filter((name) => name !== opts.name);

        writes = writes.filter((args) => args.name === opts.name);

        if (wrongNames.length > 0) {
          throw new Error(
            writes.length === 0
              ? `wrote a NEW memory "${wrongNames.join('", "')}" instead of ` +
                  `updating the existing "${opts.name}"`
              : `updated "${opts.name}" but ALSO wrote ` +
                  `"${wrongNames.join('", "')}" — the fact is now duplicated`,
          );
        }
      }

      if (writes.length === 0) {
        throw new Error(`no ${TOOL_CONTEXT} write to scope:${opts.scope}`);
      }

      if (opts.count != null && writes.length !== opts.count) {
        throw new Error(
          `expected ${opts.count} scope:${opts.scope} write(s), got ${writes.length}`,
        );
      }

      return true;
    },
  };
}

/**
 * Assert that a write to a user-owned layer PRESERVED what was already in the
 * document. `action:write` replaces the whole thing, so the model has to carry
 * the existing content forward in the `content` it sends — the document is
 * already injected into its context on connect, so it has everything it needs
 * to do that without reading first.
 *
 * This is the difference between a skipped confirmation (annoying) and silent
 * data loss (serious): a model that writes only the NEW fact wipes everything
 * the user had accumulated.
 *
 * @param opts - What the write must preserve
 * @param opts.scope - The user-owned layer being written
 * @param opts.turn - Turn to check
 * @param opts.mustContain - Snippets of the pre-existing document that must survive
 * @returns Custom assertion
 */
export function assertContextWritePreserves(opts: {
  scope: "project" | "global";
  turn: number | "any";
  mustContain: string[];
}): EvalAssertion {
  return {
    type: "custom",
    description: `scope:${opts.scope} write kept the existing document`,
    assert: (turns) => {
      const writes = contextCalls(turns, opts.turn, "write", opts.scope);

      if (writes.length === 0) {
        throw new Error(`no ${TOOL_CONTEXT} write to scope:${opts.scope}`);
      }

      // The LAST write is what the document ends up as.
      const content = String(writes.at(-1)?.content ?? "");
      const dropped = opts.mustContain.filter((s) => !content.includes(s));

      if (dropped.length > 0) {
        throw new Error(
          `write DESTROYED existing content — dropped: ${dropped
            .map((s) => `"${s}"`)
            .join(", ")}`,
        );
      }

      return true;
    },
  };
}

/**
 * Assert the model did NOT write a given layer. The layer split only holds if
 * the WRONG layer stays untouched: a model that dutifully writes global context
 * and ALSO copies the same fact into memory has duplicated it into a place that
 * will drift, and one that writes only memory has quietly downgraded an
 * always-on fact to a lazy-loaded one. Neither is visible to an assertion that
 * merely checks the right layer got written.
 *
 * @param opts - What must not have been written
 * @param opts.scope - The layer that must NOT have been written
 * @param opts.turn - Turn to check
 * @returns Custom assertion
 */
export function assertNoContextWrite(opts: {
  scope: "project" | "global" | "memory";
  turn: number | "any";
}): EvalAssertion {
  return {
    type: "custom",
    description: `did not write context scope:${opts.scope}`,
    assert: (turns) => {
      const writes = contextCalls(turns, opts.turn, "write", opts.scope);

      if (writes.length > 0) {
        throw new Error(
          `wrote scope:${opts.scope} — that fact belongs in another layer`,
        );
      }

      return true;
    },
  };
}

/**
 * Assert the model did NOT write a user-owned layer on this turn. The skills
 * require confirming before REPLACING a project/global document that already
 * has content, so an unprompted write on the turn the fact was merely stated is
 * the failure this catches. Only meaningful when the document is non-empty: an
 * empty one carries no such rule, since a write there destroys nothing.
 *
 * @param turn - Turn that should contain no project/global write
 * @returns Custom assertion
 */
export function assertNoUnconfirmedWrite(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: "did not write project/global context before confirming",
    assert: (turns) => {
      const written = (["project", "global"] as const).filter(
        (scope) => contextCalls(turns, turn, "write", scope).length > 0,
      );

      if (written.length > 0) {
        throw new Error(
          `wrote scope:${written.join(", ")} without confirming first`,
        );
      }

      return true;
    },
  };
}

/**
 * Assert the model loaded a memory entry BY NAME. This is the whole point of
 * the memory layer: only the index (name + description) is in context, so the
 * model has to decide from the description alone that a body is worth reading.
 *
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

      if (!reads.some((args) => args.name === name)) {
        const seen = reads.map((args) => String(args.name ?? "(index)"));
        const detail =
          seen.length > 0 ? `read ${seen.join(", ")} instead` : "read nothing";

        throw new Error(`did not load memory "${name}" — ${detail}`);
      }

      return true;
    },
  };
}

/**
 * Assert the model loaded NO memory bodies. The index descriptions are always
 * in context, so a model that reads every entry "just in case" would defeat the
 * layer's whole purpose (lazy loading) and burn the context window on every
 * turn. Reading the index itself is fine — only pulling bodies fails.
 *
 * @param turn - Turn that should load no memory bodies
 * @returns Custom assertion
 */
export function assertNoMemoryRead(turn: number | "any"): EvalAssertion {
  return {
    type: "custom",
    description: "did not load any memory bodies",
    assert: (turns) => {
      const bodies = contextCalls(turns, turn, "read", "memory")
        .map((args) => String(args.name ?? ""))
        .filter((name) => name !== "");

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

      if (!deletes.some((args) => args.name === name)) {
        throw new Error(`did not delete memory "${name}"`);
      }

      return true;
    },
  };
}
