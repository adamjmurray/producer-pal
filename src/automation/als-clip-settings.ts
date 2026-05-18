// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

type SettingType = "int" | "bool" | "enum";

interface SettingDef {
  tag: string;
  type: SettingType;
  def: string;
  /** true = nur innerhalb <FollowAction>…</FollowAction> patchen */
  inFollowAction: boolean;
}

export const CLIP_SETTING_SPEC: Record<string, SettingDef> = {
  LaunchMode: {
    tag: "LaunchMode",
    type: "enum",
    def: "0",
    inFollowAction: false,
  },
  LaunchQuantisation: {
    tag: "LaunchQuantisation",
    type: "enum",
    def: "0",
    inFollowAction: false,
  },
  Legato: { tag: "Legato", type: "bool", def: "false", inFollowAction: false },
  VelocityAmount: {
    tag: "VelocityAmount",
    type: "int",
    def: "0",
    inFollowAction: false,
  },
  FollowTime: {
    tag: "FollowTime",
    type: "int",
    def: "4",
    inFollowAction: true,
  },
  IsLinked: {
    tag: "IsLinked",
    type: "bool",
    def: "true",
    inFollowAction: true,
  },
  LoopIterations: {
    tag: "LoopIterations",
    type: "int",
    def: "1",
    inFollowAction: true,
  },
  FollowActionA: {
    tag: "FollowActionA",
    type: "enum",
    def: "4",
    inFollowAction: true,
  },
  FollowActionB: {
    tag: "FollowActionB",
    type: "enum",
    def: "0",
    inFollowAction: true,
  },
  FollowChanceA: {
    tag: "FollowChanceA",
    type: "int",
    def: "100",
    inFollowAction: true,
  },
  FollowChanceB: {
    tag: "FollowChanceB",
    type: "int",
    def: "0",
    inFollowAction: true,
  },
  JumpIndexA: {
    tag: "JumpIndexA",
    type: "int",
    def: "1",
    inFollowAction: true,
  },
  JumpIndexB: {
    tag: "JumpIndexB",
    type: "int",
    def: "1",
    inFollowAction: true,
  },
  FollowActionEnabled: {
    tag: "FollowActionEnabled",
    type: "bool",
    def: "false",
    inFollowAction: true,
  },
};

/**
 * Byte-belegte Enum-Tabellen (Name -> Integer-String) aus der G3'-Ground-
 * Truth-Fixture `docs/superpowers/fixtures/ableton12-clip-settings-
 * groundtruth.xml` (Ableton 12.3.8). Werte sind Strings, da Patch-Werte
 * Strings sind. KEINE Spekulation: nur byte-belegte Stufen.
 * `LaunchQuantisation` hat absichtlich nur die beiden im Set vorhandenen
 * Stufen — weitere Stufen bleiben Roh-Int-Passthrough (Design).
 */
export const ENUM_TABLES: Record<string, Record<string, string>> = {
  // FollowActionA und FollowActionB teilen dieselbe Action-Enum.
  FollowActionA: {
    "No Action": "0",
    Stop: "1",
    "Play Again": "2",
    Previous: "3",
    Next: "4",
    First: "5",
    Last: "6",
    Any: "7",
    Other: "8",
    Jump: "9",
  },
  FollowActionB: {
    "No Action": "0",
    Stop: "1",
    "Play Again": "2",
    Previous: "3",
    Next: "4",
    First: "5",
    Last: "6",
    Any: "7",
    Other: "8",
    Jump: "9",
  },
  LaunchMode: { Trigger: "0", Gate: "1", Toggle: "2", Repeat: "3" },
  LaunchQuantisation: { Global: "0", "1 Bar": "5" },
};

/**
 * Löst einen Enum-Wert auf: Roh-Integer (`/^-?\d+$/`) wird unverändert
 * durchgereicht (auch `0`/negativ); ein Name wird über `ENUM_TABLES[key]`
 * aufgelöst. Unbekannter Name -> Error mit der Liste erlaubter Namen.
 *
 * @param key - Enum-Setting-Key (z. B. `FollowActionA`, `LaunchMode`).
 * @param v - Roh-Integer-String oder Enum-Name.
 * @returns Der aufgelöste Integer-String.
 */
export function resolveEnumValue(key: string, v: string): string {
  if (/^-?\d+$/.test(v)) return v;

  const table = ENUM_TABLES[key];
  const resolved = table?.[v];

  if (resolved !== undefined) return resolved;

  const allowed =
    table === undefined ? "(keine)" : Object.keys(table).join(", ");

  throw new Error(
    `Ungültiger Enum-Name "${v}" für Key "${key}". ` +
      `Erlaubt: ${allowed} (oder Roh-Integer)`,
  );
}

/**
 * Lokalisiert den `<FollowAction>…</FollowAction>`-Block.
 *
 * @param clipXml - Der Clip-XML-Block.
 * @returns Block-String mit Offsets oder `null`, falls nicht vorhanden.
 */
function followActionBlock(
  clipXml: string,
): { block: string; start: number; end: number } | null {
  const m = clipXml.match(/<FollowAction>[^]*?<\/FollowAction>/);

  if (m?.index === undefined) return null;

  return { block: m[0], start: m.index, end: m.index + m[0].length };
}

/**
 * Liest die 14 Clip-Settings aus einem Clip-XML-Block.
 *
 * WARNUNG: Fehlende Tags sind nicht von echten Default-Werten
 * unterscheidbar (beides liefert `def.def`). Daher NICHT als alleinige
 * Verify-Quelle nach einem `patchClipSetting`-Aufruf nutzen — der Aufrufer
 * muss den gepatchten Roh-Wert im XML direkt prüfen.
 *
 * @param clipXml - Der `<MidiClip>`/`<AudioClip>`-Block als String.
 * @returns Map Key -> Wert; fehlende Tags liefern den Spec-Default.
 */
export function getClipSettings(clipXml: string): Record<string, string> {
  const res: Record<string, string> = {};

  for (const [key, def] of Object.entries(CLIP_SETTING_SPEC)) {
    const scope = def.inFollowAction
      ? (followActionBlock(clipXml)?.block ?? "")
      : clipXml;
    const m = scope.match(new RegExp(`<${def.tag} Value="([^"]*)" />`));

    res[key] = m?.[1] ?? def.def;
  }

  return res;
}

/**
 * Validiert den Wert gemäß Setting-Typ (bool/int/enum).
 *
 * @param key - Setting-Key (für die Fehlermeldung).
 * @param def - Spec-Definition des Keys.
 * @param value - Zu prüfender Wert.
 */
function validate(key: string, def: SettingDef, value: string): void {
  if (def.type === "bool" && value !== "true" && value !== "false")
    throw new Error(
      `Key "${key}" erwartet bool (true|false), nicht "${value}"`,
    );
  if ((def.type === "int" || def.type === "enum") && !/^-?\d+$/.test(value))
    throw new Error(
      `Key "${key}" erwartet Integer (ganzzahl), nicht "${value}"`,
    );
}

/**
 * Plan-Anpassung A (R2): ersetzt `<tag Value="…" />` AUSSCHLIESSLICH im
 * Fenster zwischen startMarkerRe und (erstem nachfolgenden) endMarkerRe.
 * Wirft bei 0 oder >1 Treffern im Fenster (kein Off-Target-Patch).
 *
 * @param clipXml - Der Clip-XML-Block.
 * @param tag - Tag-Name, dessen `Value` ersetzt wird.
 * @param value - Neuer Wert.
 * @param startMarkerRe - Regex, dessen Match-Ende das Fenster öffnet.
 * @param endMarkerRe - Regex (relativ zum Fensterstart), das das Fenster schließt.
 * @returns Der Clip-XML-Block mit genau einem ersetzten Tag im Fenster.
 */
function replaceScalarInWindow(
  clipXml: string,
  tag: string,
  value: string,
  startMarkerRe: RegExp,
  endMarkerRe: RegExp,
): string {
  const sm = clipXml.match(startMarkerRe);

  if (sm?.index === undefined)
    throw new Error(
      `Positions-Anker für <${tag}> nicht gefunden (Startmarke fehlt)`,
    );
  const windowStart = sm.index + sm[0].length;
  const rest = clipXml.slice(windowStart);
  const em = rest.match(endMarkerRe);

  if (em?.index === undefined)
    throw new Error(
      `Positions-Anker für <${tag}> nicht gefunden (Endmarke fehlt)`,
    );
  const windowEnd = windowStart + em.index;
  const win = clipXml.slice(windowStart, windowEnd);

  // Genau EIN non-global Regex sowohl für Count-Guard als auch für Replace,
  // damit Guard und Ersetzung nicht über zwei separate Patterns gekoppelt
  // sind (defensive Konsistenz Guard <-> Replace).
  const tagRe = new RegExp(`<${tag} Value="[^"]*" />`, "g");
  const hits = win.match(tagRe);

  if (hits === null)
    throw new Error(`Tag <${tag}> im Clip nicht gefunden (Fenster leer)`);
  if (hits.length !== 1)
    throw new Error(
      `Tag <${tag}> ${hits.length}-mal im Positions-Fenster — mehrdeutig`,
    );

  let replaced = 0;
  const patchedWin = win.replace(
    new RegExp(`(<${tag} Value=")[^"]*(" />)`),
    (_m, pre: string, post: string) => {
      replaced += 1;

      return `${pre}${value}${post}`;
    },
  );

  // Konsistenz-Assertion: Guard sagte exakt 1 Treffer — der Replace muss
  // exakt 1 Ersetzung durchführen, sonst sind Guard und Replace divergiert.
  if (replaced !== 1)
    throw new Error(
      `Replace-Konsistenzfehler für <${tag}>: Guard erwartete 1 Treffer, ` +
        `Replace ersetzte ${replaced} — Marker/Regex inkonsistent`,
    );

  return clipXml.slice(0, windowStart) + patchedWin + clipXml.slice(windowEnd);
}

/**
 * Setzt einen einzelnen Clip-Setting-Wert positions-verankert (Anpassung A).
 *
 * @param clipXml - Der Clip-XML-Block.
 * @param key - Einer der 14 Keys aus `CLIP_SETTING_SPEC`.
 * @param value - Neuer Wert; wird typabhängig validiert.
 * @returns Der Clip-XML-Block mit genau einem ersetzten Tag.
 */
export function patchClipSetting(
  clipXml: string,
  key: string,
  value: string,
): string {
  const def = CLIP_SETTING_SPEC[key];

  if (def === undefined)
    throw new Error(
      `Unbekannter Key "${key}". Gültig: ${Object.keys(CLIP_SETTING_SPEC).join(", ")}`,
    );
  // Enum-Keys: Namen vor dem Schreiben in Roh-Integer auflösen
  // (Roh-Int-Pfad bleibt unverändert -> keine T2-Regression).
  if (def.type === "enum") value = resolveEnumValue(key, value);
  validate(key, def, value);

  if (def.inFollowAction) {
    const fa = followActionBlock(clipXml);

    if (fa === null) throw new Error(`<FollowAction> im Clip nicht gefunden`);
    const tagRe = new RegExp(`(<${def.tag} Value=")[^"]*(" />)`);

    if (!tagRe.test(fa.block))
      throw new Error(`Tag <${def.tag}> in <FollowAction> nicht gefunden`);
    const patched = fa.block.replace(tagRe, `$1${value}$2`);

    return clipXml.slice(0, fa.start) + patched + clipXml.slice(fa.end);
  }

  // Plan-Anpassung A: Top-Level-Scalars positions-verankert patchen.
  switch (def.tag) {
    case "LaunchMode":
    case "LaunchQuantisation":
      return replaceScalarInWindow(
        clipXml,
        def.tag,
        value,
        /<Color [^>]*\/>/,
        /<TimeSignature>/,
      );
    case "Legato":
      return replaceScalarInWindow(
        clipXml,
        def.tag,
        value,
        /<\/TimeSelection>/,
        /<Ram /,
      );
    case "VelocityAmount":
      // VelocityAmount steht in der Recon-Reihenfolge IMMER zwischen
      // <Ram .../> (in jedem Clip byte-belegt) und <FollowAction>
      // (unmittelbar davor). <Disabled/> ist optional/fehlt im Test-Clip.
      return replaceScalarInWindow(
        clipXml,
        def.tag,
        value,
        /<Ram [^>]*\/>/,
        /<FollowAction>/,
      );
    default:
      throw new Error(`Tag <${def.tag}> ohne Positions-Anker — nicht patchbar`);
  }
}
