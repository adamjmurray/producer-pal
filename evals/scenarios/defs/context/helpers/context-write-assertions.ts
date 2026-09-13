// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Grading which context layer a model wrote to, and whether it wrote at all.
 *
 * These scenarios grade BEHAVIOR — does the model reach for the right layer?
 * The mechanics of each scope (read/write/delete over MCP) are already pinned
 * by e2e/mcp/workflow/ppal-context.test.ts; nothing here re-tests those.
 */

import { argText } from "../../arg-text.ts";
import { getToolCalls } from "../../../assertions/index.ts";
import { type EvalAssertion, type EvalTurnResult } from "../../../types.ts";
import { TOOL_CONTEXT } from "./context-scenario-setup.ts";

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
          .map((args) => argText(args.name))
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
      const content = argText(writes.at(-1)?.content);
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
 * The ppal-context calls in a turn matching an action and scope.
 *
 * @param turns - All turn results
 * @param turn - Turn index, or "any" to search every turn
 * @param action - Action to match (read | write | delete)
 * @param scope - Scope to match (project | global | memory)
 * @returns Matching calls' arguments
 */
export function contextCalls(
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
 * The scope a call targeted. Both `scope` and `action` have schema defaults, and
 * what a turn records is the model's RAW args — so an omitted `scope` still
 * means "project" and an omitted `action` still means "read". Normalizing here
 * keeps every assertion from having to remember that.
 *
 * @param args - Raw tool-call arguments
 * @returns The targeted scope
 */
function scopeOf(args: Record<string, unknown>): string {
  return argText(args.scope, "project");
}

/**
 * The action a call took, applying the schema default (see {@link scopeOf}).
 *
 * @param args - Raw tool-call arguments
 * @returns The action taken
 */
function actionOf(args: Record<string, unknown>): string {
  return argText(args.action, "read");
}
