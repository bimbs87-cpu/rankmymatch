import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { sanitizePath, scrubParams, canTrack } from "@/lib/analytics";

describe("sanitizePath — minimização de dados em eventos de analytics", () => {
  it("remove query string (pode conter tokens e parâmetros sensíveis)", () => {
    strictEqual(sanitizePath("/ranking?utm_source=x&token=abc123"), "/ranking");
  });

  it("remove hash", () => {
    strictEqual(sanitizePath("/grupos#secao"), "/grupos");
  });

  it("mascara códigos de convite no caminho", () => {
    strictEqual(sanitizePath("/invite/ABC123XYZ"), "/invite");
  });

  it("mascara convite mesmo com query string", () => {
    strictEqual(sanitizePath("/invite/ABC123?utm_medium=whatsapp"), "/invite");
  });

  it("mantém caminhos comuns intactos", () => {
    strictEqual(sanitizePath("/ranking"), "/ranking");
    strictEqual(sanitizePath("/groups/1234-abcd"), "/groups/1234-abcd");
  });
});
