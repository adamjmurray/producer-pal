// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findSourceFiles,
  projectRoot,
  repoPath,
  throwOnFileViolations,
} from "#src/test/helpers/meta-test-helpers.ts";

// Live's clip copy between tracks drops device envelopes, so every tool path
// that copies a clip with Live's own duplicate must say so (see
// src/tools/clip/envelopes/cross-track-envelopes.ts) or say why it needn't. Any
// file making such a copy has to be listed here.

/** The calls that copy a clip with Live's own duplicate, or the raw API names. */
const COPY_CALLS =
  /\b(copyClipToSlot|duplicateToArrangementTarget)\(|"duplicate_clip_to(_arrangement)?"/;

/** Files that note it, with the name each uses to do it. */
const NOTED: Record<string, string> = {
  "src/tools/clip/update/helpers/slot-move/clip-slot-move.ts":
    "sayEnvelopeLoss",
  "src/tools/clip/update/helpers/arrangement/place-moved-clip.ts":
    "arrangementEnvelopeLoss",
  "src/tools/actions/duplicate/helpers/call/write-duplicate-copy.ts":
    "envelopeLossFor",
  "src/tools/actions/duplicate/helpers/call/write-arrangement-copy.ts":
    "envelopeLossFor",
};

/** Files that needn't, and why. */
const EXEMPT: Record<string, string> = {
  "src/tools/actions/duplicate/helpers/clip/slot-copy/duplicate-clip-slot.ts":
    "takes the note from write-duplicate-copy.ts, which reads it before the copy",
  "src/tools/shared/clip/copy-clip-to-slot.ts": "the copy primitive itself",
  "src/tools/shared/arrangement/arrangement-duplicate-target.ts":
    "the copy primitive itself",
  "src/tools/shared/clip/recreate-into-slot.ts":
    "copies a scratch clip it just made into the destination slot, and says what a re-create drops",
  "src/tools/clip/helpers/clip-results.ts":
    "copies a clip it just created, which has no envelopes",
  "src/tools/actions/duplicate/helpers/clip/stamp-automation.ts":
    "scratch copies made while stamping; the copy's entry is noted by write-arrangement-copy.ts",
  "src/tools/actions/duplicate/helpers/clip/arrangement-length.ts":
    "reached from duplicate-clip-to-arrangement.ts, whose copy write-arrangement-copy.ts notes; a scene's clips stay on their tracks",
  "src/tools/actions/duplicate/helpers/clip/duplicate-clip-to-arrangement.ts":
    "its only caller is write-arrangement-copy.ts, which notes the copy",
  "src/tools/actions/duplicate/helpers/call/spare/spare-copy.ts":
    "a spare of the source on the source's own track",
  "src/tools/live-set/helpers/song-extension.ts":
    "a scratch clip made by the tool to extend the song, on the selected track",
  "src/tools/clip/envelopes/arrangement/stamp-clip-lane.ts":
    "a scratch clip on the clip's own track, to write its lane",
  "src/tools/clip/arrangement/helpers/arrangement-length-changes.ts":
    "a scratch clip trimming a clip on its own track",
  "src/tools/shared/arrangement/arrangement-holding-clip.ts":
    "copies on the clip's own track, through the holding area",
  "src/tools/shared/arrangement/arrangement-splitting.ts":
    "pieces of a clip, on its own track",
  "src/tools/shared/arrangement/arrangement-duplicate-workaround.ts":
    "the crash workaround around the copy primitive; callers note the copy",
  "src/tools/shared/arrangement/helpers/scratch-clips.ts":
    "scratch clips used to trim, on the clip's own track",
};

describe("copies of a clip onto another track say what they drop", () => {
  it("should list every file that copies a clip with Live's own duplicate", () => {
    const violations: { file: string; reason: string }[] = [];

    for (const file of findSourceFiles(path.join(projectRoot, "src"), true)) {
      const rel = repoPath(file);
      const source = fs.readFileSync(file, "utf8");

      if (!COPY_CALLS.test(source)) {
        continue;
      }

      if (!(rel in NOTED) && !(rel in EXEMPT)) {
        violations.push({
          file: rel,
          reason: "copies a clip but isn't in NOTED or EXEMPT",
        });
      }
    }

    for (const [rel, noted] of Object.entries(NOTED)) {
      if (
        !fs
          .readFileSync(path.join(projectRoot, rel), "utf8")
          .includes(`${noted}(`)
      ) {
        violations.push({
          file: rel,
          reason: `no longer calls ${noted}( to say what a copy to another track drops`,
        });
      }
    }

    throwOnFileViolations(
      violations,
      "Found a clip copy that may drop device envelopes without saying so",
      "Say what a copy to another track drops (cross-track-envelopes.ts) and add the file to NOTED, or add it to EXEMPT with the reason it needn't.",
    );

    expect(violations).toHaveLength(0);
  });
});
