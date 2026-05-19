// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Eingabe-Spec fuer `group-create set` (alles explizit, nicht abgeleitet). */
export interface GroupCreateSpec {
  groupTrackId: number;
  nextPointeeId: number;
  returnCount: number;
  groupName: string;
  color: number;
  memberTrackIds: number[];
  insertAfterTrackId: number | null;
}

/** Ein per `getGroupTracks` gelesener GroupTrack. */
export interface GroupTrackInfo {
  id: number;
  name: string;
  memberTrackIds: number[];
  sendHolderCount: number;
}

/**
 * Den byte-exakten `<GroupTrack>`-Block synthetisieren: konstantes
 * 3-Fixture-Skelett + linearer Per-Return-`TrackSendHolder` + sequentielle
 * Pointee-Id-Allokation ab `nextPointeeId` (Dokument-Reihenfolge). Konsumiert
 * NUR die explizite Spec, leitet nichts ab.
 * @param spec - Validierte GroupCreate-Spec.
 * @returns Block-XML und der naechste freie Pointee-Id-Wert.
 */
export function synthesizeGroupTrack(spec: GroupCreateSpec): {
  block: string;
  nextId: number;
} {
  const { groupTrackId, nextPointeeId, returnCount, groupName, color } = spec;
  let counter = nextPointeeId;
  const fillIds = (s: string): string =>
    s.replaceAll("{{ID}}", () => String(counter++));
  const head = GROUP_TRACK_PREFIX.replace("{{GROUP_ID}}", String(groupTrackId))
    .replace("{{NAME}}", groupName)
    .replace("{{COLOR}}", String(color));
  let block = fillIds(head);

  if (returnCount === 0) {
    block += GROUP_TRACK_SENDS_EMPTY;
  } else {
    block += GROUP_TRACK_SENDS_OPEN;

    for (let h = 0; h < returnCount; h++) {
      block += fillIds(GROUP_TRACK_SEND_HOLDER.replace("{{H}}", String(h)));
    }

    block += GROUP_TRACK_SENDS_CLOSE;
  }

  block += fillIds(GROUP_TRACK_SUFFIX);

  return { block, nextId: counter };
}

/**
 * Alle `<GroupTrack>`-Bloecke aus dem Set lesen (konsistenter Default `[]`).
 * @param xml - Dekomprimierter .als-XML-String.
 * @returns `{ groupTracks }` (leeres Array falls keine vorhanden).
 */
export function getGroupTracks(xml: string): { groupTracks: GroupTrackInfo[] } {
  const groupTracks: GroupTrackInfo[] = [];
  const openRe = /<GroupTrack Id="(\d+)"[^>]*>/g;
  let m: RegExpExecArray | null;

  while ((m = openRe.exec(xml)) != null) {
    const id = Number(m[1]);
    const closeAt = xml.indexOf("</GroupTrack>", m.index);

    if (closeAt < 0) {
      break;
    }

    const block = xml.slice(m.index, closeAt + "</GroupTrack>".length);
    const nameMatch = /<EffectiveName Value="([^"]*)"/.exec(block);
    const holders = block.match(/<TrackSendHolder Id="\d+">/g);

    groupTracks.push({
      id,
      name: nameMatch == null ? "" : (nameMatch[1] as string),
      memberTrackIds: collectMemberIds(xml, id),
      sendHolderCount: holders == null ? 0 : holders.length,
    });
  }

  return { groupTracks };
}

/**
 * Den GroupTrack-Block synthetisieren + einsetzen, Member-Tracks ihre
 * track-level `<TrackGroupId>` auf die Gruppen-Id setzen und das set-globale
 * `<NextPointeeId>` um `22 + 2R` erhoehen. Verletzt eine Vorbedingung →
 * Throw VOR jeder Mutation (kein Teil-Patch).
 * @param xml - Dekomprimierter .als-XML-String.
 * @param spec - Validierte GroupCreate-Spec.
 * @returns Der gepatchte XML-String.
 */
export function injectGroupCreate(xml: string, spec: GroupCreateSpec): string {
  validateSpec(spec);

  const npRe = /<NextPointeeId Value="(\d+)" \/>/;
  const npMatch = npRe.exec(xml);

  if (npMatch == null) {
    throw new Error("<NextPointeeId> nicht im Set gefunden");
  }

  if (Number(npMatch[1]) !== spec.nextPointeeId) {
    throw new Error(
      `nextPointeeId ${spec.nextPointeeId} != set-<NextPointeeId> ${npMatch[1]}`,
    );
  }

  const returnCount = countTracks(xml, "ReturnTrack");

  if (returnCount !== spec.returnCount) {
    throw new Error(
      `returnCount ${spec.returnCount} != #ReturnTrack ${returnCount}`,
    );
  }

  if (
    findTrackOpen(xml, spec.groupTrackId) != null ||
    new RegExp(`<GroupTrack Id="${spec.groupTrackId}"[^>]*>`).test(xml)
  ) {
    throw new Error(`Track-Id ${spec.groupTrackId} existiert bereits`);
  }

  for (const memberId of spec.memberTrackIds) {
    if (findTrackOpen(xml, memberId) == null) {
      throw new Error(`Member-Track-Id ${memberId} existiert nicht`);
    }
  }

  const insertOffset = resolveInsertOffset(xml, spec.insertAfterTrackId);
  const { block, nextId } = synthesizeGroupTrack(spec);
  const indent = "\t\t\t";
  let next = `${xml.slice(0, insertOffset)}${indent}${block}\n${xml.slice(
    insertOffset,
  )}`;

  for (const memberId of spec.memberTrackIds) {
    next = setMemberTrackGroupId(next, memberId, spec.groupTrackId);
  }

  return next.replace(npRe, `<NextPointeeId Value="${nextId}" />`);
}

/**
 * Spec haerten: leer/ungueltig → Throw (kein Teil-Patch). Prueft Wertebereiche,
 * non-empty Member ohne Duplikate, Gruppen-Id nicht selbst Member,
 * non-empty Name.
 * @param spec - Zu pruefende GroupCreate-Spec.
 * @returns Nichts; wirft bei Verstoss.
 */
function validateSpec(spec: GroupCreateSpec): void {
  if (!Number.isInteger(spec.groupTrackId) || spec.groupTrackId <= 0) {
    throw new Error("groupTrackId muss positive Ganzzahl sein");
  }

  if (!Number.isInteger(spec.nextPointeeId) || spec.nextPointeeId <= 0) {
    throw new Error("nextPointeeId muss positive Ganzzahl sein");
  }

  if (!Number.isInteger(spec.returnCount) || spec.returnCount < 0) {
    throw new Error("returnCount muss Ganzzahl >=0 sein");
  }

  if (!Number.isInteger(spec.color)) {
    throw new Error("color muss Ganzzahl sein");
  }

  if (spec.groupName === "") {
    throw new Error("groupName darf nicht leer sein");
  }

  if (spec.memberTrackIds.length === 0) {
    throw new Error("memberTrackIds darf nicht leer sein");
  }

  if (new Set(spec.memberTrackIds).size !== spec.memberTrackIds.length) {
    throw new Error("memberTrackIds enthaelt Duplikate");
  }

  if (spec.memberTrackIds.includes(spec.groupTrackId)) {
    throw new Error("groupTrackId darf nicht Member sein");
  }
}

/**
 * Den track-level Einfuege-Byte-Offset bestimmen: Ende des
 * `insertAfterTrackId`-Tracks, bzw. direkt nach `<Tracks>` falls `null`.
 * @param xml - Dekomprimierter .als-XML-String.
 * @param insertAfterTrackId - Sibling-Track-Id oder `null` (= vorn).
 * @returns Absoluter Byte-Offset fuer den Block-Einsatz.
 */
function resolveInsertOffset(
  xml: string,
  insertAfterTrackId: number | null,
): number {
  if (insertAfterTrackId == null) {
    const tracksOpen = xml.indexOf("<Tracks>");

    if (tracksOpen < 0) {
      throw new Error("<Tracks> nicht im Set gefunden");
    }

    return tracksOpen + "<Tracks>\n".length;
  }

  const open = locateRequiredTrack(xml, insertAfterTrackId);

  return open.closeAt + `</${open.tag}>`.length + 1;
}

/**
 * Einen Midi-/Audio-Track per Id sicher lokalisieren: oeffnendes Tag + Offset
 * des schliessenden Tags. Wirft, falls Track-Id oder schliessendes Tag fehlt
 * (eine getestete Guard-Stelle fuer beide Aufrufer).
 * @param xml - Dekomprimierter .als-XML-String.
 * @param trackId - Gesuchte Track-Id.
 * @returns Tag-Name, Start-Offset und Offset des schliessenden Tags.
 */
function locateRequiredTrack(
  xml: string,
  trackId: number,
): { tag: string; index: number; closeAt: number } {
  const open = findTrackOpen(xml, trackId);

  if (open == null) {
    throw new Error(`Track-Id ${trackId} nicht gefunden`);
  }

  const closeTag = `</${open.tag}>`;
  const closeAt = xml.indexOf(closeTag, open.index);

  if (closeAt < 0) {
    throw new Error(`Schliessendes ${closeTag} fuer Track ${trackId} fehlt`);
  }

  return { tag: open.tag, index: open.index, closeAt };
}

/**
 * Im Block eines Member-Tracks (per Id lokalisiert) das ERSTE track-level
 * `<TrackGroupId Value="-1" />` auf die Gruppen-Id setzen.
 * @param xml - Dekomprimierter .als-XML-String.
 * @param memberId - Track-Id des Members.
 * @param groupId - Ziel-Gruppen-Id.
 * @returns Der gepatchte XML-String.
 */
function setMemberTrackGroupId(
  xml: string,
  memberId: number,
  groupId: number,
): string {
  const open = locateRequiredTrack(xml, memberId);
  const end = open.closeAt + `</${open.tag}>`.length;
  const blockBefore = xml.slice(open.index, end);
  const blockAfter = blockBefore.replace(
    '<TrackGroupId Value="-1" />',
    `<TrackGroupId Value="${groupId}" />`,
  );

  if (blockAfter === blockBefore) {
    throw new Error(
      `Track ${memberId}: kein track-level <TrackGroupId Value="-1" />`,
    );
  }

  return xml.slice(0, open.index) + blockAfter + xml.slice(end);
}

/**
 * Die Member-Track-Ids eines GroupTrack ermitteln: Top-Level-Tracks deren
 * erstes track-level `<TrackGroupId>` == der Gruppen-Id ist.
 * @param xml - Dekomprimierter .als-XML-String.
 * @param groupId - Gruppen-Id.
 * @returns Aufsteigend dokumentierte Member-Track-Ids.
 */
function collectMemberIds(xml: string, groupId: number): number[] {
  const ids: number[] = [];
  const re = /<(MidiTrack|AudioTrack) Id="(\d+)"[^>]*>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml)) != null) {
    const closeTag = `</${m[1]}>`;
    const closeAt = xml.indexOf(closeTag, m.index);
    const block = xml.slice(m.index, closeAt);
    const tg = /<TrackGroupId Value="(-?\d+)" \/>/.exec(block);

    if (tg != null && Number(tg[1]) === groupId) {
      ids.push(Number(m[2]));
    }
  }

  return ids;
}

/**
 * Das oeffnende Tag eines Midi-/Audio-Tracks per Id finden.
 * @param xml - Dekomprimierter .als-XML-String.
 * @param trackId - Gesuchte Track-Id.
 * @returns Tag-Name + Start-Offset, oder `null` falls nicht vorhanden.
 */
function findTrackOpen(
  xml: string,
  trackId: number,
): { tag: string; index: number } | null {
  const re = new RegExp(`<(MidiTrack|AudioTrack) Id="${trackId}"[^>]*>`);
  const m = re.exec(xml);

  if (m == null) {
    return null;
  }

  return { tag: m[1] as string, index: m.index };
}

/**
 * Top-Level-Tracks eines Typs zaehlen.
 * @param xml - Dekomprimierter .als-XML-String.
 * @param tag - Track-Tag-Name (z.B. `ReturnTrack`).
 * @returns Anzahl der oeffnenden Tags.
 */
function countTracks(xml: string, tag: string): number {
  const m = xml.match(new RegExp(`<${tag} Id="\\d+"`, "g"));

  return m == null ? 0 : m.length;
}

/**
 * Byte-exaktes GroupTrack-Skelett, programmatisch aus den
 * 3-Fixture-Ground-Truth-Sets abgeleitet (grp0/grp2 -after,
 * docs/superpowers/specs/2026-05-19-ppal-grouptrack-recon-verdict.md).
 * Sentinel: `{{GROUP_ID}}` GroupTrack-Id, `{{NAME}}` EffectiveName,
 * `{{COLOR}}` Color, `{{ID}}` sequenzieller Pointee-Id-Slot
 * (DOKUMENT-Reihenfolge ab Ziel-NextPointeeId). PREFIX endet exakt vor
 * `<Sends />`, SUFFIX beginnt exakt danach. Verifiziert byte-gleich gegen
 * grp0/1/2 -after in als-group-create-template.test.ts.
 */
export const GROUP_TRACK_PREFIX =
  '<GroupTrack Id="{{GROUP_ID}}" SelectedToolPanel="7" SelectedTransformationName="" SelectedGeneratorName="">\n\t\t\t\t<LomId Value="0" />\n\t\t\t\t<LomIdView Value="0" />\n\t\t\t\t<IsContentSelectedInDocument Value="false" />\n\t\t\t\t<PreferredContentViewMode Value="0" />\n\t\t\t\t<TrackDelay>\n\t\t\t\t\t<Value Value="0" />\n\t\t\t\t\t<IsValueSampleBased Value="false" />\n\t\t\t\t</TrackDelay>\n\t\t\t\t<Name>\n\t\t\t\t\t<EffectiveName Value="{{NAME}}" />\n\t\t\t\t\t<UserName Value="" />\n\t\t\t\t\t<Annotation Value="" />\n\t\t\t\t\t<MemorizedFirstClipName Value="" />\n\t\t\t\t</Name>\n\t\t\t\t<Color Value="{{COLOR}}" />\n\t\t\t\t<AutomationEnvelopes>\n\t\t\t\t\t<Envelopes />\n\t\t\t\t</AutomationEnvelopes>\n\t\t\t\t<TrackGroupId Value="-1" />\n\t\t\t\t<TrackUnfolded Value="true" />\n\t\t\t\t<DevicesListWrapper LomId="0" />\n\t\t\t\t<ClipSlotsListWrapper LomId="0" />\n\t\t\t\t<ArrangementClipsListWrapper LomId="0" />\n\t\t\t\t<TakeLanesListWrapper LomId="0" />\n\t\t\t\t<ViewData Value="{}" />\n\t\t\t\t<TakeLanes>\n\t\t\t\t\t<TakeLanes />\n\t\t\t\t\t<AreTakeLanesFolded Value="true" />\n\t\t\t\t</TakeLanes>\n\t\t\t\t<LinkedTrackGroupId Value="-1" />\n\t\t\t\t<Slots>\n\t\t\t\t\t<GroupTrackSlot Id="0">\n\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t</GroupTrackSlot>\n\t\t\t\t\t<GroupTrackSlot Id="1">\n\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t</GroupTrackSlot>\n\t\t\t\t\t<GroupTrackSlot Id="2">\n\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t</GroupTrackSlot>\n\t\t\t\t\t<GroupTrackSlot Id="3">\n\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t</GroupTrackSlot>\n\t\t\t\t\t<GroupTrackSlot Id="4">\n\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t</GroupTrackSlot>\n\t\t\t\t\t<GroupTrackSlot Id="5">\n\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t</GroupTrackSlot>\n\t\t\t\t\t<GroupTrackSlot Id="6">\n\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t</GroupTrackSlot>\n\t\t\t\t\t<GroupTrackSlot Id="7">\n\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t</GroupTrackSlot>\n\t\t\t\t</Slots>\n\t\t\t\t<Freeze Value="false" />\n\t\t\t\t<NeedArrangerRefreeze Value="true" />\n\t\t\t\t<DeviceChain>\n\t\t\t\t\t<AutomationLanes>\n\t\t\t\t\t\t<AutomationLanes>\n\t\t\t\t\t\t\t<AutomationLane Id="0">\n\t\t\t\t\t\t\t\t<SelectedDevice Value="0" />\n\t\t\t\t\t\t\t\t<SelectedEnvelope Value="0" />\n\t\t\t\t\t\t\t\t<IsContentSelectedInDocument Value="false" />\n\t\t\t\t\t\t\t\t<LaneHeight Value="51" />\n\t\t\t\t\t\t\t</AutomationLane>\n\t\t\t\t\t\t</AutomationLanes>\n\t\t\t\t\t\t<AreAdditionalAutomationLanesFolded Value="false" />\n\t\t\t\t\t</AutomationLanes>\n\t\t\t\t\t<ClipEnvelopeChooserViewState>\n\t\t\t\t\t\t<SelectedDevice Value="0" />\n\t\t\t\t\t\t<SelectedEnvelope Value="0" />\n\t\t\t\t\t\t<PreferModulationVisible Value="false" />\n\t\t\t\t\t</ClipEnvelopeChooserViewState>\n\t\t\t\t\t<AudioInputRouting>\n\t\t\t\t\t\t<Target Value="AudioIn/External/S0" />\n\t\t\t\t\t\t<UpperDisplayString Value="Ext. In" />\n\t\t\t\t\t\t<LowerDisplayString Value="1/2" />\n\t\t\t\t\t\t<MpeSettings>\n\t\t\t\t\t\t\t<ZoneType Value="0" />\n\t\t\t\t\t\t\t<FirstNoteChannel Value="1" />\n\t\t\t\t\t\t\t<LastNoteChannel Value="15" />\n\t\t\t\t\t\t</MpeSettings>\n\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />\n\t\t\t\t\t</AudioInputRouting>\n\t\t\t\t\t<MidiInputRouting>\n\t\t\t\t\t\t<Target Value="MidiIn/External.All/-1" />\n\t\t\t\t\t\t<UpperDisplayString Value="Ext: All Ins" />\n\t\t\t\t\t\t<LowerDisplayString Value="" />\n\t\t\t\t\t\t<MpeSettings>\n\t\t\t\t\t\t\t<ZoneType Value="0" />\n\t\t\t\t\t\t\t<FirstNoteChannel Value="1" />\n\t\t\t\t\t\t\t<LastNoteChannel Value="15" />\n\t\t\t\t\t\t</MpeSettings>\n\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />\n\t\t\t\t\t</MidiInputRouting>\n\t\t\t\t\t<AudioOutputRouting>\n\t\t\t\t\t\t<Target Value="AudioOut/Main" />\n\t\t\t\t\t\t<UpperDisplayString Value="Main" />\n\t\t\t\t\t\t<LowerDisplayString Value="" />\n\t\t\t\t\t\t<MpeSettings>\n\t\t\t\t\t\t\t<ZoneType Value="0" />\n\t\t\t\t\t\t\t<FirstNoteChannel Value="1" />\n\t\t\t\t\t\t\t<LastNoteChannel Value="15" />\n\t\t\t\t\t\t</MpeSettings>\n\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />\n\t\t\t\t\t</AudioOutputRouting>\n\t\t\t\t\t<MidiOutputRouting>\n\t\t\t\t\t\t<Target Value="MidiOut/None" />\n\t\t\t\t\t\t<UpperDisplayString Value="None" />\n\t\t\t\t\t\t<LowerDisplayString Value="" />\n\t\t\t\t\t\t<MpeSettings>\n\t\t\t\t\t\t\t<ZoneType Value="0" />\n\t\t\t\t\t\t\t<FirstNoteChannel Value="1" />\n\t\t\t\t\t\t\t<LastNoteChannel Value="15" />\n\t\t\t\t\t\t</MpeSettings>\n\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />\n\t\t\t\t\t</MidiOutputRouting>\n\t\t\t\t\t<Mixer>\n\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t<LomIdView Value="0" />\n\t\t\t\t\t\t<IsExpanded Value="true" />\n\t\t\t\t\t\t<BreakoutIsExpanded Value="false" />\n\t\t\t\t\t\t<On>\n\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t<Manual Value="true" />\n\t\t\t\t\t\t\t<AutomationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t</AutomationTarget>\n\t\t\t\t\t\t\t<MidiCCOnOffThresholds>\n\t\t\t\t\t\t\t\t<Min Value="64" />\n\t\t\t\t\t\t\t\t<Max Value="127" />\n\t\t\t\t\t\t\t</MidiCCOnOffThresholds>\n\t\t\t\t\t\t</On>\n\t\t\t\t\t\t<ModulationSourceCount Value="0" />\n\t\t\t\t\t\t<ParametersListWrapper LomId="0" />\n\t\t\t\t\t\t<Pointee Id="{{ID}}" />\n\t\t\t\t\t\t<LastSelectedTimeableIndex Value="0" />\n\t\t\t\t\t\t<LastSelectedClipEnvelopeIndex Value="0" />\n\t\t\t\t\t\t<LastPresetRef>\n\t\t\t\t\t\t\t<Value />\n\t\t\t\t\t\t</LastPresetRef>\n\t\t\t\t\t\t<LockedScripts />\n\t\t\t\t\t\t<IsFolded Value="false" />\n\t\t\t\t\t\t<ShouldShowPresetName Value="true" />\n\t\t\t\t\t\t<UserName Value="" />\n\t\t\t\t\t\t<Annotation Value="" />\n\t\t\t\t\t\t<SourceContext>\n\t\t\t\t\t\t\t<Value />\n\t\t\t\t\t\t</SourceContext>\n\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />\n\t\t\t\t\t\t<ViewData Value="{}" />\n';

/** Ein <TrackSendHolder>-Element (2 Pointee-Id-Slots, 1 pro Return). */
export const GROUP_TRACK_SEND_HOLDER =
  '\n\t\t\t\t\t\t\t<TrackSendHolder Id="{{H}}">\n\t\t\t\t\t\t\t\t<Send>\n\t\t\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t\t\t<Manual Value="0.0003162277571" />\n\t\t\t\t\t\t\t\t\t<MidiControllerRange>\n\t\t\t\t\t\t\t\t\t\t<Min Value="0.0003162277571" />\n\t\t\t\t\t\t\t\t\t\t<Max Value="1" />\n\t\t\t\t\t\t\t\t\t</MidiControllerRange>\n\t\t\t\t\t\t\t\t\t<AutomationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t\t\t</AutomationTarget>\n\t\t\t\t\t\t\t\t\t<ModulationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t\t\t</ModulationTarget>\n\t\t\t\t\t\t\t\t</Send>\n\t\t\t\t\t\t\t\t<EnabledByUser Value="true" />\n\t\t\t\t\t\t\t</TrackSendHolder>';

/** R=0-Form: leeres selbstschliessendes <Sends />. */
export const GROUP_TRACK_SENDS_EMPTY = "\t\t\t\t\t\t<Sends />";

/** Oeffnendes <Sends> (R>0). */
export const GROUP_TRACK_SENDS_OPEN = "\t\t\t\t\t\t<Sends>";

/** Schliessendes </Sends> (R>0), mit fuehrendem Zeilenumbruch+Einzug. */
export const GROUP_TRACK_SENDS_CLOSE = "\n\t\t\t\t\t\t</Sends>";

/** Skelett-Suffix ab direkt nach dem Sends-Element bis </GroupTrack>. */
export const GROUP_TRACK_SUFFIX =
  '\n\t\t\t\t\t\t<Speaker>\n\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t<Manual Value="true" />\n\t\t\t\t\t\t\t<AutomationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t</AutomationTarget>\n\t\t\t\t\t\t\t<MidiCCOnOffThresholds>\n\t\t\t\t\t\t\t\t<Min Value="64" />\n\t\t\t\t\t\t\t\t<Max Value="127" />\n\t\t\t\t\t\t\t</MidiCCOnOffThresholds>\n\t\t\t\t\t\t</Speaker>\n\t\t\t\t\t\t<SoloSink Value="false" />\n\t\t\t\t\t\t<PanMode Value="0" />\n\t\t\t\t\t\t<Pan>\n\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t<Manual Value="0" />\n\t\t\t\t\t\t\t<MidiControllerRange>\n\t\t\t\t\t\t\t\t<Min Value="-1" />\n\t\t\t\t\t\t\t\t<Max Value="1" />\n\t\t\t\t\t\t\t</MidiControllerRange>\n\t\t\t\t\t\t\t<AutomationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t</AutomationTarget>\n\t\t\t\t\t\t\t<ModulationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t</ModulationTarget>\n\t\t\t\t\t\t</Pan>\n\t\t\t\t\t\t<SplitStereoPanL>\n\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t<Manual Value="-1" />\n\t\t\t\t\t\t\t<MidiControllerRange>\n\t\t\t\t\t\t\t\t<Min Value="-1" />\n\t\t\t\t\t\t\t\t<Max Value="1" />\n\t\t\t\t\t\t\t</MidiControllerRange>\n\t\t\t\t\t\t\t<AutomationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t</AutomationTarget>\n\t\t\t\t\t\t\t<ModulationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t</ModulationTarget>\n\t\t\t\t\t\t</SplitStereoPanL>\n\t\t\t\t\t\t<SplitStereoPanR>\n\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t<Manual Value="1" />\n\t\t\t\t\t\t\t<MidiControllerRange>\n\t\t\t\t\t\t\t\t<Min Value="-1" />\n\t\t\t\t\t\t\t\t<Max Value="1" />\n\t\t\t\t\t\t\t</MidiControllerRange>\n\t\t\t\t\t\t\t<AutomationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t</AutomationTarget>\n\t\t\t\t\t\t\t<ModulationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t</ModulationTarget>\n\t\t\t\t\t\t</SplitStereoPanR>\n\t\t\t\t\t\t<Volume>\n\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t<Manual Value="1" />\n\t\t\t\t\t\t\t<MidiControllerRange>\n\t\t\t\t\t\t\t\t<Min Value="0.0003162277571" />\n\t\t\t\t\t\t\t\t<Max Value="1.99526238" />\n\t\t\t\t\t\t\t</MidiControllerRange>\n\t\t\t\t\t\t\t<AutomationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t</AutomationTarget>\n\t\t\t\t\t\t\t<ModulationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t</ModulationTarget>\n\t\t\t\t\t\t</Volume>\n\t\t\t\t\t\t<ViewStateSessionTrackWidth Value="93" />\n\t\t\t\t\t\t<CrossFadeState>\n\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t<Manual Value="1" />\n\t\t\t\t\t\t\t<AutomationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t</AutomationTarget>\n\t\t\t\t\t\t\t<MidiControllerRange>\n\t\t\t\t\t\t\t\t<Min Value="0" />\n\t\t\t\t\t\t\t\t<Max Value="2" />\n\t\t\t\t\t\t\t</MidiControllerRange>\n\t\t\t\t\t\t</CrossFadeState>\n\t\t\t\t\t\t<SendsListWrapper LomId="0" />\n\t\t\t\t\t</Mixer>\n\t\t\t\t\t<DeviceChain>\n\t\t\t\t\t\t<Devices />\n\t\t\t\t\t\t<SignalModulations />\n\t\t\t\t\t</DeviceChain>\n\t\t\t\t\t<FreezeSequencer>\n\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t<LomIdView Value="0" />\n\t\t\t\t\t\t<IsExpanded Value="true" />\n\t\t\t\t\t\t<BreakoutIsExpanded Value="false" />\n\t\t\t\t\t\t<On>\n\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t<Manual Value="true" />\n\t\t\t\t\t\t\t<AutomationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t\t</AutomationTarget>\n\t\t\t\t\t\t\t<MidiCCOnOffThresholds>\n\t\t\t\t\t\t\t\t<Min Value="64" />\n\t\t\t\t\t\t\t\t<Max Value="127" />\n\t\t\t\t\t\t\t</MidiCCOnOffThresholds>\n\t\t\t\t\t\t</On>\n\t\t\t\t\t\t<ModulationSourceCount Value="0" />\n\t\t\t\t\t\t<ParametersListWrapper LomId="0" />\n\t\t\t\t\t\t<Pointee Id="{{ID}}" />\n\t\t\t\t\t\t<LastSelectedTimeableIndex Value="0" />\n\t\t\t\t\t\t<LastSelectedClipEnvelopeIndex Value="0" />\n\t\t\t\t\t\t<LastPresetRef>\n\t\t\t\t\t\t\t<Value />\n\t\t\t\t\t\t</LastPresetRef>\n\t\t\t\t\t\t<LockedScripts />\n\t\t\t\t\t\t<IsFolded Value="false" />\n\t\t\t\t\t\t<ShouldShowPresetName Value="true" />\n\t\t\t\t\t\t<UserName Value="" />\n\t\t\t\t\t\t<Annotation Value="" />\n\t\t\t\t\t\t<SourceContext>\n\t\t\t\t\t\t\t<Value />\n\t\t\t\t\t\t</SourceContext>\n\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />\n\t\t\t\t\t\t<ViewData Value="{}" />\n\t\t\t\t\t\t<ClipSlotList>\n\t\t\t\t\t\t\t<ClipSlot Id="0">\n\t\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t\t<ClipSlot>\n\t\t\t\t\t\t\t\t\t<Value />\n\t\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t\t<HasStop Value="true" />\n\t\t\t\t\t\t\t\t<NeedRefreeze Value="true" />\n\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t<ClipSlot Id="1">\n\t\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t\t<ClipSlot>\n\t\t\t\t\t\t\t\t\t<Value />\n\t\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t\t<HasStop Value="true" />\n\t\t\t\t\t\t\t\t<NeedRefreeze Value="true" />\n\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t<ClipSlot Id="2">\n\t\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t\t<ClipSlot>\n\t\t\t\t\t\t\t\t\t<Value />\n\t\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t\t<HasStop Value="true" />\n\t\t\t\t\t\t\t\t<NeedRefreeze Value="true" />\n\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t<ClipSlot Id="3">\n\t\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t\t<ClipSlot>\n\t\t\t\t\t\t\t\t\t<Value />\n\t\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t\t<HasStop Value="true" />\n\t\t\t\t\t\t\t\t<NeedRefreeze Value="true" />\n\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t<ClipSlot Id="4">\n\t\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t\t<ClipSlot>\n\t\t\t\t\t\t\t\t\t<Value />\n\t\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t\t<HasStop Value="true" />\n\t\t\t\t\t\t\t\t<NeedRefreeze Value="true" />\n\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t<ClipSlot Id="5">\n\t\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t\t<ClipSlot>\n\t\t\t\t\t\t\t\t\t<Value />\n\t\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t\t<HasStop Value="true" />\n\t\t\t\t\t\t\t\t<NeedRefreeze Value="true" />\n\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t<ClipSlot Id="6">\n\t\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t\t<ClipSlot>\n\t\t\t\t\t\t\t\t\t<Value />\n\t\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t\t<HasStop Value="true" />\n\t\t\t\t\t\t\t\t<NeedRefreeze Value="true" />\n\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t<ClipSlot Id="7">\n\t\t\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t\t\t<ClipSlot>\n\t\t\t\t\t\t\t\t\t<Value />\n\t\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t\t\t<HasStop Value="true" />\n\t\t\t\t\t\t\t\t<NeedRefreeze Value="true" />\n\t\t\t\t\t\t\t</ClipSlot>\n\t\t\t\t\t\t</ClipSlotList>\n\t\t\t\t\t\t<MonitoringEnum Value="1" />\n\t\t\t\t\t\t<KeepRecordMonitoringLatency Value="true" />\n\t\t\t\t\t\t<Sample>\n\t\t\t\t\t\t\t<ArrangerAutomation>\n\t\t\t\t\t\t\t\t<Events />\n\t\t\t\t\t\t\t\t<AutomationTransformViewState>\n\t\t\t\t\t\t\t\t\t<IsTransformPending Value="false" />\n\t\t\t\t\t\t\t\t\t<TimeAndValueTransforms />\n\t\t\t\t\t\t\t\t</AutomationTransformViewState>\n\t\t\t\t\t\t\t</ArrangerAutomation>\n\t\t\t\t\t\t</Sample>\n\t\t\t\t\t\t<VolumeModulationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t</VolumeModulationTarget>\n\t\t\t\t\t\t<TranspositionModulationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t</TranspositionModulationTarget>\n\t\t\t\t\t\t<TransientEnvelopeModulationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t</TransientEnvelopeModulationTarget>\n\t\t\t\t\t\t<GrainSizeModulationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t</GrainSizeModulationTarget>\n\t\t\t\t\t\t<FluxModulationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t</FluxModulationTarget>\n\t\t\t\t\t\t<SampleOffsetModulationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t</SampleOffsetModulationTarget>\n\t\t\t\t\t\t<ComplexProFormantsModulationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t</ComplexProFormantsModulationTarget>\n\t\t\t\t\t\t<ComplexProEnvelopeModulationTarget Id="{{ID}}">\n\t\t\t\t\t\t\t<LockEnvelope Value="0" />\n\t\t\t\t\t\t</ComplexProEnvelopeModulationTarget>\n\t\t\t\t\t\t<PitchViewScrollPosition Value="-1073741824" />\n\t\t\t\t\t\t<SampleOffsetModulationScrollPosition Value="-1073741824" />\n\t\t\t\t\t\t<Recorder>\n\t\t\t\t\t\t\t<IsArmed Value="false" />\n\t\t\t\t\t\t\t<TakeCounter Value="1" />\n\t\t\t\t\t\t</Recorder>\n\t\t\t\t\t</FreezeSequencer>\n\t\t\t\t</DeviceChain>\n\t\t\t</GroupTrack>';
