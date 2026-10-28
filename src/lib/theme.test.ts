import { describe, expect, test } from "bun:test";
import { getResolvedTheme } from "./theme";

describe("exclusive dark appearance", () => {
  test("legacy light preference resolves to dark", () => {
    expect(getResolvedTheme("light")).toBe("dark");
  });
  test("system preference cannot enable a light theme", () => {
    expect(getResolvedTheme("system")).toBe("dark");
  });
});