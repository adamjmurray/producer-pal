// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { builtinFragments } from "#src/skills/builtin-fragments.ts";
import {
  FRAGMENT_GATES,
  audienceGatedFragments,
  fragmentGate,
  gatedOutFragments,
} from "#src/skills/fragment-tool-gates.ts";
import { SKILL_SLOT_NAMES, SKILL_SLOTS } from "#src/skills/skill-slots.ts";

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
  return [...new Set(body.match(/ppal-[a-z-]+/g) ?? [])].sort();
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
  // The plug-in editor window is the one thing in `devices` that isn't a device
  // tool, and it belongs with the limits it qualifies.
  devices: ["ppal-select"],
  // Clearing a pad before replacing its sample.
  "devices-write": ["ppal-delete"],
  arrangement: ["ppal-delete"],
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

  it("gates a dependent no more widely than what it requires", () => {
    // THE invariant that lets gating skip a transitive close: if X requires Y,
    // every toolset that keeps X must keep Y. Violate it and gating reintroduces
    // the vocabulary-without-grammar failure `requires` exists to catch — the
    // model holding ratchet() and the waveforms with no transform syntax.
    for (const name of SKILL_SLOT_NAMES) {
      const gate = gateTools(name);

      if (gate == null) continue;

      for (const required of SKILL_SLOTS[name].requires ?? []) {
        const requiredGate = gateTools(required);

        if (requiredGate == null) continue;

        for (const tool of gate) {
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

  it("drops the device build recipes for a read-only device toolset", () => {
    // The direction split: a caller that can only read devices has no tool to
    // run a Simpler or Drum Rack build recipe with.
    expect(gatedOutFragments(["ppal-read-device"])).toContain("devices-write");
    expect(gatedOutFragments(["ppal-create-device"])).not.toContain(
      "devices-write",
    );
  });

  it("keeps arrangement for a read-only clip toolset", () => {
    // Arrangement positions come back through read-clip, so a caller that only
    // reads still needs to make sense of them.
    expect(gatedOutFragments(["ppal-read-clip"])).not.toContain("arrangement");
    expect(gatedOutFragments(["ppal-playback"])).toContain("arrangement");
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
    expect([...dropped].sort()).toStrictEqual(conversationOnly.sort());
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

    for (const name of SKILL_SLOT_NAMES) {
      for (const required of SKILL_SLOTS[name].requires ?? []) {
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
