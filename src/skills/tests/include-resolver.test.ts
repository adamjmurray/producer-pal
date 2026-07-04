// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { type Notation } from "#src/shared/notation.ts";
import {
  resolveIncludes,
  type ResolveIncludesOptions,
} from "#src/skills/include-resolver.ts";

/**
 * Build resolver options from a fragment map, with an optional warning spy.
 *
 * @param fragments - Fragment name → body
 * @param notation - Active notation (defaults to bar|beat)
 * @param onWarn - Optional warning sink
 * @returns Options for {@link resolveIncludes}
 */
function options(
  fragments: Record<string, string>,
  notation: Notation = "barbeat",
  onWarn?: (message: string) => void,
): ResolveIncludesOptions {
  return { notation, onWarn, lookup: (name) => fragments[name] ?? null };
}

describe("resolveIncludes - composition", () => {
  it("returns a leaf fragment verbatim", () => {
    expect(resolveIncludes("a", options({ a: "hello" }))).toBe("hello");
  });

  it("splices an included fragment in place, preserving surrounding text", () => {
    const result = resolveIncludes(
      "root",
      options({
        root: `before\n\n@include "./child.md"\n\nafter`,
        child: "MID",
      }),
    );

    expect(result).toBe("before\n\nMID\n\nafter");
  });

  it("expands multiple includes in one body", () => {
    const result = resolveIncludes(
      "root",
      options({
        root: `@include "./a.md"+@include "./b.md"`,
        a: "A",
        b: "B",
      }),
    );

    expect(result).toBe("A+B");
  });

  it("resolves nested includes (a wrapper that includes another fragment)", () => {
    const result = resolveIncludes(
      "root",
      options({
        root: `@include "./wrapper.md"`,
        wrapper: `@include "./leaf.md"`,
        leaf: "LEAF",
      }),
    );

    expect(result).toBe("LEAF");
  });

  it("resolves an include ref written without the .md extension", () => {
    const result = resolveIncludes(
      "root",
      options({ root: `@include "./head"`, head: "H" }),
    );

    expect(result).toBe("H");
  });

  it("expands the same fragment twice when reached by distinct paths (diamond)", () => {
    const result = resolveIncludes(
      "root",
      options({
        root: `@include "./a.md"|@include "./b.md"`,
        a: `@include "./shared.md"`,
        b: `@include "./shared.md"`,
        shared: "S",
      }),
    );

    expect(result).toBe("S|S");
  });
});

describe("resolveIncludes - {notation} interpolation", () => {
  it("interpolates the active notation into the include ref", () => {
    const fragments = {
      root: `@include "./{notation}-standard.md"`,
      "barbeat-standard": "BARBEAT",
      "stark-standard": "STARK",
    };

    expect(resolveIncludes("root", options(fragments, "barbeat"))).toBe(
      "BARBEAT",
    );
    expect(resolveIncludes("root", options(fragments, "stark"))).toBe("STARK");
  });
});

describe("resolveIncludes - missing fragments", () => {
  it("expands a missing fragment to empty (the silent-absence gate)", () => {
    const result = resolveIncludes(
      "root",
      options({ root: `x@include "./gone.md"y` }),
    );

    expect(result).toBe("xy");
  });

  it("returns empty for a missing root", () => {
    expect(resolveIncludes("nope", options({}))).toBe("");
  });

  it("treats an Object.prototype name as a missing fragment, not a crash", () => {
    // A naive `map[name]` lookup returns inherited members for names like
    // "constructor" / "__proto__" (a function / an object), which would crash on
    // `.replaceAll`. The resolver must treat any non-string body as absent → "".
    for (const proto of ["constructor", "__proto__", "toString"]) {
      const result = resolveIncludes(
        "root",
        options({ root: `x@include "./${proto}.md"y` }),
      );

      expect(result).toBe("xy");
    }
  });
});

describe("resolveIncludes - no loops", () => {
  it("refuses a direct self-include and warns", () => {
    const onWarn = vi.fn();
    const result = resolveIncludes(
      "a",
      options({ a: `loop:@include "./a.md"` }, "barbeat", onWarn),
    );

    expect(result).toBe("loop:");
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining("include cycle refused"),
    );
  });

  it("refuses a transitive cycle (a → b → a)", () => {
    const onWarn = vi.fn();
    const result = resolveIncludes(
      "a",
      options(
        { a: `A@include "./b.md"`, b: `B@include "./a.md"` },
        "barbeat",
        onWarn,
      ),
    );

    expect(result).toBe("AB");
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining("a → b → a"));
  });

  it("bails out and warns past the max include depth", () => {
    // A long non-cyclic chain (no name repeats, so the cycle guard never fires)
    // must still terminate at the depth backstop rather than nest unboundedly.
    const chain: Record<string, string> = { f20: "DEEP" };

    for (let i = 0; i < 20; i++) chain[`f${i}`] = `@include "./f${i + 1}.md"`;

    const onWarn = vi.fn();
    const result = resolveIncludes("f0", options(chain, "barbeat", onWarn));

    expect(result).toBe(""); // the tail past the cap collapses to nothing
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining("depth exceeded"),
    );
  });
});

describe("resolveIncludes - path safety", () => {
  const rejected = [
    ["absolute path", `@include "/etc/passwd"`],
    ["home path", `@include "~/secrets.md"`],
    ["parent traversal", `@include "./../outside.md"`],
    ["bare parent", `@include "../outside.md"`],
    ["dotfile", `@include "./.env"`],
    ["mid-path traversal", `@include "./a/../../b.md"`],
    ["backslash", `@include "a\\b.md"`],
    ["empty ref", `@include ""`],
    ["bare current dir", `@include "./"`],
  ] as const;

  for (const [label, body] of rejected) {
    it(`rejects ${label} and warns`, () => {
      const onWarn = vi.fn();
      const result = resolveIncludes(
        "root",
        options(
          { root: `keep${body}keep`, "/etc/passwd": "LEAK", ".env": "LEAK" },
          "barbeat",
          onWarn,
        ),
      );

      expect(result).toBe("keepkeep");
      expect(onWarn).toHaveBeenCalledWith(
        expect.stringContaining("rejected unsafe path"),
      );
    });
  }

  it("allows a subdirectory ref that stays inside the skills dir", () => {
    const result = resolveIncludes(
      "root",
      options({
        root: `@include "./drums/backbeat.md"`,
        "drums/backbeat": "DB",
      }),
    );

    expect(result).toBe("DB");
  });
});

describe("resolveIncludes - override shadows built-in", () => {
  it("uses whatever lookup returns — an override wins by construction", () => {
    // lookup encodes user-shadows-built-in; here the override map wins.
    const builtIns: Record<string, string> = {
      root: `@include "./head.md"`,
      head: "BUILT-IN",
    };
    const overrides: Record<string, string> = { head: "OVERRIDE" };
    const result = resolveIncludes("root", {
      notation: "barbeat",
      lookup: (name) => overrides[name] ?? builtIns[name] ?? null,
    });

    expect(result).toBe("OVERRIDE");
  });
});
