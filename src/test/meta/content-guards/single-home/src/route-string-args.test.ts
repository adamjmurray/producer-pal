// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// Route handlers take untyped JSON, so each one used to check its own string
// fields and word the refusal itself. requireString does it once; a literal
// "must be a string" throw is a handler going its own way again.
const OWN_STRING_THROW = /throw new Error\(\s*"[^"]*must be a string/;

const HOME = "src/mcp-server/rpc/route-string-args.ts";

describe("route string args have one home", () => {
  it("refuses a non-string from requireString only", () => {
    expect(
      filesContaining("src", OWN_STRING_THROW),
      "call requireString from route-string-args.ts",
    ).toStrictEqual([]);
  });

  it("still refuses one there", () => {
    expect(
      filesContaining("src", /`\$\{key\} must be a string`/),
    ).toStrictEqual([HOME]);
  });
});
