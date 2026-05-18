// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import {
  getModulationEnvelopes,
  injectModulationEnvelope,
  resolveModulationTargetId,
  resolveModulationTargetIdFromAuto,
} from "#src/automation/als-modulation-writer.ts";

const BEFORE =
  "e2e/live-sets/mod-fixtures/mod-fixture-before Project/mod-fixture-before.als";
const AFTER =
  "e2e/live-sets/mod-fixtures/mod-fixture-after Project/mod-fixture-after.als";

describe("resolveModulationTargetId", () => {
  it("liefert die adjazente ModulationTarget-Id (22678) fuer Operator Frequency", () => {
    const xml = readAls(BEFORE);

    expect(resolveModulationTargetId(xml, "1-Operator", 0, "Frequency")).toBe(
      "22678",
    );
  });

  it("wirft wenn Param kein ModulationTarget hat", () => {
    // Param-Element ohne <ModulationTarget> direkt nach <AutomationTarget>.
    const xml =
      '<Foo><AutomationTarget Id="9"><LockEnvelope Value="0" /></AutomationTarget></Foo>';

    // resolveModulationTargetIdFromAuto deckt den ModulationTarget-Zweig
    // fokussiert ab, ohne resolveAutomationTargetId zu durchlaufen.
    expect(() => resolveModulationTargetIdFromAuto(xml, "9")).toThrow(
      /ModulationTarget/,
    );
  });

  it("wirft fuer realen nicht-modulierbaren Param statt fremdes ModulationTarget zu liefern (Stage-1-CRITICAL: tempered Quantifier)", () => {
    // 22676 = Slope (AutomationTarget, KEIN direkt folgendes
    // ModulationTarget). Der ungebundene Lazy-Quantifier lieferte vorher
    // faelschlich 22678 (Frequency) — Silent-Mis-Target. Muss werfen.
    const xml = readAls(BEFORE);

    expect(() => resolveModulationTargetIdFromAuto(xml, "22676")).toThrow(
      /nicht modulierbar/,
    );
    // Positivfall bleibt korrekt.
    expect(resolveModulationTargetIdFromAuto(xml, "22677")).toBe("22678");
  });
});

describe("injectModulationEnvelope", () => {
  it("fuegt ClipEnvelope mit ModulationTarget-PointeeId + bipolaren FloatEvents ein", () => {
    const xml = readAls(BEFORE);
    const out = injectModulationEnvelope(xml, "ModClip", "22678", [
      { time: 0, value: -0.8 },
      { time: 4, value: 0.5 },
    ]);
    const env = getModulationEnvelopes(out, "ModClip");

    expect(env).toHaveLength(1);
    expect(env[0]?.pointeeId).toBe("22678");
    // Id-tolerant: nur Time/Value-Paare (Anker -63072000 + 2 BPs).
    expect(env[0]?.points).toStrictEqual([
      { time: -63072000, value: -0.8 },
      { time: 0, value: -0.8 },
      { time: 4, value: 0.5 },
    ]);
  });

  it("wirft wenn Clip bereits Envelopes hat (AFTER-Fixture)", () => {
    const xml = readAls(AFTER);

    expect(() =>
      injectModulationEnvelope(xml, "ModClip", "22678", [
        { time: 0, value: 0 },
      ]),
    ).toThrow();
  });
});

describe("getModulationEnvelopes", () => {
  it("liest die Modulation-Huellkurve aus AFTER (PointeeId 22678, 11 Events)", () => {
    const xml = readAls(AFTER);
    const env = getModulationEnvelopes(xml, "ModClip");

    expect(env).toHaveLength(1);
    expect(env[0]?.pointeeId).toBe("22678");
    expect(env[0]?.points.length).toBe(11);
    expect(env[0]?.points[0]).toStrictEqual({
      time: -63072000,
      value: 0.7872340679,
    });
  });

  it("leer wenn Clip keine Envelopes (BEFORE)", () => {
    expect(getModulationEnvelopes(readAls(BEFORE), "ModClip")).toStrictEqual(
      [],
    );
  });
});
