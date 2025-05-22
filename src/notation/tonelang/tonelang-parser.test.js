// src/notation/tonelang/tonelang-parser.test.js
import { describe, expect, it } from "vitest";
import * as parser from "./tonelang-parser";

describe("ToneLang Parser", () => {
  it("parses simple notes", () => {
    const ast = parser.parse("C3 D3 E3");
    expect(ast.length).toBe(1); // One voice
    expect(ast[0].length).toBe(3); // Three notes

    const [note1, note2, note3] = ast[0];
    expect(note1.type).toBe("note");
    expect(note1.pitch).toBe(60);
    expect(note1.name).toBe("C3");

    expect(note2.pitch).toBe(62);
    expect(note3.pitch).toBe(64);
  });

  it("parses multiple voices", () => {
    const ast = parser.parse("C3 D3; E3 F3");
    expect(ast.length).toBe(2); // Two voices

    expect(ast[0][0].name).toBe("C3");
    expect(ast[0][1].name).toBe("D3");
    expect(ast[1][0].name).toBe("E3");
    expect(ast[1][1].name).toBe("F3");
  });

  it("parses notes with modifiers", () => {
    const ast = parser.parse("C3v80n2t3");
    const note = ast[0][0];

    expect(note.velocity).toBe(80);
    expect(note.duration).toBe(2);
    expect(note.timeUntilNext).toBe(3);
  });

  it("parses chords", () => {
    const ast = parser.parse("[C3 E3 G3]v90");
    const chord = ast[0][0];

    expect(chord.type).toBe("chord");
    expect(chord.notes.length).toBe(3);
    expect(chord.velocity).toBe(90);
  });

  it("parses groupings and repetition", () => {
    const ast = parser.parse("(C3 D3)v80*2");
    const repetition = ast[0][0];

    expect(repetition.type).toBe("repetition");
    expect(repetition.repeat).toBe(2);

    const grouping = repetition.content[0];
    expect(grouping.type).toBe("grouping");
    expect(grouping.velocity).toBe(80);
    expect(grouping.content.length).toBe(2);
  });
});
