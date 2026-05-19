// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Routing-Kategorie einer Spur (genau 1 Block je kind pro Track-Block). */
export type RoutingKind = "audio-in" | "audio-out" | "midi-in" | "midi-out";

/** Ein Routing als rohe Attribut-Strings (woertlich, kein Reformat). */
export interface RoutingValue {
  target: string;
  upper: string;
  lower: string;
}

/**
 * Byte-belegtes well-known (kind,key) → {target,upper,lower}-Mapping
 * (Recon-Ground-Truth, set-unabhaengig, woertlich inkl. leerer lower="").
 * Erzwingt kind↔key-Konsistenz: ein key existiert NUR unter seinem kind
 * (Premortem R4) — ein Lookup-Miss fuehrt zu einem Throw VOR jedem Write.
 */
export const ROUTING_TARGETS: Record<
  RoutingKind,
  Record<string, RoutingValue>
> = {
  "audio-in": {
    none: { target: "AudioIn/None", upper: "No Output", lower: "" },
    "ext-stereo": {
      target: "AudioIn/External/S0",
      upper: "Ext. In",
      lower: "1/2",
    },
    "ext-mono": { target: "AudioIn/External/M0", upper: "Ext. In", lower: "1" },
  },
  "audio-out": {
    main: { target: "AudioOut/Main", upper: "Main", lower: "" },
    none: { target: "AudioOut/None", upper: "No Output", lower: "" },
    "ext-stereo": {
      target: "AudioOut/External/S0",
      upper: "Ext. Out",
      lower: "1/2",
    },
  },
  "midi-in": {
    "ext-all": {
      target: "MidiIn/External.All/-1",
      upper: "Ext: All Ins",
      lower: "",
    },
  },
  "midi-out": {
    none: { target: "MidiOut/None", upper: "None", lower: "" },
  },
};

/** kind → exakter Block-Tag-Name (genau 1× pro Track-Block, build-belegt). */
const KIND_TO_TAG: Record<RoutingKind, string> = {
  "audio-in": "AudioInputRouting",
  "audio-out": "AudioOutputRouting",
  "midi-in": "MidiInputRouting",
  "midi-out": "MidiOutputRouting",
};

/**
 * Im (eindeutigen) `<{kind}Routing>…</{kind}Routing>`-Block einer Spur das
 * `<Target>`, `<UpperDisplayString>` und `<LowerDisplayString>` ATOMAR auf
 * das byte-belegte Tripel aus `ROUTING_TARGETS[kind][targetKey]` setzen.
 *
 * Premortem R4: unbekanntes kind ODER kind-fremder/unbekannter key →
 * Throw VOR jeder Mutation (kind↔key-Konsistenz, kein spekulativer Write).
 * Premortem R1: nur der EXAKT benannte Block-Tag wird lokalisiert (Device-
 * internes Routing nutzt bare `<Routable>` = anders benannt, kein Mis-
 * Target), eindeutig 1× pro Track-Block (build-belegt ueber alle Track-
 * Typen). Premortem R6: fehlt der Block ODER eines der drei Tags → Throw,
 * KEIN Teil-Patch. Werte werden woertlich gesetzt; der gezielte Attr-
 * Replace ersetzt nur `Value="…"` und bewahrt Whitespace + `</>`-Suffix
 * (Recon-Format `<Target Value="…" />`) 1:1.
 *
 * @param trackBlock - Der vollstaendige Track-Block (von locateTrackBlock).
 * @param kind - Routing-Kategorie (bestimmt Block-Tag).
 * @param targetKey - well-known Key in ROUTING_TARGETS[kind].
 * @returns Der Track-Block mit atomar ersetztem Routing-Tripel.
 */
export function patchTrackRouting(
  trackBlock: string,
  kind: RoutingKind,
  targetKey: string,
): string {
  // Laufzeit-Defensive: `kind`/`targetKey` koennen ungueltig gecastete
  // CLI-Eingaben sein (Typ fuehrt sie faelschlich als vorhanden). Ein
  // `hasOwn`-Guard pro Ebene ist die einzige laufzeit-ehrliche Pruefung
  // (kein toter Branch — eigene kind-/key-Miss-Tests decken beide ab).
  if (
    !Object.hasOwn(ROUTING_TARGETS, kind) ||
    !Object.hasOwn(ROUTING_TARGETS[kind], targetKey)
  ) {
    throw new Error(
      `Ungueltige Routing-Kombination: kind="${kind}" key="${targetKey}" ` +
        `nicht in der byte-belegten Tabelle (kind↔key inkonsistent)`,
    );
  }

  // Nach den beiden hasOwn-Guards ist der Eintrag garantiert vorhanden;
  // ROUTING_TARGETS enthaelt keine undefined-Werte, daher kein zusaetzlicher
  // (toter) Null-Check (R5). Der noUncheckedIndexedAccess-Cast bleibt eng.
  const value = ROUTING_TARGETS[kind][targetKey] as RoutingValue;
  const tag = KIND_TO_TAG[kind];
  const blockMatch = trackBlock.match(
    new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`),
  );

  if (blockMatch?.index == null) {
    throw new Error(`<${tag}>-Block im Track-Block nicht gefunden`);
  }

  const start = blockMatch.index;
  const block = blockMatch[0];
  const patched = replaceRoutingTriple(block, value);

  return (
    trackBlock.slice(0, start) +
    patched +
    trackBlock.slice(start + block.length)
  );
}

/**
 * Alle vier benannten Routing-Bloecke eines Track-Blocks roh parsen. Fehlt
 * ein Block ODER ein Tag → leere Strings (konsistent dokumentiert; R5: die
 * Destrukturierungs-Defaults erfuellen nur noUncheckedIndexedAccess und
 * sind kein erreichbarer toter `??`-Zweig).
 *
 * @param trackBlock - Der vollstaendige Track-Block (von locateTrackBlock).
 * @returns kind → {target,upper,lower} (leere Strings wenn fehlend).
 */
export function getTrackRouting(
  trackBlock: string,
): Record<RoutingKind, RoutingValue> {
  return {
    "audio-in": readRoutingBlock(trackBlock, "audio-in"),
    "audio-out": readRoutingBlock(trackBlock, "audio-out"),
    "midi-in": readRoutingBlock(trackBlock, "midi-in"),
    "midi-out": readRoutingBlock(trackBlock, "midi-out"),
  };
}

/**
 * Den `<{kind}Routing>`-Block lesen und Target/Upper/Lower roh extrahieren.
 * Fehlt der Block ODER ein Tag → leere Strings (defensive Lese-Semantik;
 * KEIN toter Branch, da jeder Fall durch einen eigenen Test belegt ist).
 *
 * @param trackBlock - Der vollstaendige Track-Block.
 * @param kind - Routing-Kategorie (bestimmt Block-Tag).
 * @returns Rohes Tripel (leere Strings bei fehlendem Block/Tag).
 */
function readRoutingBlock(trackBlock: string, kind: RoutingKind): RoutingValue {
  const tag = KIND_TO_TAG[kind];
  const blockMatch = trackBlock.match(
    new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`),
  );

  if (blockMatch == null) {
    return { target: "", upper: "", lower: "" };
  }

  const block = blockMatch[0];

  return {
    target: readAttr(block, "Target"),
    upper: readAttr(block, "UpperDisplayString"),
    lower: readAttr(block, "LowerDisplayString"),
  };
}

/**
 * Das `Value="…"`-Attribut eines selbstschliessenden Tags im Block lesen.
 * Fehlt das Tag → "" (defensiv; die Capture-Group ist im Regex Pflicht,
 * der `?? ""`-Default erfuellt nur noUncheckedIndexedAccess).
 *
 * @param block - Der Routing-Block-String.
 * @param tagName - Tag-Name (Target | UpperDisplayString | LowerDisplayString).
 * @returns Roher Attribut-Wert oder "" wenn das Tag fehlt.
 */
function readAttr(block: string, tagName: string): string {
  const m = block.match(new RegExp(`<${tagName} Value="([^"]*)"`));

  if (m == null) {
    return "";
  }

  // Die Capture-Group `([^"]*)` ist bei einem Match Pflicht; die
  // Destrukturierung mit Default erfuellt nur noUncheckedIndexedAccess
  // (Vorbild als-warp-markers) und erzeugt keinen erreichbaren Fallback.
  const [, value = ""] = m;

  return value;
}

/**
 * Innerhalb EINES Routing-Blocks die drei `Value="…"`-Attribute atomar auf
 * das Tripel ersetzen. Premortem R6: fehlt eines der drei Tags → Throw,
 * KEIN Teil-Patch (vorher pruefen, dann erst splicen). Nur das `Value`-
 * Attribut wird ersetzt; Whitespace und ` />`-Suffix bleiben 1:1.
 *
 * @param block - Der Routing-Block-String (genau einmal vorhanden).
 * @param value - Das byte-belegte Ziel-Tripel.
 * @returns Der Block mit atomar ersetztem Tripel.
 */
function replaceRoutingTriple(block: string, value: RoutingValue): string {
  const targets: { tag: string; next: string }[] = [
    { tag: "Target", next: value.target },
    { tag: "UpperDisplayString", next: value.upper },
    { tag: "LowerDisplayString", next: value.lower },
  ];

  for (const { tag } of targets) {
    if (block.match(new RegExp(`<${tag} Value="[^"]*"`)) == null) {
      throw new Error(
        `<${tag}> im Routing-Block fehlt — kein Teil-Patch (Abbruch)`,
      );
    }
  }

  let out = block;

  for (const { tag, next } of targets) {
    // Replacer-Funktion statt String-Replacement: Sonderzeichen im Wert
    // (z.B. `$`) werden NICHT als Replacement-Pattern interpretiert.
    out = out.replace(
      new RegExp(`(<${tag} Value=")[^"]*(")`),
      (_full, head: string, tail: string) => `${head}${next}${tail}`,
    );
  }

  return out;
}
