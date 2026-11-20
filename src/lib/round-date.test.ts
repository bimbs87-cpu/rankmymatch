import { describe, test } from "node:test";
import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { canChangeRoundDate, roundDateUpdate } from "./round-date";

describe("antecipar a rodada existente", () => {
  test("permite antecipar a próxima rodada para o feriado de 20 de novembro", () => {
    deepStrictEqual(roundDateUpdate("2026-11-20"), { scheduled_date: "2026-11-20" });
  });
  test("preserva a quantidade e os números das rodadas, jogadores e resultados", () => {
    const rounds = [
      { id: "x", round_number: 1, scheduled_date: "2026-11-13", status: "completed", players: ["a", "b"], scores: [6, 4] },
      { id: "next", round_number: 2, scheduled_date: "2026-11-27", status: "scheduled", players: ["c", "d"], scores: [] },
      { id: "later", round_number: 3, scheduled_date: "2026-12-04", status: "scheduled", players: [], scores: [] },
    ];
    const updated = rounds.map((r) => r.id === "next" ? { ...r, ...roundDateUpdate("2026-11-20") } : r);
    deepStrictEqual(updated, [rounds[0], { ...rounds[1], scheduled_date: "2026-11-20" }, rounds[2]]);
    strictEqual(updated.length, 3);
    deepStrictEqual(Object.keys(roundDateUpdate("2026-11-20")), ["scheduled_date"]);
  });
  test("permite mover para uma data anterior mesmo depois do sorteio", () => {
    strictEqual(canChangeRoundDate("scheduled"), true);
    strictEqual(canChangeRoundDate("in_progress"), true);
  });
  test("não oferece alteração de rodadas encerradas ou canceladas", () => {
    strictEqual(canChangeRoundDate("completed"), false);
    strictEqual(canChangeRoundDate("cancelled"), false);
    strictEqual(canChangeRoundDate(null), false);
  });
  test("rejeita datas vazias e inexistentes", () => {
    throws(() => roundDateUpdate(""));
    throws(() => roundDateUpdate("2026-02-30"));
  });
});