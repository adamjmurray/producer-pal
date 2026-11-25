// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getInfo,
  getPropertyValue,
  getTypeName,
  parseInfo,
  parseRawApiResponse,
  scanPath,
  type ScanContext,
} from "./live-api-scan.ts";

const BASE_URL = "http://localhost:3350";

const SONG_INFO = [
  "id 1",
  "type Song",
  "description The Live Set",
  "children tracks Track",
  "child master_track Track",
  "property tempo float",
  "property is_playing bool",
  "function start_playing",
  "done",
].join("\n");

/**
 * REST body for a `ppal-live-api` call, in the tool's `{ path?, id, results }`
 * shape (see live-api.test.ts "return format").
 * @param id - Object id the tool reports
 * @param results - One value per operation
 * @returns The REST response body
 */
function restBody(id: string, results: unknown[]): unknown {
  return { result: { path: "live_set", id, results }, isError: false };
}

/**
 * Answer every fetch with this REST body.
 * @param body - The response body
 * @param ok - Whether the HTTP status is a success
 * @returns The fetch spy
 */
function stubRest(body: unknown, ok = true) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json(body, { status: ok ? 200 : 500 }));
}

describe("live-api-scan against ppal-live-api responses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("parseRawApiResponse", () => {
    it("returns the tool result", () => {
      expect(parseRawApiResponse(restBody("1", [120]))).toStrictEqual({
        path: "live_set",
        id: "1",
        results: [120],
      });
    });

    it.each([
      ["null body", null],
      ["error", { result: "boom", isError: true }],
      ["string result", { result: "text", isError: false }],
      ["null result", { result: null, isError: false }],
      ["no results array", { result: { id: "1" }, isError: false }],
    ])("returns null for %s", (_name, body) => {
      expect(parseRawApiResponse(body)).toBeNull();
    });
  });

  describe("getInfo", () => {
    it("returns the info string and requests plain JSON", async () => {
      const fetchSpy = stubRest(restBody("1", [SONG_INFO]));

      expect(await getInfo(BASE_URL, "live_set")).toBe(SONG_INFO);
      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/api/tools/ppal-live-api`,
        expect.objectContaining({
          body: JSON.stringify({
            path: "live_set",
            operations: [{ type: "info" }],
          }),
        }),
      );
    });

    it("returns null when no object is at the path", async () => {
      stubRest(restBody("0", ["No object"]));

      expect(await getInfo(BASE_URL, "live_set tracks 99")).toBeNull();
    });

    it.each([
      ["empty info", restBody("1", [""])],
      ["non-string info", restBody("1", [42])],
      ["tool error", { result: "failed", isError: true }],
    ])("returns null for %s", async (_name, body) => {
      stubRest(body);

      expect(await getInfo(BASE_URL, "live_set")).toBeNull();
    });

    it("returns null on an HTTP error or a failed request", async () => {
      stubRest({}, false);

      expect(await getInfo(BASE_URL, "live_set")).toBeNull();

      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));

      expect(await getInfo(BASE_URL, "live_set")).toBeNull();
    });

    it("gives parseInfo and getTypeName what they need", async () => {
      stubRest(restBody("1", [SONG_INFO]));

      const info = (await getInfo(BASE_URL, "live_set")) as string;

      expect(getTypeName(info)).toBe("Song");
      expect(parseInfo(info).map((e) => `${e.kind} ${e.name}`)).toStrictEqual([
        "children tracks",
        "child master_track",
        "property tempo",
        "property is_playing",
        "function start_playing",
      ]);
    });
  });

  describe("getPropertyValue", () => {
    it.each([
      ["number", [120], "120"],
      ["bool", [1], "1"],
      ["string", ["Drift"], "Drift"],
    ])("reads the first %s value", async (_name, values, expected) => {
      stubRest(restBody("5", [values]));

      expect(await getPropertyValue(BASE_URL, "live_set", "x")).toBe(expected);
    });

    it.each([
      ["empty array", restBody("5", [[]])],
      ["non-array", restBody("5", [120])],
      ["error", { result: "failed", isError: true }],
    ])("returns null for %s", async (_name, body) => {
      stubRest(body);

      expect(await getPropertyValue(BASE_URL, "live_set", "x")).toBeNull();
    });
  });

  describe("scanPath", () => {
    it("discovers a type once", async () => {
      stubRest(restBody("1", [SONG_INFO]));

      const ctx: ScanContext = {
        baseUrl: BASE_URL,
        results: [],
        seenTypes: new Set(),
      };

      expect(await scanPath(ctx, "live_set", "Song")).toBe(true);
      expect(await scanPath(ctx, "live_set", "Song")).toBe(false);
      expect(ctx.results).toHaveLength(1);
      expect(ctx.results[0]?.typeName).toBe("Song");
    });
  });
});
