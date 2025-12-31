import { describe, expect, it } from "vitest";
import { STATE } from "#src/tools/constants.js";
import { updateDrumPadSoloStates } from "./device-reader-drum-helpers.js";

describe("device-reader-drum-helpers", () => {
  describe("updateDrumPadSoloStates", () => {
    it("should not modify pads when none are soloed", () => {
      const drumPads = [
        { note: 36, pitch: "C1", name: "Kick" },
        { note: 37, pitch: "C#1", name: "Snare" },
      ];

      updateDrumPadSoloStates(drumPads);

      expect(drumPads[0].state).toBeUndefined();
      expect(drumPads[1].state).toBeUndefined();
    });

    it("should keep soloed pads as soloed and mute others via solo", () => {
      const drumPads = [
        { note: 36, pitch: "C1", name: "Kick", state: STATE.SOLOED },
        { note: 37, pitch: "C#1", name: "Snare" },
        { note: 38, pitch: "D1", name: "Clap" },
      ];

      updateDrumPadSoloStates(drumPads);

      expect(drumPads[0].state).toBe(STATE.SOLOED);
      expect(drumPads[1].state).toBe(STATE.MUTED_VIA_SOLO);
      expect(drumPads[2].state).toBe(STATE.MUTED_VIA_SOLO);
    });

    it("should mark already-muted pads as muted_also_via_solo when others are soloed", () => {
      const drumPads = [
        { note: 36, pitch: "C1", name: "Kick", state: STATE.SOLOED },
        { note: 37, pitch: "C#1", name: "Snare", state: STATE.MUTED },
        { note: 38, pitch: "D1", name: "Clap" },
      ];

      updateDrumPadSoloStates(drumPads);

      expect(drumPads[0].state).toBe(STATE.SOLOED);
      expect(drumPads[1].state).toBe(STATE.MUTED_ALSO_VIA_SOLO);
      expect(drumPads[2].state).toBe(STATE.MUTED_VIA_SOLO);
    });

    it("should handle multiple soloed pads", () => {
      const drumPads = [
        { note: 36, pitch: "C1", name: "Kick", state: STATE.SOLOED },
        { note: 37, pitch: "C#1", name: "Snare", state: STATE.SOLOED },
        { note: 38, pitch: "D1", name: "Clap" },
      ];

      updateDrumPadSoloStates(drumPads);

      expect(drumPads[0].state).toBe(STATE.SOLOED);
      expect(drumPads[1].state).toBe(STATE.SOLOED);
      expect(drumPads[2].state).toBe(STATE.MUTED_VIA_SOLO);
    });

    it("should not modify pads when only muted pads exist", () => {
      const drumPads = [
        { note: 36, pitch: "C1", name: "Kick", state: STATE.MUTED },
        { note: 37, pitch: "C#1", name: "Snare" },
      ];

      updateDrumPadSoloStates(drumPads);

      expect(drumPads[0].state).toBe(STATE.MUTED);
      expect(drumPads[1].state).toBeUndefined();
    });
  });
});
