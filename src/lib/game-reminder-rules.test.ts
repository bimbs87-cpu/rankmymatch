import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { DAY, MINUTE, gameTime, reminderKinds, presenceOpening, localDate } from "./game-reminder-rules";
const start = gameTime("2026-10-30", "08:00:00");
describe("scheduled game reminders", () => {
  it("Friday 8am São Paulo is 11am UTC", () => strictEqual(new Date(start).toISOString(), "2026-10-30T11:00:00.000Z"));
  it("reminds at 9:30 but not 9:29", () => {
    deepStrictEqual(reminderKinds(start + 90 * MINUTE, start, start - DAY, false), ["result_after_game"]);
    deepStrictEqual(reminderKinds(start + 89 * MINUTE, start, start - DAY, false), []);
  });
  it("reminds again after one day", () => deepStrictEqual(reminderKinds(start + DAY, start, start - DAY, false), ["result_next_day"]));
  it("opening the app after the game suppresses results reminders", () => deepStrictEqual(reminderKinds(start + DAY, start, start - DAY, true), []));
  it("reminds the day before a 6am game if list is open", () => {
    const early = gameTime("2026-10-29", "06:00");
    strictEqual(reminderKinds(early - DAY, early, early - DAY, false).includes("presence_day_before"), true);
  });
  it("does not ask for presence before the list opens", () => deepStrictEqual(reminderKinds(start - DAY, start, start - 12 * 60 * MINUTE, false), []));
  it("opening time uses São Paulo instead of server timezone", () => strictEqual(new Date(presenceOpening("2026-10-29", "06:00", "r", "1_day_before", "10:00", null)).toISOString(), "2026-10-28T13:00:00.000Z"));
  it("new game day is the correct local date", () => strictEqual(localDate(Date.parse("2026-10-29T02:00:00Z")), "2026-10-28"));
});