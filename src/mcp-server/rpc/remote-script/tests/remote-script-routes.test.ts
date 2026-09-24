// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { clearNodeRoutes } from "../../node-request-protocol.ts";
import { dispatchNodeRoute } from "../../../tests/config-dir-test-helpers.ts";
import { registerRemoteScriptRoutes } from "../remote-script-routes.ts";
import {
  type FakeAnswer,
  type FakeRemoteScript,
  startFakeRemoteScript,
} from "./remote-script-test-helpers.ts";

const LOAD_ARGS = {
  type: "plugin",
  path: "VST3/FabFilter/Pro-Q 4",
  trackIndex: 3,
  trackName: "Producer Pal temp abc",
};

let fake: FakeRemoteScript | undefined;

beforeEach(() => {
  registerRemoteScriptRoutes();
});

afterEach(async () => {
  clearNodeRoutes();
  await fake?.close();
  fake = undefined;
});

/**
 * Start a stand-in remote script that gives every request the same answer.
 * @param answer - The answer
 * @returns The stand-in
 */
async function answerWith(answer: FakeAnswer): Promise<FakeRemoteScript> {
  fake = await startFakeRemoteScript(() => answer);

  return fake;
}

describe("remoteScript.resolve", () => {
  it("looks the name up in Live's browser", async () => {
    await answerWith({ body: { items: [{ name: "Reverb", path: "Reverb" }] } });

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.resolve, { name: "Reverb" }),
    ).toHaveProperty("result.available", true);
  });

  it("needs a name", async () => {
    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.resolve, {}),
    ).toStrictEqual({ success: false, error: "name must be a string" });
  });
});

describe("remoteScript.load", () => {
  it("loads the item onto the track", async () => {
    const remote = await answerWith({ body: { loaded: {} } });

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.load, LOAD_ARGS),
    ).toStrictEqual({ success: true, result: { available: true } });
    expect(remote.requests).toStrictEqual([
      {
        method: "POST",
        route: "/load",
        query: {},
        body: {
          type: "plugin",
          path: "VST3/FabFilter/Pro-Q 4",
          track_index: 3,
          track_name: "Producer Pal temp abc",
        },
      },
    ]);
  });

  it("hands back why a load failed", async () => {
    await answerWith({ status: 404, body: { error: "no 'Pro-Q 4' in VST3" } });

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.load, LOAD_ARGS),
    ).toStrictEqual({
      success: true,
      result: { available: true, error: "no 'Pro-Q 4' in VST3" },
    });
  });

  it("says so when the remote script isn't running", async () => {
    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.load, LOAD_ARGS),
    ).toStrictEqual({ success: true, result: { available: false } });
  });

  it("needs a track index", async () => {
    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.load, {
        ...LOAD_ARGS,
        trackIndex: "3",
      }),
    ).toStrictEqual({ success: false, error: "trackIndex must be a number" });
  });

  it("needs a track name", async () => {
    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.load, {
        ...LOAD_ARGS,
        trackName: undefined,
      }),
    ).toStrictEqual({ success: false, error: "trackName must be a string" });
  });
});
