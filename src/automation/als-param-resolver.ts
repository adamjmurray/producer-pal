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
 * Extract the track display name from a MidiTrack XML block.
 * UserName if non-empty, else EffectiveName.
 * @param trackBlock - Raw XML block for a single MidiTrack element
 * @returns Display name string, or empty string if not found
 */
function extractTrackName(trackBlock: string): string {
  const userNameMatch = /<UserName Value="([^"]*)"/.exec(trackBlock);

  if (userNameMatch != null && userNameMatch[1] !== "") {
    return userNameMatch[1];
  }

  const effectiveNameMatch = /<EffectiveName Value="([^"]*)"/.exec(trackBlock);

  return effectiveNameMatch != null ? effectiveNameMatch[1] : "";
}

/**
 * Parse a single child element of a Devices block to extract AlsParam info.
 * Returns null if the element has no AutomationTarget child.
 * @param elementName - The XML element tag name
 * @param elementBody - Inner content of the element
 * @returns AlsParam or null
 */
function parseParamElement(elementName: string, elementBody: string): AlsParam | null {
  const targetMatch = /<AutomationTarget Id="(\d+)"/.exec(elementBody);

  if (targetMatch == null) return null;

  const automationTargetId = targetMatch[1];

  const minMatch = /<MidiControllerRange>.*?<Min Value="([^"]+)"/.exec(elementBody);
  const maxMatch = /<MidiControllerRange>.*?<Max Value="([^"]+)"/.exec(elementBody);
  const manualMatch = /<Manual Value="([^"]+)"/.exec(elementBody);

  return {
    element: elementName,
    automationTargetId,
    min: minMatch != null ? Number(minMatch[1]) : null,
    max: maxMatch != null ? Number(maxMatch[1]) : null,
    manual: manualMatch != null ? Number(manualMatch[1]) : null,
  };
}

/**
 * List all automation-capable parameters for a given device in a track.
 *
 * Locates the MidiTrack by display name (UserName if non-empty, else EffectiveName),
 * navigates to the deviceIndex-th device element under Devices, and returns
 * every immediate child element that contains an AutomationTarget.
 *
 * @param xml - Decompressed .als XML string
 * @param trackName - Display name of the target track
 * @param deviceIndex - Zero-based index of the device within the track's Devices block
 * @returns Array of AlsParam for all automation-capable child elements
 */
export function listDeviceParams(xml: string, trackName: string, deviceIndex: number): AlsParam[] {
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
  // The path is <DeviceChain><DeviceChain><Devices>...</Devices>...
  const devicesMatch = /<Devices>([\S\s]*?)<\/Devices>/.exec(trackBlock);

  if (devicesMatch == null) return [];

  const devicesContent = devicesMatch[1];

  // Find the deviceIndex-th top-level element in Devices
  // Top-level device elements: match opening tags and their full body
  const deviceRe = /<(\w+)\b[^>]*Id="\d+"[^>]*>([\S\s]*?)<\/\1>/g;
  let deviceCount = 0;
  let deviceContent: string | null = null;

  while ((m = deviceRe.exec(devicesContent)) !== null) {
    if (deviceCount === deviceIndex) {
      deviceContent = m[2];
      break;
    }

    deviceCount++;
  }

  if (deviceContent == null) return [];

  // Collect immediate child elements with AutomationTarget
  const childRe = /<(\w+)\b[^>]*>([\S\s]*?)<\/\1>/g;
  const params: AlsParam[] = [];

  while ((m = childRe.exec(deviceContent)) !== null) {
    const param = parseParamElement(m[1], m[2]);

    if (param != null) {
      params.push(param);
    }
  }

  return params;
}

/**
 * Resolve an automation parameter by display name or alias to its full AlsParam.
 *
 * Matches paramSelector against (a) exact element name or (b) PARAM_ALIASES (case-insensitive).
 * Throws a descriptive error listing available element names if not found.
 *
 * @param xml - Decompressed .als XML string
 * @param trackName - Display name of the target track
 * @param deviceIndex - Zero-based index of the device within the track's Devices block
 * @param paramSelector - Element name or display alias (e.g. "Frequency", "Filter Freq")
 * @returns Resolved AlsParam
 */
export function resolveAutomationTargetId(
  xml: string,
  trackName: string,
  deviceIndex: number,
  paramSelector: string,
): AlsParam {
  const params = listDeviceParams(xml, trackName, deviceIndex);

  // (a) Exact element name match
  const exact = params.find((p) => p.element === paramSelector);

  if (exact != null) return exact;

  // (b) Alias match
  const aliasedElement = PARAM_ALIASES[paramSelector.toLowerCase()];

  if (aliasedElement != null) {
    const aliased = params.find((p) => p.element === aliasedElement);

    if (aliased != null) return aliased;
  }

  const available = params.map((p) => p.element).join(", ");

  throw new Error(`Param "${paramSelector}" nicht gefunden. verfuegbar: ${available}`);
}
