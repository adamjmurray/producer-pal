// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The two suppression axes that come from the RUNTIME rather than from the user:
// which tools this caller can reach, and who is listening. They share a file
// because they share the mechanism (both empty a fragment through the same
// `suppressed` set in buildSkills) and because build-skills.test.ts is at the
// test-file line cap.

import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { assembleSkills, buildSkills } from "#src/skills/build-skills.ts";

const HEADER = "# Producer Pal Skills";

describe("buildSkills - tool gating", () => {
  const ALL_TOOLS = [...TOOL_NAMES];

  it("ships everything when the toolset is not supplied", () => {
    expect(buildSkills({ notation: "barbeat" })).toBe(
      buildSkills({ notation: "barbeat", tools: ALL_TOOLS }),
    );
  });

  it("drops a section whose every tool is off, and says nothing about it", () => {
    // Disabling a tool is a setting, not a broken document — no warning.
    const warnings: string[] = [];
    const result = buildSkills(
      {
        notation: "barbeat",
        tools: ALL_TOOLS.filter((name) => name !== "ppal-library"),
      },
      {},
      (message) => warnings.push(message),
    );

    expect(result).not.toContain("## Finding Library Content");
    expect(result).toContain("## Devices & Instruments");
    expect(warnings).toStrictEqual([]);
  });

  it("drops a user's override of a gated fragment too", () => {
    // The override slot is named for the fragment's subject, so a customized
    // library guide is exactly as dead as the built-in when the tool is off.
    const result = buildSkills(
      {
        notation: "barbeat",
        tools: ALL_TOOLS.filter((name) => name !== "ppal-library"),
      },
      { fragments: { library: "MY LIBRARY NOTES" } },
    );

    expect(result).not.toContain("MY LIBRARY NOTES");
  });

  it("drops a dependent together with what it requires, never alone", () => {
    const warnings: string[] = [];
    const result = buildSkills(
      {
        notation: "barbeat",
        tools: ALL_TOOLS.filter((name) => !name.endsWith("-device")),
      },
      {},
      (message) => warnings.push(message),
    );

    expect(result).not.toContain("## Devices & Instruments");
    expect(result).not.toContain("### Specialized Device Controls");
    expect(warnings).toStrictEqual([]);
  });

  it("cuts the blob down to the conversational core for a minimal toolset", () => {
    const full = buildSkills({ notation: "barbeat", tools: ALL_TOOLS });
    const minimal = buildSkills({
      notation: "barbeat",
      tools: ["ppal-connect", "ppal-playback", "ppal-select"],
    });

    expect(minimal).toContain("## Time & Note Values");
    expect(minimal).toContain("## Working with Ableton Live");
    expect(minimal).toContain("## Getting Help");
    expect(minimal).not.toContain("## Positions & Meter"); // bar|beat head
    expect(minimal).not.toContain("## Transforms");
    expect(minimal).not.toContain("## Context & Memory");
    expect(minimal.length).toBeLessThan(full.length / 2);
  });

  it("keeps the note format but drops the authoring half for a read-only caller", () => {
    // The case the notation-head split exists for: a worker that reads clips
    // needs the grammar to PARSE what read-clip returns, and none of the sugar a
    // serializer never emits. Silent, like any gating — nothing is broken.
    const warnings: string[] = [];
    const result = buildSkills(
      {
        notation: "barbeat",
        tools: ["ppal-read-clip", "ppal-read-track", "ppal-read-scene"],
      },
      {},
      (message) => warnings.push(message),
    );

    expect(result).toContain("## Positions & Meter");
    expect(result).toContain("## MIDI Syntax");
    expect(result).not.toContain("## Writing Notes");
    expect(result).not.toContain("**Pattern brackets**");
    expect(result).not.toContain("### Bar Copying");
    expect(warnings).toStrictEqual([]);
  });

  it("states the octave convention for a toolset with no notation head", () => {
    // Device paths (`pC1`) and transform selectors (`C3:`) name pitches, but
    // both are gated wider than the notation heads that used to be the only
    // place saying Live counts octaves from C3=60. Under the MIDI-standard
    // convention C1 is 24 rather than 36 — a device build a full octave off.
    for (const tools of [
      ["ppal-create-device", "ppal-read-device"],
      ["ppal-duplicate"],
    ]) {
      const result = buildSkills({ notation: "barbeat", tools });

      expect(result, `${tools.join()} kept a notation head`).not.toContain(
        "## MIDI Syntax",
      );
      expect(result, `${tools.join()} lost the octave convention`).toContain(
        "C3 = MIDI 60",
      );
    }
  });

  it("names no update-clip-only parameter to a caller without update-clip", () => {
    // Vocabulary without grammar, the version gating can create on its own: the
    // notation heads and the bar|beat write half all used to point at
    // `preTransforms` while the fragment that DEFINES it is gated on update-clip
    // alone, so a read-only or create-clip-only caller was told to reach for a
    // parameter its schema doesn't have. It can't be recorded in
    // FRAGMENT_REQUIRES either — that edge would fail the subset test, which is
    // itself the signal the two gates disagree.
    const withoutUpdate = ALL_TOOLS.filter((n) => n !== "ppal-update-clip");

    for (const notation of ["barbeat", "stark", "midi-json"] as const) {
      for (const smallModelMode of [false, true]) {
        const result = buildSkills({
          notation,
          smallModelMode,
          tools: withoutUpdate,
        });

        expect(result, `${notation} ${smallModelMode}`).not.toContain(
          "preTransforms",
        );
        expect(result, `${notation} ${smallModelMode}`).not.toContain(
          "quantizeGrid",
        );
      }
    }
  });

  it("keeps the merge rule for update-clip, in every notation", () => {
    // The other half of the move: it left three notation heads, so it has to
    // arrive exactly once for anyone who can actually merge into a clip.
    for (const notation of ["barbeat", "stark", "midi-json"] as const) {
      const result = buildSkills({ notation, tools: ["ppal-update-clip"] });

      expect(result, `${notation} lost the editing section`).toContain(
        "### Editing Notes Already in a Clip",
      );
      expect(result, `${notation} lost the merge rule`).toContain("MERGES");
    }
  });

  it("keeps both halves for anything that can write a clip", () => {
    // Either writer alone is enough, and each keeps the base head it builds on —
    // the requires-subset invariant, seen from the assembled document.
    for (const tool of ["ppal-create-clip", "ppal-update-clip"]) {
      const result = buildSkills({ notation: "barbeat", tools: [tool] });

      expect(result, `${tool} lost the note format`).toContain(
        "## Positions & Meter",
      );
      expect(result, `${tool} lost the authoring half`).toContain(
        "## Writing Notes",
      );
    }
  });

  it("leaves an unsplit notation head whole, with no gap where its write half would be", () => {
    // stark and midi-json register an EMPTY `-write` fragment so the driver's
    // notation-templated ref resolves. That must read as one clean section
    // break, not a stack of blank lines, and must never warn.
    for (const notation of ["stark", "midi-json"] as const) {
      const warnings: string[] = [];
      const result = buildSkills(
        { notation, tools: ALL_TOOLS },
        {},
        (message) => warnings.push(message),
      );

      expect(result, `${notation} lost its head`).toContain("## MIDI Notation");
      expect(result, `${notation} stacked blank lines`).not.toMatch(/\n{3,}/);
      expect(warnings, `${notation} warned`).toStrictEqual([]);
    }
  });

  it("gates the small-model document the same way", () => {
    const result = buildSkills({
      smallModelMode: true,
      tools: ALL_TOOLS.filter((name) => name !== "ppal-context"),
    });

    expect(result).toContain(HEADER);
    expect(result).not.toContain("## Context");
  });

  it("drops the small-model preTransforms guide without update-clip", () => {
    // The narrow-toolset case gating exists for: a worker that reads notes and
    // creates clips has no `preTransforms` (an update-clip parameter alone), but
    // still needs the notation head it shares with the read tools.
    const result = buildSkills({
      smallModelMode: true,
      tools: ALL_TOOLS.filter((name) => name !== "ppal-update-clip"),
    });

    expect(result).not.toContain("## Editing a clip that already has notes");
    expect(result).toContain("## MIDI Notation");
    expect(result).toContain("## Rules");
  });
});

describe("buildSkills - audience gating", () => {
  const ALL_TOOLS = [...TOOL_NAMES];

  it("ships everything when the audience is not supplied", () => {
    expect(buildSkills({ notation: "barbeat", tools: ALL_TOOLS })).toBe(
      buildSkills({ notation: "barbeat", tools: ALL_TOOLS, audience: "chat" }),
    );
  });

  it("drops the conversation-only guidance for a subagent worker", () => {
    // A worker has no user to explain a limitation to, and no toolset could
    // ever have said so — Getting Help maps to no tool at all.
    const warnings: string[] = [];
    const result = buildSkills(
      { notation: "barbeat", tools: ALL_TOOLS, audience: "subagent" },
      {},
      (message) => warnings.push(message),
    );

    expect(result).not.toContain("## Getting Help");
    expect(result).toContain("## Working with Ableton Live");
    expect(warnings).toStrictEqual([]);
  });

  it("composes with tool gating rather than replacing it", () => {
    const result = buildSkills({
      notation: "barbeat",
      tools: ALL_TOOLS.filter((name) => name !== "ppal-library"),
      audience: "subagent",
    });

    expect(result).not.toContain("## Getting Help");
    expect(result).not.toContain("## Finding Library Content");
    expect(result).toContain("## Devices & Instruments");
  });

  it("drops a user's override of an audience-gated fragment too", () => {
    // Same rule as tool gating: suppression runs AFTER the override lookup, so
    // a customized fragment is exactly as absent as the built-in.
    const result = buildSkills(
      { notation: "barbeat", tools: ALL_TOOLS, audience: "subagent" },
      { fragments: { "getting-help": "MY HELP NOTES" } },
    );

    expect(result).not.toContain("MY HELP NOTES");
  });

  it("gates the small-model document the same way", () => {
    const result = buildSkills({
      smallModelMode: true,
      tools: ALL_TOOLS,
      audience: "subagent",
    });

    expect(result).toContain(HEADER);
  });
});

describe("assembleSkills - dropped fragments", () => {
  const ALL_TOOLS = [...TOOL_NAMES];

  it("reports nothing when no gate fires", () => {
    expect(assembleSkills({ tools: ALL_TOOLS }).dropped).toStrictEqual([]);
  });

  it("names the fragments a disabled tool emptied", () => {
    const { dropped } = assembleSkills({
      notation: "barbeat",
      tools: ALL_TOOLS.filter((name) => name !== "ppal-library"),
    });

    expect(dropped).toContain("library");
    expect(dropped).not.toContain("devices");
  });

  it("names an audience-dropped fragment too", () => {
    const { dropped } = assembleSkills({
      tools: ALL_TOOLS,
      audience: "subagent",
    });

    expect(dropped).toStrictEqual(["getting-help"]);
  });

  it("omits fragments this document never referenced", () => {
    // transforms-basic belongs to the small-model driver, so the standard
    // document dropping nothing of the sort is the point: the preview must not
    // list sections that were never on the table.
    const { dropped } = assembleSkills({ tools: [] });

    expect(dropped).not.toContain("transforms-basic");
    expect(dropped).toContain("transforms-core");
  });

  it("omits a fragment the USER switched off", () => {
    // Their own off switch already shows as an unchecked box; only gating has
    // nothing on screen to explain it.
    const { dropped } = assembleSkills(
      { tools: ALL_TOOLS },
      {
        disabled: ["library"],
      },
    );

    expect(dropped).toStrictEqual([]);
  });

  it("returns the same string buildSkills does", () => {
    const options = { notation: "stark", tools: ALL_TOOLS } as const;

    expect(assembleSkills(options).skills).toBe(buildSkills(options));
  });
});
