// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { dispatchNodeRoute } from "../../../tests/config-dir-test-helpers.ts";
import { registerRemoteScriptRoutes } from "../remote-script-routes.ts";
import { useFakeRemoteScriptRoutes } from "./remote-script-test-helpers.ts";

const LOAD_ARGS = {
  type: "plugin",
  path: "VST3/FabFilter/Pro-Q 4",
  trackIndex: 3,
  trackName: "Producer Pal temp abc",
  expiresInMs: 5000,
};

const HOTSWAP_ARGS = {
  type: "instrument",
  path: "Drift/Bass/AG Bass.adv",
  devicePath: "live_set tracks 3 devices 0",
  deviceName: "Drift",
  expiresInMs: 5000,
};

const answerWith = useFakeRemoteScriptRoutes(registerRemoteScriptRoutes);

/** An answer from the remote script that Live skipped, or gave up on mid-run. */
const SKIPPED = {
  status: 504,
  body: { error: "the request expired before Live ran it; nothing changed" },
};
const ABANDONED = {
  status: 504,
  body: {
    error: "Live started the request but didn't finish it",
    started: true,
  },
};

describe("remoteScript.resolve", () => {
  it("looks the name up in Live's browser", async () => {
    await answerWith({ body: { items: [{ name: "Reverb", path: "Reverb" }] } });

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.resolve, {
        name: "Reverb",
        expiresInMs: 5000,
      }),
    ).toHaveProperty("result.available", true);
  });

  it("needs a name", async () => {
    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.resolve, {
        expiresInMs: 5000,
      }),
    ).toStrictEqual({ success: false, error: "name must be a string" });
  });

  it("gives every search what is left of the expiry", async () => {
    const remote = await answerWith({ body: { items: [] } });

    await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.resolve, {
      name: "Reverb",
      expiresInMs: 8000,
    });

    expect(remote.requests).toHaveLength(5);

    for (const { query } of remote.requests) {
      expect(Number(query.expires_in_ms)).toBeGreaterThan(7000);
      expect(Number(query.expires_in_ms)).toBeLessThanOrEqual(8000);
    }
  });

  it.each([
    ["Live skips a search", SKIPPED],
    ["Live gives up on one", ABANDONED],
  ])("answers out of time when %s", async (_name, answer) => {
    await answerWith(answer);

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.resolve, {
        name: "Reverb",
        expiresInMs: 5000,
      }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: answer.body.error,
        outOfTime: true,
      },
    });
  });

  it("answers out of time when the remote script doesn't answer in time", async () => {
    await answerWith(null);

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.resolve, {
        name: "Reverb",
        expiresInMs: 100,
      }),
    ).toHaveProperty("result.outOfTime", true);
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
          expires_in_ms: 5000,
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

  it("doesn't mark a load Live skipped as unfinished", async () => {
    await answerWith(SKIPPED);

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.load, LOAD_ARGS),
    ).toStrictEqual({
      success: true,
      result: { available: true, error: SKIPPED.body.error },
    });
  });

  it("marks a load Live started but didn't finish as unfinished", async () => {
    await answerWith(ABANDONED);

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.load, LOAD_ARGS),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: ABANDONED.body.error,
        unfinished: true,
      },
    });
  });

  it("marks a load the remote script never answered as unfinished", async () => {
    await answerWith(null);

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.load, {
        ...LOAD_ARGS,
        expiresInMs: 100,
      }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: expect.stringContaining("did not answer within"),
        unfinished: true,
      },
    });
  });

  it("fails the route when the connection drops mid-load", async () => {
    await answerWith({ drop: true });

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.load, LOAD_ARGS),
    ).toStrictEqual({
      success: false,
      error: expect.stringMatching(/socket hang up|ECONNRESET/),
    });
  });

  it("sends nothing once the expiry is 0", async () => {
    const remote = await answerWith({ body: { loaded: {} } });

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.load, {
        ...LOAD_ARGS,
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

describe("remoteScript.resolvePreset", () => {
  it("searches under the device the call named", async () => {
    const remote = await answerWith({
      body: {
        items: [{ name: "Warm Pad.adv", path: "Wavetable/Warm Pad.adv" }],
      },
    });

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.resolvePreset, {
        name: "Warm Pad",
        expiresInMs: 5000,
        scope: { type: "instrument", path: "Wavetable", device: "Wavetable" },
      }),
    ).toHaveProperty("result.item.path", "Wavetable/Warm Pad.adv");
    expect(remote.requests[0]?.query).toStrictEqual({
      type: "instrument",
      presets: "true",
      q: "warm pad",
      path: "Wavetable",
      expires_in_ms: expect.stringMatching(/^[1-5]\d{3}$/),
    });
  });

  it("searches everywhere with no device", async () => {
    const remote = await answerWith({ body: { items: [] } });

    await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.resolvePreset, {
      name: "Warm Pad",
      expiresInMs: 5000,
    });

    expect(remote.requests.every((request) => request.query.path == null)).toBe(
      true,
    );
  });

  it("needs a scope's device", async () => {
    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.resolvePreset, {
        name: "Warm Pad",
        expiresInMs: 5000,
        scope: { type: "instrument", path: "Wavetable" },
      }),
    ).toStrictEqual({ success: false, error: "device must be a string" });
  });
});

describe("remoteScript.hotswap", () => {
  it("loads the item in place of the device, and says whether Live replaced it", async () => {
    const remote = await answerWith({
      body: { device: { name: "AG Bass", replaced: false } },
    });

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.hotswap, HOTSWAP_ARGS),
    ).toStrictEqual({
      success: true,
      result: { available: true, replaced: false },
    });
    expect(remote.requests[0]).toStrictEqual({
      method: "POST",
      route: "/hotswap",
      query: {},
      body: {
        type: "instrument",
        path: "Drift/Bass/AG Bass.adv",
        device_path: "live_set tracks 3 devices 0",
        device_name: "Drift",
        expires_in_ms: 5000,
      },
    });
  });

  it("reads a replaced device", async () => {
    await answerWith({ body: { device: { replaced: true } } });

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.hotswap, HOTSWAP_ARGS),
    ).toHaveProperty("result.replaced", true);
  });

  it("hands back why a load failed", async () => {
    await answerWith({ status: 409, body: { error: "kinds differ" } });

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.hotswap, HOTSWAP_ARGS),
    ).toStrictEqual({
      success: true,
      result: { available: true, error: "kinds differ" },
    });
  });

  it("says so when the remote script isn't running", async () => {
    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.hotswap, HOTSWAP_ARGS),
    ).toStrictEqual({ success: true, result: { available: false } });
  });

  it("marks a hotswap Live started but didn't finish as unfinished", async () => {
    await answerWith(ABANDONED);

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.hotswap, HOTSWAP_ARGS),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: ABANDONED.body.error,
        unfinished: true,
      },
    });
  });

  it("doesn't mark a hotswap Live skipped as unfinished", async () => {
    await answerWith(SKIPPED);

    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.hotswap, HOTSWAP_ARGS),
    ).toStrictEqual({
      success: true,
      result: { available: true, error: SKIPPED.body.error },
    });
  });

  it("needs the device's name", async () => {
    expect(
      await dispatchNodeRoute(REMOTE_SCRIPT_ROUTES.hotswap, {
        ...HOTSWAP_ARGS,
        deviceName: undefined,
      }),
    ).toStrictEqual({ success: false, error: "deviceName must be a string" });
  });
});

describe.each([
  ["resolve", REMOTE_SCRIPT_ROUTES.resolve, { name: "Reverb" }],
  ["resolvePreset", REMOTE_SCRIPT_ROUTES.resolvePreset, { name: "Warm Pad" }],
  ["load", REMOTE_SCRIPT_ROUTES.load, LOAD_ARGS],
  ["hotswap", REMOTE_SCRIPT_ROUTES.hotswap, HOTSWAP_ARGS],
])("remoteScript.%s's expiry", (_name, route, args) => {
  it.each([undefined, "5000", -1, Number.NaN])(
    "refuses %s",
    async (expiresInMs) => {
      const remote = await answerWith({ body: {} });

      expect(
        await dispatchNodeRoute(route, { ...args, expiresInMs }),
      ).toStrictEqual({
        success: false,
        error: "expiresInMs must be a number, 0 or more",
      });
      expect(remote.requests).toStrictEqual([]);
    },
  );
});
