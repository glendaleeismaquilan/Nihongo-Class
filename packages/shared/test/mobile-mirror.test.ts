import { describe, expect, it } from "vitest";
import * as shared from "../src/constants";
import { formatPeso, pesosToCentavos } from "../src/money";
import * as time from "../src/time";
// apps/mobile keeps a copy of these (an EAS build uploads only apps/mobile, so it
// can't import @nihongo/shared). This test fails when the copy drifts.
import * as mobile from "../../../apps/mobile/src/shared/constants.js";
import * as mobileMoney from "../../../apps/mobile/src/shared/money.js";
import * as mobileTime from "../../../apps/mobile/src/shared/time.js";

describe("mobile copy of the shared constants", () => {
  it("has every shared constant, with the same value", () => {
    for (const [name, value] of Object.entries(shared)) {
      expect((mobile as Record<string, unknown>)[name], name).toEqual(value);
    }
  });

  it("has nothing the shared package doesn't", () => {
    expect(Object.keys(mobile).sort()).toEqual(Object.keys(shared).sort());
  });

  it("formats and parses pesos the same way", () => {
    for (const c of [0, 100, 29_900, 123_456_789]) expect(mobileMoney.formatPeso(c)).toBe(formatPeso(c));
    for (const s of ["2,500", "2500.50", "₱ 299", "12.345", "abc", ""]) expect(mobileMoney.pesosToCentavos(s)).toBe(pesosToCentavos(s));
  });

  it("has the same time functions, giving the same answers", () => {
    expect(Object.keys(mobileTime).sort()).toEqual(Object.keys(time).sort());
    const zones = ["Asia/Manila", "Asia/Tokyo", "America/New_York", "Europe/London", "Australia/Lord_Howe", "UTC"];
    // Midnight, both sides of the 2026 US and UK DST changes, a leap day, and year end.
    const instants = ["2026-11-09T16:00:00Z", "2026-03-08T06:59:59Z", "2026-03-08T07:00:00Z", "2026-11-01T05:30:00Z", "2026-03-29T00:59:00Z", "2028-02-29T12:00:00Z", "2026-12-31T23:59:59Z"].map((s) => new Date(s));
    for (const tz of zones) {
      for (const d of instants) {
        expect(mobileTime.zonedParts(d, tz), `${tz} ${d.toISOString()}`).toEqual(time.zonedParts(d, tz));
        expect(mobileTime.dateKey(d, tz)).toBe(time.dateKey(d, tz));
        expect(mobileTime.timeKey(d, tz)).toBe(time.timeKey(d, tz));
      }
      // Wall-clock times including ones that don't exist or happen twice on DST days.
      for (const [date, t] of [["2026-11-09", "00:00"], ["2026-03-08", "02:30"], ["2026-11-01", "01:30"], ["2026-03-29", "01:30"], ["2028-02-29", "23:59"]]) {
        expect(mobileTime.zonedTimeToUtc(date, t, tz).getTime(), `${tz} ${date} ${t}`).toBe(time.zonedTimeToUtc(date, t, tz).getTime());
      }
    }
    for (const tz of ["Asia/Manila", "Not/AZone", ""]) expect(mobileTime.isValidTimeZone(tz)).toBe(time.isValidTimeZone(tz));
    for (const [key, n] of [["2026-11-09", 1], ["2026-12-31", 1], ["2028-03-01", -1], ["2026-01-01", -365]] as const) {
      expect(mobileTime.addDaysToKey(key, n)).toBe(time.addDaysToKey(key, n));
    }
    const days = ["2026-11-09", "2026-11-08", "2026-11-07", "2026-11-05"];
    for (const today of ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-06"]) {
      expect(mobileTime.computeStreak(days, today)).toBe(time.computeStreak(days, today));
    }
  });
});
