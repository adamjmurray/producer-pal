// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { touchedRefs } from "../touched-refs.ts";
import { type McpResponse } from "../../../max-api-adapter.ts";

/**
 * @param texts - The text blocks of a tool result
 * @returns A tool result
 */
function response(...texts: string[]): McpResponse {
  return { content: texts.map((text) => ({ type: "text", text })) };
}

describe("touchedRefs", () => {
  it("reads ids and paths from a JSON result", () => {
    const result = touchedRefs(
      "ppal-create-clip",
      { path: "t0/s0" },
      response(JSON.stringify([{ id: "12", path: "t0/s0" }, { id: 13 }])),
    );

    expect(result).toStrictEqual({
      tool: "ppal-create-clip",
      ids: ["12", "13"],
      paths: ["t0/s0"],
      all: false,
    });
  });

  it("reads a compact JS-literal result", () => {
    const result = touchedRefs(
      "ppal-update-clip",
      {},
      response('{id:"12",path:"t1/s2",noteCount:4}'),
    );

    expect(result).toStrictEqual({
      tool: "ppal-update-clip",
      ids: ["12"],
      paths: ["t1/s2"],
      all: false,
    });
  });

  it("adds what the call named, splitting lists", () => {
    const result = touchedRefs(
      "ppal-update-clip",
      { id: "5,6", toPath: "t2/s1", clipId: 7 },
      response("{}"),
    );

    expect(result.ids).toStrictEqual(["5", "6", "7"]);
    expect(result.paths).toStrictEqual(["t2/s1"]);
  });

  it("ignores WARNING blocks", () => {
    const result = touchedRefs(
      "ppal-create-clip",
      {},
      response('{id:"1"}', 'WARNING: id:"99" was odd'),
    );

    expect(result.ids).toStrictEqual(["1"]);
  });

  it("asks for a full refresh when it can't tie the change to clips", () => {
    expect(
      touchedRefs("ppal-delete", { id: "7" }, response('{id:"7"}')).all,
    ).toBe(true);
    expect(touchedRefs("ppal-update-clip", {}, response("{}")).all).toBe(true);
    expect(
      touchedRefs(
        "ppal-update-clip",
        { id: "7" },
        {
          ...response("timed out"),
          isError: true,
          errorCode: "timeout",
        },
      ).all,
    ).toBe(true);
  });
});

describe("touchedRefs with odd results", () => {
  it.each(["42", "null", '{"id":{"nested":1}}', "plain words"])(
    "finds nothing in %s and asks for a full refresh",
    (text) => {
      const result = touchedRefs("ppal-create-clip", {}, response(text));

      expect(result).toStrictEqual({
        tool: "ppal-create-clip",
        ids: [],
        paths: [],
        all: true,
      });
    },
  );
});

describe("touchedRefs with other spellings of a compact result", () => {
  it("reads single-quoted and bare values, and skips empty list entries", () => {
    const result = touchedRefs(
      "ppal-update-clip",
      { id: "5,,6," },
      response("{id:'12',path:t1/s2,other:{id:13}}"),
    );

    expect(result.ids).toStrictEqual(["5", "6", "12", "13"]);
    expect(result.paths).toStrictEqual(["t1/s2"]);
  });
});
