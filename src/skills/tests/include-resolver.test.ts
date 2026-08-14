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

  it("resolves an include ref written without the .md extension", () => {
    const result = resolveIncludes(
      "root",
      options({ root: `@include "./head"`, head: "H" }),
    );

    expect(result).toBe("H");
  });

  it("expands the same fragment twice when the driver includes it twice", () => {
    const result = resolveIncludes(
      "root",
      options({
        root: `@include "./shared.md"|@include "./shared.md"`,
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

describe("resolveIncludes - depth-1 only", () => {
  it("refuses an include INSIDE an included fragment, and warns", () => {
    // A fragment's cost must be its own length: if a fragment could pull in
    // another, dropping one include line would silently drop two fragments.
    const onWarn = vi.fn();
    const result = resolveIncludes(
      "root",
      options(
        {
          root: `A@include "./wrapper.md"B`,
          wrapper: `[@include "./leaf.md"]`,
          leaf: "LEAF",
        },
        "barbeat",
        onWarn,
      ),
    );

    expect(result).toBe("A[]B");
    expect(result).not.toContain("LEAF");
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining("include nesting refused"),
    );
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining("leaf"));
  });

  it("terminates a self-including fragment instead of looping", () => {
    // What used to need cycle detection: at depth 1 the second level's own
    // include is simply refused, so there is nothing to recurse into.
    const onWarn = vi.fn();
    const result = resolveIncludes(
      "a",
      options({ a: `loop:@include "./a.md"` }, "barbeat", onWarn),
    );

    expect(result).toBe("loop:loop:");
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining("include nesting refused"),
    );
  });

  it("refuses a two-fragment cycle in one pass (a → b → a)", () => {
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
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining("include nesting refused"),
    );
  });
});

describe("resolveIncludes - unknown fragments", () => {
  it("warns when an include names a fragment that does not exist", () => {
    // The migration hazard this fixes: a driver override naming a renamed
    // fragment used to resolve to "" with no signal at all.
    const onWarn = vi.fn();
    const result = resolveIncludes(
      "root",
      options({ root: `x@include "./gone.md"y` }, "barbeat", onWarn),
    );

    expect(result).toBe("xy");
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining(`unknown fragment: "gone"`),
    );
  });

  it("returns empty and warns for a missing root", () => {
    const onWarn = vi.fn();

    expect(resolveIncludes("nope", options({}, "barbeat", onWarn))).toBe("");
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining("unknown fragment"),
    );
  });

  it("expands a KNOWN but empty fragment silently (the build-gated case)", () => {
    // code-transforms is present-and-empty in a release build, so its manifest
    // line must not warn — that is what distinguishes it from a typo'd name.
    const onWarn = vi.fn();
    const result = resolveIncludes(
      "root",
      options(
        { root: `a\n\n@include "./gated.md"\n\nb`, gated: "" },
        "barbeat",
        onWarn,
      ),
    );

    expect(result).toBe("a\n\nb");
    expect(onWarn).not.toHaveBeenCalled();
  });

  it("treats an Object.prototype name as an unknown fragment, not a crash", () => {
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

describe("resolveIncludes - onFragment", () => {
  it("reports each resolved include in document order", () => {
    const seen: string[] = [];

    resolveIncludes("root", {
      notation: "barbeat",
      lookup: (name) =>
        ({ root: `@include "./a.md"\n@include "./b.md"`, a: "A", b: "B" })[
          name
        ] ?? null,
      onFragment: (name) => seen.push(name),
    });

    expect(seen).toStrictEqual(["a", "b"]);
  });

  it("does not report the root, unknown names, or refused paths", () => {
    // The caller uses this set to check declared prerequisites, so a name that
    // contributed no text must not count as present.
    const seen: string[] = [];

    resolveIncludes("root", {
      notation: "barbeat",
      lookup: (name) =>
        ({
          root: `@include "./gone.md"@include "../nope.md"@include "./a.md"`,
          a: "A",
        })[name] ?? null,
      onFragment: (name) => seen.push(name),
    });

    expect(seen).toStrictEqual(["a"]);
  });
});

describe("resolveIncludes - blank line collapse", () => {
  it("collapses the blank-line run a dropped fragment leaves behind", () => {
    const result = resolveIncludes(
      "root",
      options({ root: `a\n\n@include "./gone.md"\n\nb`, gone: "" }),
    );

    expect(result).toBe("a\n\nb");
  });

  it("collapses a run left by several adjacent empty includes", () => {
    const result = resolveIncludes(
      "root",
      options({
        root: `a\n\n@include "./x.md"\n\n@include "./y.md"\n\nb`,
        x: "",
        y: "",
      }),
    );

    expect(result).toBe("a\n\nb");
  });

  it("leaves a blank-line run inside a fragment alone", () => {
    // Only reachable through a user override today, and only cosmetic unless
    // the spacing means something — which inside a fenced block it does.
    const result = resolveIncludes(
      "root",
      options({
        root: `a\n\n@include "./x.md"\n\nb`,
        x: "```\nfirst\n\n\nlast\n```",
      }),
    );

    expect(result).toBe("a\n\n```\nfirst\n\n\nlast\n```\n\nb");
  });

  it("tidies the seam when a fragment body ends with its own newline", () => {
    const result = resolveIncludes(
      "root",
      options({ root: `a\n\n@include "./x.md"\n\nb`, x: "body\n" }),
    );

    expect(result).toBe("a\n\nbody\n\nb");
  });

  it("tidies the seam when a fragment body starts with its own newline", () => {
    const result = resolveIncludes(
      "root",
      options({ root: `a\n\n@include "./x.md"\n\nb`, x: "\nbody" }),
    );

    expect(result).toBe("a\n\nbody\n\nb");
  });

  it("keeps a paragraph break when a dropped fragment held the only one", () => {
    // The include line has no blank line in front of it, so its own is all that
    // separates a from b. Taking it would merge two paragraphs into one.
    const result = resolveIncludes(
      "root",
      options({ root: `a\n@include "./gone.md"\n\nb`, gone: "" }),
    );

    expect(result).toBe("a\n\nb");
  });

  it("drops a dropped fragment's line whole when nothing followed it", () => {
    const result = resolveIncludes(
      "root",
      options({ root: `a\n@include "./gone.md"\nb`, gone: "" }),
    );

    expect(result).toBe("a\nb");
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
    ["null byte", `@include "a\0b.md"`],
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
