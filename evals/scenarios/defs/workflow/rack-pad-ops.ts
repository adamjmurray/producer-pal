// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Drum-pad chain work in one pass: the pad's own fader, a pad copy, and taking
 * one layer back off a pad that ended up with two.
 *
 * Each turn probes a different reach-for, and each is only visible in the chain
 * the pad ends up with:
 *   - **the pad fader** is the chain's, not the instrument's. Setting the
 *     Simpler's own volume sounds the same and reads back as a default chain,
 *     so the state check below is what tells the two apart.
 *   - **a pad copy** (`type:"drum-pad"`) brings the chain — trim, pan, choke
 *     group — while a device copy leaves all of it behind. The copy's `gainDb`
 *     and `chokeGroup` are how we know which one the model reached for.
 *   - **one layer off a layered pad** needs `ppal-delete type:"chain"`. Live
 *     lists a copied-on layer FIRST, so `/c0` is the shaker and `/c1` the pad
 *     that was already there — the model has to read the pad to tell them
 *     apart, and deleting the wrong one leaves a pad that fails the same check.
 *
 * The kit is the one already on the Drums track, nested inside an Instrument
 * Rack (`t0/d0/c0/d0`), so the model has to find it before it can address a pad.
 *
 * No LLM judge: the pad reads pin every outcome.
 */

import { argText } from "../arg-text.ts";
import { getToolCalls } from "../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-scenario-helpers.ts";

const TOOL_UPDATE_DEVICE = "ppal-update-device";
const TOOL_DUPLICATE = "ppal-duplicate";
const TOOL_DELETE = "ppal-delete";

/** The Cyndal Kit sits inside an Instrument Rack, two levels below the track. */
const RACK = "t0/d0/c0/d0";
/** "Hihat Pedal" — the only uniquely named pad, and already in choke group 3. */
const HAT_PAD = `${RACK}/pA#1`;
/** Free: the kit spans C1–D#2, so everything above it is an empty pad. */
const COPY_PAD = `${RACK}/pC3`;
/** The gain the first turn asks for, in dB. */
const TRIM_DB = -6;
/** Live quantizes a dB write, so compare with slack rather than for equality. */
const DB_TOLERANCE = 0.2;
/** The pedal hihat's choke group in the shipped kit — the copy must carry it. */
const HAT_CHOKE_GROUP = 3;

/** One chain of a drum pad, as ppal-read-device returns it. */
interface PadChain {
  name?: string;
  gainDb?: number;
  pan?: number;
  chokeGroup?: number;
}

/**
 * The chains on a pad read.
 * @param result - Parsed ppal-read-device result for a pad path
 * @returns The pad's chains, or an empty list when it has none
 */
function padChains(result: unknown): PadChain[] {
  return (result as { chains?: PadChain[] }).chains ?? [];
}

/**
 * A pad's chains as one readable line, for failure text.
 * @param result - Parsed ppal-read-device result for a pad path
 * @returns Each chain's name and mixer state
 */
function describePad(result: unknown): string {
  const chains = padChains(result);

  if (chains.length === 0) return "no chains";

  return chains
    .map(
      (chain) =>
        `${chain.name ?? "?"} (gainDb ${chain.gainDb ?? 0}, pan ${
          chain.pan ?? 0
        }, choke ${chain.chokeGroup ?? 0})`,
    )
    .join("; ");
}

/**
 * Whether a chain carries the trim the first turn asked for: the exact gain,
 * and a pan somewhere to the right (the prompt says "a little", so only the
 * direction is graded).
 *
 * @param chain - A chain off a pad read
 * @returns True when the chain's own fader holds the asked-for trim
 */
function hasAskedForTrim(chain: PadChain | undefined): boolean {
  if (chain == null) return false;

  return (
    Math.abs((chain.gainDb ?? 0) - TRIM_DB) <= DB_TOLERANCE &&
    (chain.pan ?? 0) > 0
  );
}

/**
 * Read one pad and grade its chains.
 *
 * @param path - Pad path to read
 * @param what - What the check is looking for, for the description
 * @param check - Verdict over the pad's chains
 * @returns A state assertion over the pad
 */
function assertPad(
  path: string,
  what: string,
  check: (chains: PadChain[]) => boolean,
): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-device",
    args: { path, include: ["chains"] },
    expect: (result) => check(padChains(result)),
    explain: (result) =>
      `${path}: expected ${what}, got ${describePad(result)}`,
  };
}

/**
 * Assert a call in `turn` carried the expected `type`. Both the pad copy and
 * the layer delete have a wrong-type neighbour that half-works — a device copy
 * lands a device without the chain, a device delete empties a layer without
 * removing it — so the type is worth grading on its own.
 *
 * @param turn - Turn index containing the call
 * @param tool - Tool name
 * @param type - The `type` arg the call must carry
 * @returns A custom assertion
 */
function assertCalledWithType(
  turn: number,
  tool: string,
  type: string,
): EvalAssertion {
  return {
    type: "custom",
    description: `${tool} turn ${turn}: type is "${type}"`,
    assert: (turns: EvalTurnResult[]) => {
      const calls = getToolCalls(turns, turn).filter((c) => c.name === tool);

      if (calls.length === 0) {
        throw new Error(`${tool} not called in turn ${turn}`);
      }

      if (!calls.some((c) => argText(c.args.type) === type)) {
        throw new Error(
          `no ${tool} call used type "${type}" — got ${calls
            .map((c) => argText(c.args.type) || "none")
            .join(", ")}`,
        );
      }

      return true;
    },
  };
}

/**
 * The layer landed: copying onto an occupied pad warns that it layered rather
 * than replaced. Nothing in the end state can prove this — a copy that never
 * happened leaves the same one-chain pad as the layer that was removed again.
 *
 * @param turn - Turn index containing the copy
 * @returns A custom assertion
 */
function assertLayeredOntoPad(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `turn ${turn}: the copy layered onto the occupied pad`,
    assert: (turns: EvalTurnResult[]) => {
      const warnings = getToolCalls(turns, turn)
        .filter((c) => c.name === TOOL_DUPLICATE)
        .flatMap((c) => c.warnings ?? []);

      if (!warnings.some((w) => /layer/i.test(w))) {
        throw new Error(
          warnings.length === 0
            ? "no layering warning — the copy never reached the occupied pad"
            : `no layering warning — got: ${warnings.join("; ")}`,
        );
      }

      return true;
    },
  };
}

export const rackPadOps: EvalScenario = {
  id: "rack-pad-ops",
  description:
    "Drum pad chain fader, a pad copy that carries it, and removing one layer",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  // The chain mixer params are hidden from small-model mode, so a small model
  // is never given the fader this scenario is about.
  requires: { params: ["gainDb", "chokeGroup"] },

  messages: [
    MSG_CONNECT,
    "In the Drums track's drum rack, turn the pedal hihat pad down to -6 dB and push it a little to the right.",
    "Copy that pedal hihat pad onto the empty C3 pad.",
    "Layer the shaker pad on top of C3 as well.",
    "That's too busy — take the shaker layer back off C3 and leave the pedal hihat on it.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Turn 1 — the pad's own fader, not the instrument's volume.
    { type: "tool_called", tool: TOOL_UPDATE_DEVICE, turn: 1 },
    assertPad(
      HAT_PAD,
      `one chain trimmed to ${TRIM_DB} dB and panned right`,
      (chains) => chains.length === 1 && hasAskedForTrim(chains[0]),
    ),

    // Turn 2 — a pad copy brings the chain; a device copy would not.
    assertCalledWithType(2, TOOL_DUPLICATE, "drum-pad"),

    // Turn 3 — copying onto an occupied pad layers rather than replaces.
    assertLayeredOntoPad(3),

    // Turn 4 — one layer off, and the right one. The survivor still carries the
    // trim and choke group the copy brought over in turn 2.
    assertCalledWithType(4, TOOL_DELETE, "chain"),
    assertPad(
      COPY_PAD,
      `one chain left, still at ${TRIM_DB} dB in choke group ${HAT_CHOKE_GROUP}`,
      (chains) =>
        chains.length === 1 &&
        hasAskedForTrim(chains[0]) &&
        chains[0]?.chokeGroup === HAT_CHOKE_GROUP,
    ),

    { type: "token_usage", metric: "inputTokens", maxTokens: 160_000 },
  ],
};
