import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveAPI, liveApiId } from "#src/test/mock-live-api.js";
import "./live-api-extensions.js";

describe("LiveAPI extensions - basic methods", () => {
  let api;

  beforeEach(() => {
    api = new LiveAPI("live_set");
    vi.resetAllMocks();
  });

  describe("exists", () => {
    it("returns true when LiveAPI object exists", () => {
      liveApiId.mockReturnValue("1");
      expect(api.exists()).toBe(true);
    });

    it("returns false when LiveAPI object does not exist ('id 0' case)", () => {
      liveApiId.mockReturnValue("id 0");
      expect(api.exists()).toBe(false);
    });

    it("returns false when LiveAPI object does not exist  ('0' case)", () => {
      liveApiId.mockReturnValue("0");
      expect(api.exists()).toBe(false);
    });
  });

  describe("getProperty", () => {
    it("returns the first element from LiveAPI get()", () => {
      api.get = vi.fn().mockReturnValue(["test_value"]);
      expect(api.getProperty("name")).toBe("test_value");
      expect(api.get).toHaveBeenCalledWith("name");
    });

    it("returns undefined when get() returns undefined", () => {
      api.get = vi.fn().mockReturnValue();
      expect(api.getProperty("missing")).toBeUndefined();
    });

    it("returns undefined when get() returns empty array", () => {
      api.get = vi.fn().mockReturnValue([]);
      expect(api.getProperty("empty")).toBeUndefined();
    });

    it("returns the full array for scale_intervals", () => {
      const intervals = [0, 2, 4, 5, 7, 9, 11];

      api.get = vi.fn().mockReturnValue(intervals);
      expect(api.getProperty("scale_intervals")).toStrictEqual(intervals);
      expect(api.get).toHaveBeenCalledWith("scale_intervals");
    });

    it("returns the full array for available_warp_modes", () => {
      const modes = [0, 1, 2, 3, 4];

      api.get = vi.fn().mockReturnValue(modes);
      expect(api.getProperty("available_warp_modes")).toStrictEqual(modes);
      expect(api.get).toHaveBeenCalledWith("available_warp_modes");
    });

    describe("routing properties", () => {
      it("parses JSON for available_input_routing_channels", () => {
        const jsonString =
          '{"available_input_routing_channels": [{"display_name": "All Channels", "identifier": 0}, {"display_name": "Ch. 1", "identifier": 1}]}';

        api.get = vi.fn().mockReturnValue([jsonString]);

        const result = api.getProperty("available_input_routing_channels");

        expect(result).toStrictEqual([
          { display_name: "All Channels", identifier: 0 },
          { display_name: "Ch. 1", identifier: 1 },
        ]);
        expect(api.get).toHaveBeenCalledWith(
          "available_input_routing_channels",
        );
      });

      it("parses JSON for available_input_routing_types", () => {
        const jsonString =
          '{"available_input_routing_types": [{"display_name": "All Ins", "identifier": 17}, {"display_name": "Computer Keyboard", "identifier": 18}]}';

        api.get = vi.fn().mockReturnValue([jsonString]);

        const result = api.getProperty("available_input_routing_types");

        expect(result).toStrictEqual([
          { display_name: "All Ins", identifier: 17 },
          { display_name: "Computer Keyboard", identifier: 18 },
        ]);
      });

      it("parses JSON for available_output_routing_channels", () => {
        const jsonString =
          '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}]}';

        api.get = vi.fn().mockReturnValue([jsonString]);

        const result = api.getProperty("available_output_routing_channels");

        expect(result).toStrictEqual([
          { display_name: "Master", identifier: 26 },
        ]);
      });

      it("parses JSON for available_output_routing_types", () => {
        const jsonString =
          '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}, {"display_name": "Send Only", "identifier": 27}]}';

        api.get = vi.fn().mockReturnValue([jsonString]);

        const result = api.getProperty("available_output_routing_types");

        expect(result).toStrictEqual([
          { display_name: "Track Out", identifier: 25 },
          { display_name: "Send Only", identifier: 27 },
        ]);
      });

      it("parses JSON for input_routing_channel", () => {
        const jsonString =
          '{"input_routing_channel": {"display_name": "All Channels", "identifier": 0}}';

        api.get = vi.fn().mockReturnValue([jsonString]);

        const result = api.getProperty("input_routing_channel");

        expect(result).toStrictEqual({
          display_name: "All Channels",
          identifier: 0,
        });
      });

      it("parses JSON for input_routing_type", () => {
        const jsonString =
          '{"input_routing_type": {"display_name": "All Ins", "identifier": 17}}';

        api.get = vi.fn().mockReturnValue([jsonString]);

        const result = api.getProperty("input_routing_type");

        expect(result).toStrictEqual({
          display_name: "All Ins",
          identifier: 17,
        });
      });

      it("parses JSON for output_routing_channel", () => {
        const jsonString =
          '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}';

        api.get = vi.fn().mockReturnValue([jsonString]);

        const result = api.getProperty("output_routing_channel");

        expect(result).toStrictEqual({
          display_name: "Master",
          identifier: 26,
        });
      });

      it("parses JSON for output_routing_type", () => {
        const jsonString =
          '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}';

        api.get = vi.fn().mockReturnValue([jsonString]);

        const result = api.getProperty("output_routing_type");

        expect(result).toStrictEqual({
          display_name: "Track Out",
          identifier: 25,
        });
      });

      it("returns null when routing property has no data", () => {
        api.get = vi.fn().mockReturnValue([]);
        expect(api.getProperty("input_routing_channel")).toBeNull();
      });

      it("returns null when routing property returns null array", () => {
        api.get = vi.fn().mockReturnValue(null);
        expect(api.getProperty("input_routing_type")).toBeNull();
      });

      it("returns null when routing property returns undefined", () => {
        api.get = vi.fn().mockReturnValue();
        expect(api.getProperty("output_routing_channel")).toBeNull();
      });

      it("returns null when routing property has empty first element", () => {
        api.get = vi.fn().mockReturnValue([null]);
        expect(api.getProperty("output_routing_type")).toBeNull();
      });

      it("handles malformed JSON gracefully for routing properties", () => {
        api.get = vi.fn().mockReturnValue(["invalid json"]);
        expect(api.getProperty("input_routing_channel")).toBeNull();
      });

      it("handles empty JSON object for routing properties", () => {
        api.get = vi.fn().mockReturnValue(["{}"]);
        expect(api.getProperty("input_routing_channel")).toBeUndefined();
      });
    });
  });

  describe("getChildIds", () => {
    it("parses id pairs from LiveAPI response", () => {
      api.get = vi.fn().mockReturnValue(["id", "1", "id", "2", "id", "3"]);
      expect(api.getChildIds("tracks")).toStrictEqual(["id 1", "id 2", "id 3"]);
    });

    it("returns empty array when get() returns non-array", () => {
      api.get = vi.fn().mockReturnValue();
      expect(api.getChildIds("tracks")).toStrictEqual([]);
    });

    it("returns empty array when no id pairs found", () => {
      api.get = vi.fn().mockReturnValue(["something", "else"]);
      expect(api.getChildIds("tracks")).toStrictEqual([]);
    });

    it("handles partial id pairs", () => {
      api.get = vi.fn().mockReturnValue(["id", "1", "something"]);
      expect(api.getChildIds("tracks")).toStrictEqual(["id 1"]);
    });
  });

  describe("getChildren", () => {
    it("returns LiveAPI objects for each child ID", () => {
      api.get = vi.fn().mockReturnValue(["id", "1", "id", "2"]);
      const children = api.getChildren("tracks");

      expect(children).toHaveLength(2);
      expect(children[0]).toBeInstanceOf(LiveAPI);
      expect(children[0].path).toBe("id 1");
      expect(children[1]).toBeInstanceOf(LiveAPI);
      expect(children[1].path).toBe("id 2");
    });

    it("returns empty array when no children", () => {
      api.get = vi.fn().mockReturnValue([]);
      expect(api.getChildren("tracks")).toStrictEqual([]);
    });
  });

  describe("from", () => {
    it("creates LiveAPI with 'id ' prefix for numeric ID", () => {
      const result = LiveAPI.from("123");

      expect(result.path).toBe("id 123");
    });

    it("creates LiveAPI with 'id ' prefix for number type", () => {
      const result = LiveAPI.from(456);

      expect(result.path).toBe("id 456");
    });

    it("creates LiveAPI with 'id ' prefix for string digits only", () => {
      const result = LiveAPI.from("789");

      expect(result.path).toBe("id 789");
    });

    it("uses path as-is for already prefixed ID", () => {
      const result = LiveAPI.from("id 123");

      expect(result.path).toBe("id 123");
    });

    it("uses path as-is for normal Live API paths", () => {
      const result = LiveAPI.from("live_set tracks 0");

      expect(result.path).toBe("live_set tracks 0");
    });

    it("uses path as-is for strings with non-digit characters", () => {
      const result = LiveAPI.from("123abc");

      expect(result.path).toBe("123abc");
    });

    it("uses path as-is for strings with leading zero followed by non-digits", () => {
      const result = LiveAPI.from("0x123");

      expect(result.path).toBe("0x123");
    });

    it("handles ['id', '123'] array format from Live API calls", () => {
      const result = LiveAPI.from(["id", "123"]);

      expect(result.path).toBe("id 123");
    });

    it("handles ['id', 456] array format with numeric ID", () => {
      const result = LiveAPI.from(["id", 456]);

      expect(result.path).toBe("id 456");
    });

    it("throws error for array not in ['id', value] format", () => {
      expect(() => LiveAPI.from(["something", "else"])).toThrow(
        "Invalid array format",
      );
    });

    it("throws error for array with wrong length", () => {
      expect(() => LiveAPI.from(["id"])).toThrow("Invalid array format");
    });

    it("throws error for array where first element is not 'id'", () => {
      expect(() => LiveAPI.from(["path", "123"])).toThrow(
        "Invalid array format",
      );
    });
  });
});
