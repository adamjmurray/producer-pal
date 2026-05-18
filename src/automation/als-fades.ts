// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

type FadeType = "int" | "bool" | "float" | "curve";

interface FadeDef {
  tag: string;
  type: FadeType;
  def: string;
  /** "sibling" = direkt im Clip neben <Fades>; "fades" = innerhalb <Fades>…</Fades> */
  scope: "sibling" | "fades";
}

/**
 * Setbare Fade-Keys (genau 8). Der Composite-Key `FadeInCurve` (Werte
 * `up`|`down`) schreibt atomar die byte-belegten G4b-Tupel
 * `FadeInCurveSkew`/`FadeInCurveSlope` + `IsDefaultFadeIn="false"`; sein
 * Witness-Tag (für den geteilten Verify im clip-patch-cli) ist
 * `FadeInCurveSkew`. Die rohen `FadeInCurveSkew/Slope`- und
 * `FadeOutCurveSkew/Slope`-Keys sind über `getFades` LESBAR, aber
 * set-gesperrt (nicht byte-belegt = Slice 4c).
 */
export const FADE_SPEC: Record<string, FadeDef> = {
  Fade: { tag: "Fade", type: "bool", def: "true", scope: "sibling" },
  FadeInLength: {
    tag: "FadeInLength",
    type: "float",
    def: "0",
    scope: "fades",
  },
  FadeOutLength: {
    tag: "FadeOutLength",
    type: "float",
    def: "0",
    scope: "fades",
  },
  ClipFadesAreInitialized: {
    tag: "ClipFadesAreInitialized",
    type: "bool",
    def: "true",
    scope: "fades",
  },
  CrossfadeInState: {
    tag: "CrossfadeInState",
    type: "int",
    def: "0",
    scope: "fades",
  },
  IsDefaultFadeIn: {
    tag: "IsDefaultFadeIn",
    type: "bool",
    def: "true",
    scope: "fades",
  },
  IsDefaultFadeOut: {
    tag: "IsDefaultFadeOut",
    type: "bool",
    def: "true",
    scope: "fades",
  },
  FadeInCurve: {
    // Composite-Key: Witness-Tag = FadeInCurveSkew (dessen Literal -1/1/0
    // diskriminiert up/down/neutral); patchFade schreibt zusätzlich
    // FadeInCurveSlope + IsDefaultFadeIn atomar im selben <Fades>-Scope.
    tag: "FadeInCurveSkew",
    type: "curve",
    def: "0",
    scope: "fades",
  },
};

/**
 * Rohe Skew/Slope-Keys: lesbar via `getFades`, aber set-gesperrt. FadeOut-
 * Kurve und direkte FadeIn-Skew/Slope sind NICHT byte-belegt (nur die
 * up/down-Tupel des Composite-Keys `FadeInCurve` sind es) = Slice 4c.
 */
const SKEW_SLOPE_KEYS = new Set([
  "FadeInCurveSkew",
  "FadeInCurveSlope",
  "FadeOutCurveSkew",
  "FadeOutCurveSlope",
]);

/**
 * Byte-belegte G4b-Tupel (Fixture-CDATA, Commit `e266c15`) — WÖRTLICH,
 * keine Float-Neuformatierung. `FadeInCurve` schreibt diese Literale plus
 * `IsDefaultFadeIn="false"` atomar.
 */
const FADE_IN_CURVE_TUPLES: Record<string, { skew: string; slope: string }> = {
  up: { skew: "-1", slope: "0.8999999762" },
  down: { skew: "1", slope: "-0.8999999762" },
};

/** Alle 11 lesbaren Tags: Fade (sibling) + 10 <Fades>-Kinder. */
const READ_KEYS: { tag: string; scope: "sibling" | "fades" }[] = [
  { tag: "Fade", scope: "sibling" },
  { tag: "FadeInLength", scope: "fades" },
  { tag: "FadeOutLength", scope: "fades" },
  { tag: "ClipFadesAreInitialized", scope: "fades" },
  { tag: "CrossfadeInState", scope: "fades" },
  { tag: "FadeInCurveSkew", scope: "fades" },
  { tag: "FadeInCurveSlope", scope: "fades" },
  { tag: "FadeOutCurveSkew", scope: "fades" },
  { tag: "FadeOutCurveSlope", scope: "fades" },
  { tag: "IsDefaultFadeIn", scope: "fades" },
  { tag: "IsDefaultFadeOut", scope: "fades" },
];

/**
 * Liest alle 11 Fade-Werte aus einem Clip-XML-Block. `<Fade>` (bool) wird
 * R1-sicher per ` Value="` von `<Fades>` getrennt. Die 10 `<Fades>`-Kinder
 * (inkl. der 4 Skew/Slope) werden nur aus dem `<Fades>…</Fades>`-Substring
 * gelesen. Fehlende Tags liefern den Spec-Default bzw. "0".
 *
 * @param clipXml - Der `<AudioClip>`/`<MidiClip>`-Block als String.
 * @returns Map Tag -> Wert für alle 11 Fade-Tags.
 */
export function getFades(clipXml: string): Record<string, string> {
  const res: Record<string, string> = {};
  const fb = fadesBlockOrNull(clipXml);
  let skew = "0";

  for (const { tag, scope } of READ_KEYS) {
    const hay = scope === "fades" ? (fb?.block ?? "") : clipXml;
    const m = hay.match(new RegExp(`<${tag} Value="([^"]*)" />`));
    const val = m?.[1] ?? FADE_SPEC[tag]?.def ?? "0";

    res[tag] = val;
    if (tag === "FadeInCurveSkew") skew = val;
  }

  // Composite-Witness: FadeInCurve == das FadeInCurveSkew-Literal. Der
  // geteilte clip-patch-cli-Verify prüft `after.FadeInCurve === want` UND
  // den Roh-Tag `<FadeInCurveSkew Value="want" />`; mit want = Skew-Literal
  // (via expectedValue-Hook) deckt sich beides ohne clip-patch-cli-Änderung.
  res.FadeInCurve = skew;

  return res;
}

/**
 * Setzt einen einzelnen Fade-Wert. R1: `<Fade>` (scope "sibling") wird
 * zwingend per `/<Fade Value="[^"]*" \/>/` UND Positions-Fenster zwischen
 * `<WarpMode` und `<Fades>` getroffen — niemals `<Fades>`. `<Fades>`-Kinder
 * werden ausschließlich innerhalb des `<Fades>…</Fades>`-Substrings ersetzt.
 *
 * @param clipXml - Der Clip-XML-Block.
 * @param key - Einer der 7 setbaren Keys aus `FADE_SPEC`.
 * @param value - Neuer Wert; wird typabhängig validiert.
 * @returns Der Clip-XML-Block mit genau einem ersetzten Tag-Wert.
 */
export function patchFade(clipXml: string, key: string, value: string): string {
  if (SKEW_SLOPE_KEYS.has(key))
    throw new Error(
      "Direkte Fade-Kurven-Skew/Slope (FadeOut bzw. roh FadeIn) = Slice 4c, " +
        "nicht unterstützt — FadeIn-Kurve nur über Composite-Key FadeInCurve",
    );

  const def = FADE_SPEC[key];

  if (def === undefined)
    throw new Error(
      `Unbekannter Key "${key}". Gültig: ${Object.keys(FADE_SPEC).join(", ")}`,
    );

  if (def.type === "curve") return patchFadeInCurve(clipXml, value);
  validate(key, def, value);

  if (def.scope === "fades") {
    const fb = fadesBlock(clipXml);
    const tagRe = new RegExp(`(<${def.tag} Value=")[^"]*(" />)`);

    if (!tagRe.test(fb.block))
      throw new Error(`Tag <${def.tag}> in <Fades> nicht gefunden`);
    const patched = fb.block.replace(tagRe, `$1${value}$2`);

    return clipXml.slice(0, fb.start) + patched + clipXml.slice(fb.end);
  }

  // scope "sibling" (Key Fade): R1 — Positions-Fenster zwischen <WarpMode
  // und <Fades>, Tag-Match zwingend mit ` Value="` (schließt <Fades> aus).
  return replaceFadeBoolInWindow(clipXml, value);
}

/**
 * Schreibt den Composite-Key `FadeInCurve` (`up`|`down`) atomar: ersetzt
 * `FadeInCurveSkew`, `FadeInCurveSlope` und `IsDefaultFadeIn` innerhalb des
 * `<Fades>…</Fades>`-Scopes mit den byte-belegten G4b-Literalen (wörtlich,
 * keine Float-Neuformatierung). Wirft bei ungültigem Wert oder fehlendem
 * Tag, bevor irgendetwas am Block geändert wird (kein Partial-Patch).
 *
 * @param clipXml - Der Clip-XML-Block.
 * @param value - `up` oder `down` (einzige byte-belegte Tupel).
 * @returns Der Clip-XML-Block mit den 3 atomar ersetzten Tag-Werten.
 */
function patchFadeInCurve(clipXml: string, value: string): string {
  const tuple = FADE_IN_CURVE_TUPLES[value];

  if (tuple === undefined)
    throw new Error(
      `Key "FadeInCurve" erwartet up|down (byte-belegt), nicht "${value}"`,
    );
  const fb = fadesBlock(clipXml);
  const writes: Array<[string, string]> = [
    ["FadeInCurveSkew", tuple.skew],
    ["FadeInCurveSlope", tuple.slope],
    ["IsDefaultFadeIn", "false"],
  ];
  let block = fb.block;

  for (const [tag, v] of writes) {
    const tagRe = new RegExp(`(<${tag} Value=")[^"]*(" />)`);

    if (!tagRe.test(block))
      throw new Error(`Tag <${tag}> in <Fades> nicht gefunden`);
    block = block.replace(tagRe, `$1${v}$2`);
  }

  return clipXml.slice(0, fb.start) + block + clipXml.slice(fb.end);
}

/**
 * Lokalisiert den `<Fades>…</Fades>`-Block (oder `null`).
 *
 * @param clipXml - Der Clip-XML-Block.
 * @returns Block-String mit Offsets oder `null`.
 */
function fadesBlockOrNull(
  clipXml: string,
): { block: string; start: number; end: number } | null {
  const m = clipXml.match(/<Fades>[^]*?<\/Fades>/);

  if (m?.index === undefined) return null;

  return { block: m[0], start: m.index, end: m.index + m[0].length };
}

/**
 * Wie `fadesBlockOrNull`, wirft aber wenn kein `<Fades>` vorhanden ist
 * (z. B. MidiClip).
 *
 * @param clipXml - Der Clip-XML-Block.
 * @returns Block-String mit Offsets.
 */
function fadesBlock(clipXml: string): {
  block: string;
  start: number;
  end: number;
} {
  const fb = fadesBlockOrNull(clipXml);

  if (fb === null) throw new Error("kein <Fades> (nur AudioClip)");

  return fb;
}

/**
 * Validiert den Wert gemäß Fade-Typ (bool/float/int).
 *
 * @param key - Fade-Key (für die Fehlermeldung).
 * @param def - Spec-Definition des Keys.
 * @param value - Zu prüfender Wert.
 */
function validate(key: string, def: FadeDef, value: string): void {
  if (def.type === "bool" && value !== "true" && value !== "false")
    throw new Error(
      `Key "${key}" erwartet bool (true|false), nicht "${value}"`,
    );

  if (def.type === "float") {
    if (value.trim() === "")
      throw new Error(`Key "${key}" erwartet finite Zahl >= 0, nicht leer`);
    const n = Number(value);

    if (!Number.isFinite(n) || n < 0)
      throw new Error(
        `Key "${key}" erwartet finite Zahl >= 0 (nicht negativ), nicht "${value}"`,
      );
  }

  if (def.type === "int" && !/^-?\d+$/.test(value))
    throw new Error(
      `Key "${key}" erwartet Integer (ganzzahl), nicht "${value}"`,
    );
}

/**
 * R1-sicherer Replace des bool `<Fade Value="…" />` im Positions-Fenster
 * zwischen `<WarpMode` und `<Fades>`. Exakt-1-Treffer-Guard; die Tag-Regex
 * mit ` Value="` schließt `<Fades>` strukturell aus.
 *
 * @param clipXml - Der Clip-XML-Block.
 * @param value - Neuer bool-Wert.
 * @returns Der Clip-XML-Block mit genau einem ersetzten `<Fade>`.
 */
function replaceFadeBoolInWindow(clipXml: string, value: string): string {
  const sm = clipXml.match(/<WarpMode/);

  if (sm?.index === undefined)
    throw new Error(
      "Positions-Anker für <Fade> nicht gefunden (kein <WarpMode>)",
    );
  const windowStart = sm.index + sm[0].length;
  const rest = clipXml.slice(windowStart);
  const em = rest.match(/<Fades>/);

  if (em?.index === undefined)
    throw new Error("Positions-Anker für <Fade> nicht gefunden (kein <Fades>)");
  const windowEnd = windowStart + em.index;
  const win = clipXml.slice(windowStart, windowEnd);

  // Genau EINE Regex-Quelle (mit /g + Capture-Gruppen) sowohl für den
  // Treffer-Count-Guard als auch für den Replace — kein Divergenzrisiko
  // zwischen zwei separaten Literals. Pattern analog zu
  // als-clip-settings.ts replaceScalarInWindow (lokal nachgebildet, NICHT
  // importiert: keine fades→clip-settings-Kopplung, Slice-3 unangetastet).
  const tagRe = /(<Fade Value=")[^"]*(" \/>)/g;
  const hits = win.match(tagRe);

  if (hits === null)
    throw new Error("Tag <Fade> im Positions-Fenster nicht gefunden");
  if (hits.length !== 1)
    throw new Error(
      `Tag <Fade> ${hits.length}-mal im Positions-Fenster — mehrdeutig`,
    );

  let replaced = 0;
  const patchedWin = win.replaceAll(tagRe, (_m, pre: string, post: string) => {
    replaced += 1;

    return `${pre}${value}${post}`;
  });

  if (replaced !== 1)
    throw new Error(
      `Replace-Konsistenzfehler für <Fade>: Guard erwartete 1 Treffer, ` +
        `Replace ersetzte ${replaced}`,
    );

  return clipXml.slice(0, windowStart) + patchedWin + clipXml.slice(windowEnd);
}
