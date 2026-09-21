// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import { clearNodeRoutes } from "../../node-request-protocol.ts";
import { dispatchNodeRoute } from "../../../tests/config-dir-test-helpers.ts";
import { registerRemoteScriptEnvelopeRoutes } from "../remote-script-envelope-routes.ts";
import {
  type FakeAnswer,
  type FakeRemoteScript,
  startFakeRemoteScript,
} from "./remote-script-test-helpers.ts";

const PARAMETER = {
  name: "Volume",
  min: 0,
  max: 1,
  value: 0.85,
  display: "0.0 dB",
  quantized: false,
  enabled: true,
  automation_state: 0,
};

let fake: FakeRemoteScript | undefined;

beforeEach(() => {
  registerRemoteScriptEnvelopeRoutes();
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

describe("remoteScript.envelope.list", () => {
  it("forwards the clip and hands back what the remote script listed", async () => {
    const result = {
      envelopes: [
        { parameter_name: "volume", parameter: PARAMETER, event_count: 4 },
      ],
    };
    const remote = await answerWith({ body: result });

    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.list, { track: "t0", slot: 2 }),
    ).toStrictEqual({ success: true, result: { available: true, result } });
    expect(remote.requests).toStrictEqual([
      {
        method: "POST",
        route: "/envelope/list",
        query: {},
        body: { track: "t0", slot: 2 },
      },
    ]);
  });
});

describe("remoteScript.envelope.read", () => {
  it("forwards the range and the snake_case arrangement index", async () => {
    const remote = await answerWith({
      body: { exists: true, parameter: PARAMETER, events: [] },
    });

    await dispatchNodeRoute(ENVELOPE_ROUTES.read, {
      track: "rt1",
      arrangementIndex: 3,
      device: "d0/c1/d0",
      parameter: 7,
      from: 0,
      to: 4,
      limit: 100,
    });

    expect(remote.requests).toStrictEqual([
      {
        method: "POST",
        route: "/envelope/read",
        query: {},
        body: {
          track: "rt1",
          arrangement_index: 3,
          device: "d0/c1/d0",
          parameter: 7,
          from: 0,
          to: 4,
          limit: 100,
        },
      },
    ]);
  });

  it("hands back why a read failed", async () => {
    await answerWith({ status: 404, body: { error: "slot 2 is empty" } });

    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.read, { track: "t0", slot: 2 }),
    ).toStrictEqual({
      success: true,
      result: { available: true, error: "slot 2 is empty" },
    });
  });
});

describe("remoteScript.envelope.write", () => {
  it("forwards the points and shape", async () => {
    const points = [
      { time: 0, value: 0 },
      { time: 4, value: 1 },
    ];
    const remote = await answerWith({
      body: { parameter: PARAMETER, shape: "linear", samples: points },
    });

    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.write, {
        track: "mt",
        slot: 0,
        points,
        shape: "linear",
      }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        result: { parameter: PARAMETER, shape: "linear", samples: points },
      },
    });
    expect(remote.requests).toStrictEqual([
      {
        method: "POST",
        route: "/envelope/write",
        query: {},
        body: { track: "mt", slot: 0, points, shape: "linear" },
      },
    ]);
  });

  it("says so when the remote script isn't running", async () => {
    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.write, {
        track: "t0",
        slot: 0,
        points: [{ time: 0, value: 0 }],
        shape: "steps",
      }),
    ).toStrictEqual({ success: true, result: { available: false } });
  });
});

describe("remoteScript.envelope.clear", () => {
  it("leaves out the params it wasn't given, so the clip clears whole", async () => {
    const remote = await answerWith({ body: { cleared: true, all: true } });

    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.clear, { track: "t0", slot: 1 }),
    ).toStrictEqual({
      success: true,
      result: { available: true, result: { cleared: true, all: true } },
    });
    expect(remote.requests[0]?.body).toStrictEqual({ track: "t0", slot: 1 });
  });

  it("needs a track", async () => {
    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.clear, { slot: 1 }),
    ).toStrictEqual({ success: false, error: "track must be a string" });
  });
});
