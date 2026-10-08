// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import { dispatchNodeRoute } from "../../../../tests/config-dir-test-helpers.ts";
import { registerRemoteScriptEnvelopeRoutes } from "../../forwarded/remote-script-envelope-routes.ts";
import { CONNECTION_LOST } from "../../remote-script-errors.ts";
import {
  OUTDATED_ANSWER,
  callUntilItTimesOut,
  unknownRouteAnswer,
  useFakeRemoteScriptRoutes,
} from "../remote-script-test-helpers.ts";

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

const EXPIRES_IN_MS = 5000;

const answerWith = useFakeRemoteScriptRoutes(
  registerRemoteScriptEnvelopeRoutes,
);

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

describe("remoteScript.envelope failures", () => {
  it("says an older remote script is out of date, not that the clip is missing", async () => {
    await answerWith(unknownRouteAnswer("/envelope/read"));

    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.read, { track: "t0", slot: 2 }),
    ).toStrictEqual({ success: true, result: OUTDATED_ANSWER });
  });

  it("says a dropped connection is not a timeout, and that a write may have landed", async () => {
    await answerWith({ drop: true });

    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.write, {
        track: "t0",
        slot: 0,
        points: [{ time: 0, value: 0 }],
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: CONNECTION_LOST,
        unfinished: true,
      },
    });
  });

  it("says a dropped connection is not a timeout for a read, and stops like no answer", async () => {
    await answerWith({ drop: true });

    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.list, { track: "t0", slot: 0 }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: CONNECTION_LOST,
        unfinished: true,
      },
    });
  });

  it("calls a write the remote script never answered a timeout", async () => {
    const remote = await answerWith(null);

    expect(
      await callUntilItTimesOut(remote, 60, () =>
        dispatchNodeRoute(ENVELOPE_ROUTES.write, {
          track: "t0",
          slot: 0,
          points: [{ time: 0, value: 0 }],
          expiresInMs: 40,
        }),
      ),
    ).toStrictEqual({
      success: false,
      error: "the Producer Pal remote script did not answer in time",
    });
  });

  it("names the remote script when a failed reply gives no error", async () => {
    await answerWith({ status: 500, body: {} });

    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.list, { track: "t0", slot: 0 }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: "the Producer Pal remote script answered with status 500",
      },
    });
  });
});

describe("remoteScript.envelope.write", () => {
  it("forwards the points", async () => {
    const points = [
      { time: 0, value: 0 },
      { time: 4, value: 1, jump: true },
    ];
    const remote = await answerWith({
      body: { parameter: PARAMETER, samples: points },
    });

    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.write, {
        track: "mt",
        slot: 0,
        points,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        result: { parameter: PARAMETER, samples: points },
      },
    });
    expect(remote.requests).toStrictEqual([
      {
        method: "POST",
        route: "/envelope/write",
        query: {},
        body: { track: "mt", slot: 0, points, expires_in_ms: EXPIRES_IN_MS },
      },
    ]);
  });

  it("says so when the remote script isn't running", async () => {
    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.write, {
        track: "t0",
        slot: 0,
        points: [{ time: 0, value: 0 }],
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({ success: true, result: { available: false } });
  });
});

describe("remoteScript.envelope.clear", () => {
  it("leaves out the params it wasn't given, so the clip clears whole", async () => {
    const remote = await answerWith({ body: { cleared: true, all: true } });

    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.clear, {
        track: "t0",
        slot: 1,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({
      success: true,
      result: { available: true, result: { cleared: true, all: true } },
    });
    expect(remote.requests[0]?.body).toStrictEqual({
      track: "t0",
      slot: 1,
      expires_in_ms: EXPIRES_IN_MS,
    });
  });

  it("needs a track", async () => {
    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.clear, {
        slot: 1,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({ success: false, error: "track must be a string" });
  });

  it("needs args at all", async () => {
    expect(await dispatchNodeRoute(ENVELOPE_ROUTES.clear, null)).toStrictEqual({
      success: false,
      error: "track must be a string",
    });
  });
});

describe("remoteScript.envelope changes carry an expiry", () => {
  const WRITE = {
    track: "t0",
    slot: 0,
    points: [{ time: 0, value: 0 }],
  };

  it.each([
    ["write", WRITE],
    ["clear", { track: "t0", slot: 0 }],
  ] as const)(
    "%s refuses a call with no expiry, sending nothing",
    async (name, args) => {
      const remote = await answerWith({ body: {} });

      expect(
        await dispatchNodeRoute(ENVELOPE_ROUTES[name], args),
      ).toStrictEqual({
        success: false,
        error: "expiresInMs must be a number, 0 or more",
      });
      expect(remote.requests).toStrictEqual([]);
    },
  );

  it.each(["write", "clear"] as const)(
    "%s sends nothing once the expiry is used up, and says nothing changed",
    async (name) => {
      const remote = await answerWith({ body: {} });

      expect(
        await dispatchNodeRoute(ENVELOPE_ROUTES[name], {
          ...WRITE,
          expiresInMs: 0,
        }),
      ).toStrictEqual({
        success: true,
        result: {
          available: true,
          error: "ran out of time before the request left",
        },
      });
      expect(remote.requests).toStrictEqual([]);
    },
  );

  it("hands back a job the remote script skipped as a plain error", async () => {
    await answerWith({
      status: 504,
      body: {
        error: "the request expired before Live ran it; nothing changed",
      },
    });

    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.write, {
        ...WRITE,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: "the request expired before Live ran it; nothing changed",
      },
    });
  });

  it("marks a job Live started but didn't finish as unfinished", async () => {
    await answerWith({
      status: 504,
      body: {
        error: "Live started the request but didn't finish it",
        started: true,
      },
    });

    expect(
      await dispatchNodeRoute(ENVELOPE_ROUTES.clear, {
        track: "t0",
        slot: 0,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: "Live started the request but didn't finish it",
        unfinished: true,
      },
    });
  });

  it("doesn't send an expiry with a read", async () => {
    const remote = await answerWith({ body: { envelopes: [] } });

    await dispatchNodeRoute(ENVELOPE_ROUTES.list, { track: "t0", slot: 0 });

    expect(remote.requests[0]?.body).toStrictEqual({ track: "t0", slot: 0 });
  });
});
