// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetRemoteScriptPort,
  remoteScriptPing,
  remoteScriptRequest,
  resolveRemoteScriptPort,
} from "../remote-script-client.ts";
import { RemoteScriptTimeout } from "../remote-script-errors.ts";
import { setRemoteScriptMinVersion } from "../port/remote-script-version.ts";
import {
  type FakeRemoteScript,
  startFakeRemoteScript,
  unknownRouteAnswer,
} from "./remote-script-test-helpers.ts";

// The "default" port is a stand-in's, so a real Live on 3349 can't interfere.
const ports = vi.hoisted(() => ({
  preferred: 1,
  file: null as number | null,
}));

vi.mock(import("../port/remote-script-port-file.ts"), () => ({
  get REMOTE_SCRIPT_DEFAULT_PORT() {
    return ports.preferred;
  },
  remoteScriptPortFromFile: () => ports.file,
}));

const OUTDATED_2_4 =
  'the Producer Pal remote script is out of date (running 2.4.0, needs 2.5.0-rc1 or later); update it with ppal-manage action "install-remote-script" or in the Producer Pal chat UI\'s Settings → Remote Script, then restart Live';

let fake: FakeRemoteScript | undefined;
let version = "2.4.0";
let savedEnv: string | undefined;

/**
 * Start a stand-in that reports `version` and answers everything else with
 * `other`, found the way a real run finds it: through 3349, or the port file.
 * @param other - What it answers for any route but /ping
 * @param viaFile - Whether to put it on the port file's port, not 3349
 * @returns The stand-in
 */
async function standIn(
  other: Parameters<typeof startFakeRemoteScript>[0] = () => ({
    body: { ok: true },
  }),
  viaFile = false,
): Promise<FakeRemoteScript> {
  fake = await startFakeRemoteScript((request) =>
    request.route === "/ping"
      ? { body: { ok: true, live_version: "12.4.5", script_version: version } }
      : other(request),
  );
  delete process.env.PPAL_REMOTE_SCRIPT_PORT;

  if (viaFile) {
    ports.file = fake.port;
  } else {
    ports.preferred = fake.port;
  }

  return fake;
}

/**
 * @param route - The route to ask
 * @returns Whether the remote script took the request
 */
async function available(route: string): Promise<boolean> {
  const reply = await remoteScriptRequest({ route });

  return reply.available;
}

/**
 * @param remote - A stand-in
 * @returns The routes it was asked for, in order
 */
function routesAsked(remote: FakeRemoteScript): string[] {
  return remote.requests.map((request) => request.route);
}

beforeEach(() => {
  savedEnv = process.env.PPAL_REMOTE_SCRIPT_PORT;
  ports.preferred = 1;
  ports.file = null;
  version = "2.4.0";
  forgetRemoteScriptPort();
});

afterEach(async () => {
  await fake?.close();
  fake = undefined;
  setRemoteScriptMinVersion(null);
  forgetRemoteScriptPort();

  if (savedEnv == null) {
    delete process.env.PPAL_REMOTE_SCRIPT_PORT;
  } else {
    process.env.PPAL_REMOTE_SCRIPT_PORT = savedEnv;
  }
});

describe("remoteScriptRequest against a remote script that is too old", () => {
  it("says it is out of date and sends nothing", async () => {
    const remote = await standIn();

    expect(
      await remoteScriptRequest({ method: "POST", route: "/list", body: {} }),
    ).toStrictEqual({ available: false, outdated: OUTDATED_2_4 });
    expect(routesAsked(remote)).toStrictEqual(["/ping"]);
  });

  it("asks again on each call while the version reads too old", async () => {
    const remote = await standIn();

    await remoteScriptRequest({ route: "/list" });
    await remoteScriptRequest({ route: "/list" });

    expect(routesAsked(remote)).toStrictEqual(["/ping", "/ping"]);
  });

  it("pings a port from the port file once, however many calls are waiting", async () => {
    const remote = await standIn(undefined, true);
    const replies = await Promise.all([
      remoteScriptRequest({ route: "/list" }),
      remoteScriptRequest({ route: "/list" }),
    ]);

    expect(replies.map((reply) => reply.available)).toStrictEqual([
      false,
      false,
    ]);
    expect(
      routesAsked(remote).filter((route) => route === "/ping"),
    ).toHaveLength(1);
    expect(routesAsked(remote)).not.toContain("/list");
  });

  it("asks again while the version reads too old, so a newer script is let through", async () => {
    const remote = await standIn();

    expect(await available("/list")).toBe(false);

    version = "2.5.0";
    expect(await available("/list")).toBe(true);
    expect(routesAsked(remote)).toStrictEqual(["/ping", "/ping", "/list"]);

    // Now current, so it is kept: no ping per call.
    expect(await available("/list")).toBe(true);
    expect(routesAsked(remote)).toStrictEqual([
      "/ping",
      "/ping",
      "/list",
      "/list",
    ]);
  });

  it("learns each port's version on its own, not from another port's ping", async () => {
    // Port A takes the ping and never answers it.
    const slow = await startFakeRemoteScript(() => null);

    delete process.env.PPAL_REMOTE_SCRIPT_PORT;
    ports.file = slow.port;

    const first = remoteScriptRequest({ route: "/list", timeoutMs: 100 }).catch(
      (error: unknown) => error,
    );

    await vi.waitFor(() => expect(routesAsked(slow)).toStrictEqual(["/ping"]));

    // The script moves to port B, which is too old.
    forgetRemoteScriptPort();

    const moved = await standIn(undefined, true);
    const started = Date.now();

    expect(await remoteScriptRequest({ route: "/list" })).toStrictEqual({
      available: false,
      outdated: OUTDATED_2_4,
    });
    expect(Date.now() - started).toBeLessThan(800);
    expect(routesAsked(moved)).toStrictEqual(["/ping"]);

    await first;
    await slow.close();
    process.env.PPAL_REMOTE_SCRIPT_PORT = "0";
  });

  it("waits for the version no longer than the caller has time", async () => {
    fake = await startFakeRemoteScript(() => null);
    delete process.env.PPAL_REMOTE_SCRIPT_PORT;
    ports.file = fake.port;

    const started = Date.now();
    const error: unknown = await remoteScriptRequest({
      route: "/list",
      expiresInMs: 300,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RemoteScriptTimeout);
    expect(error).toHaveProperty("sent", false);
    expect(Date.now() - started).toBeLessThan(800);
  });

  it("makes no ping for the version once the caller's time is used up", async () => {
    let clock = 0;

    vi.spyOn(Date, "now").mockImplementation(() => clock);

    const remote = await standIn((request) => {
      clock += request.route === "/ping" ? 400 : 0;

      return { body: { ok: true } };
    });

    // The probe of the preferred port takes the time; the version it
    // reports is old, and there is none left to ask for it again.
    expect(
      await remoteScriptRequest({ route: "/list", expiresInMs: 300 }),
    ).toStrictEqual({ available: false, outdated: OUTDATED_2_4 });
    expect(routesAsked(remote)).toStrictEqual(["/ping"]);
    vi.restoreAllMocks();
  });

  it("doesn't ask again for the version when the caller has no time left", async () => {
    const remote = await standIn(undefined, true);

    expect(await available("/list")).toBe(false);

    let clock = 0;

    vi.spyOn(Date, "now").mockImplementation(() => (clock += 400));

    expect(
      await remoteScriptRequest({ route: "/list", expiresInMs: 300 }),
    ).toStrictEqual({ available: false, outdated: OUTDATED_2_4 });
    expect(routesAsked(remote)).toStrictEqual(["/ping"]);
    vi.restoreAllMocks();
  });

  it("gives the port requests go to", async () => {
    const remote = await standIn();

    expect(await resolveRemoteScriptPort()).toBe(remote.port);
  });

  it("is still pingable: the ping reports the old version", async () => {
    await standIn();

    expect(await remoteScriptPing()).toStrictEqual({
      running: true,
      liveVersion: "12.4.5",
      scriptVersion: "2.4.0",
      userLibrary: null,
      otherOnPort: null,
    });
  });
});

describe("remoteScriptRequest against a current remote script", () => {
  it("keeps the version with the port, so there is no ping per call", async () => {
    version = "2.5.0";

    const remote = await standIn();

    await remoteScriptRequest({ route: "/list" });
    await remoteScriptRequest({ route: "/list" });

    expect(routesAsked(remote)).toStrictEqual(["/ping", "/list", "/list"]);
  });

  it("looks at the version again once the port is forgotten", async () => {
    version = "2.5.0";
    await standIn();
    expect(await available("/list")).toBe(true);

    // Replaced by an older script: unseen until the port is looked up again.
    version = "2.4.0";
    expect(await available("/list")).toBe(true);

    forgetRemoteScriptPort();
    expect(await available("/list")).toBe(false);
  });

  it("sends the request", async () => {
    version = "2.5.0-rc1";

    const remote = await standIn();
    const reply = await remoteScriptRequest({ route: "/list" });

    expect(reply).toStrictEqual({
      available: true,
      status: 200,
      body: { ok: true },
    });
    expect(routesAsked(remote)).toStrictEqual(["/ping", "/list"]);
  });

  it("words a 404 for an unknown route as out of date", async () => {
    version = "2.5.0";
    await standIn(() => unknownRouteAnswer("/envelope/read"));

    expect(
      await remoteScriptRequest({ route: "/envelope/read" }),
    ).toStrictEqual({
      available: false,
      outdated:
        'the Producer Pal remote script is out of date (running 2.5.0, needs 2.5.0-rc1 or later); update it with ppal-manage action "install-remote-script" or in the Producer Pal chat UI\'s Settings → Remote Script, then restart Live',
    });
  });

  it("keeps the port after an unknown route", async () => {
    version = "2.5.0";

    const remote = await standIn((request) =>
      request.route === "/missing" ? unknownRouteAnswer("/missing") : null,
    );

    await remoteScriptRequest({ route: "/missing" });
    await remoteScriptRequest({ route: "/missing" });

    expect(routesAsked(remote)).toStrictEqual([
      "/ping",
      "/missing",
      "/missing",
    ]);
  });

  it("leaves a 404 that means not found as an answer", async () => {
    version = "2.5.0";
    await standIn(() => ({ status: 404, body: { error: "no track t9" } }));

    expect(await remoteScriptRequest({ route: "/clip/convert" })).toStrictEqual(
      { available: true, status: 404, body: { error: "no track t9" } },
    );
  });

  it("leaves a 404 that only starts like an unknown route", async () => {
    version = "2.5.0";
    await standIn(() => ({
      status: 404,
      body: { error: "unknown route: /x" },
    }));

    expect(await available("/x")).toBe(true);
  });
});

describe("the dev override of the minimum version", () => {
  it("makes a current script look out of date, and back", async () => {
    version = "2.5.0";
    await standIn();
    setRemoteScriptMinVersion("9.0.0");

    expect(await remoteScriptRequest({ route: "/list" })).toStrictEqual({
      available: false,
      outdated: expect.stringContaining("running 2.5.0, needs 9.0.0 or later"),
    });

    setRemoteScriptMinVersion(null);
    expect(await available("/list")).toBe(true);
  });
});

describe("remoteScriptRequest when the version can't be known", () => {
  it("sends the request when what answers the ping isn't the script", async () => {
    fake = await startFakeRemoteScript(() => ({ body: { ok: true } }));
    delete process.env.PPAL_REMOTE_SCRIPT_PORT;
    ports.preferred = fake.port;

    expect(await available("/list")).toBe(true);
  });
});
