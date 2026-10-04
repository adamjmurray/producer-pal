// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RemoteScriptTimeout,
  remoteScriptPing,
  remoteScriptRequest,
} from "../remote-script-client.ts";
import { forgetRemoteScriptPort } from "../port/remote-script-port.ts";
import {
  type FakeAnswer,
  type FakeRemoteScript,
  type ReceivedRequest,
  startFakeRemoteScript,
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

const OURS: FakeAnswer = {
  body: { ok: true, live_version: "12.4.5", script_version: "2.5.0" },
};
const NOT_OURS: FakeAnswer = { body: { ok: true } };

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
    const preferred = await standIn(OURS);
    const other = await standIn(OURS);

    ports.preferred = preferred.port;
    ports.file = other.port;
    await remoteScriptRequest({ route: "/list" });

    expect(preferred.requests.map((r) => r.route)).toContain("/list");
    expect(other.requests).toStrictEqual([]);
  });

  it("goes to the file's port when 3349 answers without script_version", async () => {
    const preferred = await standIn(NOT_OURS);
    const other = await standIn(OURS);

    ports.preferred = preferred.port;
    ports.file = other.port;
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

  it("goes to 3349 when its ping is slow, not to the file's port", async () => {
    const preferred = await standIn(null);
    const other = await standIn(OURS);

    ports.preferred = preferred.port;
    ports.file = other.port;

    await expect(
      remoteScriptRequest({ route: "/list", timeoutMs: 100 }),
    ).rejects.toBeInstanceOf(RemoteScriptTimeout);
    expect(other.requests).toStrictEqual([]);
  });

  it("treats a non-JSON reply on 3349 as another program: uses the file's port", async () => {
    const preferred = await standIn({ raw: "<html>dev server</html>" });
    const other = await standIn(OURS);

    ports.preferred = preferred.port;
    ports.file = other.port;
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
      otherOnPort: preferred.port,
    });
  });

  it("pings once when it finds the port and reports the ping", async () => {
    const preferred = await standIn(OURS);

    ports.preferred = preferred.port;
    const ping = await remoteScriptPing();

    expect(ping.running).toBe(true);
    expect(ping.scriptVersion).toBe("2.5.0");
    expect(preferred.requests.map((r) => r.route)).toStrictEqual(["/ping"]);
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
      const error: unknown = await remoteScriptRequest({
        route: "/list",
        expiresInMs: 300,
      }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(RemoteScriptTimeout);
      expect(error).toHaveProperty("sent", false);
      expect(fake.requests.map((r) => r.route)).toStrictEqual(["/ping"]);
    });
  });
});
