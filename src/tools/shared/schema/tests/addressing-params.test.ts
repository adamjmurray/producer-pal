// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { getHiddenParam } from "../../tool-framework/hidden-param.ts";
import { addressingAliases } from "../addressing-params.ts";

describe("addressingAliases", () => {
  it("folds ids onto id and paths onto path", () => {
    const params = addressingAliases();

    expect(Object.keys(params)).toStrictEqual(["ids", "paths"]);
    expect(getHiddenParam(params.ids!)).toStrictEqual({
      kind: "alias",
      canonical: "id",
    });
    expect(getHiddenParam(params.paths!)).toStrictEqual({
      kind: "alias",
      canonical: "path",
    });
  });

  it("adds a type-named id alias between them", () => {
    const params = addressingAliases({ idAlias: "clipId" });

    expect(Object.keys(params)).toStrictEqual(["ids", "clipId", "paths"]);
    expect(getHiddenParam(params.clipId!)).toStrictEqual({
      kind: "alias",
      canonical: "id",
    });
  });

  it("coerces a number the way the id params do", () => {
    expect(addressingAliases().ids!.parse(7)).toBe("7");
  });
});
