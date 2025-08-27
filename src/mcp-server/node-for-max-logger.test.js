import Max from "max-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as logger from "./node-for-max-logger.js";

describe("Node for Max Logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("log", () => {
    it("should always post with timestamp", () => {
      logger.log("test message");

      expect(Max.post).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] test message$/,
        ),
      );
    });
  });

  describe("warn", () => {
    it("should post with warn level", () => {
      logger.warn("test warning");

      expect(Max.post).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] test warning$/,
        ),
        Max.POST_LEVELS.WARN,
      );
    });
  });

  describe("error", () => {
    it("should post with error level", () => {
      logger.error("test error");

      expect(Max.post).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] test error$/,
        ),
        Max.POST_LEVELS.ERROR,
      );
    });
  });
});
