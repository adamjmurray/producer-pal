// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  remoteScriptPing,
  remoteScriptRequest,
  replyError,
} from "../remote-script-client.ts";
import {
  RemoteScriptConnectionLost,
  RemoteScriptTimeout,
} from "../remote-script-errors.ts";
import {
  type FakeAnswer,
  type FakeRemoteScript,
  callUntilItTimesOut,
  startFakeRemoteScript,
} from "./remote-script-test-helpers.ts";

let fake: FakeRemoteScript | undefined;

afterEach(async () => {
  vi.useRealTimers();
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

describe("remoteScriptRequest", () => {
  it("sends a GET with its query and hands back the answer", async () => {
    const remote = await answerWith({ body: { ok: true } });

    expect(
      await remoteScriptRequest({
        route: "/list",
        query: { type: "plugin", q: "pro q" },
      }),
    ).toStrictEqual({ available: true, status: 200, body: { ok: true } });
    expect(remote.requests).toStrictEqual([
      {
        method: "GET",
        route: "/list",
        query: { type: "plugin", q: "pro q" },
        body: undefined,
      },
    ]);
  });

  it("sends a POST body as JSON, and hands back an error status as an answer", async () => {
    const remote = await answerWith({ status: 400, body: { error: "bad" } });

    expect(
      await remoteScriptRequest({
        method: "POST",
        route: "/load",
        body: { type: "plugin", track_index: 2 },
      }),
    ).toStrictEqual({ available: true, status: 400, body: { error: "bad" } });
    expect(remote.requests[0]?.body).toStrictEqual({
      type: "plugin",
      track_index: 2,
    });
  });

  it("is unavailable when nothing takes the connection", async () => {
    expect(await remoteScriptRequest({ route: "/ping" })).toStrictEqual({
      available: false,
    });
  });

  it("is unavailable, but says something answered, when it isn't sending a JSON object", async () => {
    await answerWith({ raw: "hello" });
    expect(await remoteScriptRequest({ route: "/ping" })).toStrictEqual({
      available: false,
      otherAnswered: true,
    });

    await fake?.close();
    await answerWith({ raw: "[1]" });
    expect(await remoteScriptRequest({ route: "/ping" })).toStrictEqual({
      available: false,
      otherAnswered: true,
    });
  });

  it("throws when the connection is taken but no answer comes", async () => {
    const remote = await answerWith(null);

    await expect(
      callUntilItTimesOut(remote, 50, () =>
        remoteScriptRequest({ route: "/list", timeoutMs: 50 }),
      ),
    ).rejects.toThrow("Live's browser did not answer within 0.05s");
  });

  it("marks a timeout as sent, since Live may have acted on it", async () => {
    const remote = await answerWith(null);

    const error = await callUntilItTimesOut(remote, 50, () =>
      remoteScriptRequest({ route: "/list", timeoutMs: 50 }).catch(
        (caught: unknown) => caught,
      ),
    );

    expect(error).toBeInstanceOf(RemoteScriptTimeout);
    expect(error).toHaveProperty("sent", true);
  });

  it("marks a timeout before the connection as not sent", async () => {
    await answerWith({ body: { ok: true } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    // Advancing before the event loop turns means the socket hasn't connected.
    const reply = remoteScriptRequest({ route: "/list", timeoutMs: 50 }).catch(
      (caught: unknown) => caught,
    );

    vi.advanceTimersByTime(50);

    const error = await reply;

    expect(error).toBeInstanceOf(RemoteScriptTimeout);
    expect(error).toHaveProperty("sent", false);
    expect(error).toHaveProperty(
      "message",
      "ran out of time before connecting to Live's browser",
    );
  });

  describe("with an expiry", () => {
    it("sends it as expires_in_ms: in the query of a GET, in the body of a POST", async () => {
      const remote = await answerWith({ body: { ok: true } });

      await remoteScriptRequest({ route: "/list", expiresInMs: 8000.7 });
      await remoteScriptRequest({
        method: "POST",
        route: "/load",
        body: { type: "plugin" },
        expiresInMs: 8000,
      });

      expect(remote.requests).toStrictEqual([
        {
          method: "GET",
          route: "/list",
          query: { expires_in_ms: "8000" },
          body: undefined,
        },
        {
          method: "POST",
          route: "/load",
          query: {},
          body: { type: "plugin", expires_in_ms: 8000 },
        },
      ]);
    });

    it("waits a moment past the expiry for the reply, not the fixed 35s", async () => {
      const remote = await answerWith(null);

      await expect(
        callUntilItTimesOut(remote, 150, () =>
          remoteScriptRequest({ route: "/list", expiresInMs: 100 }),
        ),
      ).rejects.toThrow("Live's browser did not answer within 0.15s");
    });

    it.each([0, -5])("sends nothing at %s", async (expiresInMs) => {
      const remote = await answerWith({ body: { ok: true } });
      const error = await remoteScriptRequest({
        route: "/list",
        expiresInMs,
      }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(RemoteScriptTimeout);
      expect(error).toHaveProperty("sent", false);
      expect(remote.requests).toStrictEqual([]);
    });
  });

  it("is unavailable when the connection isn't taken in time", async () => {
    await answerWith({ body: { ok: true } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    // Advancing before the event loop turns means the socket hasn't connected.
    const reply = remoteScriptRequest({ route: "/ping" });

    vi.advanceTimersByTime(1000);

    expect(await reply).toStrictEqual({ available: false });
  });

  it("throws when the connection is dropped after it was taken", async () => {
    await answerWith({ drop: true });

    await expect(
      remoteScriptRequest({ route: "/ping", timeoutMs: 5000 }),
    ).rejects.toBeInstanceOf(RemoteScriptConnectionLost);
  });

  it("throws when the answer is cut off", async () => {
    await answerWith({ cut: '{"ok":' });

    await expect(
      remoteScriptRequest({ route: "/ping", timeoutMs: 5000 }),
    ).rejects.toBeInstanceOf(RemoteScriptConnectionLost);
  });

  it("reads a reply with no status code as status 0", async () => {
    await answerWith({ body: { ok: true } });
    const realRequest = http.request;

    vi.spyOn(http, "request").mockImplementation(((
      options: http.RequestOptions,
      callback: (response: http.IncomingMessage) => void,
    ) =>
      realRequest(options, (response) => {
        response.statusCode = undefined;
        callback(response);
      })) as typeof http.request);

    expect(await remoteScriptRequest({ route: "/ping" })).toStrictEqual({
      available: true,
      status: 0,
      body: { ok: true },
    });
  });
});

describe("remoteScriptPing", () => {
  it("reports the versions of our script", async () => {
    await answerWith({
      body: { ok: true, live_version: "12.4.5", script_version: "2.4.1" },
    });

    expect(await remoteScriptPing()).toStrictEqual({
      running: true,
      liveVersion: "12.4.5",
      scriptVersion: "2.4.1",
      userLibrary: null,
      otherOnPort: null,
    });
  });

  it("reports the User Library the script runs from", async () => {
    await answerWith({
      body: {
        ok: true,
        script_version: "2.5.0",
        user_library: "/Music/Ableton/User Library",
      },
    });

    const ping = await remoteScriptPing();

    expect(ping.userLibrary).toBe("/Music/Ableton/User Library");
  });

  it("reads a null User Library as unknown", async () => {
    await answerWith({
      body: { ok: true, script_version: "2.5.0", user_library: null },
    });

    const ping = await remoteScriptPing();

    expect(ping.userLibrary).toBeNull();
  });

  it("names the port when something else answers there", async () => {
    const remote = await answerWith({ body: { ok: true } });

    const ping = await remoteScriptPing();

    expect(ping.running).toBe(false);
    expect(ping.otherOnPort).toBe(remote.port);
  });

  it("names no port when nothing answers", async () => {
    const ping = await remoteScriptPing();

    expect(ping.otherOnPort).toBeNull();
  });
});

describe("replyError", () => {
  it("uses the remote script's own error", () => {
    expect(
      replyError({ available: true, status: 404, body: { error: "no 'X'" } }),
    ).toBe("no 'X'");
  });

  it("falls back to the status", () => {
    expect(replyError({ available: true, status: 500, body: {} })).toBe(
      "Live's browser answered with status 500",
    );
  });
});
