// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: load a drum kit the user names, without being walked to it.
 *
 * A pack's drum kit isn't filed under any device in Live's browser. Asking
 * `ppal-create-device` for the preset "505 Classic Kit" now finds it by name in
 * Live's library database, so one call loads it. The database is read as of
 * Live's last save, so a miss still falls back to searching the library and
 * passing the path; either route must end loaded, without stopping to ask.
 *
 * Graded on the Set: a new track holds a device named for the kit. Stopping to
 * ask leaves nothing loaded, so the state check also catches it. The route is
 * reported as a signal only.
 */

import { asSignal, getToolCalls } from "../../../assertions/index.ts";
import { type EvalScenario } from "../../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../../clip/helpers/clip-tool-constants.ts";
import { newTrackPath } from "../../helpers/new-track-path.ts";
import { describeNames } from "../helpers/describe-names.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

const KIT = /505/;

/** A track read with its devices. */
interface TrackDevices {
  devices?: Array<{ name?: string }>;
}

/**
 * Device names on a track read.
 *
 * @param result - Parsed ppal-read-track result
 * @returns The names, "" for an unnamed device
 */
function deviceNames(result: unknown): string[] {
  return ((result as TrackDevices).devices ?? []).map(
    (device) => device.name ?? "",
  );
}

export const deviceKitByName: EvalScenario = {
  id: "device-kit-by-name",
  tags: ["devices"],
  description: "Load a named library drum kit on a new track, unprompted",
  kind: "capability",
  requires: { params: ["preset"] },
  liveSet: "basic-midi-4-track",

  messages: [MSG_CONNECT, "Load the 505 Classic Kit on a new MIDI track."],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // The device index isn't fixed: a default track preset may add devices.
    {
      type: "state",
      tool: TOOLS.readTrack,
      args: (turns) => ({ path: newTrackPath(turns), include: ["devices"] }),
      expect: (result) => deviceNames(result).some((name) => KIT.test(name)),
      explain: (result) =>
        `expected a device named for the 505 kit on the new track, devices are: ${describeNames(deviceNames(result))}`,
    },

    asSignal({
      type: "custom",
      description: "loaded by name in one ppal-create-device call, no search",
      assert: (turns) => {
        const calls = getToolCalls(turns, "any");

        return (
          calls.some(
            (call) =>
              call.name === TOOLS.createDevice && call.args.preset != null,
          ) && !calls.some((call) => call.name === TOOLS.library)
        );
      },
    }),

    { type: "token_usage", maxTokens: 2_500 },
  ],
};
