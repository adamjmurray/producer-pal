// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { parseXmlPlist } from "../../../query/plugins/parse-xml-plist.ts";

const HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- made by hand -->`;

/**
 * @param body - What goes inside <plist>
 * @returns A whole plist document
 */
function doc(body: string): string {
  return `${HEAD}<plist version="1.0">${body}</plist>`;
}

describe("parseXmlPlist", () => {
  it("reads nested dicts, arrays and every scalar type", () => {
    const xml = doc(`<dict>
      <key>name</key><string>Apple: AUDelay</string>
      <key>count</key><integer>-3</integer>
      <key>ratio</key><real>1.5</real>
      <key>on</key><true/>
      <key>off</key><false></false>
      <key>when</key><date>2020-01-01T00:00:00Z</date>
      <key>nested</key><dict><key>list</key><array><string>a</string><dict/></array></dict>
      <key>none</key><array/>
    </dict>`);

    expect(parseXmlPlist(xml)).toStrictEqual({
      name: "Apple: AUDelay",
      count: -3,
      ratio: 1.5,
      on: true,
      off: false,
      when: "2020-01-01T00:00:00Z",
      nested: { list: ["a", {}] },
      none: [],
    });
  });

  it("decodes entities", () => {
    expect(
      parseXmlPlist(
        doc(
          "<string>A &amp; B &lt;&gt; &quot;q&quot; &apos;s&apos; &#65;&#x42;</string>",
        ),
      ),
    ).toBe(`A & B <> "q" 's' AB`);
  });

  it("skips comments whole, even ones holding tags or a second <!--", () => {
    expect(
      parseXmlPlist(
        doc(
          "<array><!-- <string>x</string> <!-- --><string>a</string></array>",
        ),
      ),
    ).toStrictEqual(["a"]);
  });

  it("reads empty strings", () => {
    expect(
      parseXmlPlist(doc("<array><string></string><string/></array>")),
    ).toStrictEqual(["", ""]);
  });

  it("is null for a binary plist or text that isn't a plist", () => {
    expect(parseXmlPlist("bplist00\u0001\u0002")).toBeNull();
    expect(parseXmlPlist("")).toBeNull();
    expect(parseXmlPlist("<xml/>")).toBeNull();
  });

  it("is null for a plist that is malformed", () => {
    expect(parseXmlPlist(doc("<dict><key>a</key>"))).toBeNull();
    expect(parseXmlPlist(doc("<dict><string>x</string></dict>"))).toBeNull();
    expect(parseXmlPlist(doc("<array><string>x</integer></array>"))).toBeNull();
    expect(parseXmlPlist(doc("text"))).toBeNull();
    expect(parseXmlPlist(doc("</dict>"))).toBeNull();
    expect(parseXmlPlist('<plist version="1.0"')).toBeNull();
    expect(parseXmlPlist("<plist>")).toBeNull();
    expect(parseXmlPlist("</plist><plist>")).toBeNull();
  });
});
