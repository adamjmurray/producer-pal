// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Read-only REST endpoint that assembles a spawned subagent worker's SYSTEM
// PROMPT addendum: the skills its toolset needs, the Live Set it is working in,
// and the user's context layers — everything a worker used to have to call
// ppal-connect for.
//
// Why not just let the worker call ppal-connect? Two costs. It spends a whole
// inference round doing it, per spawn; and the result lands in message history,
// where it is neither a stable cache prefix nor as well-adhered-to as the system
// prompt. A worker is a fresh conversation every time — there is no history to
// amortize a cached blob against — so the blob belongs in the one part of the
// request that repeats byte-for-byte across spawns of the same profile.
//
// Why not extend /skills-preview? That endpoint answers "what does the context
// editor show the user", deliberately reflecting the DEVICE's tool whitelist and
// returning only skills. This one answers "what does this worker need to start
// work", takes the caller's own profile off the per-request headers, and reaches
// V8 for the Live Set. Same buildSkills underneath, different questions.

import { type Express, type Request, type Response } from "express";
import {
  DISABLED_TOOLS_HEADER,
  SMALL_MODEL_MODE_HEADER,
  resolveEnabledTools,
  resolveSmallModelMode,
} from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import {
  NOTATION_HEADER,
  resolveNotation,
  type Notation,
} from "#src/shared/notation.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import { type CallLiveApiFunction } from "../create-mcp-server.ts";
import {
  globalContextBlock,
  projectContextBlock,
} from "../helpers/global-context/global-context-inject.ts";
import { rejectForeignOriginWrite } from "../helpers/http/request-origin.ts";
import { readSkillOverrides } from "../helpers/skill-overrides-store.ts";
import { type McpResponse } from "../max-api-adapter.ts";
import * as console from "../node-for-max-logger.ts";

/** The live device settings a briefing falls back to when a header is absent. */
export interface SubagentBriefingConfig {
  tools: string[];
  notation: Notation;
  smallModelMode: boolean;
  /** This Live Set's context blob, held by the Max device (config, not fs). */
  projectContext: string;
}

/**
 * Register the GET /subagent-briefing endpoint on the Express app.
 *
 * The caller's profile arrives on the SAME three per-request headers its MCP
 * requests carry — notation, small-model mode, and the withheld tools — so the
 * briefing is assembled for exactly the toolset and notation the worker will run
 * under, with no second vocabulary to keep in sync. Absent headers fall back to
 * the device globals, the same contract POST /mcp has.
 *
 * Origin-gated like the content writes (see rejectForeignOriginWrite), not like
 * the other read endpoints. Disclosure isn't the reason — it reveals nothing a
 * ppal-connect call on the same profile wouldn't. The reason is the side effect:
 * this is the only read endpoint that dispatches a real Live API call, so
 * ungated, any page the user has open could drive their Live Set in a loop and
 * hold an Express socket per request until the tool timeout. Same-origin still
 * passes, so the chat reaches it over a LAN/tunnel as before.
 *
 * Responds 502 when Live can't be reached — the caller then falls back to
 * letting the worker connect for itself, so a briefing failure degrades to the
 * previous behavior instead of launching a worker that knows nothing.
 *
 * @param app - Express application
 * @param getConfig - Reads the current device settings (per request, for live
 *   updates)
 * @param callLiveApi - Dispatches the Live Set probe to V8. Pass the RAW
 *   callLiveApi, not the connect-enriched one: this route composes the blocks
 *   itself, in worker order, and must not inherit the user-facing next step.
 */
export function registerSubagentBriefingRoute(
  app: Express,
  getConfig: () => SubagentBriefingConfig,
  callLiveApi: CallLiveApiFunction,
): void {
  app.get(
    "/subagent-briefing",
    async (req: Request, res: Response): Promise<void> => {
      // Gated like a write, because it acts like one: this GET reaches Live.
      if (
        rejectForeignOriginWrite(
          req,
          res,
          "cross-site /subagent-briefing requests are not allowed",
        )
      ) {
        return;
      }

      // Overrides, context, and the Live Set all change between calls — never
      // cache. (Cache stability across spawns is the MODEL's prompt cache, which
      // keys on the assembled text, not on an HTTP cache.)
      res.set("Cache-Control", "no-store");

      const config = getConfig();
      const notation = resolveNotation(
        req.get(NOTATION_HEADER),
        config.notation,
      );
      const smallModelMode = resolveSmallModelMode(
        req.get(SMALL_MODEL_MODE_HEADER),
        config.smallModelMode,
      );
      const tools = resolveEnabledTools(
        req.get(DISABLED_TOOLS_HEADER),
        config.tools,
      );

      let liveSet: string;

      try {
        liveSet = await readLiveSetOverview(callLiveApi);
      } catch (error) {
        res.status(502).json({ error: errorMessage(error) });

        return;
      }

      const skills = buildSkills(
        { notation, smallModelMode, tools, audience: "subagent" },
        readSkillOverrides(),
        (message) => console.warn(`Subagent briefing skills: ${message}`),
      );

      res.json({
        briefing: composeBriefing({
          skills,
          liveSet,
          projectContext: config.projectContext,
        }),
      });
    },
  );
}

// --- Helpers below main export ---

/** The pieces a briefing is assembled from. */
interface BriefingParts {
  skills: string;
  liveSet: string;
  projectContext: string;
}

// The worker's marching orders, and the LAST thing in its system prompt for the
// same reason withNextStep composes outermost: it is the operative instruction,
// and it has to survive ten thousand tokens of reference material above it.
//
// It exists because a worker inherits the orchestrator's system instruction,
// which tells the assistant to suggest connecting and to call ppal-connect —
// advice that is now wrong twice over for a worker (already briefed, and the
// tool is withheld). Saying only "you are connected" would leave the other half
// standing: the base instruction is written for someone talking to a person, and
// a worker that stops to ask a clarifying question strands the orchestrator
// waiting on a result that will never come.
const WORKER_INSTRUCTION = `## You are a subagent

You are a Producer Pal subagent working in the Ableton Live Set described above. You are ALREADY connected — there is no connection step, and ppal-connect is not available to you.

Nobody is reading this conversation. The message you receive is a task delegated by another assistant, and your final message is the only thing it gets back. So:

- Do the work. Don't ask clarifying questions — make a sensible choice, do it, and say which choice you made.
- Stay inside the task's scope. Other subagents may be working in this same Live Set at the same time; don't touch tracks or clips the task didn't name.
- Finish with a short summary of what you actually changed (names, tracks, clips), plus anything you could not do and why.`;

/**
 * Assemble the worker's system-prompt addendum.
 *
 * Block order mirrors the ppal-connect response it replaces — Live Set, skills,
 * project context, global context — so the two paths teach the same thing in the
 * same sequence. Two deliberate differences: the memory INDEX is omitted (a
 * worker has no ppal-context to load a body with, so an index would be a dead
 * end — the same reasoning that skips it in small-model mode), and the
 * user-facing next step is replaced by {@link WORKER_INSTRUCTION}.
 *
 * @param parts - The assembled pieces
 * @returns The briefing text to append to the worker's system instruction
 */
function composeBriefing(parts: BriefingParts): string {
  return [
    `## Ableton Live Set\n\n${parts.liveSet}`,
    parts.skills,
    projectContextBlock(parts.projectContext),
    globalContextBlock(),
    WORKER_INSTRUCTION,
  ]
    .filter((block) => block != null && block !== "")
    .join("\n\n");
}

/**
 * Probe V8 for the Live Set overview — tempo, time signature, scale, and the
 * track/scene counts. Without it a worker writes confidently wrong positions:
 * bar|beat is meter-relative (the grid beat is not a quarter in 6/8), and
 * `snap()`/`step()` are no-ops with no scale.
 *
 * Forced to compact output regardless of the device's JSON setting: this is
 * prose in a system prompt rather than a tool result, and pinning the format
 * keeps a config flip from silently invalidating every worker's prompt cache.
 *
 * @param callLiveApi - Dispatches the call to V8
 * @returns The Live Set overview text
 * @throws When Live is unreachable or the call errors
 */
async function readLiveSetOverview(
  callLiveApi: CallLiveApiFunction,
): Promise<string> {
  const result = (await callLiveApi(
    "ppal-connect",
    {},
    { compactOutput: true },
  )) as McpResponse;
  const text = result.content[0]?.text ?? "";

  if (result.isError || text === "") {
    throw new Error(
      text === "" ? "Ableton Live returned no connection info" : text,
    );
  }

  return text;
}
