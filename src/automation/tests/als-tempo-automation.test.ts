// src/automation/tests/als-tempo-automation.test.ts
import { describe, it, expect } from "vitest";
import { assertNoSlice6bInput } from "#src/automation/als-tempo-automation.ts";

describe("Slice-6b-Hartsperre", () => {
  it("wirft bei Time-Signature-Eingabe mit 'Slice 6b' im Text", () => {
    expect(() => assertNoSlice6bInput({ timeSignature: "3/4" })).toThrow(
      /Slice 6b/,
    );
  });
  it("wirft bei Curve-Flag-Eingabe mit 'Slice 6b' im Text", () => {
    expect(() => assertNoSlice6bInput({ curve: true })).toThrow(/Slice 6b/);
  });
  it("passiert bei reiner linearer Tempo-Eingabe", () => {
    expect(() => assertNoSlice6bInput({})).not.toThrow();
  });
});

describe("G6-gated: byte-belegte Master-Tempo-Automation", () => {
  // Recon-Gate G6 offen: Ground-Truth aus User-Before/After-.als ableiten,
  // dann docs/superpowers/fixtures/ableton12-tempo-automation-groundtruth.xml.
  it.todo("locateMasterTrackAutomationBlock findet Master-Platzhalter");
  it.todo("locateMasterTrackAutomationBlock wirft bei gefülltem Platzhalter");
  it.todo("resolveMasterTempoTargetId liefert die Tempo-PointeeId");
  it.todo("injectTempoEnvelope erzeugt byte-treues Envelope vs. G6-Fixture");
  it.todo("injectTempoEnvelope ändert nur den Master-Block (Mitigation-B)");
});
