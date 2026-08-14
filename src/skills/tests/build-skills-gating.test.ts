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
    // Dropping `devices` takes the device tools AND the three that only address
    // a device by path — the gate is any-of, so one survivor keeps the grammar.
    const pathOnly = new Set(["ppal-select", "ppal-delete", "ppal-duplicate"]);
    const warnings: string[] = [];
    const result = buildSkills(
      {
        notation: "barbeat",
        tools: ALL_TOOLS.filter(
          (name) => !name.endsWith("-device") && !pathOnly.has(name),
        ),
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
        "C3 = middle C = MIDI 60",
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

  it("keeps the editing pipeline for update-clip, in every notation", () => {
    // The other half of the move: it left three notation heads, so it has to
    // arrive exactly once for anyone who can actually merge into a clip. The
    // merge rule itself is the `notes` param's now — what stays here is the
    // pipeline, which no single schema can state.
    for (const notation of ["barbeat", "stark", "midi-json"] as const) {
      const result = buildSkills({ notation, tools: ["ppal-update-clip"] });

      expect(result, `${notation} lost the editing section`).toContain(
        "### Editing Notes Already in a Clip",
      );
      expect(result, `${notation} lost the pipeline`).toContain(
        "preTransforms → notes (merge) → transforms",
      );
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
    // midi-json registers an EMPTY `-write` fragment at BOTH depths so the
    // drivers' notation-templated refs resolve. That must read as one clean
    // section break, not a stack of blank lines, and must never warn.
    for (const smallModelMode of [false, true]) {
      const warnings: string[] = [];
      const result = buildSkills(
        { notation: "midi-json", smallModelMode, tools: ALL_TOOLS },
        {},
        (message) => warnings.push(message),
      );

      expect(result, `${smallModelMode} lost its head`).toContain(
        "## MIDI Notation",
      );
      expect(result, `${smallModelMode} stacked blank lines`).not.toMatch(
        /\n{3,}/,
      );
      expect(warnings, `${smallModelMode} warned`).toStrictEqual([]);
    }
  });

  it("keeps the note format but drops the authoring half in small-model mode too", () => {
    // Direction and depth are independent axes. A small-model subagent that only
    // reads clips is precisely the caller the carve serves, and at this size the
    // authoring half is a third of bar|beat's document — so the read/write gate
    // has to hold here, not just at standard depth.
    const readOnly = ["ppal-read-clip", "ppal-read-track", "ppal-read-scene"];
    const warnings: string[] = [];
    const barbeat = buildSkills(
      { notation: "barbeat", smallModelMode: true, tools: readOnly },
      {},
      (message) => warnings.push(message),
    );
    const stark = buildSkills({
      notation: "stark",
      smallModelMode: true,
      tools: readOnly,
    });

    expect(barbeat).toContain("## MIDI Notation");
    expect(barbeat).not.toContain("## Generate notes");
    expect(stark).toContain("## MIDI Notation — Stark");
    expect(stark).not.toContain("## Writing Notes");
    expect(warnings).toStrictEqual([]);
  });

  it("keeps both halves at both depths for anything that can write a clip", () => {
    for (const tool of ["ppal-create-clip", "ppal-update-clip"]) {
      const barbeat = buildSkills({
        notation: "barbeat",
        smallModelMode: true,
        tools: [tool],
      });
      const stark = buildSkills({ notation: "stark", tools: [tool] });

      expect(barbeat, `${tool} lost the examples`).toContain(
        "## Generate notes",
      );
      expect(stark, `${tool} lost the chord symbols`).toContain(
        "## Writing Notes",
      );
    }
  });

  it("teaches no chord symbol to a stark caller that can't write one", () => {
    // The seam stark's carve turns on: the serializer realizes every symbol to
    // literal pitches and never emits a `chords:` line, so a read-back provably
    // contains none of this. The Voicings bullet used to demonstrate brackets
    // with `chords: Cm7 [Eb G C']` — a symbol left dangling on the read side
    // once the vocabulary that defines it moved.
    for (const smallModelMode of [false, true]) {
      const result = buildSkills({
        notation: "stark",
        smallModelMode,
        tools: ["ppal-read-clip"],
      });

      expect(result, `${smallModelMode} kept a chord symbol`).not.toContain(
        "Cm7",
      );
      expect(result, `${smallModelMode} kept the quality list`).not.toContain(
        "sus4",
      );
    }
  });

  it("teaches the comma beat list to a small-model caller that can only read", () => {
    // The serializer comma-merges repeated pitches, so a read-back contains
    // `1|1,3` whether or not the caller can write. The rule used to live in the
    // authoring half, glossed inside the drums example, which gated it away from
    // exactly the caller that has to parse it.
    const result = buildSkills({
      notation: "barbeat",
      smallModelMode: true,
      tools: ["ppal-read-clip"],
    });

    expect(result).toContain("comma-separated list");
    expect(result).not.toContain("## Generate notes");
  });

  it("teaches the repeat pattern to a caller that can only read", () => {
    // The drum serializer collapses evenly-spaced hits, so a Drum Rack read-back
    // contains `1|1x16`. Only a writer can choose to author one, but everyone has
    // to parse one — so the form is defined on the read side, and only the
    // authoring gotchas are gated.
    const result = buildSkills({
      notation: "barbeat",
      tools: ["ppal-read-clip"],
    });

    expect(result).toContain("repeat pattern");
    expect(result).not.toContain("## Writing Notes");
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

  it("defines the selector syntax it teaches, in every notation", () => {
    // The small-model document leaves out time-and-values, so the selector
    // examples (`3|*`, `C1-C5`) have to carry their own definition. Stark times
    // notes by token position and midi-json by a 0-indexed `t` — under either,
    // an unglossed bar|beat range is not just undefined but contradicted.
    for (const notation of ["barbeat", "stark", "midi-json"] as const) {
      const result = buildSkills({ notation, smallModelMode: true });

      expect(result, `${notation} lost the selectors`).toContain("`3|*`");
      expect(result, `${notation} lost bar|beat`).toContain(
        "**bar|beat** positions counting from 1",
      );
      expect(result, `${notation} lost the octave convention`).toContain(
        "C3 = middle C = 60",
      );
    }
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
