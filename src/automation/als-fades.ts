// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

type FadeType = "int" | "bool" | "float";

interface FadeDef {
  tag: string;
  type: FadeType;
  def: string;
  /** "sibling" = direkt im Clip neben <Fades>; "fades" = innerhalb <Fades>…</Fades> */
  scope: "sibling" | "fades";
}

/**
 * Setbare Fade-Keys (genau 7). Skew/Slope-Kinder sind über `getFades`
 * LESBAR, aber bewusst NICHT in FADE_SPEC — gekrümmte Kurven = Slice 4b.
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
};

/** Skew/Slope-Keys: lesbar, aber set-gesperrt (Slice 4b). */
const SKEW_SLOPE_KEYS = new Set([
  "FadeInCurveSkew",
  "FadeInCurveSlope",
  "FadeOutCurveSkew",
  "FadeOutCurveSlope",
]);

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

  for (const { tag, scope } of READ_KEYS) {
    const hay = scope === "fades" ? (fb?.block ?? "") : clipXml;
    const m = hay.match(new RegExp(`<${tag} Value="([^"]*)" />`));

    res[tag] = m?.[1] ?? FADE_SPEC[tag]?.def ?? "0";
  }

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
    throw new Error("Gekrümmte Fade-Kurve = Slice 4b, nicht unterstützt");

  const def = FADE_SPEC[key];

  if (def === undefined)
    throw new Error(
      `Unbekannter Key "${key}". Gültig: ${Object.keys(FADE_SPEC).join(", ")}`,
    );
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

  const tagRe = /<Fade Value="[^"]*" \/>/g;
  const hits = win.match(tagRe);

  if (hits === null)
    throw new Error("Tag <Fade> im Positions-Fenster nicht gefunden");
  if (hits.length !== 1)
    throw new Error(
      `Tag <Fade> ${hits.length}-mal im Positions-Fenster — mehrdeutig`,
    );

  let replaced = 0;
  const patchedWin = win.replace(
    /(<Fade Value=")[^"]*(" \/>)/,
    (_m, pre: string, post: string) => {
      replaced += 1;

      return `${pre}${value}${post}`;
    },
  );

  if (replaced !== 1)
    throw new Error(
      `Replace-Konsistenzfehler für <Fade>: Guard erwartete 1 Treffer, ` +
        `Replace ersetzte ${replaced}`,
    );

  return clipXml.slice(0, windowStart) + patchedWin + clipXml.slice(windowEnd);
}
