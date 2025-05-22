// src/notation/midi-pitch-to-name.test.js
import { midiPitchToName } from "./midi-pitch-to-name";

describe("midiPitchToName", () => {
  it("converts valid midi pitch numbers to ToneLang-compatible strings", () => {
    expect(midiPitchToName(0)).toBe("C-2"); // Lowest valid MIDI pitch
    expect(midiPitchToName(60)).toBe("C3"); // Middle C
    expect(midiPitchToName(127)).toBe("G8"); // Highest valid MIDI pitch
  });

  it("uses flats for all pitch classes", () => {
    expect(midiPitchToName(60)).toBe("C3");
    expect(midiPitchToName(61)).toBe("Db3");
    expect(midiPitchToName(62)).toBe("D3");
    expect(midiPitchToName(63)).toBe("Eb3");
    expect(midiPitchToName(64)).toBe("E3");
    expect(midiPitchToName(65)).toBe("F3");
    expect(midiPitchToName(66)).toBe("Gb3");
    expect(midiPitchToName(67)).toBe("G3");
    expect(midiPitchToName(68)).toBe("Ab3");
    expect(midiPitchToName(69)).toBe("A3");
    expect(midiPitchToName(70)).toBe("Bb3");
    expect(midiPitchToName(71)).toBe("B3");
  });

  it("handles different octaves", () => {
    expect(midiPitchToName(0)).toBe("C-2");
    expect(midiPitchToName(1)).toBe("Db-2");
    expect(midiPitchToName(12)).toBe("C-1");
    expect(midiPitchToName(23)).toBe("B-1");
    expect(midiPitchToName(24)).toBe("C0");
    expect(midiPitchToName(36)).toBe("C1");
    expect(midiPitchToName(48)).toBe("C2");
    expect(midiPitchToName(72)).toBe("C4");
    expect(midiPitchToName(84)).toBe("C5");
    expect(midiPitchToName(96)).toBe("C6");
    expect(midiPitchToName(108)).toBe("C7");
    expect(midiPitchToName(120)).toBe("C8");
  });
});
