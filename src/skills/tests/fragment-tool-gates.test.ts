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
