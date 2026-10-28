import { describe, it as test } from "node:test";
import { strictEqual } from "node:assert";
import { getResolvedTheme } from "./theme";

describe("exclusive dark appearance", () => {
  test("legacy light preference resolves to dark", () => {
    strictEqual(getResolvedTheme("light"), "dark");
  });
  test("system preference cannot enable a light theme", () => {
    strictEqual(getResolvedTheme("system"), "dark");
  });
});