import { describe, expect, it } from "bun:test";
import { sanitizePushUrl } from "@/lib/push-url";

describe("sanitizePushUrl — notificações push só abrem destinos internos", () => {
  it("aceita caminhos internos", () => {
    expect(sanitizePushUrl("/notifications")).toBe("/notifications");
    expect(sanitizePushUrl("/groups/abc")).toBe("/groups/abc");
  });

  it("rejeita URLs externas absolutas", () => {
    expect(sanitizePushUrl("https://evil.com/phish")).toBeUndefined();
    expect(sanitizePushUrl("http://evil.com")).toBeUndefined();
  });

  it("rejeita URLs relativas a host externo (//)", () => {
    expect(sanitizePushUrl("//evil.com/x")).toBeUndefined();
  });

  it("rejeita javascript: e outros esquemas", () => {
    expect(sanitizePushUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("aceita undefined/vazio como sem destino", () => {
    expect(sanitizePushUrl(undefined)).toBeUndefined();
    expect(sanitizePushUrl("")).toBeUndefined();
  });

  it("trunca destinos muito longos", () => {
    const long = "/" + "a".repeat(1000);
    expect(sanitizePushUrl(long)!.length).toBe(500);
  });
});
