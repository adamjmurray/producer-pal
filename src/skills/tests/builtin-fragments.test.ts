// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  builtinFragments,
  resolveFragmentAlias,
} from "#src/skills/builtin-fragments.ts";
import { SKILL_SLOT_NAMES, SKILL_SLOTS } from "#src/skills/skill-slots.ts";

describe("builtinFragments", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes the driver roots with the header and both notation includes", () => {
    // Both depths take the head and its `-write` sibling on adjacent lines. The
    // sibling ref is easy to forget when adding a driver, and forgetting it is
    // silent — every remaining include still resolves, the document is just
    // missing its authoring half.
    const frags = builtinFragments(false);

    for (const [root, depth] of [
      ["standard", "standard"],
      ["basic", "basic"],
    ] as const) {
      expect(frags[root]).toContain("# Producer Pal Skills");
      expect(frags[root]).toContain(
        `@include "./{notation}-${depth}.md"\n\n@include "./{notation}-${depth}-write.md"`,
      );
    }
  });

  it("makes the standard driver a bare include manifest", () => {
    // Forking it to drop a section must cost a line, not a document: every
    // non-blank line past the header is an include directive.
    const lines = builtinFragments(false)
      .standard!.split("\n")
      .filter((line) => line.trim() !== "")
      .slice(1); // drop the "# Producer Pal Skills" header

    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) expect(line).toMatch(/^@include "\.\/.+"$/);
  });

  it("keeps every fragment a leaf — no fragment includes another", () => {
    // Depth-1 is enforced by the resolver, but the built-ins must not RELY on
    // being stripped: an include here would be a silently dropped section.
    const frags = builtinFragments(true);

    for (const [name, body] of Object.entries(frags)) {
      if (name === "standard" || name === "basic") continue;

      expect(body, `${name} must not include another fragment`).not.toContain(
        "@include",
      );
    }
  });

  it("keeps code-transforms PRESENT but empty when code exec is off", () => {
    // Present-but-empty, not absent: the resolver warns about unknown names, so
    // the manifest's include line has to resolve to a real (empty) fragment.
    expect(builtinFragments(false)["code-transforms"]).toBe("");
    expect(builtinFragments(true)["code-transforms"]).toContain(
      "Code Transforms",
    );
  });

  it("defaults the code-exec flag to the ENABLE_CODE_EXEC env", () => {
    vi.stubEnv("ENABLE_CODE_EXEC", "true");
    expect(builtinFragments()["code-transforms"]).not.toBe("");

    vi.stubEnv("ENABLE_CODE_EXEC", "");
    expect(builtinFragments()["code-transforms"]).toBe("");
  });

  it("stays consistent with the editor slot registry for every curated slot", () => {
    // The editor serves SKILL_SLOTS[name].builtIn as "the current default"; the
    // resolver assembles from builtinFragments()[name]. They must be the same
    // string or the preview would diverge from what the editor shows.
    const frags = builtinFragments(true);

    for (const name of SKILL_SLOT_NAMES) {
      expect(frags[name]).toBe(SKILL_SLOTS[name].builtIn);
    }
  });
});

describe("resolveFragmentAlias", () => {
  it("folds midi-json's depth-suffixed names onto its single head", () => {
    expect(resolveFragmentAlias("midi-json-standard")).toBe("midi-json");
    expect(resolveFragmentAlias("midi-json-basic")).toBe("midi-json");
  });

  it("passes every other name through unchanged", () => {
    for (const name of ["standard", "barbeat-basic", "my-own-fragment"]) {
      expect(resolveFragmentAlias(name)).toBe(name);
    }
  });

  it("passes an Object.prototype name through as a string, not a function", () => {
    // Include refs and override filenames are user text: a naive
    // `ALIASES[name] ?? name` hands back Object.prototype.toString here, which
    // would be stringified into the lookup key and the warning message.
    for (const proto of ["toString", "constructor", "__proto__"]) {
      expect(resolveFragmentAlias(proto)).toBe(proto);
    }
  });
});
