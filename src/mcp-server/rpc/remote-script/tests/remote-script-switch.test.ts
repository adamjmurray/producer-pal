// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it } from "vitest";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { dispatchNodeRoute } from "../../../tests/config-dir-test-helpers.ts";
import { clearNodeRoutes } from "../../node-request-protocol.ts";
import {
  pingRemoteScript,
  setRemoteScriptEnabled,
} from "../remote-script-client.ts";
import { registerRemoteScriptRoutes } from "../remote-script-routes.ts";
import { remoteScriptStatus } from "../remote-script-status.ts";
import {
  type FakeRemoteScript,
  startFakeRemoteScript,
} from "./remote-script-test-helpers.ts";

const ENVELOPE_ARGS = { track: "t0", slot: 0 };

/** Valid args for every route V8 can call, so none is left out of the sweep. */
const ROUTE_ARGS: Record<string, unknown> = {
  [REMOTE_SCRIPT_ROUTES.resolve]: { name: "Pro-Q 4" },
  [REMOTE_SCRIPT_ROUTES.resolvePreset]: { name: "Warm Pad" },
  [REMOTE_SCRIPT_ROUTES.load]: {
    type: "plugin",
    path: "VST3/Pro-Q 4",
    trackIndex: 0,
    trackName: "Drums",
    expiresInMs: 1000,
  },
  [REMOTE_SCRIPT_ROUTES.hotswap]: {
    type: "plugin",
    path: "VST3/Pro-Q 4",
    devicePath: "t0/d0",
    deviceName: "Pro-Q 4",
    expiresInMs: 1000,
  },
  [ENVELOPE_ROUTES.list]: ENVELOPE_ARGS,
  [ENVELOPE_ROUTES.read]: { ...ENVELOPE_ARGS, parameter: "volume" },
  [ENVELOPE_ROUTES.write]: {
    ...ENVELOPE_ARGS,
    parameter: "volume",
    points: [{ time: 0, value: 0.5 }],
  },
  [ENVELOPE_ROUTES.clear]: ENVELOPE_ARGS,
};

let fake: FakeRemoteScript | undefined;

afterEach(async () => {
  setRemoteScriptEnabled(true);
  clearNodeRoutes();
  await fake?.close();
  fake = undefined;
});

describe("the remote script switch", () => {
  it("makes every caller see no remote script, without a request reaching it", async () => {
    registerRemoteScriptRoutes();
    fake = await startFakeRemoteScript(() => ({
      body: { ok: true, items: [], envelopes: [] },
    }));

    // Control: the stand-in answers while the switch is on.
    expect(await pingRemoteScript()).toBe(true);
    fake.requests.length = 0;

    setRemoteScriptEnabled(false);

    expect(await pingRemoteScript()).toBe(false);
    const status = await remoteScriptStatus();

    expect(status.running).toBe(false);

    const routes = [
      ...Object.values(REMOTE_SCRIPT_ROUTES),
      ...Object.values(ENVELOPE_ROUTES),
    ];

    // A route added to a contract without args here fails the sweep.
    expect(Object.keys(ROUTE_ARGS).toSorted()).toStrictEqual(routes.toSorted());

    const answers: Record<string, unknown> = {};

    for (const route of routes) {
      answers[route] = await dispatchNodeRoute(route, ROUTE_ARGS[route]);
    }

    // Keyed by route, so a failure names the one that reached the script.
    expect(answers).toStrictEqual(
      Object.fromEntries(
        routes.map((route) => [
          route,
          {
            success: true,
            result: expect.objectContaining({ available: false }),
          },
        ]),
      ),
    );
    expect(fake.requests).toStrictEqual([]);
  });
});
