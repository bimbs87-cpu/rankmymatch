import { describe, expect, it } from "bun:test";
import { sanitizePath } from "@/lib/analytics";

describe("sanitizePath — minimização de dados em eventos de analytics", () => {
  it("remove query string (pode conter tokens e parâmetros sensíveis)", () => {
    expect(sanitizePath("/ranking?utm_source=x&token=abc123")).toBe("/ranking");
  });

  it("remove hash", () => {
    expect(sanitizePath("/grupos#secao")).toBe("/grupos");
  });

  it("mascara códigos de convite no caminho", () => {
    expect(sanitizePath("/invite/ABC123XYZ")).toBe("/invite");
  });

  it("mascara convite mesmo com query string", () => {
    expect(sanitizePath("/invite/ABC123?utm_medium=whatsapp")).toBe("/invite");
  });

  it("mantém caminhos comuns intactos", () => {
    expect(sanitizePath("/ranking")).toBe("/ranking");
    expect(sanitizePath("/groups/1234-abcd")).toBe("/groups/1234-abcd");
  });
});
