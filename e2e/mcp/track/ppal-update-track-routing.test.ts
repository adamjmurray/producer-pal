// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-update-track routing writes.
 * Routing identifiers are assigned by Live per Set and per machine, so every
 * test reads the available options first and never hardcodes an id.
 * Uses: e2e-test-set (t8, the empty MIDI track with no instrument)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- track/ppal-update-track-routing
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";
import { EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

interface RoutingOption {
  name: string;
  inputId?: string;
  outputId?: string;
}

interface TrackRouting {
  id: string;
  inputRoutingType?: RoutingOption | null;
  inputRoutingChannel?: RoutingOption | null;
  outputRoutingType?: RoutingOption | null;
  outputRoutingChannel?: RoutingOption | null;
  availableInputRoutingTypes?: RoutingOption[];
  availableInputRoutingChannels?: RoutingOption[];
  availableOutputRoutingTypes?: RoutingOption[];
  availableOutputRoutingChannels?: RoutingOption[];
}

async function readRouting(trackIndex: number): Promise<TrackRouting> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-track",
    arguments: { trackIndex, include: ["routings", "available-routings"] },
  });

  return parseToolResult<TrackRouting>(result);
}

async function updateRouting(
  id: string,
  args: Record<string, string>,
): Promise<void> {
  await ctx.client!.callTool({
    name: "ppal-update-track",
    arguments: { id, ...args },
  });
  await sleep(100);
}

describe("ppal-update-track routing", () => {
  it("assigns input routing type", async () => {
    const before = await readRouting(EMPTY_MIDI_TRACK);
    const originalId = before.inputRoutingType!.inputId!;
    const target = before.availableInputRoutingTypes!.find(
      (t) => t.inputId !== originalId,
    );

    expect(target).toBeDefined();

    await updateRouting(before.id, { inputRoutingType: target!.inputId! });

    const after = await readRouting(EMPTY_MIDI_TRACK);

    expect(after.inputRoutingType?.inputId).toBe(target!.inputId);
    expect(after.inputRoutingType?.name).toBe(target!.name);

    await updateRouting(before.id, { inputRoutingType: originalId });
  });

  it("assigns input routing channel", async () => {
    const before = await readRouting(EMPTY_MIDI_TRACK);
    const originalTypeId = before.inputRoutingType!.inputId!;
    const originalChannelId = before.inputRoutingChannel!.inputId!;

    // "All Ins" is on every MIDI track and is the type that exposes the MIDI
    // channel list, so the channel write has something to choose between.
    const allIns = before.availableInputRoutingTypes!.find(
      (t) => t.name === "All Ins",
    );

    expect(allIns).toBeDefined();

    await updateRouting(before.id, { inputRoutingType: allIns!.inputId! });

    const withChannels = await readRouting(EMPTY_MIDI_TRACK);
    const channels = withChannels.availableInputRoutingChannels!;

    expect(channels.length).toBeGreaterThan(1);

    const target = channels.find(
      (c) => c.inputId !== withChannels.inputRoutingChannel?.inputId,
    );

    await updateRouting(before.id, { inputRoutingChannel: target!.inputId! });

    const after = await readRouting(EMPTY_MIDI_TRACK);

    expect(after.inputRoutingChannel?.inputId).toBe(target!.inputId);
    expect(after.inputRoutingChannel?.name).toBe(target!.name);

    await updateRouting(before.id, {
      inputRoutingType: originalTypeId,
      inputRoutingChannel: originalChannelId,
    });
  });

  it("assigns output routing type", async () => {
    const before = await readRouting(EMPTY_MIDI_TRACK);
    const originalId = before.outputRoutingType!.outputId!;
    // "Sends Only" is the side-effect-free choice; fall back to anything else.
    const target =
      before.availableOutputRoutingTypes!.find(
        (t) => t.name === "Sends Only",
      ) ??
      before.availableOutputRoutingTypes!.find(
        (t) => t.outputId !== originalId,
      );

    expect(target).toBeDefined();

    await updateRouting(before.id, { outputRoutingType: target!.outputId! });

    const after = await readRouting(EMPTY_MIDI_TRACK);

    expect(after.outputRoutingType?.outputId).toBe(target!.outputId);
    expect(after.outputRoutingType?.name).toBe(target!.name);

    await updateRouting(before.id, { outputRoutingType: originalId });
  });

  it("assigns output routing type by display name", async () => {
    const before = await readRouting(EMPTY_MIDI_TRACK);
    const originalId = before.outputRoutingType!.outputId!;
    // Set by name, so the target's name has to be unambiguous in this Set.
    const options = before.availableOutputRoutingTypes!;
    const target = options.find(
      (t) =>
        t.outputId !== originalId &&
        options.filter((o) => o.name === t.name).length === 1,
    );

    expect(target).toBeDefined();

    await updateRouting(before.id, { outputRoutingType: target!.name });

    const after = await readRouting(EMPTY_MIDI_TRACK);

    expect(after.outputRoutingType?.name).toBe(target!.name);
    expect(after.outputRoutingType?.outputId).toBe(target!.outputId);

    await updateRouting(before.id, { outputRoutingType: originalId });
  });

  it("assigns output routing channel", async () => {
    // Output channels only get interesting once the output is another track:
    // t8 has no instrument, so its output is MIDI and can reach a MIDI track.
    // Bass carries a rack, so the channel list is "Track In" plus its chains.
    const before = await readRouting(EMPTY_MIDI_TRACK);
    const originalTypeId = before.outputRoutingType!.outputId!;
    const originalChannelId = before.outputRoutingChannel!.outputId!;
    const bass = before.availableOutputRoutingTypes!.find(
      (t) => t.name === "Bass",
    );

    expect(bass).toBeDefined();

    await updateRouting(before.id, { outputRoutingType: bass!.outputId! });

    const withChannels = await readRouting(EMPTY_MIDI_TRACK);
    const channels = withChannels.availableOutputRoutingChannels!;

    expect(channels.length).toBeGreaterThan(1);

    const target = channels.find(
      (c) => c.outputId !== withChannels.outputRoutingChannel?.outputId,
    );

    await updateRouting(before.id, {
      outputRoutingChannel: target!.outputId!,
    });

    const after = await readRouting(EMPTY_MIDI_TRACK);

    expect(after.outputRoutingChannel?.outputId).toBe(target!.outputId);
    expect(after.outputRoutingChannel?.name).toBe(target!.name);

    await updateRouting(before.id, {
      outputRoutingType: originalTypeId,
      outputRoutingChannel: originalChannelId,
    });
  });
});
