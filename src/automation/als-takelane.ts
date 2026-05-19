// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Eine Take-Lane als explizite Allokation. `clipXml` ist der WÖRTLICHE
 * `<AudioClip …>…</AudioClip>`-Block (kein Reformat) — die exakte
 * Id/TakeId/Height/IsContentSelected-Allokation ist aus 1 Fixture NICHT
 * byte-sicher ableitbar und daher Pflicht-EINGABE, kein Modul-Default.
 */
export interface TakeLaneSpec {
  id: string;
  takeId: string;
  height: string;
  isContentSelected: string;
  clipXml: string;
}

/** Geparster `<TakeLanes>`-Wrapper: Fold-Flag + Lane-Liste. */
export interface ParsedTakeLanes {
  folded: boolean;
  lanes: TakeLaneSpec[];
}

// Eindeutiges Wrapper-Ende: <AreTakeLanesFolded …/> kommt exakt 1×/Wrapper
// (Premortem R1 — verhindert non-greedy-Stopp am inneren </TakeLanes>).
// Akzeptiert NUR den exakten leeren Default (folded=true); ein leerer
// Wrapper mit folded=false (manuell aufgeklappt) wird ebenfalls abgelehnt
// (Recon-Verdikt: populiert ⇒ folded=false, leer-Default ⇒ true).
const EMPTY_DEFAULT_RE =
  /^<TakeLanes>\n(\t*)<TakeLanes \/>\n\t*<AreTakeLanesFolded Value="true" \/>\n(\t*)<\/TakeLanes>$/;

/**
 * Den leeren Default-`<TakeLanes>`-Wrapper byte-treu in den populierten
 * Zustand überführen. Strikt nur empty→populated: ist der Wrapper NICHT in
 * exakter leerer Default-Form → Throw (Doppel-Patch-/Idempotenz-Schutz);
 * leere Lane-Menge oder ungültige Spec → Throw, kein Teil-Patch. Der
 * Basis-Indent wird aus dem Original abgeleitet (kein hartkodierter Tab-
 * Count), `clipXml` wird WÖRTLICH gespliced.
 *
 * @param wrapper - Der `<TakeLanes>…</TakeLanes>`-Wrapper-String.
 * @param lanes - Explizite Lane-Allokation (>= 1).
 * @returns Der populierte Wrapper-String.
 */
export function patchTakeLanes(wrapper: string, lanes: TakeLaneSpec[]): string {
  if (lanes.length === 0) {
    throw new Error("Take-Lane erfordert mindestens eine Lane");
  }

  const m = wrapper.match(EMPTY_DEFAULT_RE);

  if (m == null) {
    throw new Error(
      wrapper.includes("<TakeLanes")
        ? "Wrapper ist kein leerer Default-Wrapper (nur empty->populated)"
        : "<TakeLanes>-Wrapper nicht gefunden",
    );
  }

  // Beide Capture-Groups sind im Regex Pflicht (\t*); bei einem Match stets
  // gesetzt — die Defaults erfüllen nur noUncheckedIndexedAccess und sind
  // kein erreichbarer Laufzeit-Zweig (Match-Fehlen wirft bereits oben).
  const [, base = "", close = ""] = m;

  for (const lane of lanes) {
    if (
      lane.id === "" ||
      lane.takeId === "" ||
      lane.height === "" ||
      lane.isContentSelected === ""
    ) {
      throw new Error("Lane-Spec: Pflichtfeld leer");
    }

    if (!lane.clipXml.startsWith("<AudioClip")) {
      throw new Error("Lane-Spec: clipXml ist kein <AudioClip-Block");
    }

    // Pre-Render-Konsistenz-Check (Codex-Review F1): embedded <TakeId> im
    // verbatim gesplicten clipXml muss == lane.takeId sein. Sonst wuerde
    // der Mismatch erst im Post-Write-Verify auffallen — die .als waere da
    // schon korrupt geschrieben (Throw-statt-Teil-Patch-Bruch).
    const embeddedTakeId = lane.clipXml.match(/<TakeId Value="([^"]*)" \/>/);

    if (embeddedTakeId == null) {
      throw new Error("Lane-Spec: clipXml ohne <TakeId>");
    }

    if (embeddedTakeId[1] !== lane.takeId) {
      throw new Error(
        `Lane-Spec: takeId "${lane.takeId}" != embedded <TakeId> ` +
          `"${embeddedTakeId[1]}" in clipXml`,
      );
    }
  }

  const laneI = `${base}\t`;
  const fieldI = `${base}\t\t`;
  const evI = `${base}\t\t\t`;
  const clipI = `${base}\t\t\t\t`;
  const body = lanes.map((l) => renderLane(l, laneI, fieldI, evI, clipI));

  return (
    "<TakeLanes>\n" +
    `${base}<TakeLanes>\n` +
    `${body.join("")}` +
    `${base}</TakeLanes>\n` +
    `${base}<AreTakeLanesFolded Value="false" />\n` +
    `${close}</TakeLanes>`
  );
}

/**
 * Den `<TakeLanes>`-Wrapper wert-gebunden zurücklesen. Leerer Default →
 * konsistenter `{ folded: true, lanes: [] }`. Fehlt `<AreTakeLanesFolded>`
 * → Throw (kein Raten). `clipXml` wird WÖRTLICH extrahiert.
 *
 * @param wrapper - Der `<TakeLanes>…</TakeLanes>`-Wrapper-String.
 * @returns Geparster Wrapper.
 */
export function getTakeLanes(wrapper: string): ParsedTakeLanes {
  const foldedMatch = wrapper.match(/<AreTakeLanesFolded Value="(\w+)" \/>/);

  if (foldedMatch == null) {
    throw new Error("<AreTakeLanesFolded> im Wrapper nicht gefunden");
  }

  // Capture-Group 1 ist Pflicht (\w+) -> bei Match stets gesetzt.
  const [, foldedRaw = ""] = foldedMatch;
  const folded = foldedRaw === "true";
  const lanes: TakeLaneSpec[] = [];
  const laneRe =
    /<TakeLane Id="([^"]*)">\n[\S\s]*?<Height Value="([^"]*)" \/>\n\t*<IsContentSelectedInDocument Value="([^"]*)" \/>[\S\s]*?(<AudioClip Id="0"[\S\s]*?<\/AudioClip>)[\S\s]*?<\/TakeLane>/g;

  for (const mt of wrapper.matchAll(laneRe)) {
    // Alle 4 Capture-Groups sind im Regex Pflicht ([^"]* bzw. konkrete
    // Tags) -> bei einem Match stets gesetzt; Defaults nur für
    // noUncheckedIndexedAccess, kein erreichbarer Fallback-Zweig.
    const [, id = "", height = "", isSel = "", clipXml = ""] = mt;
    const takeIdMatch = clipXml.match(/<TakeId Value="([^"]*)" \/>/);

    if (takeIdMatch == null) {
      throw new Error("<TakeId> im Lane-AudioClip nicht gefunden");
    }

    const [, takeId = ""] = takeIdMatch;

    lanes.push({
      id,
      takeId,
      height,
      isContentSelected: isSel,
      clipXml,
    });
  }

  // Silent-Skip-Guard (Stage-1-Review F1): laneRe verlangt
  // `<AudioClip Id="0"` — das ist eine Recon-Beobachtung aus EINEM
  // Fixture, keine bewiesene Invariante. Weicht das Id-Format ab, wuerde
  // matchAll die Lane kommentarlos ueberspringen und im get-Pfad (kein
  // Verify) zu kurzes JSON liefern. Tag-Zaehlung erzwingt Vollstaendigkeit.
  const laneTagCount = (wrapper.match(/<TakeLane /g) ?? []).length;

  if (lanes.length !== laneTagCount) {
    throw new Error(
      `TakeLane-Anzahl (${laneTagCount}) != geparste Lanes ` +
        `(${lanes.length}): AudioClip-Id-Format unerwartet`,
    );
  }

  return { folded, lanes };
}

/**
 * Eine einzelne `<TakeLane>` byte-treu rendern (festes Schema aus Recon-B,
 * Indents aus dem abgeleiteten Basis-Indent, `clipXml` verbatim).
 *
 * @param l - Die Lane-Spezifikation.
 * @param laneI - Indent der `<TakeLane>`-Zeile.
 * @param fieldI - Indent der Lane-Felder.
 * @param evI - Indent der `<Events>`-Ebene.
 * @param clipI - Indent der `<AudioClip>`-Zeile.
 * @returns Der gerenderte `<TakeLane>`-Block inkl. Trailing-Newline.
 */
function renderLane(
  l: TakeLaneSpec,
  laneI: string,
  fieldI: string,
  evI: string,
  clipI: string,
): string {
  return (
    `${laneI}<TakeLane Id="${l.id}">\n` +
    `${fieldI}<LomId Value="0" />\n` +
    `${fieldI}<Height Value="${l.height}" />\n` +
    `${fieldI}<IsContentSelectedInDocument Value="${l.isContentSelected}" />\n` +
    `${fieldI}<ClipAutomation>\n` +
    `${evI}<Events>\n` +
    `${clipI}${l.clipXml}\n` +
    `${evI}</Events>\n` +
    `${evI}<AutomationTransformViewState>\n` +
    `${clipI}<IsTransformPending Value="false" />\n` +
    `${clipI}<TimeAndValueTransforms />\n` +
    `${evI}</AutomationTransformViewState>\n` +
    `${fieldI}</ClipAutomation>\n` +
    `${fieldI}<Name Value="Lane" />\n` +
    `${fieldI}<Annotation Value="" />\n` +
    `${fieldI}<Audition Value="false" />\n` +
    `${fieldI}<ArrangementClipsListWrapper LomId="0" />\n` +
    `${laneI}</TakeLane>\n`
  );
}
