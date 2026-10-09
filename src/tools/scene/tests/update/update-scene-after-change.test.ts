// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A throw after part of a scene landed keeps the scene's normal entry, with a
// detail for what landed and what didn't. Later scenes still run.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_FAILURE,
  failOnSet,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { updateScene } from "../../update-scene.ts";
import { registerThreeScenes } from "../scene-fixtures.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateScene - a throw after a change landed", () => {
  let scene1: RegisteredMockObject;
  let scene2: RegisteredMockObject;
  let scene3: RegisteredMockObject;

  beforeEach(() => {
    [scene1, scene2, scene3] = registerThreeScenes();
  });

  it.each([
    ["color", { name: "A", color: "#FF0000" }, "name"],
    ["tempo", { name: "A", color: "#FF0000", tempo: 90 }, "name, color"],
    ["tempo_enabled", { tempo: 90 }, "tempo"],
    ["time_signature_denominator", { timeSignature: "3/4" }, "time signature"],
  ])(
    "names what landed before %s threw, with no ok",
    (failing, args, landed) => {
      failOnSet(scene2, failing);

      const result = updateScene({ id: "123,456,789", ...args });

      expect(result).toStrictEqual([
        { id: "123", path: "s0" },
        {
          id: "456",
          path: "s1",
          detail: `${LIVE_FAILURE}; already changed: ${landed}`,
        },
        { id: "789", path: "s2" },
      ]);
      expect(scene3.set).toHaveBeenCalled();
    },
  );

  it("is the plain skip when nothing landed before the throw", () => {
    failOnSet(scene2, "name");

    expect(updateScene({ id: "123,456", name: "A" })).toStrictEqual([
      { id: "123", path: "s0" },
      { id: "456", ok: false, detail: LIVE_FAILURE },
    ]);
  });

  it("leaves scenes the deadline never reached as skips", () => {
    const start = 1_000_000;
    let now = start;

    vi.spyOn(Date, "now").mockImplementation(() => now);
    // The first scene uses up the time.
    scene1.set.mockImplementation(() => {
      now = start + 5000;
    });

    expect(
      updateScene({ id: "123,456,789", name: "A" }, { deadline: start + 1000 }),
    ).toStrictEqual([
      { id: "123", path: "s0" },
      {
        id: "456",
        ok: false,
        detail: "the request ran out of time; re-run for this scene",
      },
      {
        id: "789",
        ok: false,
        detail: "the request ran out of time; re-run for this scene",
      },
    ]);
    expect(scene2.set).not.toHaveBeenCalled();
  });
});
