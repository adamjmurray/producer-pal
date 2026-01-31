import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { createNote } from "#src/test/test-data-builders.ts";

describe("bar|beat interpretNotation() - advanced bar copy", () => {
  describe("bar copy", () => {
    describe("multi-bar source range tiling", () => {
      it("tiles 2-bar pattern evenly across 8 bars (@3-10=1-2)", () => {
        const result = interpretNotation("C3 1|1 D3 2|1 @3-10=1-2");

        // Should have: bar 1 (C3), bar 2 (D3), bars 3-10 (4 complete tiles of C3+D3)
        expect(result).toHaveLength(10); // 1 + 1 + 8 = 10 notes

        // Bar 1: C3
        expect(result[0]).toStrictEqual(createNote());
        // Bar 2: D3
        expect(result[1]).toStrictEqual(
          createNote({ pitch: 62, start_time: 4 }),
        );
        // Bar 3: C3 (tile starts)
        expect(result[2]).toStrictEqual(createNote({ start_time: 8 }));
        // Bar 4: D3
        expect(result[3]).toStrictEqual(
          createNote({ pitch: 62, start_time: 12 }),
        );
        // Bar 10: D3 (last bar of 4th tile)
        expect(result[9]).toStrictEqual(
          createNote({ pitch: 62, start_time: 36 }),
        );
      });

      it("tiles 2-bar pattern unevenly across 7 bars (@3-9=1-2)", () => {
        const result = interpretNotation("C3 1|1 D3 2|1 @3-9=1-2");

        // Should have: bar 1 (C3), bar 2 (D3), bars 3-9 (3 complete tiles + 1 partial = 7 notes)
        expect(result).toHaveLength(9); // 1 + 1 + 7 = 9 notes

        // Bar 9 should be C3 (partial tile, only bar 1 of the pattern)
        expect(result[8]).toStrictEqual(createNote({ start_time: 32 }));
      });

      it("truncates source when destination is smaller (@3-4=1-5)", () => {
        const result = interpretNotation(
          "C3 1|1 D3 2|1 E3 3|1 F3 4|1 G3 5|1 @6-7=1-5",
        );

        // Should have: bars 1-5 (original), bars 6-7 (only C3 and D3 from the 5-bar source)
        expect(result).toHaveLength(7); // 5 + 2 = 7 notes

        // Bar 6: C3
        expect(result[5]).toStrictEqual(createNote({ start_time: 20 }));
        // Bar 7: D3
        expect(result[6]).toStrictEqual(
          createNote({ pitch: 62, start_time: 24 }),
        );
      });

      it("skips overlapping source bars in destination (@3-10=5-6)", () => {
        const result = interpretNotation("C3 5|1 D3 6|1 @3-10=5-6");

        // Should have: bar 5 (C3), bar 6 (D3), bars 3,4,7,8,9,10 (tiles, skipping 5,6)
        expect(result).toHaveLength(8); // 2 original + 6 copied

        // Verify no duplicates by checking all start_times
        const startTimes = result
          .map((note) => note.start_time)
          .sort((a, b) => a - b);

        expect(startTimes).toStrictEqual([
          8, // bar 3
          12, // bar 4
          16, // bar 5 (original, not duplicated)
          20, // bar 6 (original, not duplicated)
          24, // bar 7
          28, // bar 8
          32, // bar 9
          36, // bar 10
        ]);

        // Verify specific bars for correctness
        // Bar 3: C3
        expect(result[2]).toStrictEqual(createNote({ start_time: 8 }));
        // Bar 4: D3
        expect(result[3]).toStrictEqual(
          createNote({ pitch: 62, start_time: 12 }),
        );
        // Bar 7: C3 (after skipping bars 5 and 6)
        expect(result[4]).toStrictEqual(createNote({ start_time: 24 }));
      });

      it("skips overlapping source bars at beginning of destination (@1-10=3-4)", () => {
        const result = interpretNotation("C3 3|1 D3 4|1 @1-10=3-4");

        // Should have: bar 3 (C3), bar 4 (D3), bars 1,2,5,6,7,8,9,10 (tiles, skipping 3,4)
        expect(result).toHaveLength(10); // 2 original + 8 copied

        // Verify no duplicates by checking all start_times
        const startTimes = result
          .map((note) => note.start_time)
          .sort((a, b) => a - b);

        expect(startTimes).toStrictEqual([
          0, // bar 1
          4, // bar 2
          8, // bar 3 (original)
          12, // bar 4 (original)
          16, // bar 5
          20, // bar 6
          24, // bar 7
          28, // bar 8
          32, // bar 9
          36, // bar 10
        ]);

        // Verify specific bars for correctness
        // Bar 1: C3
        expect(result[2]).toStrictEqual(createNote());
        // Bar 2: D3
        expect(result[3]).toStrictEqual(
          createNote({ pitch: 62, start_time: 4 }),
        );
      });

      it("preserves note properties in tiled copy", () => {
        const result = interpretNotation(
          "v80 t0.5 p0.8 C3 1|1 v90 t0.25 p0.9 D3 2|1 @3-6=1-2",
        );

        // Bar 3 should have C3 with original properties
        expect(result[2]).toStrictEqual(
          createNote({
            start_time: 8,
            duration: 0.5,
            velocity: 80,
            probability: 0.8,
          }),
        );
        // Bar 4 should have D3 with original properties
        expect(result[3]).toStrictEqual(
          createNote({
            pitch: 62,
            start_time: 12,
            duration: 0.25,
            velocity: 90,
            probability: 0.9,
          }),
        );
      });

      it("handles tiling with different time signatures", () => {
        const result = interpretNotation("C3 1|1 D3 2|1 @3-4=1-2", {
          timeSigNumerator: 6,
          timeSigDenominator: 8,
        });

        // 6/8 bar = 3.0 Ableton beats
        expect(result).toHaveLength(4);
        // Bar 3: C3 at 6.0 beats
        expect(result[2]).toStrictEqual(
          createNote({ start_time: 6.0, duration: 0.5 }),
        );
        // Bar 4: D3 at 9.0 beats
        expect(result[3]).toStrictEqual(
          createNote({ pitch: 62, start_time: 9.0, duration: 0.5 }),
        );
      });
    });

    describe("multi-bar source range tiling: warnings and errors", () => {
      it("warns when destination range is invalid (start > end)", () => {
        interpretNotation("C3 1|1 @10-3=1-2");
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Invalid destination range"),
        );
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("start > end"),
        );
      });

      it("warns when source range is invalid (start > end)", () => {
        interpretNotation("C3 1|1 @3-10=5-2");
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Invalid source range"),
        );
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("start > end"),
        );
      });

      it("warns when source bar is empty during tiling", () => {
        interpretNotation("C3 1|1 D3 3|1 @5-8=1-4");
        // Bar 2 and 4 are empty, should warn when trying to copy them
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Bar 2 is empty, nothing to copy"),
        );
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Bar 4 is empty, nothing to copy"),
        );
      });

      it("warns when skipping self-copy during tiling", () => {
        interpretNotation("C3 5|1 D3 6|1 @3-10=5-6");
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Skipping copy of bar 5 to itself"),
        );
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Skipping copy of bar 6 to itself"),
        );
      });

      it("returns no copies when all source bars result in skips", () => {
        // Copy bars 3-4 to range 3-4 (all are self-copies, should skip all)
        const result = interpretNotation("C3 3|1 D3 4|1 @3-4=3-4");

        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Skipping copy of bar 3 to itself"),
        );
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Skipping copy of bar 4 to itself"),
        );
        // Should only have the original 2 notes, no copies
        expect(result).toHaveLength(2);
      });
    });

    describe("warnings and errors", () => {
      it("warns when copying from empty bar", () => {
        interpretNotation("C3 1|1 @3=2");
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Bar 2 is empty, nothing to copy"),
        );
      });

      it("warns when copying previous bar at bar 1", () => {
        interpretNotation("@1=");
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining(
            "Cannot copy from previous bar when at bar 1",
          ),
        );
      });

      it("warns when pitches are buffered before copy", () => {
        interpretNotation("C3 1|1 D3 @2=1");
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining(
            "1 pitch(es) buffered but not emitted before bar copy",
          ),
        );
      });

      it("warns when state changed before copy", () => {
        interpretNotation("C3 1|1 v90 @2=1");
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining(
            "state change won't affect anything before bar copy",
          ),
        );
      });

      it("warns when range copy has invalid source bar (bar 0)", () => {
        interpretNotation("@1-4=");
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining(
            "Cannot copy from previous bar when destination starts at bar 1",
          ),
        );
      });

      it("warns when range copy has invalid range (start > end)", () => {
        interpretNotation("C3 1|1 @5-3=");
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining(
            "Invalid destination range @5-3= (start > end)",
          ),
        );
      });

      it("warns when range copy from empty bar", () => {
        interpretNotation("C3 1|1 @3-5=2");
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Bar 2 is empty, nothing to copy"),
        );
      });

      it("warns when source range has reversed order", () => {
        interpretNotation("C3 1|1 @3=5-2");
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Invalid source range 5-2 (start > end)"),
        );
      });

      it("warns when multi-bar source range has reversed order", () => {
        interpretNotation("C3 1|1 @3-5=4-2");
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining(
            "Invalid source range @3-5=4-2 (start > end)",
          ),
        );
      });
    });

    describe("edge cases", () => {
      it("rejects copying a bar to itself (prevents infinite loop)", () => {
        const result = interpretNotation("C3 1|1 @1=1");

        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Cannot copy bar 1 to itself"),
        );
        // Should only have the original note, not a copy
        expect(result).toStrictEqual([createNote()]);
      });

      it("handles empty source in range copy", () => {
        interpretNotation("C3 1|1 @5=1-3");
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Bar 2 is empty, nothing to copy"),
        );
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Bar 3 is empty, nothing to copy"),
        );
      });

      it("skips copying a bar to itself in range copy", () => {
        const result = interpretNotation("C3 1|1 D3 2|1 @1-5=2");

        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Skipping copy of bar 2 to itself"),
        );
        // Should have 6 notes: C3 in bar 1, D3 in bar 2, and D3 copied to bars 1,3,4,5
        expect(result).toHaveLength(6);
        // Bar 1 original C3
        expect(result).toContainEqual(createNote());
        // Bar 1 also gets copy of bar 2 (D3)
        expect(result).toContainEqual(createNote({ pitch: 62 }));
        // Bar 2 original D3 (not copied to itself)
        expect(result).toContainEqual(createNote({ pitch: 62, start_time: 4 }));
        // Bar 3 gets copy of bar 2
        expect(result).toContainEqual(createNote({ pitch: 62, start_time: 8 }));
        // Bar 4 gets copy of bar 2
        expect(result).toContainEqual(
          createNote({ pitch: 62, start_time: 12 }),
        );
        // Bar 5 gets copy of bar 2
        expect(result).toContainEqual(
          createNote({ pitch: 62, start_time: 16 }),
        );
      });
    });

    describe("buffer persistence without @clear", () => {
      it("buffer persists across non-copy operations", () => {
        // Without auto-clear, bar 1 persists after E3 is added
        const result = interpretNotation("C3 1|1 @2= E3 4|1 @5=1");

        expect(result).toStrictEqual([
          // Bar 1
          createNote(),
          // Bar 2 (copied from bar 1)
          createNote({ start_time: 4 }),
          // Bar 4 (E3)
          createNote({ pitch: 64, start_time: 12 }),
          // Bar 5 (copy of bar 1 still works)
          createNote({ start_time: 16 }),
        ]);
      });
    });

    describe("@clear", () => {
      it("@clear immediately clears the copy buffer", () => {
        const result = interpretNotation("C3 1|1 @clear E3 2|1 @3=1");

        // Should warn that bar 1 is empty (cleared by @clear)
        expect(outlet).toHaveBeenCalledWith(
          1,
          expect.stringContaining("Bar 1 is empty, nothing to copy"),
        );

        expect(result).toStrictEqual([
          // Bar 1
          createNote(),
          // Bar 2 (E3)
          createNote({ pitch: 64, start_time: 4 }),
        ]);
      });

      it("@clear allows copying later bars", () => {
        const result = interpretNotation("C3 1|1 @2= @clear E3 4|1 @5=4");

        expect(result).toStrictEqual([
          // Bar 1
          createNote(),
          // Bar 2 (copied from bar 1)
          createNote({ start_time: 4 }),
          // Bar 4 (E3)
          createNote({ pitch: 64, start_time: 12 }),
          // Bar 5 (copied E3 from bar 4)
          createNote({ pitch: 64, start_time: 16 }),
        ]);
      });
    });
  });
});
