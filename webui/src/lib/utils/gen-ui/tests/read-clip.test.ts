// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  interpretReply,
  parseNotes,
  readClip,
} from "#webui/lib/utils/gen-ui/read-clip";

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * @param body - JSON the fake server returns
 * @param status - HTTP status
 */
function stubFetch(body: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

describe("parseNotes", () => {
  it("parses the compact MIDI JSON string", () => {
    expect(
      parseNotes("[{p:60,t:0,d:1,v:100},{p:64,t:1.5,d:0.5}]"),
    ).toStrictEqual([
      { p: 60, t: 0, d: 1, v: 100 },
      { p: 64, t: 1.5, d: 0.5, v: 100 },
    ]);
  });

  it.each([undefined, "", "   ", "not notes", "[{p:60}]x", 42])(
    "draws nothing for %j",
    (raw) => {
      expect(parseNotes(raw)).toStrictEqual([]);
    },
  );

  it("skips entries without a pitch and start", () => {
    expect(parseNotes("[{p:60},{t:1},{p:62,t:2}]")).toStrictEqual([
      { p: 62, t: 2, d: 1, v: 100 },
    ]);
  });
});

describe("interpretReply", () => {
  it("reads a clip", () => {
    expect(
      interpretReply({
        result: {
          id: "12",
          path: "t0/s0",
          name: "Bass",
          type: "midi",
          length: "2bar",
          notes: "[{p:36,t:0,d:1,v:90}]",
        },
        isError: false,
      }),
    ).toStrictEqual({
      status: "ready",
      clip: {
        id: "12",
        path: "t0/s0",
        name: "Bass",
        type: "midi",
        length: "2bar",
        notes: [{ p: 36, t: 0, d: 1, v: 90 }],
      },
    });
  });

  it("calls a tool error missing, with the tool's words", () => {
    expect(
      interpretReply({ result: "no clip at t0/s0", isError: true }),
    ).toStrictEqual({ status: "missing", message: "no clip at t0/s0" });
  });

  it.each([
    [{ result: { id: null, path: "t0/s0" } }],
    [{ result: {} }],
    [{ result: null }],
    [{}],
  ])("calls %j missing", (reply) => {
    expect(interpretReply(reply).status).toBe("missing");
  });

  it("calls a skipped entry missing, with its detail", () => {
    expect(
      interpretReply({ result: { id: "12", ok: false, detail: "gone" } }),
    ).toStrictEqual({ status: "missing", message: "gone" });
  });
});

describe("readClip", () => {
  it("asks for MIDI JSON notes by id or by path", async () => {
    stubFetch({ result: { id: "12", type: "midi" }, isError: false });

    await readClip("12");
    await readClip("t0/s3");

    const calls = vi.mocked(fetch).mock.calls;
    const first = calls[0] as [string, RequestInit];
    const second = calls[1] as [string, RequestInit];

    expect(first[0]).toContain("/api/tools/ppal-read-clip?format=json");
    expect(first[1].headers).toStrictEqual({
      "Content-Type": "application/json",
      "x-producer-pal-notation": "midi-json",
    });
    expect(JSON.parse(first[1].body as string)).toStrictEqual({
      id: "12",
      include: ["notes", "timing"],
    });
    expect(JSON.parse(second[1].body as string)).toStrictEqual({
      path: "t0/s3",
      include: ["notes", "timing"],
    });
  });

  it("separates a server that can't be reached from a clip that is gone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    expect(await readClip("12")).toStrictEqual({
      status: "error",
      message: "Can't reach the server",
    });

    stubFetch({ error: "Internal server error" }, 500);

    expect(await readClip("12")).toStrictEqual({
      status: "error",
      message: "Internal server error",
    });
  });

  it("lets an aborted read throw so a newer read wins", async () => {
    const controller = new AbortController();

    controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aborted")));

    await expect(readClip("12", controller.signal)).rejects.toThrow("aborted");
  });
});

describe("readClip when the server's words are missing or odd", () => {
  it("says the HTTP status when a failed reply gives no reason", async () => {
    stubFetch({}, 500);

    expect(await readClip("12")).toStrictEqual({
      status: "error",
      message: "HTTP 500",
    });
  });

  it("reads a clip that has only an id, as a MIDI clip with nothing else known", () => {
    expect(interpretReply({ result: { id: 12 } })).toStrictEqual({
      status: "ready",
      clip: {
        id: "12",
        path: undefined,
        name: undefined,
        type: "midi",
        length: undefined,
        notes: [],
      },
    });
  });

  it("reads an audio clip", () => {
    const read = interpretReply({ result: { id: "3", type: "audio" } });

    expect(read.status === "ready" && read.clip.type).toBe("audio");
  });

  it("uses a stock message when the reason isn't text", () => {
    expect(
      interpretReply({ isError: true, result: { odd: true } }),
    ).toStrictEqual({
      status: "missing",
      message: "No clip",
    });
    expect(
      interpretReply({ result: { id: "1", ok: false, detail: { odd: true } } }),
    ).toStrictEqual({ status: "missing", message: "No clip" });
  });

  it("gives an id of no usable kind as empty text", () => {
    const read = interpretReply({ result: { id: { odd: true } } });

    expect(read.status === "ready" && read.clip.id).toBe("");
  });
});
