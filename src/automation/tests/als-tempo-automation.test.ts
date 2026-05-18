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
