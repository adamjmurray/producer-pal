// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetRemoteScriptPort,
  remoteScriptPing,
  remoteScriptRequest,
} from "../remote-script-client.ts";
import { MIN_REMOTE_SCRIPT_VERSION } from "../port/remote-script-version.ts";
import { RemoteScriptTimeout } from "../remote-script-errors.ts";
import {
  type FakeAnswer,
  type FakeRemoteScript,
  type ReceivedRequest,
  callUntilItTimesOut,
  expectUnsentTimeout,
  startFakeRemoteScript,
} from "./remote-script-test-helpers.ts";

/** How long the client waits for a ping. */
const PING_WAIT_MS = 1000;

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

const OURS: FakeAnswer = {
  body: {
    ok: true,
    live_version: "12.4.5",
    script_version: MIN_REMOTE_SCRIPT_VERSION,
  },
};
const NOT_OURS: FakeAnswer = { body: { ok: true } };
const NOT_JSON: FakeAnswer = { raw: "<html>dev server</html>" };

let fakes: FakeRemoteScript[] = [];
let savedEnv: string | undefined;

/**
 * Start a stand-in that answers every request, and leave the env alone so the
 * port is found the way a real run finds it.
 * @param answer - The answer, or a function giving each request's
 * @returns The stand-in
 */
async function standIn(
  answer: FakeAnswer | ((request: ReceivedRequest) => FakeAnswer),
): Promise<FakeRemoteScript> {
  const fake = await startFakeRemoteScript(
    typeof answer === "function" ? answer : () => answer,
  );

  delete process.env.PPAL_REMOTE_SCRIPT_PORT;
  fakes.push(fake);

  return fake;
}

/**
 * Put `answer` on the preferred port and a real script on the file's port.
 * @param answer - What the preferred port says
 * @returns The two stand-ins
 */
async function preferredAndFilePorts(
  answer: FakeAnswer,
): Promise<{ preferred: FakeRemoteScript; other: FakeRemoteScript }> {
  const preferred = await standIn(answer);
  const other = await standIn(OURS);

  ports.preferred = preferred.port;
  ports.file = other.port;

  return { preferred, other };
}

beforeEach(() => {
  savedEnv = process.env.PPAL_REMOTE_SCRIPT_PORT;
  ports.preferred = 1;
  ports.file = null;
  forgetRemoteScriptPort();
});

afterEach(async () => {
  for (const fake of fakes) {
    await fake.close();
  }

  fakes = [];
  vi.restoreAllMocks();
  forgetRemoteScriptPort();

  if (savedEnv == null) {
    delete process.env.PPAL_REMOTE_SCRIPT_PORT;
  } else {
    process.env.PPAL_REMOTE_SCRIPT_PORT = savedEnv;
  }
});

describe("remoteScriptRequest without PPAL_REMOTE_SCRIPT_PORT", () => {
  it("goes to 3349 when the script answers there, not to the file's port", async () => {
    const { preferred, other } = await preferredAndFilePorts(OURS);

    await remoteScriptRequest({ route: "/list" });

    expect(preferred.requests.map((r) => r.route)).toContain("/list");
    expect(other.requests).toStrictEqual([]);
  });

  it("goes to the file's port when 3349 answers without script_version", async () => {
    const { preferred, other } = await preferredAndFilePorts(NOT_OURS);

    await remoteScriptRequest({ route: "/list" });

    expect(other.requests.map((r) => r.route)).toContain("/list");
    expect(preferred.requests.map((r) => r.route)).not.toContain("/list");
  });

  it("goes to the file's port when nothing is on 3349", async () => {
    const other = await standIn(OURS);

    ports.file = other.port;
    await remoteScriptRequest({ route: "/list" });

    expect(other.requests.map((r) => r.route)).toContain("/list");
  });

  it("finds a script that moved after a call that got no answer", async () => {
    const moved = await standIn(OURS);

    ports.file = 1;
    expect(await remoteScriptRequest({ route: "/list" })).toStrictEqual({
      available: false,
    });

    ports.file = moved.port;
    const reply = await remoteScriptRequest({ route: "/list" });

    expect(reply.available).toBe(true);
  });

  it("sends a left-over file's port nothing but a ping when another program holds it", async () => {
    const stranger = await standIn(NOT_OURS);

    ports.file = stranger.port;

    expect(await remoteScriptRequest({ route: "/list" })).toStrictEqual({
      available: false,
    });
    expect(stranger.requests.map((r) => r.route)).toStrictEqual(["/ping"]);
  });

  it("finds a script that starts on 3349 after a left-over file's port wasn't it", async () => {
    const stranger = await standIn(NOT_OURS);

    ports.file = stranger.port;
    await remoteScriptRequest({ route: "/list" });

    const started = await standIn(OURS);

    ports.preferred = started.port;
    const reply = await remoteScriptRequest({ route: "/list" });

    expect(reply.available).toBe(true);
    expect(started.requests.map((r) => r.route)).toContain("/list");
  });

  it("sends 3349 nothing but a ping when another program holds it and there is no file", async () => {
    const stranger = await standIn(NOT_OURS);

    ports.preferred = stranger.port;

    expect(await remoteScriptRequest({ route: "/list" })).toStrictEqual({
      available: false,
      otherAnswered: true,
    });
    expect(stranger.requests.map((r) => r.route)).toStrictEqual(["/ping"]);
  });

  it("goes to 3349 when its ping is slow, not to the file's port", async () => {
    const { preferred, other } = await preferredAndFilePorts(null);

    await expect(
      callUntilItTimesOut(preferred, [PING_WAIT_MS, 100], () =>
        remoteScriptRequest({ route: "/list", timeoutMs: 100 }),
      ),
    ).rejects.toBeInstanceOf(RemoteScriptTimeout);
    expect(other.requests).toStrictEqual([]);
  });

  it("treats a non-JSON reply on 3349 as another program: uses the file's port", async () => {
    const { other } = await preferredAndFilePorts({
      raw: "<html>dev server</html>",
    });

    await remoteScriptRequest({ route: "/list" });

    expect(other.requests.map((r) => r.route)).toContain("/list");
  });

  it("names the port when a non-JSON program holds it and nothing else answers", async () => {
    const preferred = await standIn({ raw: "<html>dev server</html>" });

    ports.preferred = preferred.port;

    expect(await remoteScriptPing()).toStrictEqual({
      running: false,
      liveVersion: null,
      scriptVersion: null,
      scriptBuild: null,
      scriptCommit: null,
      userLibrary: null,
      otherOnPort: preferred.port,
    });
  });

  it("pings once when it finds the port and reports the ping", async () => {
    const preferred = await standIn(OURS);

    ports.preferred = preferred.port;
    const ping = await remoteScriptPing();

    expect(ping.running).toBe(true);
    expect(ping.scriptVersion).toBe(MIN_REMOTE_SCRIPT_VERSION);
    expect(preferred.requests.map((r) => r.route)).toStrictEqual(["/ping"]);
  });

  it("pings once when the ping is slow and nothing is known yet", async () => {
    const preferred = await standIn(null);

    ports.preferred = preferred.port;
    const ping = await callUntilItTimesOut(preferred, PING_WAIT_MS, () =>
      remoteScriptPing(),
    );

    expect(ping.running).toBe(false);
    expect(preferred.requests.map((r) => r.route)).toStrictEqual(["/ping"]);
  });

  describe("once found", () => {
    /**
     * A script that answers its first ping, then pings never come back.
     * @returns The stand-in
     */
    async function busyAfterFirstPing(): Promise<FakeRemoteScript> {
      let pings = 0;
      const fake = await standIn((request) => {
        if (request.route !== "/ping") {
          return { body: { ok: true } };
        }

        pings += 1;

        return pings === 1 ? OURS : null;
      });

      ports.preferred = fake.port;

      return fake;
    }

    it("keeps the port with no more pings, however long it has been", async () => {
      const fake = await busyAfterFirstPing();
      const other = await standIn(OURS);

      await remoteScriptRequest({ route: "/list" });
      ports.file = other.port;
      await remoteScriptRequest({ route: "/list" });
      await remoteScriptRequest({ route: "/list" });

      expect(fake.requests.map((r) => r.route)).toStrictEqual([
        "/ping",
        "/list",
        "/list",
        "/list",
      ]);
      expect(other.requests).toStrictEqual([]);
    });

    it("still reads as running when a later ping is too slow", async () => {
      const fake = await busyAfterFirstPing();

      const first = await remoteScriptPing();
      const second = await callUntilItTimesOut(fake, PING_WAIT_MS, () =>
        remoteScriptPing(),
      );

      expect(first.running).toBe(true);
      expect(second).toStrictEqual(first);
    });

    it("doesn't move to the file's port when a later ping is too slow", async () => {
      const fake = await busyAfterFirstPing();
      const other = await standIn(OURS);

      await remoteScriptPing();
      ports.file = other.port;
      await callUntilItTimesOut(fake, PING_WAIT_MS, () => remoteScriptPing());
      await remoteScriptRequest({ route: "/list" });

      expect(other.requests).toStrictEqual([]);
      expect(fake.requests.at(-1)?.route).toBe("/list");
    });

    /**
     * A script on 3349 that another program replaces once `taken.over` is set,
     * with the script back on the file's port.
     * @returns The switch, and the stand-in on the file's port
     */
    async function takenOverLater(stranger: FakeAnswer = NOT_JSON): Promise<{
      taken: { over: boolean };
      first: FakeRemoteScript;
      moved: FakeRemoteScript;
    }> {
      const taken = { over: false };
      const first = await standIn(() => (taken.over ? stranger : OURS));
      const moved = await standIn(OURS);

      ports.preferred = first.port;
      ports.file = moved.port;

      return { taken, first, moved };
    }

    it("looks again after another program answers a request on the port", async () => {
      const { taken, moved } = await takenOverLater();

      await remoteScriptRequest({ route: "/list" });
      taken.over = true;

      expect(await remoteScriptRequest({ route: "/list" })).toStrictEqual({
        available: false,
        otherAnswered: true,
      });

      const reply = await remoteScriptRequest({ route: "/list" });

      expect(reply.available).toBe(true);
      expect(moved.requests.map((r) => r.route)).toContain("/list");
    });

    // A JSON error could be the script's own, so the port is pinged to tell.
    it("looks again after another program answers a request with a JSON error", async () => {
      const { taken, first, moved } = await takenOverLater({
        status: 404,
        body: { detail: "Not Found" },
      });

      await remoteScriptRequest({ route: "/list" });
      taken.over = true;
      first.requests.length = 0;

      expect(await remoteScriptRequest({ route: "/list" })).toStrictEqual({
        available: false,
        otherAnswered: true,
      });
      expect(first.requests.map((r) => r.route)).toStrictEqual([
        "/list",
        "/ping",
      ]);

      await remoteScriptRequest({ route: "/list" });

      expect(first.requests.filter((r) => r.route === "/list")).toHaveLength(1);
      expect(moved.requests.map((r) => r.route)).toContain("/list");
    });

    it("keeps the port when the script itself answers with an error", async () => {
      const fake = await standIn((request) =>
        request.route === "/ping"
          ? OURS
          : { status: 400, body: { error: "bad path" } },
      );

      ports.preferred = fake.port;

      const reply = await remoteScriptRequest({ route: "/list" });
      const again = await remoteScriptRequest({ route: "/list" });

      expect([reply, again]).toStrictEqual([
        { available: true, status: 400, body: { error: "bad path" } },
        { available: true, status: 400, body: { error: "bad path" } },
      ]);
    });

    it("looks again after another program answers a ping on the port", async () => {
      const { taken, moved } = await takenOverLater();

      await remoteScriptPing();
      taken.over = true;

      const after = await remoteScriptPing();
      const later = await remoteScriptPing();

      expect([after.running, later.running]).toStrictEqual([false, true]);
      expect(moved.requests.map((r) => r.route)).toStrictEqual(["/ping"]);
    });

    it("looks again after the port refuses a connection", async () => {
      const fake = await busyAfterFirstPing();
      const other = await standIn(OURS);

      await remoteScriptRequest({ route: "/list" });
      await fake.close();
      // Closing a stand-in points the env at port 0.
      delete process.env.PPAL_REMOTE_SCRIPT_PORT;
      ports.file = other.port;

      expect(await remoteScriptRequest({ route: "/list" })).toStrictEqual({
        available: false,
      });

      const reply = await remoteScriptRequest({ route: "/list" });

      expect(reply.available).toBe(true);
      expect(other.requests.map((r) => r.route)).toContain("/list");
    });
  });

  describe("with a deadline", () => {
    let clock = 0;

    /**
     * A script whose ping takes 400ms by the mocked clock.
     * @returns The stand-in
     */
    async function slowToFind(): Promise<FakeRemoteScript> {
      clock = 0;
      vi.spyOn(Date, "now").mockImplementation(() => clock);

      const fake = await standIn((request) => {
        if (request.route === "/ping") {
          clock += 400;
        }

        return OURS;
      });

      ports.preferred = fake.port;

      return fake;
    }

    it("sends what is left of expiresInMs once the port is found", async () => {
      const fake = await slowToFind();

      await remoteScriptRequest({ route: "/list", expiresInMs: 1000 });

      expect(fake.requests.at(-1)?.query).toStrictEqual({
        expires_in_ms: "600",
      });
    });

    it("gives up unsent when finding the port used the time up", async () => {
      const fake = await slowToFind();

      await expectUnsentTimeout(
        remoteScriptRequest({ route: "/list", expiresInMs: 300 }),
      );
      expect(fake.requests.map((r) => r.route)).toStrictEqual(["/ping"]);
    });
  });
});
