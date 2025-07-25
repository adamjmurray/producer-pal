// @generated by Peggy 5.0.5.
//
// https://peggyjs.org/



  const PITCH_CLASS_VALUES = {
    "C": 0,
    "C#": 1, "Db": 1,
    "D": 2,
    "D#": 3, "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6, "Gb": 6,
    "G": 7,
    "G#": 8, "Ab": 8,
    "A": 9,
    "A#": 10, "Bb": 10,
    "B": 11,
  };

class peg$SyntaxError extends SyntaxError {
  constructor(message, expected, found, location) {
    super(message);
    this.expected = expected;
    this.found = found;
    this.location = location;
    this.name = "SyntaxError";
  }

  format(sources) {
    let str = "Error: " + this.message;
    if (this.location) {
      let src = null;
      const st = sources.find(s => s.source === this.location.source);
      if (st) {
        src = st.text.split(/\r\n|\n|\r/g);
      }
      const s = this.location.start;
      const offset_s = (this.location.source && (typeof this.location.source.offset === "function"))
        ? this.location.source.offset(s)
        : s;
      const loc = this.location.source + ":" + offset_s.line + ":" + offset_s.column;
      if (src) {
        const e = this.location.end;
        const filler = "".padEnd(offset_s.line.toString().length, " ");
        const line = src[s.line - 1];
        const last = s.line === e.line ? e.column : line.length + 1;
        const hatLen = (last - s.column) || 1;
        str += "\n --> " + loc + "\n"
            + filler + " |\n"
            + offset_s.line + " | " + line + "\n"
            + filler + " | " + "".padEnd(s.column - 1, " ")
            + "".padEnd(hatLen, "^");
      } else {
        str += "\n at " + loc;
      }
    }
    return str;
  }

  static buildMessage(expected, found) {
    function hex(ch) {
      return ch.codePointAt(0).toString(16).toUpperCase();
    }

    const nonPrintable = Object.prototype.hasOwnProperty.call(RegExp.prototype, "unicode")
      ? new RegExp("[\\p{C}\\p{Mn}\\p{Mc}]", "gu")
      : null;
    function unicodeEscape(s) {
      if (nonPrintable) {
        return s.replace(nonPrintable,  ch => "\\u{" + hex(ch) + "}");
      }
      return s;
    }

    function literalEscape(s) {
      return unicodeEscape(s
        .replace(/\\/g, "\\\\")
        .replace(/"/g,  "\\\"")
        .replace(/\0/g, "\\0")
        .replace(/\t/g, "\\t")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/[\x00-\x0F]/g,          ch => "\\x0" + hex(ch))
        .replace(/[\x10-\x1F\x7F-\x9F]/g, ch => "\\x"  + hex(ch)));
    }

    function classEscape(s) {
      return unicodeEscape(s
        .replace(/\\/g, "\\\\")
        .replace(/\]/g, "\\]")
        .replace(/\^/g, "\\^")
        .replace(/-/g,  "\\-")
        .replace(/\0/g, "\\0")
        .replace(/\t/g, "\\t")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/[\x00-\x0F]/g,          ch => "\\x0" + hex(ch))
        .replace(/[\x10-\x1F\x7F-\x9F]/g, ch => "\\x"  + hex(ch)));
    }

    const DESCRIBE_EXPECTATION_FNS = {
      literal(expectation) {
        return "\"" + literalEscape(expectation.text) + "\"";
      },

      class(expectation) {
        const escapedParts = expectation.parts.map(
          part => (Array.isArray(part)
            ? classEscape(part[0]) + "-" + classEscape(part[1])
            : classEscape(part))
        );

        return "[" + (expectation.inverted ? "^" : "") + escapedParts.join("") + "]" + (expectation.unicode ? "u" : "");
      },

      any() {
        return "any character";
      },

      end() {
        return "end of input";
      },

      other(expectation) {
        return expectation.description;
      },
    };

    function describeExpectation(expectation) {
      return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
    }

    function describeExpected(expected) {
      const descriptions = expected.map(describeExpectation);
      descriptions.sort();

      if (descriptions.length > 0) {
        let j = 1;
        for (let i = 1; i < descriptions.length; i++) {
          if (descriptions[i - 1] !== descriptions[i]) {
            descriptions[j] = descriptions[i];
            j++;
          }
        }
        descriptions.length = j;
      }

      switch (descriptions.length) {
        case 1:
          return descriptions[0];

        case 2:
          return descriptions[0] + " or " + descriptions[1];

        default:
          return descriptions.slice(0, -1).join(", ")
            + ", or "
            + descriptions[descriptions.length - 1];
      }
    }

    function describeFound(found) {
      return found ? "\"" + literalEscape(found) + "\"" : "end of input";
    }

    return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
  }
}

function peg$parse(input, options) {
  options = options !== undefined ? options : {};

  const peg$FAILED = {};
  const peg$source = options.grammarSource;

  const peg$startRuleFunctions = {
    start: peg$parsestart,
  };
  let peg$startRuleFunction = peg$parsestart;

  const peg$c0 = "|";
  const peg$c1 = "p";
  const peg$c2 = "v";
  const peg$c3 = "-";
  const peg$c4 = "t";
  const peg$c5 = "C#";
  const peg$c6 = "Db";
  const peg$c7 = "D#";
  const peg$c8 = "Eb";
  const peg$c9 = "F#";
  const peg$c10 = "Gb";
  const peg$c11 = "G#";
  const peg$c12 = "Ab";
  const peg$c13 = "A#";
  const peg$c14 = "Bb";
  const peg$c15 = ".";

  const peg$r0 = /^[A-G]/;
  const peg$r1 = /^[0-9]/;
  const peg$r2 = /^[1-9]/;
  const peg$r3 = /^[ \t\r\n]/;

  const peg$e0 = peg$literalExpectation("|", false);
  const peg$e1 = peg$literalExpectation("p", false);
  const peg$e2 = peg$literalExpectation("v", false);
  const peg$e3 = peg$literalExpectation("-", false);
  const peg$e4 = peg$literalExpectation("t", false);
  const peg$e5 = peg$literalExpectation("C#", false);
  const peg$e6 = peg$literalExpectation("Db", false);
  const peg$e7 = peg$literalExpectation("D#", false);
  const peg$e8 = peg$literalExpectation("Eb", false);
  const peg$e9 = peg$literalExpectation("F#", false);
  const peg$e10 = peg$literalExpectation("Gb", false);
  const peg$e11 = peg$literalExpectation("G#", false);
  const peg$e12 = peg$literalExpectation("Ab", false);
  const peg$e13 = peg$literalExpectation("A#", false);
  const peg$e14 = peg$literalExpectation("Bb", false);
  const peg$e15 = peg$classExpectation([["A", "G"]], false, false, false);
  const peg$e16 = peg$classExpectation([["0", "9"]], false, false, false);
  const peg$e17 = peg$classExpectation([["1", "9"]], false, false, false);
  const peg$e18 = peg$literalExpectation(".", false);
  const peg$e19 = peg$classExpectation([" ", "\t", "\r", "\n"], false, false, false);

  function peg$f0(head, tail) {
    return [head, ...tail.map(t => t[1])].filter(Boolean);
  }
  function peg$f1(bar, beat) {
    return { bar, beat };
  }
  function peg$f2(val) {
    if (val >= 0.0 && val <= 1.0) {
      return { probability: val };
    }
    else throw new Error(`Note probability ${val} outside valid range 0.0-1.0`);
  }
  function peg$f3(start, end) {
    if (start >= 0 && start <= 127 && end >= 0 && end <= 127) {
      return { 
        velocityMin: Math.min(start, end), 
        velocityMax: Math.max(start, end),
      };
    }
    else throw new Error(`Invalid velocity range ${start}-${end}`);
  }
  function peg$f4(val) {
    if (val >= 0 && val <= 127) {
      return { velocity: val };
    }
    else throw new Error(`MIDI velocity ${val} outside valid range 0-127`);
  }
  function peg$f5(val) {
    return { duration: val };
  }
  function peg$f6(pitchClass, octave) {
    const name = `${pitchClass.name}${octave}`;
    const pitch = (octave + 2) * 12 + pitchClass.value;
    if (pitch >= 0 && pitch <= 127) {
      return { pitch };
    }
    else throw new Error(`MIDI pitch ${pitch} (${name}) outside valid range 0-127`);    
  }
  function peg$f7(pc) {
    return { name: pc, value: PITCH_CLASS_VALUES[pc] };
  }
  function peg$f8() {    
       return Number.parseInt(text()); 
  }
  function peg$f9() {    
       return Number.parseInt(text()); 
  }
  function peg$f10(sign, value) {
    return sign ? -value : value;
  }
  function peg$f11() {
    return Number.parseFloat(text());
  }
  function peg$f12() {
    return Number.parseFloat(text());
  }
  let peg$currPos = options.peg$currPos | 0;
  let peg$savedPos = peg$currPos;
  const peg$posDetailsCache = [{ line: 1, column: 1 }];
  let peg$maxFailPos = peg$currPos;
  let peg$maxFailExpected = options.peg$maxFailExpected || [];
  let peg$silentFails = options.peg$silentFails | 0;

  let peg$result;

  if (options.startRule) {
    if (!(options.startRule in peg$startRuleFunctions)) {
      throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
    }

    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
  }

  function text() {
    return input.substring(peg$savedPos, peg$currPos);
  }

  function offset() {
    return peg$savedPos;
  }

  function range() {
    return {
      source: peg$source,
      start: peg$savedPos,
      end: peg$currPos,
    };
  }

  function location() {
    return peg$computeLocation(peg$savedPos, peg$currPos);
  }

  function expected(description, location) {
    location = location !== undefined
      ? location
      : peg$computeLocation(peg$savedPos, peg$currPos);

    throw peg$buildStructuredError(
      [peg$otherExpectation(description)],
      input.substring(peg$savedPos, peg$currPos),
      location
    );
  }

  function error(message, location) {
    location = location !== undefined
      ? location
      : peg$computeLocation(peg$savedPos, peg$currPos);

    throw peg$buildSimpleError(message, location);
  }

  function peg$getUnicode(pos = peg$currPos) {
    const cp = input.codePointAt(pos);
    if (cp === undefined) {
      return "";
    }
    return String.fromCodePoint(cp);
  }

  function peg$literalExpectation(text, ignoreCase) {
    return { type: "literal", text, ignoreCase };
  }

  function peg$classExpectation(parts, inverted, ignoreCase, unicode) {
    return { type: "class", parts, inverted, ignoreCase, unicode };
  }

  function peg$anyExpectation() {
    return { type: "any" };
  }

  function peg$endExpectation() {
    return { type: "end" };
  }

  function peg$otherExpectation(description) {
    return { type: "other", description };
  }

  function peg$computePosDetails(pos) {
    let details = peg$posDetailsCache[pos];
    let p;

    if (details) {
      return details;
    } else {
      if (pos >= peg$posDetailsCache.length) {
        p = peg$posDetailsCache.length - 1;
      } else {
        p = pos;
        while (!peg$posDetailsCache[--p]) {}
      }

      details = peg$posDetailsCache[p];
      details = {
        line: details.line,
        column: details.column,
      };

      while (p < pos) {
        if (input.charCodeAt(p) === 10) {
          details.line++;
          details.column = 1;
        } else {
          details.column++;
        }

        p++;
      }

      peg$posDetailsCache[pos] = details;

      return details;
    }
  }

  function peg$computeLocation(startPos, endPos, offset) {
    const startPosDetails = peg$computePosDetails(startPos);
    const endPosDetails = peg$computePosDetails(endPos);

    const res = {
      source: peg$source,
      start: {
        offset: startPos,
        line: startPosDetails.line,
        column: startPosDetails.column,
      },
      end: {
        offset: endPos,
        line: endPosDetails.line,
        column: endPosDetails.column,
      },
    };
    if (offset && peg$source && (typeof peg$source.offset === "function")) {
      res.start = peg$source.offset(res.start);
      res.end = peg$source.offset(res.end);
    }
    return res;
  }

  function peg$fail(expected) {
    if (peg$currPos < peg$maxFailPos) { return; }

    if (peg$currPos > peg$maxFailPos) {
      peg$maxFailPos = peg$currPos;
      peg$maxFailExpected = [];
    }

    peg$maxFailExpected.push(expected);
  }

  function peg$buildSimpleError(message, location) {
    return new peg$SyntaxError(message, null, null, location);
  }

  function peg$buildStructuredError(expected, found, location) {
    return new peg$SyntaxError(
      peg$SyntaxError.buildMessage(expected, found),
      expected,
      found,
      location
    );
  }

  function peg$parsestart() {
    let s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$parse_();
    s2 = peg$parseelement();
    if (s2 === peg$FAILED) {
      s2 = null;
    }
    s3 = [];
    s4 = peg$currPos;
    s5 = [];
    s6 = peg$parseWS();
    if (s6 !== peg$FAILED) {
      while (s6 !== peg$FAILED) {
        s5.push(s6);
        s6 = peg$parseWS();
      }
    } else {
      s5 = peg$FAILED;
    }
    if (s5 !== peg$FAILED) {
      s6 = peg$parseelement();
      if (s6 !== peg$FAILED) {
        s5 = [s5, s6];
        s4 = s5;
      } else {
        peg$currPos = s4;
        s4 = peg$FAILED;
      }
    } else {
      peg$currPos = s4;
      s4 = peg$FAILED;
    }
    while (s4 !== peg$FAILED) {
      s3.push(s4);
      s4 = peg$currPos;
      s5 = [];
      s6 = peg$parseWS();
      if (s6 !== peg$FAILED) {
        while (s6 !== peg$FAILED) {
          s5.push(s6);
          s6 = peg$parseWS();
        }
      } else {
        s5 = peg$FAILED;
      }
      if (s5 !== peg$FAILED) {
        s6 = peg$parseelement();
        if (s6 !== peg$FAILED) {
          s5 = [s5, s6];
          s4 = s5;
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
      } else {
        peg$currPos = s4;
        s4 = peg$FAILED;
      }
    }
    s4 = peg$parse_();
    peg$savedPos = s0;
    s0 = peg$f0(s2, s3);

    return s0;
  }

  function peg$parseelement() {
    let s0;

    s0 = peg$parsetime();
    if (s0 === peg$FAILED) {
      s0 = peg$parseprobability();
      if (s0 === peg$FAILED) {
        s0 = peg$parsevelocity();
        if (s0 === peg$FAILED) {
          s0 = peg$parseduration();
          if (s0 === peg$FAILED) {
            s0 = peg$parsenote();
          }
        }
      }
    }

    return s0;
  }

  function peg$parsetime() {
    let s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parsepositiveInt();
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 124) {
        s2 = peg$c0;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e0); }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parsepositiveFloat();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s0 = peg$f1(s1, s3);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseprobability() {
    let s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 112) {
      s1 = peg$c1;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e1); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseunsignedFloat();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s0 = peg$f2(s2);
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsevelocity() {
    let s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 118) {
      s1 = peg$c2;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e2); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseunsignedInt();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 45) {
          s3 = peg$c3;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e3); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseunsignedInt();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f3(s2, s4);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 118) {
        s1 = peg$c2;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e2); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseunsignedInt();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s0 = peg$f4(s2);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseduration() {
    let s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 116) {
      s1 = peg$c4;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e4); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseunsignedFloat();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s0 = peg$f5(s2);
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsenote() {
    let s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$parsepitchClass();
    if (s1 !== peg$FAILED) {
      s2 = peg$parsesignedInt();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s0 = peg$f6(s1, s2);
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsepitchClass() {
    let s0, s1;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c5) {
      s1 = peg$c5;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e5); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 2) === peg$c6) {
        s1 = peg$c6;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e6); }
      }
      if (s1 === peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c7) {
          s1 = peg$c7;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e7); }
        }
        if (s1 === peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c8) {
            s1 = peg$c8;
            peg$currPos += 2;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e8); }
          }
          if (s1 === peg$FAILED) {
            if (input.substr(peg$currPos, 2) === peg$c9) {
              s1 = peg$c9;
              peg$currPos += 2;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$e9); }
            }
            if (s1 === peg$FAILED) {
              if (input.substr(peg$currPos, 2) === peg$c10) {
                s1 = peg$c10;
                peg$currPos += 2;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$e10); }
              }
              if (s1 === peg$FAILED) {
                if (input.substr(peg$currPos, 2) === peg$c11) {
                  s1 = peg$c11;
                  peg$currPos += 2;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$e11); }
                }
                if (s1 === peg$FAILED) {
                  if (input.substr(peg$currPos, 2) === peg$c12) {
                    s1 = peg$c12;
                    peg$currPos += 2;
                  } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$e12); }
                  }
                  if (s1 === peg$FAILED) {
                    if (input.substr(peg$currPos, 2) === peg$c13) {
                      s1 = peg$c13;
                      peg$currPos += 2;
                    } else {
                      s1 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$e13); }
                    }
                    if (s1 === peg$FAILED) {
                      if (input.substr(peg$currPos, 2) === peg$c14) {
                        s1 = peg$c14;
                        peg$currPos += 2;
                      } else {
                        s1 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$e14); }
                      }
                      if (s1 === peg$FAILED) {
                        s1 = input.charAt(peg$currPos);
                        if (peg$r0.test(s1)) {
                          peg$currPos++;
                        } else {
                          s1 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$e15); }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$f7(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseunsignedInt() {
    let s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    s2 = input.charAt(peg$currPos);
    if (peg$r1.test(s2)) {
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e16); }
    }
    if (s2 !== peg$FAILED) {
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        s2 = input.charAt(peg$currPos);
        if (peg$r1.test(s2)) {
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e16); }
        }
      }
    } else {
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$f8();
    }
    s0 = s1;

    return s0;
  }

  function peg$parsepositiveInt() {
    let s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = input.charAt(peg$currPos);
    if (peg$r2.test(s1)) {
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e17); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = input.charAt(peg$currPos);
      if (peg$r1.test(s3)) {
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e16); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = input.charAt(peg$currPos);
        if (peg$r1.test(s3)) {
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e16); }
        }
      }
      peg$savedPos = s0;
      s0 = peg$f9();
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsesignedInt() {
    let s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 45) {
      s1 = peg$c3;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e3); }
    }
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    s2 = peg$parseunsignedInt();
    if (s2 !== peg$FAILED) {
      peg$savedPos = s0;
      s0 = peg$f10(s1, s2);
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseunsignedFloat() {
    let s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = [];
    s3 = input.charAt(peg$currPos);
    if (peg$r1.test(s3)) {
      peg$currPos++;
    } else {
      s3 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e16); }
    }
    if (s3 !== peg$FAILED) {
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = input.charAt(peg$currPos);
        if (peg$r1.test(s3)) {
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e16); }
        }
      }
    } else {
      s2 = peg$FAILED;
    }
    if (s2 !== peg$FAILED) {
      s3 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 46) {
        s4 = peg$c15;
        peg$currPos++;
      } else {
        s4 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e18); }
      }
      if (s4 !== peg$FAILED) {
        s5 = [];
        s6 = input.charAt(peg$currPos);
        if (peg$r1.test(s6)) {
          peg$currPos++;
        } else {
          s6 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e16); }
        }
        while (s6 !== peg$FAILED) {
          s5.push(s6);
          s6 = input.charAt(peg$currPos);
          if (peg$r1.test(s6)) {
            peg$currPos++;
          } else {
            s6 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e16); }
          }
        }
        s4 = [s4, s5];
        s3 = s4;
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      if (s3 === peg$FAILED) {
        s3 = null;
      }
      s2 = [s2, s3];
      s1 = s2;
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 === peg$FAILED) {
      s1 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 46) {
        s2 = peg$c15;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e18); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = input.charAt(peg$currPos);
        if (peg$r1.test(s4)) {
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e16); }
        }
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = input.charAt(peg$currPos);
            if (peg$r1.test(s4)) {
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$e16); }
            }
          }
        } else {
          s3 = peg$FAILED;
        }
        if (s3 !== peg$FAILED) {
          s2 = [s2, s3];
          s1 = s2;
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$f11();
    }
    s0 = s1;

    return s0;
  }

  function peg$parsepositiveFloat() {
    let s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = input.charAt(peg$currPos);
    if (peg$r2.test(s1)) {
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e17); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = input.charAt(peg$currPos);
      if (peg$r1.test(s3)) {
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e16); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = input.charAt(peg$currPos);
        if (peg$r1.test(s3)) {
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e16); }
        }
      }
      s3 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 46) {
        s4 = peg$c15;
        peg$currPos++;
      } else {
        s4 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e18); }
      }
      if (s4 !== peg$FAILED) {
        s5 = [];
        s6 = input.charAt(peg$currPos);
        if (peg$r1.test(s6)) {
          peg$currPos++;
        } else {
          s6 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e16); }
        }
        while (s6 !== peg$FAILED) {
          s5.push(s6);
          s6 = input.charAt(peg$currPos);
          if (peg$r1.test(s6)) {
            peg$currPos++;
          } else {
            s6 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e16); }
          }
        }
        s4 = [s4, s5];
        s3 = s4;
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      if (s3 === peg$FAILED) {
        s3 = null;
      }
      peg$savedPos = s0;
      s0 = peg$f12();
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseWS() {
    let s0, s1;

    s0 = [];
    s1 = input.charAt(peg$currPos);
    if (peg$r3.test(s1)) {
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e19); }
    }
    if (s1 !== peg$FAILED) {
      while (s1 !== peg$FAILED) {
        s0.push(s1);
        s1 = input.charAt(peg$currPos);
        if (peg$r3.test(s1)) {
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e19); }
        }
      }
    } else {
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parse_() {
    let s0, s1;

    s0 = [];
    s1 = input.charAt(peg$currPos);
    if (peg$r3.test(s1)) {
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e19); }
    }
    while (s1 !== peg$FAILED) {
      s0.push(s1);
      s1 = input.charAt(peg$currPos);
      if (peg$r3.test(s1)) {
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e19); }
      }
    }

    return s0;
  }

  peg$result = peg$startRuleFunction();

  const peg$success = (peg$result !== peg$FAILED && peg$currPos === input.length);
  function peg$throw() {
    if (peg$result !== peg$FAILED && peg$currPos < input.length) {
      peg$fail(peg$endExpectation());
    }

    throw peg$buildStructuredError(
      peg$maxFailExpected,
      peg$maxFailPos < input.length ? peg$getUnicode(peg$maxFailPos) : null,
      peg$maxFailPos < input.length
        ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
        : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
    );
  }
  if (options.peg$library) {
    return /** @type {any} */ ({
      peg$result,
      peg$currPos,
      peg$FAILED,
      peg$maxFailExpected,
      peg$maxFailPos,
      peg$success,
      peg$throw: peg$success ? undefined : peg$throw,
    });
  }
  if (peg$success) {
    return peg$result;
  } else {
    peg$throw();
  }
}

const peg$allowedStartRules = [
  "start"
];

export {
  peg$allowedStartRules as StartRules,
  peg$SyntaxError as SyntaxError,
  peg$parse as parse
};
