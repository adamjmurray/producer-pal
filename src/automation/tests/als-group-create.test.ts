// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type GroupCreateSpec,
  getGroupTracks,
  injectGroupCreate,
  synthesizeGroupTrack,
} from "#src/automation/als-group-create.ts";

const baseXml = (r: number): string =>
  gunzipSync(
    readFileSync(`e2e/live-sets/grp${r}-base Project/grp${r}-base.als`),
  ).toString("utf8");

const specFor = (r: number): GroupCreateSpec => ({
  groupTrackId: 16,
  nextPointeeId: 22346,
  returnCount: r,
  groupName: "2-Group",
  color: 6,
  memberTrackIds: [13, 8],
  insertAfterTrackId: 12,
});

describe("synthesizeGroupTrack", () => {
  it.each([0, 1, 2])("R=%i: Id sequence end == base + 22 + 2R", (r) => {
    const { nextId } = synthesizeGroupTrack(specFor(r));

    expect(nextId).toBe(22346 + 22 + 2 * r);
  });
});

describe("getGroupTracks", () => {
  it("returns empty array when no GroupTrack present", () => {
    expect(getGroupTracks(baseXml(0)).groupTracks).toStrictEqual([]);
  });

  it("roundtrips id/name/members/sendHolderCount after inject", () => {
    for (const r of [0, 1, 2]) {
      const out = injectGroupCreate(baseXml(r), specFor(r));
      const { groupTracks } = getGroupTracks(out);

      expect(groupTracks).toHaveLength(1);
      expect(groupTracks[0]).toStrictEqual({
        id: 16,
        name: "2-Group",
        memberTrackIds: [13, 8],
        sendHolderCount: r,
      });
    }
  });
});

describe("injectGroupCreate preconditions (throw, no partial patch)", () => {
  it("throws on non-positive groupTrackId", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), { ...specFor(0), groupTrackId: 0 }),
    ).toThrow(/groupTrackId/);
  });

  it("throws on non-positive nextPointeeId", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), { ...specFor(0), nextPointeeId: -1 }),
    ).toThrow(/nextPointeeId muss/);
  });

  it("throws on negative returnCount", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), { ...specFor(0), returnCount: -1 }),
    ).toThrow(/returnCount muss/);
  });

  it("throws on non-integer color", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), { ...specFor(0), color: 1.5 }),
    ).toThrow(/color/);
  });

  it("throws on empty groupName", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), { ...specFor(0), groupName: "" }),
    ).toThrow(/groupName/);
  });

  it("throws on empty memberTrackIds", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), { ...specFor(0), memberTrackIds: [] }),
    ).toThrow(/memberTrackIds darf/);
  });

  it("throws on duplicate memberTrackIds", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), {
        ...specFor(0),
        memberTrackIds: [13, 13],
      }),
    ).toThrow(/Duplikate/);
  });

  it("throws when groupTrackId is itself a member", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), {
        ...specFor(0),
        memberTrackIds: [16, 13],
      }),
    ).toThrow(/nicht Member/);
  });

  it("throws on nextPointeeId mismatch with set", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), { ...specFor(0), nextPointeeId: 99999 }),
    ).toThrow(/!= set-<NextPointeeId>/);
  });

  it("throws on returnCount mismatch with #ReturnTrack", () => {
    expect(() =>
      injectGroupCreate(baseXml(2), { ...specFor(2), returnCount: 0 }),
    ).toThrow(/!= #ReturnTrack/);
  });

  it("throws when groupTrackId already exists as a track", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), {
        ...specFor(0),
        groupTrackId: 14,
        memberTrackIds: [13, 8],
      }),
    ).toThrow(/existiert bereits/);
  });

  it("throws when groupTrackId collides with an existing GroupTrack", () => {
    const xml =
      '<Ableton><NextPointeeId Value="22346" /><Tracks>\n' +
      '<GroupTrack Id="20"><EffectiveName Value="X" /></GroupTrack>\n' +
      '<MidiTrack Id="5"><TrackGroupId Value="-1" /></MidiTrack>' +
      "</Tracks></Ableton>";

    expect(() =>
      injectGroupCreate(xml, {
        groupTrackId: 20,
        nextPointeeId: 22346,
        returnCount: 0,
        groupName: "G",
        color: 6,
        memberTrackIds: [5],
        insertAfterTrackId: null,
      }),
    ).toThrow(/Track-Id 20 existiert bereits/);
  });

  it("throws when a member track id does not exist", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), {
        ...specFor(0),
        memberTrackIds: [999],
      }),
    ).toThrow(/existiert nicht/);
  });

  it("throws when insertAfterTrackId does not exist", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), {
        ...specFor(0),
        insertAfterTrackId: 999,
      }),
    ).toThrow(/Track-Id 999 nicht gefunden/);
  });

  it("throws when <NextPointeeId> tag is absent", () => {
    expect(() => injectGroupCreate("<Ableton></Ableton>", specFor(0))).toThrow(
      /<NextPointeeId> nicht/,
    );
  });
});

describe("injectGroupCreate insertAfterTrackId null (prepend)", () => {
  it("inserts the GroupTrack as the first Tracks child", () => {
    const out = injectGroupCreate(baseXml(0), {
      ...specFor(0),
      insertAfterTrackId: null,
    });
    const tracksOpen = out.indexOf("<Tracks>");
    const firstGroup = out.indexOf("<GroupTrack ");
    const firstMidi = out.indexOf("<MidiTrack ");

    expect(firstGroup).toBeGreaterThan(tracksOpen);
    expect(firstGroup).toBeLessThan(firstMidi);
  });

  it("throws when <Tracks> is absent and prepend requested", () => {
    const noTracks =
      '<X><NextPointeeId Value="22346" />' +
      '<MidiTrack Id="13"><TrackGroupId Value="-1" /></MidiTrack></X>';

    expect(() =>
      injectGroupCreate(noTracks, {
        ...specFor(0),
        returnCount: 0,
        insertAfterTrackId: null,
        memberTrackIds: [13],
      }),
    ).toThrow(/<Tracks> nicht/);
  });
});

describe("injectGroupCreate member TrackGroupId flip", () => {
  it("flips only member track-level TrackGroupId to groupId", () => {
    const out = injectGroupCreate(baseXml(0), specFor(0));

    for (const id of [13, 8]) {
      const open = new RegExp(`<(MidiTrack|AudioTrack) Id="${id}"[^>]*>`).exec(
        out,
      )!;
      const close = `</${open[1]}>`;
      const blk = out.slice(
        out.indexOf(open[0]),
        out.indexOf(close, open.index),
      );

      expect(/<TrackGroupId Value="16" \/>/.test(blk)).toBe(true);
    }

    const nonMember = new RegExp('<MidiTrack Id="15"[^>]*>').exec(out)!;
    const nmBlk = out.slice(
      nonMember.index,
      out.indexOf("</MidiTrack>", nonMember.index),
    );

    expect(/<TrackGroupId Value="-1" \/>/.test(nmBlk)).toBe(true);
  });
});

describe("defensive guards (malformed XML)", () => {
  it("getGroupTracks breaks out when </GroupTrack> is missing", () => {
    const xml = '<X><GroupTrack Id="9"><EffectiveName Value="G" /></X>';

    expect(getGroupTracks(xml).groupTracks).toStrictEqual([]);
  });

  it("getGroupTracks yields empty name when EffectiveName absent", () => {
    const xml = '<X><GroupTrack Id="9"></GroupTrack></X>';

    expect(getGroupTracks(xml).groupTracks).toStrictEqual([
      { id: 9, name: "", memberTrackIds: [], sendHolderCount: 0 },
    ]);
  });

  it("throws when member track has no track-level TrackGroupId=-1", () => {
    const xml =
      '<Ableton><NextPointeeId Value="22346" /><Tracks>\n' +
      '<MidiTrack Id="5"><TrackGroupId Value="3" /></MidiTrack>' +
      "</Tracks></Ableton>";

    expect(() =>
      injectGroupCreate(xml, {
        groupTrackId: 99,
        nextPointeeId: 22346,
        returnCount: 0,
        groupName: "G",
        color: 6,
        memberTrackIds: [5],
        insertAfterTrackId: null,
      }),
    ).toThrow(/kein track-level <TrackGroupId/);
  });

  it("throws when the inserted-after track has no closing tag", () => {
    const xml =
      '<Ableton><NextPointeeId Value="22346" /><Tracks>\n' +
      '<MidiTrack Id="5"><TrackGroupId Value="-1" />' +
      "</Tracks></Ableton>";

    expect(() =>
      injectGroupCreate(xml, {
        groupTrackId: 99,
        nextPointeeId: 22346,
        returnCount: 0,
        groupName: "G",
        color: 6,
        memberTrackIds: [5],
        insertAfterTrackId: 5,
      }),
    ).toThrow(/Schliessendes <\/MidiTrack> fuer Track 5 fehlt/);
  });

  it("throws when a member track loses its closing tag after insert", () => {
    const xml =
      '<Ableton><NextPointeeId Value="22346" /><Tracks>\n' +
      '<MidiTrack Id="5"><TrackGroupId Value="-1" /></MidiTrack>\n' +
      '<AudioTrack Id="6"><TrackGroupId Value="-1" />' +
      "</Tracks></Ableton>";

    expect(() =>
      injectGroupCreate(xml, {
        groupTrackId: 99,
        nextPointeeId: 22346,
        returnCount: 0,
        groupName: "G",
        color: 6,
        memberTrackIds: [6],
        insertAfterTrackId: 5,
      }),
    ).toThrow(/Schliessendes <\/AudioTrack> fuer Track 6 fehlt/);
  });
});

const afterXml = (r: number): string =>
  gunzipSync(
    readFileSync(`e2e/live-sets/grp${r}-base Project/grp${r}-after.als`),
  ).toString("utf8");

const groupBlock = (xml: string): string => {
  const i = xml.indexOf("<GroupTrack ");

  return xml.slice(i, xml.indexOf("</GroupTrack>") + "</GroupTrack>".length);
};

const trackTgid = (xml: string, id: number): string => {
  const open = new RegExp(`<(MidiTrack|AudioTrack) Id="${id}"[^>]*>`).exec(
    xml,
  )!;
  const blk = xml.slice(open.index, xml.indexOf(`</${open[1]}>`, open.index));

  return /<TrackGroupId Value="(-?\d+)" \/>/.exec(blk)![1] as string;
};

const nextPointee = (xml: string): string =>
  /<NextPointeeId Value="(\d+)" \/>/.exec(xml)![1] as string;

describe("als-group-create byte-spot-check vs -after (R=0/1/2)", () => {
  it.each([0, 1, 2])(
    "R=%i: synthesized <GroupTrack> block byte-equals -after",
    (r) => {
      const out = injectGroupCreate(baseXml(r), specFor(r));

      expect(groupBlock(out)).toBe(groupBlock(afterXml(r)));
    },
  );

  it.each([0, 1, 2])(
    "R=%i: member TrackGroupId byte-equals -after, non-members unchanged",
    (r) => {
      const out = injectGroupCreate(baseXml(r), specFor(r));
      const after = afterXml(r);

      expect(trackTgid(out, 13)).toBe(trackTgid(after, 13));
      expect(trackTgid(out, 8)).toBe(trackTgid(after, 8));
      expect(trackTgid(out, 14)).toBe("-1");
      expect(trackTgid(out, 15)).toBe("-1");
      expect(trackTgid(out, 12)).toBe("-1");
    },
  );

  it.each([0, 1, 2])(
    "R=%i: <NextPointeeId> byte-equals -after (= base + 22 + 2R)",
    (r) => {
      const out = injectGroupCreate(baseXml(r), specFor(r));

      expect(nextPointee(out)).toBe(nextPointee(afterXml(r)));
      expect(Number(nextPointee(out))).toBe(22346 + 22 + 2 * r);
    },
  );

  it.each([0, 1, 2])("R=%i: get roundtrip byte-spot-check", (r) => {
    const out = injectGroupCreate(baseXml(r), specFor(r));

    expect(getGroupTracks(out).groupTracks[0]).toStrictEqual({
      id: 16,
      name: "2-Group",
      memberTrackIds: [13, 8],
      sendHolderCount: r,
    });
  });

  it("negative: wrong returnCount throws, leaves nothing partial", () => {
    expect(() =>
      injectGroupCreate(baseXml(2), { ...specFor(2), returnCount: 1 }),
    ).toThrow(/!= #ReturnTrack/);
  });

  it("negative: non-existent member throws before any mutation", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), {
        ...specFor(0),
        memberTrackIds: [13, 777],
      }),
    ).toThrow(/777 existiert nicht/);
  });

  it("Codex F2: nicht-Integer memberTrackId (1.5) -> Throw (Regex-Injection-Schutz)", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), {
        ...specFor(0),
        memberTrackIds: [13, 1.5],
      }),
    ).toThrow(/keine nicht-negative Ganzzahl/);
  });

  it("Codex F2: negative memberTrackId -> Throw", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), {
        ...specFor(0),
        memberTrackIds: [13, -1],
      }),
    ).toThrow(/keine nicht-negative Ganzzahl/);
  });

  it("Codex F2: nicht-Integer insertAfterTrackId (2.7) -> Throw", () => {
    expect(() =>
      injectGroupCreate(baseXml(0), {
        ...specFor(0),
        insertAfterTrackId: 2.7,
      }),
    ).toThrow(/insertAfterTrackId/);
  });

  it("Codex F3: groupTrackId kollidiert mit ReturnTrack -> Throw", () => {
    // grp2-base hat ReturnTrack Id=2, Id=3 — vor Fix wuerde 2 silent durchgehen
    expect(() =>
      injectGroupCreate(baseXml(2), {
        ...specFor(2),
        groupTrackId: 2,
        memberTrackIds: [13, 8],
      }),
    ).toThrow(/existiert bereits/);
  });

  it("Codex F4: Insert ohne newline nach </Tracks>-Listing-Eintrag -> sauberer Split", () => {
    // Synthetisches Set: gleicher Track-Block-Schluss, aber kein \n nach
    // </MidiTrack> vor dem naechsten Tag. Fix darf nicht durch das naechste
    // Tag in der Mitte spalten.
    const base0 = baseXml(0);
    const noNlBase = base0.replace(
      /<\/MidiTrack>\n(\s*<(?:MidiTrack|AudioTrack))/,
      "</MidiTrack>$1",
    );

    expect(() => injectGroupCreate(noNlBase, specFor(0))).not.toThrow();
  });

  it("Codex F5: groupName mit XML-Sonderzeichen -> escapet, kein Korrupt-XML", () => {
    const out = injectGroupCreate(baseXml(0), {
      ...specFor(0),
      groupName: 'A & "B" <C>',
    });

    expect(out).toContain('Value="A &amp; &quot;B&quot; &lt;C&gt;"');
    expect(out).not.toContain('Value="A & "B" <C>"');
  });

  it("Codex F5: groupName mit `$1` -> kein String.replace-Pattern-Expand", () => {
    const out = injectGroupCreate(baseXml(0), {
      ...specFor(0),
      groupName: "Group $1 X",
    });

    // Literal `$1` muss erhalten bleiben (kein Pattern-Expand auf Match).
    expect(out).toContain("Group $1 X");
  });
});
