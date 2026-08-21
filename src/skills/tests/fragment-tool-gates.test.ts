// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { builtinFragments } from "#src/skills/builtin-fragments.ts";
import { FRAGMENT_REQUIRES } from "#src/skills/fragment-requires.ts";
import {
  FRAGMENT_GATES,
  audienceGatedFragments,
  fragmentGate,
  gatedOutFragments,
} from "#src/skills/fragment-tool-gates.ts";

// The driver roots are what gets assembled, not sections of the assembly, so
// they carry no gate.
const DRIVERS = new Set(["standard", "basic"]);

const ALL_TOOLS = [...TOOL_NAMES, "ppal-live-api"];

/**
 * The tools a fragment's gate names, or null when it ships unconditionally.
 *
 * @param name - Fragment name
 * @returns The gate's tool list, or null for an "always"/"conversation-only" gate
 */
function gateTools(name: string): readonly string[] | null {
  const gate = FRAGMENT_GATES[name];

  return gate == null || typeof gate === "string" ? null : gate;
}

/**
 * The tools a fragment's prose names.
 *
 * @param body - The fragment's assembled body
 * @returns Each distinct `ppal-` name in it
 */
function mentionedTools(body: string): string[] {
  return [...new Set(body.match(/ppal-[a-z-]+/g) ?? [])].toSorted();
}

// Fragments that name a tool outside their own gate ON PURPOSE: the handoff is
// the content. Both directions of library↔writers are here — a library result is
// only useful as an argument to something else.
const DELIBERATE_CROSS_REFERENCES: Record<string, readonly string[]> = {
  library: [
    "ppal-create-clip",
    "ppal-update-clip",
    "ppal-create-device",
    "ppal-update-device",
  ],
  "devices-write": ["ppal-library"],
};

// Bleed this test found and does not yet fix: guidance shipped to callers that
// can't act on it. Shrink toward empty as the splits land; an entry that stops
// bleeding must be deleted, which the "still bleeds" test below enforces.
const KNOWN_BLEED: Record<string, readonly string[]> = {
  // Pad operations named beside the chain trim they preserve: clearing a pad
  // before replacing its sample, and copying a whole pad rather than the device
  // inside it.
  "devices-write": ["ppal-delete", "ppal-duplicate"],
  // Take-lane clips refuse a delete the same way they refuse an update, so the
  // warning belongs beside the update-clip one it shares a sentence with.
  "arrangement-write": ["ppal-delete"],
};

// Tools no fragment gates on, and why. Most are here because their schema is
// the whole guide — there is no fragment to gate. Landing here is fine; landing
// here unnoticed is the bug, which is what the coverage test below prevents.
const TEACHES_NO_FRAGMENT: Record<string, string> = {
  "ppal-connect": "delivers the skills, and none of them teach it",
  "ppal-read-live-set": "its schema is the whole guide",
  "ppal-update-live-set": "its schema is the whole guide",
  "ppal-create-track": "its schema is the whole guide",
  "ppal-update-track": "its schema is the whole guide",
  "ppal-create-scene": "its schema is the whole guide",
  "ppal-update-scene": "its schema is the whole guide",
  "ppal-playback": "its schema is the whole guide",
  "ppal-live-api": "the dev-only escape hatch, deliberately unguided",
};

describe("FRAGMENT_GATES", () => {
  it("declares a gate for every fragment", () => {
    // Forces the decision when a fragment is added: no entry would silently mean
    // "always ships", which is exactly the waste this table exists to remove.
    const fragments = Object.keys(builtinFragments()).filter(
      (name) => !DRIVERS.has(name),
    );

    for (const name of fragments) {
      expect(FRAGMENT_GATES[name], `${name} has no gate`).toBeDefined();
    }
  });

  it("names only real tools", () => {
    for (const [name, gate] of Object.entries(FRAGMENT_GATES)) {
      if (typeof gate === "string") continue;

      expect(gate.length, `${name} gates on nothing`).toBeGreaterThan(0);

      for (const tool of gate) {
        expect(ALL_TOOLS, `${name} gates on unknown ${tool}`).toContain(tool);
      }
    }
  });

  it("gates on, or excuses, every tool in the catalog", () => {
    // The other direction of the check above, and the one a NEW tool trips. The
    // table is keyed by fragment, so a tool joins no gate unless someone adds it
    // to one: a note-taking tool that misses NOTE_TOOLS ships with no notation
    // guide wherever it is the only note tool enabled, and every test passes.
    const gated = new Set(
      Object.keys(FRAGMENT_GATES).flatMap((name) => gateTools(name) ?? []),
    );

    for (const tool of ALL_TOOLS) {
      expect(
        gated.has(tool) || Object.hasOwn(TEACHES_NO_FRAGMENT, tool),
        `${tool} joins no gate: add it to the fragments it teaches, or list it in TEACHES_NO_FRAGMENT with why`,
      ).toBe(true);
    }
  });

  it("excuses no tool that is gated or gone", () => {
    // Keeps the excuse list honest the way the prose allowances are kept honest:
    // a tool that gains a gate, or leaves the catalog, must lose its entry.
    for (const tool of Object.keys(TEACHES_NO_FRAGMENT)) {
      expect(ALL_TOOLS, `${tool} is not a tool`).toContain(tool);

      for (const [name, gate] of Object.entries(FRAGMENT_GATES)) {
        if (typeof gate === "string") continue;

        expect(
          gate,
          `${tool} is excused but ${name} gates on it`,
        ).not.toContain(tool);
      }
    }
  });

  it("gates a dependent no more widely than what it requires", () => {
    // THE invariant that lets gating skip a transitive close: if X requires Y,
    // every toolset that keeps X must keep Y. Violate it and gating reintroduces
    // the vocabulary-without-grammar failure `requires` exists to catch — the
    // model holding ratchet() and the waveforms with no transform syntax.
    for (const [name, requires] of Object.entries(FRAGMENT_REQUIRES)) {
      const gate = FRAGMENT_GATES[name];

      for (const required of requires) {
        const requiredGate = FRAGMENT_GATES[required];

        // "always" ships to every toolset and audience, so it satisfies anyone.
        if (requiredGate === "always") continue;

        // "conversation-only" survives a subagent audience only for another
        // "conversation-only" — a tool-gated dependent would outlive it there.
        if (requiredGate === "conversation-only") {
          expect(
            gate,
            `${name} outlives conversation-only ${required} for a worker`,
          ).toBe("conversation-only");
          continue;
        }

        // Tool-gated prerequisite: an unconditional dependent is the unsound
        // direction the old `continue` skipped — it ships to toolsets that have
        // already dropped what it depends on.
        expect(
          typeof gate,
          `${name} ships unconditionally but ${required} is tool-gated`,
        ).not.toBe("string");

        for (const tool of gateTools(name) ?? []) {
          expect(
            requiredGate,
            `${tool} keeps ${name} but drops ${required}`,
          ).toContain(tool);
        }
      }
    }
  });
});

describe("fragment prose", () => {
  // Code exec on, so the debug-only fragment is checked too.
  const fragments = Object.entries(builtinFragments(true)).filter(
    ([name]) => !DRIVERS.has(name),
  );

  it("names only tools its own gate keeps", () => {
    // A fragment that talks about a tool its gate doesn't name ships that
    // guidance to callers who can't act on it — the exact waste gating exists to
    // remove, arriving through prose instead of through the table.
    for (const [name, body] of fragments) {
      const allowed = new Set([
        ...(gateTools(name) ?? []),
        ...(DELIBERATE_CROSS_REFERENCES[name] ?? []),
        ...(KNOWN_BLEED[name] ?? []),
      ]);

      for (const tool of mentionedTools(body)) {
        expect(
          [...allowed],
          `${name} names ${tool}, which its gate drops`,
        ).toContain(tool);
      }
    }
  });

  it("names only real tools", () => {
    // Catches a typo'd tool name in skills prose, which nothing else would.
    for (const [name, body] of fragments) {
      for (const tool of mentionedTools(body)) {
        expect(ALL_TOOLS, `${name} names unknown ${tool}`).toContain(tool);
      }
    }
  });

  it("keeps deliberate cross-references rare", () => {
    // A gate is ANY-OF, so a cross-reference can never be gated exactly — it
    // wants "library AND a writer". A few are worth that; a pile of them means
    // the fragment cut is wrong and two fragments want to be one. Raising this
    // should be a decision, not a diff.
    const total = Object.values(DELIBERATE_CROSS_REFERENCES).reduce(
      (sum, tools) => sum + tools.length,
      0,
    );

    expect(total).toBeLessThanOrEqual(5);
  });

  it("lists no allowance that is no longer needed", () => {
    // Keeps both maps honest: a fragment that stops naming a tool, or a gate
    // widened to cover it, must lose its entry rather than quietly licensing the
    // next mention.
    const bodies = new Map(fragments);

    for (const map of [DELIBERATE_CROSS_REFERENCES, KNOWN_BLEED]) {
      for (const [name, tools] of Object.entries(map)) {
        const body = bodies.get(name);

        expect(body, `${name} is not a fragment`).toBeDefined();

        const mentions = mentionedTools(body ?? "");
        const gate = gateTools(name) ?? [];

        for (const tool of tools) {
          expect(mentions, `${name} no longer names ${tool}`).toContain(tool);
          expect(gate, `${name}'s gate now covers ${tool}`).not.toContain(tool);
        }
      }
    }
  });
});

describe("gatedOutFragments", () => {
  it("drops nothing when the toolset is unknown", () => {
    expect(gatedOutFragments().size).toBe(0);
  });

  it("drops nothing when every tool is enabled", () => {
    expect(gatedOutFragments(ALL_TOOLS).size).toBe(0);
  });

  it("keeps a fragment when ANY of its tools is enabled", () => {
    // devices gates on read/create/update-device; one is enough.
    expect(gatedOutFragments(["ppal-create-device"])).not.toContain("devices");
    expect(gatedOutFragments(["ppal-read-device"])).not.toContain("devices");
  });

  it("drops a fragment only when all of its tools are off", () => {
    const dropped = gatedOutFragments(["ppal-connect", "ppal-library"]);

    expect(dropped).toContain("devices");
    expect(dropped).toContain("transforms-core");
    expect(dropped).toContain("arrangement");
    expect(dropped).not.toContain("library");
  });

  it("never drops the always-on or conversation-only fragments", () => {
    const dropped = gatedOutFragments(["ppal-connect"]);

    expect(dropped).not.toContain("time-and-values");
    expect(dropped).not.toContain("working-with-live");
    expect(dropped).not.toContain("getting-help");
  });

  it("drops the notation heads only when nothing reads or writes notes", () => {
    expect(gatedOutFragments(["ppal-read-track"])).not.toContain(
      "barbeat-standard",
    );
    expect(gatedOutFragments(["ppal-playback"])).toContain("barbeat-standard");
  });

  it("keeps specialized-devices for any single device tool", () => {
    // The per-device pseudo-param catalog serves all three: building a Drift
    // needs the names as much as reading or updating one does. So each device
    // tool alone keeps both device fragments, and dropping them takes all three.
    for (const tool of [
      "ppal-create-device",
      "ppal-read-device",
      "ppal-update-device",
    ]) {
      const dropped = gatedOutFragments([tool]);

      expect(dropped, `${tool} should keep specialized-devices`).not.toContain(
        "specialized-devices",
      );
      expect(dropped, `${tool} should keep devices`).not.toContain("devices");
    }

    const noDeviceTools = gatedOutFragments(["ppal-playback"]);

    expect(noDeviceTools).toContain("specialized-devices");
    expect(noDeviceTools).toContain("devices");
  });

  it("keeps the path grammar for a tool that only addresses a device", () => {
    // select/delete/duplicate take a device path (`devicePath`, `path`,
    // `toPath`) without reading or building one, and `devices` is the only
    // place `rt`/`mt`/`c`/`rc` are written down. The per-device param catalog
    // is not their business and stays behind.
    for (const tool of ["ppal-select", "ppal-delete", "ppal-duplicate"]) {
      const dropped = gatedOutFragments([tool]);

      expect(dropped, `${tool} should keep devices`).not.toContain("devices");
      expect(dropped, `${tool} should drop specialized-devices`).toContain(
        "specialized-devices",
      );
    }
  });

  it("drops the device build recipes for a read-only device toolset", () => {
    // The direction split: a caller that can only read devices has no tool to
    // run a Simpler or Drum Rack build recipe with.
    expect(gatedOutFragments(["ppal-read-device"])).toContain("devices-write");
    expect(gatedOutFragments(["ppal-create-device"])).not.toContain(
      "devices-write",
    );
  });

  it("keeps arrangement for a read-only clip toolset, minus the placing half", () => {
    // read-clip returns arrangementStart, so a reader still needs the dual-meter
    // rule — but has no tool to move, split, or take-lane anything.
    const readOnly = gatedOutFragments(["ppal-read-clip"]);

    expect(readOnly).not.toContain("arrangement");
    expect(readOnly).toContain("arrangement-write");

    expect(gatedOutFragments(["ppal-duplicate"])).not.toContain(
      "arrangement-write",
    );
    expect(gatedOutFragments(["ppal-playback"])).toContain("arrangement");
  });

  it("keeps arrangement for read-track but not read-scene", () => {
    // read-track returns arrangementClips carrying arrangementStart; read-scene
    // reads clip slots only, so no arrangement position ever reaches it.
    expect(gatedOutFragments(["ppal-read-track"])).not.toContain("arrangement");
    expect(gatedOutFragments(["ppal-read-scene"])).toContain("arrangement");
  });
});

describe("audienceGatedFragments", () => {
  it("drops nothing when the audience is unknown or the user-facing chat", () => {
    expect(audienceGatedFragments().size).toBe(0);
    expect(audienceGatedFragments("chat").size).toBe(0);
  });

  it("drops every conversation-only fragment for a subagent worker", () => {
    const dropped = audienceGatedFragments("subagent");
    const conversationOnly = Object.keys(FRAGMENT_GATES).filter(
      (name) => FRAGMENT_GATES[name] === "conversation-only",
    );

    expect(conversationOnly.length).toBeGreaterThan(0);
    expect([...dropped].toSorted()).toStrictEqual(conversationOnly.toSorted());
  });

  it("drops nothing a toolset could have decided", () => {
    // The axis exists only for what no toolset can express. Anything with a
    // tool-list gate must be left to gatedOutFragments, or the two mechanisms
    // start disagreeing about the same fragment.
    for (const name of audienceGatedFragments("subagent")) {
      expect(gateTools(name)).toBeNull();
    }
  });

  it("drops no fragment another fragment requires", () => {
    // Audience-dropped fragments are leaves: guidance to relay, never syntax
    // something else builds on. If that stops being true, the subagent blob
    // starts shipping vocabulary whose grammar is gone — the exact failure
    // warnUnmetRequirements exists to catch, arriving without a user switch.
    const dropped = audienceGatedFragments("subagent");

    for (const requires of Object.values(FRAGMENT_REQUIRES)) {
      for (const required of requires) {
        expect(dropped).not.toContain(required);
      }
    }
  });
});

describe("fragmentGate", () => {
  it("uses only the two string gates the webui mirrors", () => {
    // webui hand-copies FragmentGate (it may only import #src/shared) and reads
    // an unrecognized value as "no gate" — silently, so nothing would fail.
    // A third literal here means updating SkillGate and toGate alongside it.
    const literals = Object.values(FRAGMENT_GATES).filter(
      (gate) => typeof gate === "string",
    );

    expect(new Set(literals)).toStrictEqual(
      new Set(["always", "conversation-only"]),
    );
  });

  it("returns each gate shape", () => {
    expect(fragmentGate("library")).toStrictEqual(["ppal-library"]);
    expect(fragmentGate("time-and-values")).toBe("always");
    expect(fragmentGate("getting-help")).toBe("conversation-only");
  });

  it("returns null for a driver root and for an unknown fragment", () => {
    expect(fragmentGate("standard")).toBeNull();
    expect(fragmentGate("no-such-fragment")).toBeNull();
  });

  it("returns null for an inherited Object property name", () => {
    // Names reach this from user text (an override filename), so a bare index
    // would hand back Object.prototype.toString — a function where a gate is
    // expected, which the editor would then try to render.
    expect(fragmentGate("toString")).toBeNull();
    expect(fragmentGate("constructor")).toBeNull();
  });
});
