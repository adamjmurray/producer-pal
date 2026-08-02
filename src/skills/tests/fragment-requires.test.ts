// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { NOTATIONS } from "#src/shared/notation.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import { builtinFragments } from "#src/skills/builtin-fragments.ts";
import { basicDriver, standardDriver } from "#src/skills/drivers.ts";
import {
  FRAGMENT_REQUIRES,
  fragmentRequires,
} from "#src/skills/fragment-requires.ts";

const FRAGMENT_NAMES = new Set(Object.keys(builtinFragments(true)));

describe("FRAGMENT_REQUIRES", () => {
  it("names only real fragments, on both ends of every edge", () => {
    for (const [name, requires] of Object.entries(FRAGMENT_REQUIRES)) {
      expect(FRAGMENT_NAMES, `${name} is not a fragment`).toContain(name);

      for (const required of requires) {
        expect(FRAGMENT_NAMES, `${name} needs unknown ${required}`).toContain(
          required,
        );
      }
    }
  });

  it("never lists a fragment as needing itself", () => {
    for (const [name, requires] of Object.entries(FRAGMENT_REQUIRES)) {
      expect(requires).not.toContain(name);
    }
  });

  it("closes transitively without a cycle", () => {
    // Edges point at what a fragment NEEDS, so closing a selection is a walk of
    // them; a cycle makes that walk infinite rather than merely wrong.
    for (const start of Object.keys(FRAGMENT_REQUIRES)) {
      const seen = new Set<string>();
      const queue = [...fragmentRequires(start)];

      while (queue.length > 0) {
        const next = queue.shift() as string;

        expect(next, `${start} requires a cycle through ${next}`).not.toBe(
          start,
        );

        if (seen.has(next)) continue;

        seen.add(next);
        queue.push(...fragmentRequires(next));
      }
    }
  });

  it("is satisfied by BOTH drivers for every fragment they include", () => {
    // Guards the built-in manifests themselves: a fragment whose prerequisite
    // the driver never includes would ship the broken subset by default. Both
    // drivers, because the notation edges differ per depth — checking only the
    // standard one leaves the basic graph's edges unguarded.
    for (const [depth, driver] of [
      ["standard", standardDriver],
      ["basic", basicDriver],
    ] as const) {
      // The refs are notation-templated; resolve them for each notation so a
      // `{notation}-basic-write` edge is compared against real fragment names.
      for (const notation of NOTATIONS) {
        const included = new Set(
          [
            ...driver
              .replaceAll("{notation}", notation)
              .matchAll(/@include\s+"\.\/([^"]+)\.md"/g),
          ].map((match) => match[1]),
        );

        for (const [name, requires] of Object.entries(FRAGMENT_REQUIRES)) {
          if (!included.has(name)) continue;

          for (const required of requires) {
            expect(
              included.has(required),
              `${depth}/${notation}: ${name} needs ${required}`,
            ).toBe(true);
          }
        }
      }
    }
  });
});

describe("the code-transforms edge", () => {
  // The edge that could not be written down while the table lived on the slot
  // registry: code-transforms has no override slot (it only carries text in a
  // code-execution build), yet it emits its `###` under transforms-core's `##`.
  const withoutTransformsCore = {
    fragments: {
      standard: standardDriver.replace(
        `@include "./transforms-core.md"\n\n`,
        "",
      ),
    },
  };

  it("warns when code exec is on and transforms-core is gone", () => {
    vi.stubEnv("ENABLE_CODE_EXEC", "true");

    const warnings: string[] = [];
    const result = buildSkills({}, withoutTransformsCore, (message) =>
      warnings.push(message),
    );

    expect(result).toContain("### Code Transforms"); // kept, and orphaned
    expect(warnings).toStrictEqual(
      expect.arrayContaining([
        expect.stringContaining(`"code-transforms" needs "transforms-core"`),
      ]),
    );
  });

  it("stays silent in a release build, where the section is empty", () => {
    // A present-but-empty fragment composed nothing, so it lost nothing.
    vi.stubEnv("ENABLE_CODE_EXEC", "");

    const warnings: string[] = [];

    buildSkills({}, withoutTransformsCore, (message) => warnings.push(message));

    expect(warnings.join("\n")).not.toContain("code-transforms");
  });
});

describe("fragmentRequires", () => {
  it("returns a fragment's edges, and nothing for one with none", () => {
    expect(fragmentRequires("devices-write")).toStrictEqual(["devices"]);
    expect(fragmentRequires("devices")).toStrictEqual([]);
  });

  it("returns nothing for an unknown or inherited name", () => {
    // A user's own fragment reaches this from an include ref; a bare index would
    // hand back Object.prototype.toString for a fragment named `toString`.
    expect(fragmentRequires("my-style")).toStrictEqual([]);
    expect(fragmentRequires("toString")).toStrictEqual([]);
  });
});
