import { describe, expect, it } from "vitest";
import { toCompactJSLiteral } from "#src/shared/compact-serializer.js";

describe("toCompactJSLiteral - Primitives", () => {
  it("converts strings to JSON-quoted format", () => {
    expect(toCompactJSLiteral("hello")).toBe('"hello"');
    expect(toCompactJSLiteral("world")).toBe('"world"');
    expect(toCompactJSLiteral("")).toBe('""');
  });

  it("converts numbers to string format", () => {
    expect(toCompactJSLiteral(42)).toBe("42");
    expect(toCompactJSLiteral(0)).toBe("0");
    expect(toCompactJSLiteral(3.14)).toBe("3.14");
    expect(toCompactJSLiteral(-100)).toBe("-100");
  });

  it("converts booleans to string format", () => {
    expect(toCompactJSLiteral(true)).toBe("true");
    expect(toCompactJSLiteral(false)).toBe("false");
  });

  it("converts null to string", () => {
    expect(toCompactJSLiteral(null)).toBe("null");
  });

  it("converts top-level undefined to empty string", () => {
    expect(toCompactJSLiteral()).toBe("");
  });
});

describe("toCompactJSLiteral - Arrays", () => {
  it("converts empty arrays", () => {
    expect(toCompactJSLiteral([])).toBe("[]");
  });

  it("converts simple arrays without whitespace", () => {
    expect(toCompactJSLiteral([1, 2, 3])).toBe("[1,2,3]");
    expect(toCompactJSLiteral(["a", "b", "c"])).toBe('["a","b","c"]');
  });

  it("includes 0 and false in arrays", () => {
    expect(toCompactJSLiteral([1, 0, 2])).toBe("[1,0,2]");
    expect(toCompactJSLiteral([true, false, true])).toBe("[true,false,true]");
  });

  it("includes null in arrays", () => {
    expect(toCompactJSLiteral([1, null, 2])).toBe("[1,null,2]");
  });

  it("skips undefined in arrays", () => {
    expect(toCompactJSLiteral([1, undefined, 2])).toBe("[1,2]");
    expect(toCompactJSLiteral([undefined, undefined])).toBe("[]");
  });

  it("handles nested arrays", () => {
    expect(
      toCompactJSLiteral([
        [1, 2],
        [3, 4],
      ]),
    ).toBe("[[1,2],[3,4]]");
    expect(toCompactJSLiteral([1, [2, 3], 4])).toBe("[1,[2,3],4]");
  });

  it("handles nested arrays with undefined", () => {
    expect(
      toCompactJSLiteral([
        [1, undefined],
        [undefined, 2],
      ]),
    ).toBe("[[1],[2]]");
    expect(toCompactJSLiteral([1, [undefined, undefined], 2])).toBe("[1,[],2]");
  });

  it("handles mixed type arrays", () => {
    expect(toCompactJSLiteral([1, "text", true, false, null, 0])).toBe(
      '[1,"text",true,false,null,0]',
    );
    expect(toCompactJSLiteral([{ a: 1 }, [2, 3]])).toBe("[{a:1},[2,3]]");
  });
});

describe("toCompactJSLiteral - Objects", () => {
  it("converts empty objects", () => {
    expect(toCompactJSLiteral({})).toBe("{}");
  });

  it("converts simple objects with unquoted keys and no whitespace", () => {
    expect(toCompactJSLiteral({ a: 1 })).toBe("{a:1}");
    expect(toCompactJSLiteral({ name: "test" })).toBe('{name:"test"}');
    expect(toCompactJSLiteral({ flag: true })).toBe("{flag:true}");
  });

  it("handles multiple properties", () => {
    expect(toCompactJSLiteral({ a: 1, b: 2, c: 3 })).toBe("{a:1,b:2,c:3}");
  });

  it("includes 0 and false in objects", () => {
    expect(toCompactJSLiteral({ a: 1, b: 0, c: 2 })).toBe("{a:1,b:0,c:2}");
    expect(toCompactJSLiteral({ a: true, b: false, c: true })).toBe(
      "{a:true,b:false,c:true}",
    );
  });

  it("includes null in objects", () => {
    expect(toCompactJSLiteral({ a: 1, b: null, c: 2 })).toBe(
      "{a:1,b:null,c:2}",
    );
  });

  it("skips undefined in objects", () => {
    expect(toCompactJSLiteral({ a: 1, b: undefined, c: 2 })).toBe("{a:1,c:2}");
    expect(toCompactJSLiteral({ a: undefined, b: undefined })).toBe("{}");
  });

  it("handles nested objects", () => {
    expect(toCompactJSLiteral({ a: { b: 1 } })).toBe("{a:{b:1}}");
    expect(toCompactJSLiteral({ x: { y: { z: 42 } } })).toBe("{x:{y:{z:42}}}");
  });

  it("handles nested objects with undefined", () => {
    expect(toCompactJSLiteral({ a: { b: 1, c: undefined } })).toBe("{a:{b:1}}");
    expect(toCompactJSLiteral({ x: { y: undefined }, z: 1 })).toBe(
      "{x:{},z:1}",
    );
  });

  it("handles objects with arrays", () => {
    expect(toCompactJSLiteral({ items: [1, 2, 3] })).toBe("{items:[1,2,3]}");
    expect(toCompactJSLiteral({ a: 1, b: [2, 3] })).toBe("{a:1,b:[2,3]}");
  });

  it("handles arrays with objects", () => {
    expect(toCompactJSLiteral([{ a: 1 }, { b: 2 }])).toBe("[{a:1},{b:2}]");
  });
});

describe("toCompactJSLiteral - Complex structures", () => {
  it("handles deeply nested structures", () => {
    const input = {
      track: {
        id: "track_1",
        name: "Drums",
        clips: [
          { id: "clip_1", length: 4 },
          { id: "clip_2", length: 8 },
        ],
      },
    };

    expect(toCompactJSLiteral(input)).toBe(
      '{track:{id:"track_1",name:"Drums",clips:[{id:"clip_1",length:4},{id:"clip_2",length:8}]}}',
    );
  });

  it("skips undefined throughout nested structure", () => {
    const input = {
      track: {
        id: "t1",
        mute: false,
        volume: 0,
        undefined_field: undefined,
        clips: [
          { id: "c1", mute: false },
          { id: "c2", mute: true, undefined_field: undefined },
        ],
      },
    };

    expect(toCompactJSLiteral(input)).toBe(
      '{track:{id:"t1",mute:false,volume:0,clips:[{id:"c1",mute:false},{id:"c2",mute:true}]}}',
    );
  });

  it("handles mixed nested arrays and objects", () => {
    const input = {
      scenes: [
        { name: "Scene 1", tempo: 120 },
        { name: "Scene 2", tempo: 140 },
      ],
      tracks: {
        count: 3,
        items: ["Track A", "Track B"],
      },
    };

    expect(toCompactJSLiteral(input)).toBe(
      '{scenes:[{name:"Scene 1",tempo:120},{name:"Scene 2",tempo:140}],tracks:{count:3,items:["Track A","Track B"]}}',
    );
  });
});

describe("toCompactJSLiteral - Token savings comparison", () => {
  it("saves tokens compared to JSON by removing quotes from keys", () => {
    const obj = { trackId: "t1", sceneId: "s1", clipId: "c1" };
    const compact = toCompactJSLiteral(obj);
    const json = JSON.stringify(obj);

    // Compact: {trackId:"t1",sceneId:"s1",clipId:"c1"}
    // JSON: {"trackId":"t1","sceneId":"s1","clipId":"c1"}
    expect(compact.length).toBeLessThan(json.length);
    expect(compact).toBe('{trackId:"t1",sceneId:"s1",clipId:"c1"}');
    expect(json).toBe('{"trackId":"t1","sceneId":"s1","clipId":"c1"}');
  });

  it("saves tokens by removing whitespace", () => {
    const obj = { x: [1, 2, 3], y: { z: 4 } };
    const compact = toCompactJSLiteral(obj);
    const jsonPretty = JSON.stringify(obj, null, 2);

    expect(compact.length).toBeLessThan(jsonPretty.length);
    expect(compact).not.toContain(" ");
    expect(compact).not.toContain("\n");
  });

  it("keeps all values that tools might need", () => {
    const obj = {
      a: 0,
      b: false,
      c: null,
      d: "",
      e: [],
    };
    const compact = toCompactJSLiteral(obj);

    // All values are preserved for tools to decide what to include
    expect(compact).toBe('{a:0,b:false,c:null,d:"",e:[]}');
  });
});

describe("toCompactJSLiteral - Edge cases", () => {
  it("handles strings with special characters", () => {
    expect(toCompactJSLiteral("hello\nworld")).toBe('"hello\\nworld"');
    expect(toCompactJSLiteral('quote"test')).toBe('"quote\\"test"');
    expect(toCompactJSLiteral("tab\there")).toBe('"tab\\there"');
  });

  it("handles very deeply nested structures", () => {
    const deep = { a: { b: { c: { d: { e: { f: 42 } } } } } };

    expect(toCompactJSLiteral(deep)).toBe("{a:{b:{c:{d:{e:{f:42}}}}}}");
  });

  it("handles arrays of arrays of arrays", () => {
    const nested = [[[1, 2]], [[3, 4]]];

    expect(toCompactJSLiteral(nested)).toBe("[[[1,2]],[[3,4]]]");
  });

  it("handles objects with numeric-like keys", () => {
    expect(toCompactJSLiteral({ 123: "value" })).toBe('{123:"value"}');
    expect(toCompactJSLiteral({ 0: "zero" })).toBe('{0:"zero"}');
  });

  it("handles objects with underscore and dollar keys", () => {
    expect(toCompactJSLiteral({ _private: 1 })).toBe("{_private:1}");
    expect(toCompactJSLiteral({ $special: 2 })).toBe("{$special:2}");
  });

  it("handles negative numbers correctly", () => {
    expect(toCompactJSLiteral(-1)).toBe("-1");
    expect(toCompactJSLiteral({ x: -5, y: -10 })).toBe("{x:-5,y:-10}");
  });

  it("handles floating point numbers", () => {
    expect(toCompactJSLiteral(3.14159)).toBe("3.14159");
    expect(toCompactJSLiteral({ pi: 3.14 })).toBe("{pi:3.14}");
  });

  it("handles objects that become empty after filtering undefined", () => {
    expect(toCompactJSLiteral({ a: undefined, b: undefined })).toBe("{}");
  });

  it("handles arrays that become empty after filtering undefined", () => {
    expect(toCompactJSLiteral([undefined, undefined])).toBe("[]");
  });
});
