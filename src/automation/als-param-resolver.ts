// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** A resolved automation parameter from an .als device. */
export interface AlsParam {
  /** XML element tag name (e.g. "Frequency", "Resonance"). */
  element: string;
  /** AutomationTarget Id attribute value. */
  automationTargetId: string;
  /** Minimum value from MidiControllerRange, or null if absent. */
  min: number | null;
  /** Maximum value from MidiControllerRange, or null if absent. */
  max: number | null;
  /** Manual Value from the element, or null if absent. */
  manual: number | null;
}

/**
 * Map of lowercased display names to canonical XML element names.
 * Extend here when adding aliases for new devices.
 */
export const PARAM_ALIASES: Record<string, string> = {
  "filter freq": "Frequency",
  "filter frequency": "Frequency",
};

/**
 * Regex that matches a "leaf parameter" element — an element whose direct
 * children include an <AutomationTarget Id="N"/>. The element may optionally
 * have <LomId>, <Manual>, <MidiControllerRange>, <MidiCCOnOffThresholds>
 * children before the <AutomationTarget>, in any combination.
 *
 * Group 1: element tag name
 * Group 2: automation target id
 *
 * The regex is applied to the full device XML subtree with the `g` flag so
 * all matches are collected in document order.
 */
const LEAF_PARAM_RE =
  /<([A-Za-z]\w*)\b[^>]*>\s*(?:<LomId\b[^>]*\/?>\s*)?(?:<Manual\b[^>]*\/?>\s*)?(?:<MidiControllerRange>[\S\s]*?<\/MidiControllerRange>\s*)?(?:<MidiCCOnOffThresholds>[\S\s]*?<\/MidiCCOnOffThresholds>\s*)?<AutomationTarget\s+Id="(\d+)"/g;

/**
 * Extract the track display name from a MidiTrack XML block.
 * UserName if non-empty, else EffectiveName.
 * @param trackBlock - Raw XML block for a single MidiTrack element
 * @returns Display name string, or empty string if not found
 */
function extractTrackName(trackBlock: string): string {
  const userNameMatch = /<UserName Value="([^"]*)"/.exec(trackBlock);

  if (userNameMatch?.[1] != null && userNameMatch[1] !== "") {
    return userNameMatch[1];
  }

  const effectiveNameMatch = /<EffectiveName Value="([^"]*)"/.exec(trackBlock);

  return effectiveNameMatch?.[1] ?? "";
}

/**
 * Extract min/max values from a <MidiControllerRange> block inside a window.
 * @param window - XML substring to search within
 * @returns min and max as numbers, or null if absent
 */
function extractMinMax(window: string): {
  min: number | null;
  max: number | null;
} {
  const rangeMatch =
    /<MidiControllerRange>([\S\s]*?)<\/MidiControllerRange>/.exec(window);

  if (rangeMatch == null) return { min: null, max: null };

  const rangeBlock = rangeMatch[1] ?? "";
  const minMatch = /<Min Value="([^"]+)"/.exec(rangeBlock);
  const maxMatch = /<Max Value="([^"]+)"/.exec(rangeBlock);

  return {
    min: minMatch != null ? Number(minMatch[1]) : null,
    max: maxMatch != null ? Number(maxMatch[1]) : null,
  };
}

/**
 * Extract the Manual Value from the window between the param open tag and <AutomationTarget>.
 * @param window - XML substring to search within
 * @returns Manual value as number, or null if absent
 */
function extractManual(window: string): number | null {
  const manualMatch = /<Manual Value="([^"]+)"/.exec(window);

  return manualMatch != null ? Number(manualMatch[1]) : null;
}

/**
 * Walk the device XML subtree recursively and collect every "leaf parameter"
 * element — an element whose direct children include an <AutomationTarget Id>.
 *
 * Uses LEAF_PARAM_RE which matches elements whose immediate content ends with
 * <AutomationTarget Id="N"/> optionally preceded by LomId/Manual/
 * MidiControllerRange/MidiCCOnOffThresholds children. This captures nested
 * params (e.g. <Filter><Frequency>...<AutomationTarget .../></Frequency>)
 * without requiring full XML parsing.
 *
 * @param deviceSubtree - XML string of the device element contents
 * @returns Array of AlsParam in document order
 */
function collectLeafParams(deviceSubtree: string): AlsParam[] {
  const params: AlsParam[] = [];
  const re = new RegExp(LEAF_PARAM_RE.source, "g");
  let m: RegExpExecArray | null;

  while ((m = re.exec(deviceSubtree)) !== null) {
    const elementName = m[1];
    const automationTargetId = m[2];

    if (elementName == null || automationTargetId == null) {
      throw new Error(
        "unerwartetes .als-Format: Pflicht-Capture-Gruppen fehlen",
      );
    }

    // The full match spans from the open tag to just past <AutomationTarget Id="N"
    // — extract min/max/manual from that window
    const matchText = m[0];
    const { min, max } = extractMinMax(matchText);
    const manual = extractManual(matchText);

    params.push({ element: elementName, automationTargetId, min, max, manual });
  }

  return params;
}

/**
 * List all automation-capable parameters for a given device in a track.
 *
 * Locates the MidiTrack by display name (UserName if non-empty, else EffectiveName),
 * navigates to the deviceIndex-th device element under Devices, and returns
 * every element in the device subtree that directly contains an AutomationTarget.
 * The search is recursive — nested elements like <Filter><Frequency> are found.
 *
 * @param xml - Decompressed .als XML string
 * @param trackName - Display name of the target track
 * @param deviceIndex - Zero-based index of the device within the track's Devices block
 * @returns Array of AlsParam for all automation-capable elements
 */
export function listDeviceParams(
  xml: string,
  trackName: string,
  deviceIndex: number,
): AlsParam[] {
  // Find the MidiTrack block for this track name
  const midiTrackRe = /<MidiTrack\b[^>]*>[\S\s]*?<\/MidiTrack>/g;
  let trackBlock: string | null = null;
  let m: RegExpExecArray | null;

  while ((m = midiTrackRe.exec(xml)) !== null) {
    if (extractTrackName(m[0]) === trackName) {
      trackBlock = m[0];
      break;
    }
  }

  if (trackBlock == null) {
    throw new Error(`track "${trackName}" nicht gefunden`);
  }

  // Navigate to DeviceChain > DeviceChain > Devices
  const devicesMatch = /<Devices>([\S\s]*?)<\/Devices>/.exec(trackBlock);

  if (devicesMatch == null) return [];

  const devicesContent = devicesMatch[1] ?? "";

  // Find the deviceIndex-th top-level element in Devices
  const deviceRe = /<(\w+)\b[^>]*Id="\d+"[^>]*>([\S\s]*?)<\/\1>/g;
  let deviceCount = 0;
  let deviceContent: string | null = null;

  while ((m = deviceRe.exec(devicesContent)) !== null) {
    if (deviceCount === deviceIndex) {
      // Include the full device element (open tag + content + close tag)
      deviceContent = m[0];
      break;
    }

    deviceCount++;
  }

  if (deviceContent == null) return [];

  return collectLeafParams(deviceContent);
}

/**
 * Resolve an automation parameter by display name or alias to its full AlsParam.
 *
 * Matches paramSelector against (a) exact element name or (b) PARAM_ALIASES (case-insensitive).
 * If multiple params share the same element name, throws a disambiguation error
 * listing all candidates with their automationTargetIds — unless occurrence is provided
 * to select among them (0-based). Use --target-id as the unambiguous fallback.
 *
 * Throws a descriptive error listing available element names if not found.
 *
 * @param xml - Decompressed .als XML string
 * @param trackName - Display name of the target track
 * @param deviceIndex - Zero-based index of the device within the track's Devices block
 * @param paramSelector - Element name or display alias (e.g. "Frequency", "Filter Freq")
 * @param occurrence - Zero-based index to pick among duplicate element names (optional)
 * @returns Resolved AlsParam
 */
export function resolveAutomationTargetId(
  xml: string,
  trackName: string,
  deviceIndex: number,
  paramSelector: string,
  occurrence?: number,
): AlsParam {
  const params = listDeviceParams(xml, trackName, deviceIndex);

  // Determine the canonical element name to look for
  const aliasedElement = PARAM_ALIASES[paramSelector.toLowerCase()];
  const targetElement = aliasedElement ?? paramSelector;

  const matches = params.filter((p) => p.element === targetElement);

  if (matches.length === 0) {
    const available = params.map((p) => p.element).join(", ");

    throw new Error(
      `Param "${paramSelector}" nicht gefunden. verfuegbar: ${available}`,
    );
  }

  if (matches.length > 1 && occurrence == null) {
    const ids = matches
      .map((p) => `${p.element}(id=${p.automationTargetId})`)
      .join(", ");

    throw new Error(
      `Param "${paramSelector}" mehrdeutig — ${matches.length} Treffer: ${ids}. ` +
        `Nutze --target-id fuer eindeutige Auswahl oder uebergib occurrence.`,
    );
  }

  const idx = occurrence ?? 0;

  if (idx >= matches.length) {
    throw new Error(
      `occurrence ${idx} ausserhalb des Bereichs — nur ${matches.length} Treffer fuer "${paramSelector}"`,
    );
  }

  const result = matches[idx];

  if (result == null) {
    throw new Error(`unerwartetes .als-Format: kein Param an Index ${idx}`);
  }

  return result;
}

/**
 * Liefert den XML-Block eines Tracks per EffectiveName + alle Track-Namen.
 * Einzige Track-Lokalisierungs-Quelle (gegen Resolver-Drift).
 * @param xml - Dekomprimierter .als XML-String
 * @param trackName - EffectiveName des Ziel-Tracks
 * @returns Track-Block, dessen Start-Index und alle gefundenen Track-Namen
 */
export function locateTrackBlock(
  xml: string,
  trackName: string,
): { block: string; index: number; names: string[] } {
  const trackRe =
    /<(?:MidiTrack|AudioTrack)\b(?:(?!<\/(?:MidiTrack|AudioTrack)>).)*?<\/(?:MidiTrack|AudioTrack)>/gs;
  const names: string[] = [];
  let found: { block: string; index: number } | null = null;

  for (const m of xml.matchAll(trackRe)) {
    // Gleiche Namens-Logik wie listDeviceParams (UserName bevorzugt) gegen
    // Resolver-Drift zwischen resolveMixerTarget und resolveAutomationTargetId.
    const name = extractTrackName(m[0]);

    if (name !== "") {
      names.push(name);
      if (name === trackName && found === null)
        found = { block: m[0], index: m.index };
    }
  }

  if (found === null)
    throw new Error(
      `Track "${trackName}" nicht gefunden. Verfügbar: ${names.join(", ")}`,
    );

  return { ...found, names };
}

/**
 * Löst ein Mixer-Automations-Target eines Tracks zu AlsParam auf.
 * @param xml - Dekomprimierter .als XML-String
 * @param trackName - EffectiveName des Ziel-Tracks
 * @param target - "volume" | "pan" | `send:<index>`
 * @returns Aufgelöster AlsParam mit AutomationTarget Id und Range
 */
export function resolveMixerTarget(
  xml: string,
  trackName: string,
  target: string,
): AlsParam {
  const { block: trackBlock } = locateTrackBlock(xml, trackName);
  const mixerM = trackBlock.match(/<Mixer\b[^]*?<\/Mixer>/);

  if (mixerM === null) throw new Error(`Kein <Mixer> im Track "${trackName}"`);
  const mixer = mixerM[0];

  if (target === "volume") {
    const vM = mixer.match(/<Volume>[^]*?<\/Volume>/);

    if (vM === null) throw new Error("Kein <Volume> im Mixer");

    return extractMixerParam(vM[0], "Volume");
  }

  if (target === "pan") {
    const pM = mixer.match(/<Pan>[^]*?<\/Pan>/);

    if (pM === null) throw new Error("Kein <Pan> im Mixer");

    return extractMixerParam(pM[0], "Pan");
  }

  const sendMatch = target.match(/^send:(\d+)$/);

  if (sendMatch) {
    const idx = Number(sendMatch[1]);
    const holders = [
      ...mixer.matchAll(
        /<TrackSendHolder Id="(\d+)">[^]*?<\/TrackSendHolder>/g,
      ),
    ];
    const holder = holders.find((h) => Number(h[1]) === idx);

    if (holder === undefined)
      throw new Error(
        `Send-Index ${idx} außerhalb (${holders.length} Sends vorhanden)`,
      );
    const sM = holder[0].match(/<Send>[^]*?<\/Send>/);

    if (sM === null) throw new Error(`Kein <Send> in TrackSendHolder ${idx}`);

    return extractMixerParam(sM[0], "Send");
  }

  throw new Error(
    `Unbekanntes Mixer-Target "${target}" (erwartet: volume|pan|send:<n>)`,
  );
}

/**
 * Extrahiert AutomationTarget Id + Range aus einem Mixer-Param-Element.
 * @param elementXml - XML eines einzelnen Mixer-Param-Elements
 * @param element - Element-Tag-Name (z.B. "Volume", "Pan", "Send")
 * @returns AlsParam mit Id und optionalem min/max/manual
 */
function extractMixerParam(elementXml: string, element: string): AlsParam {
  const idM = elementXml.match(/<AutomationTarget Id="(\d+)"/);
  const idCap = idM?.[1];

  if (idCap === undefined)
    throw new Error(`Kein AutomationTarget in <${element}>`);

  const NUM = /-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?/;
  const minM = elementXml.match(new RegExp(`<Min Value="(${NUM.source})"`));
  const maxM = elementXml.match(new RegExp(`<Max Value="(${NUM.source})"`));
  const manM = elementXml.match(new RegExp(`<Manual Value="(${NUM.source})"`));

  /**
   * Parst einen Zahl-Capture und wirft bei NaN statt still null/NaN zu liefern.
   * @param m - RegExp-Match (oder null, wenn Attribut fehlt)
   * @param attr - Attribut-/Element-Name fuer die Fehlermeldung
   * @returns Geparster Zahlwert oder null wenn nicht vorhanden
   */
  const parse = (m: RegExpMatchArray | null, attr: string): number | null => {
    if (m == null) return null;
    const n = Number(m[1]);

    if (Number.isNaN(n))
      throw new Error(`Ungültiger Zahlwert in <${element}> ${attr}`);

    return n;
  };

  return {
    element,
    automationTargetId: idCap,
    min: parse(minM, "Min"),
    max: parse(maxM, "Max"),
    manual: parse(manM, "Manual"),
  };
}
