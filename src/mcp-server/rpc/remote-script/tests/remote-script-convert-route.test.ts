// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { CONVERT_ROUTE } from "#src/tools/clip/convert/remote-script-convert-contract.ts";
import { dispatchNodeRoute } from "../../../tests/config-dir-test-helpers.ts";
import { registerRemoteScriptConvertRoute } from "../forwarded/remote-script-convert-route.ts";
import {
  OUTDATED_ANSWER,
  unknownRouteAnswer,
  useFakeRemoteScriptRoutes,
} from "./remote-script-test-helpers.ts";

/**
 * Convert the first Session clip of the first track, as drums.
 * @returns What the route answered
 */
function convertSlot(): Promise<unknown> {
  return dispatchNodeRoute(CONVERT_ROUTE, {
    track: "t0",
    slot: 0,
    type: "drums",
    expiresInMs: 5000,
  });
}

const answerWith = useFakeRemoteScriptRoutes(registerRemoteScriptConvertRoute);

describe("remoteScript.clip.convert", () => {
  it("forwards a session clip in the remote script's spelling", async () => {
    const remote = await answerWith({ body: { started: true } });

    expect(
      await dispatchNodeRoute(CONVERT_ROUTE, {
        track: "t2",
        slot: 1,
        type: "drums",
        expiresInMs: 5000,
      }),
    ).toStrictEqual({ success: true, result: { available: true } });
    expect(remote.requests).toStrictEqual([
      {
        method: "POST",
        route: "/clip/convert",
        query: {},
        body: {
          track: "t2",
          slot: 1,
          type: "drums",
          expires_in_ms: 5000,
        },
      },
    ]);
  });

  it("forwards an arrangement clip as arrangement_index", async () => {
    const remote = await answerWith({ body: { started: true } });

    await dispatchNodeRoute(CONVERT_ROUTE, {
      track: "t0",
      arrangementIndex: 3,
      type: "simpler",
      expiresInMs: 5000,
    });

    expect(remote.requests[0]?.body).toStrictEqual({
      track: "t0",
      arrangement_index: 3,
      type: "simpler",
      expires_in_ms: 5000,
    });
  });

  it("words a route an older remote script lacks as out of date", async () => {
    await answerWith(unknownRouteAnswer("/clip/convert"));

    expect(await convertSlot()).toStrictEqual({
      success: true,
      result: OUTDATED_ANSWER,
    });
  });

  it("hands back the remote script's refusal", async () => {
    await answerWith({
      status: 409,
      body: { error: "only an audio clip can be converted" },
    });

    expect(await convertSlot()).toStrictEqual({
      success: true,
      result: { available: true, error: "only an audio clip can be converted" },
    });
  });

  it("marks a job Live started but didn't finish as unfinished", async () => {
    await answerWith({
      status: 504,
      body: { error: "Live didn't finish it", started: true },
    });

    expect(await convertSlot()).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: "Live didn't finish it",
        unfinished: true,
      },
    });
  });
});
