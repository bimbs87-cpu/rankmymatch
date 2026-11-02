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

describe("scrubParams — minimização de parâmetros personalizados", () => {
  it("remove chaves com tokens, códigos de convite e dados pessoais", () => {
    deepStrictEqual(
      scrubParams({
        group_id: "g1",
        token: "abc",
        invite_code: "XYZ",
        email: "a@b.c",
        user_name: "Fulano",
        auth_code: "123",
      }),
      { group_id: "g1" },
    );
  });

  it("mantém IDs internos e enums permitidos", () => {
    deepStrictEqual(
      scrubParams({ match_id: "m1", season_id: "s1", mode: "doubles", source: "admin_save" }),
      { match_id: "m1", season_id: "s1", mode: "doubles", source: "admin_save" },
    );
  });

  it("descarta strings longas demais (possível conteúdo livre)", () => {
    deepStrictEqual(scrubParams({ note: "x".repeat(101), ok: "sim" }), { ok: "sim" });
  });
});

describe("canTrack — consentimento é verificado a cada evento", () => {
  it("sem navegador/consentimento, nenhum evento pode ser enviado", () => {
    strictEqual(canTrack(), false);
  });
});
