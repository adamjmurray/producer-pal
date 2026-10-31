// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { mcpRequests, setMcpResponse } from "#src/test/mocks/mock-max.ts";
import { prepareWidgetFields } from "../clip-ref.ts";

/**
 * @param text - What Live's read answers
 * @param isError - Whether the read failed
 */
function liveAnswers(text: string, isError = false): void {
  setMcpResponse({
    content: [{ type: "text", text }],
    ...(isError && { isError }),
  });
}

describe("prepareWidgetFields with the real lookup", () => {
  it("turns an id into the clip's path, asking by id", async () => {
    liveAnswers('{"id":"12","path":"t2/s3"}');

    const result = await prepareWidgetFields({ kind: "clip", ref: "12" });

    expect(result).toStrictEqual({
      ok: true,
      fields: { kind: "clip", ref: "t2/s3" },
    });
    expect(JSON.parse(mcpRequests.at(-1)?.argsJSON ?? "{}")).toStrictEqual({
      id: "12",
      include: [],
    });
  });

  it("checks a path by asking for it", async () => {
    liveAnswers('{"id":"12","path":"t0/s0"}');
    await prepareWidgetFields({ kind: "clip", ref: "t0/s0" });

    expect(JSON.parse(mcpRequests.at(-1)?.argsJSON ?? "{}")).toStrictEqual({
      path: "t0/s0",
      include: [],
    });
  });

  it("refuses a slot Live says is empty, with Live's words", async () => {
    liveAnswers("Error: no clip at t0/s0", true);

    const result = await prepareWidgetFields({ kind: "clip", ref: "t0/s0" });

    expect(result).toStrictEqual({
      ok: false,
      error: "No clip at t0/s0: Error: no clip at t0/s0",
    });
  });

  it("refuses an arrangement clip", async () => {
    liveAnswers('{"id":"12","path":"t0[5|1]"}');

    const result = await prepareWidgetFields({ kind: "clip", ref: "12" });

    expect(result).toStrictEqual({
      ok: false,
      error: "12 is not a Session clip",
    });
  });

  it("refuses when Live's answer can't be read", async () => {
    liveAnswers("not json");

    const result = await prepareWidgetFields({ kind: "clip", ref: "12" });

    expect(result.ok).toBe(false);
  });

  it.each([{}, { kind: "text", text: "hi" }, { kind: "clip", ref: "nope" }])(
    "leaves %j for the store to judge",
    async (fields) => {
      const before = mcpRequests.length;
      const result = await prepareWidgetFields(fields);

      expect(result).toStrictEqual({ ok: true, fields });
      expect(mcpRequests).toHaveLength(before);
    },
  );
});

describe("prepareWidgetFields when Live's answer is unusable", () => {
  it("says it couldn't check, when there is no answer at all", async () => {
    setMcpResponse({ content: [] });

    const result = await prepareWidgetFields({ kind: "clip", ref: "12" });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("Couldn't check 12 in Live");
  });

  it("says it isn't a Session clip, when the answer is null", async () => {
    liveAnswers("null");

    expect(
      await prepareWidgetFields({ kind: "clip", ref: "12" }),
    ).toStrictEqual({
      ok: false,
      error: "12 is not a Session clip",
    });
  });
});
