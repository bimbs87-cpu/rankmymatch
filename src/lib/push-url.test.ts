import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { sanitizePushUrl } from "@/lib/push-url";

describe("sanitizePushUrl — notificações push só abrem destinos internos", () => {
  it("aceita caminhos internos", () => {
    strictEqual(sanitizePushUrl("/notifications"), "/notifications");
    strictEqual(sanitizePushUrl("/groups/abc"), "/groups/abc");
  });

  it("rejeita URLs externas absolutas", () => {
    strictEqual(sanitizePushUrl("https://evil.com/phish"), undefined);
    strictEqual(sanitizePushUrl("http://evil.com"), undefined);
  });

  it("rejeita URLs relativas a host externo (//)", () => {
    strictEqual(sanitizePushUrl("//evil.com/x"), undefined);
  });

  it("rejeita javascript: e outros esquemas", () => {
    strictEqual(sanitizePushUrl("javascript:alert(1)"), undefined);
  });

  it("aceita undefined/vazio como sem destino", () => {
    strictEqual(sanitizePushUrl(undefined), undefined);
    strictEqual(sanitizePushUrl(""), undefined);
  });

  it("trunca destinos muito longos", () => {
    const long = "/" + "a".repeat(1000);
    strictEqual(sanitizePushUrl(long)!.length, 500);
  });
});
