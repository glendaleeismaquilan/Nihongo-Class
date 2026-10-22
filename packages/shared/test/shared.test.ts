import { describe, expect, it } from "vitest";
import {
  classCodeSchema,
  computeStreak,
  dateKey,
  formatPeso,
  parseCorrectOption,
  pesosToCentavos,
  teacherFlashcardSchema,
  contentDocRulesSchema,
  zonedTimeToUtc,
} from "../src";

describe("FR-3.4.4 parseCorrectOption", () => {
  it("accepts A-D trimmed and case-insensitive", () => {
    expect(parseCorrectOption(" a ")).toBe(0);
    expect(parseCorrectOption("D")).toBe(3);
  });
  it("rejects E, blank, and A,B", () => {
    expect(parseCorrectOption("E")).toBeNull();
    expect(parseCorrectOption("")).toBeNull();
    expect(parseCorrectOption("A,B")).toBeNull();
    expect(parseCorrectOption(undefined)).toBeNull();
  });
});

describe("FR-3.2.2 class codes", () => {
  it("rejects ambiguous characters", () => {
    expect(classCodeSchema.safeParse("ABC0O1").success).toBe(false);
    expect(classCodeSchema.safeParse("abcdef").success).toBe(true);
  });
});

describe("FR-3.13.10 money", () => {
  it("formats centavos as pesos with centavos", () => {
    expect(formatPeso(250000)).toBe("₱2,500.00");
  });
  it("parses peso input", () => {
    expect(pesosToCentavos("2,500")).toBe(250000);
    expect(pesosToCentavos("100.5")).toBe(10050);
    expect(pesosToCentavos("abc")).toBeNull();
  });
});

describe("Decision 5 streak in Asia/Manila", () => {
  it("counts 23:30 and 00:30 local time as different days", () => {
    // 23:30 Manila on Sep 24 = 15:30Z; 00:30 Manila Sep 25 = 16:30Z Sep 24
    const a = new Date("2026-09-24T15:30:00Z");
    const b = new Date("2026-09-24T16:30:00Z");
    expect(dateKey(a, "Asia/Manila")).toBe("2026-09-24");
    expect(dateKey(b, "Asia/Manila")).toBe("2026-09-25");
    expect(computeStreak([dateKey(a, "Asia/Manila"), dateKey(b, "Asia/Manila")], "2026-09-25")).toBe(2);
  });
  it("breaks after a missed day", () => {
    expect(computeStreak(["2026-09-20", "2026-09-22"], "2026-09-22")).toBe(1);
    expect(computeStreak(["2026-09-21"], "2026-09-22")).toBe(1);
    expect(computeStreak(["2026-09-20"], "2026-09-22")).toBe(0);
  });
});

describe("zonedTimeToUtc", () => {
  it("converts Manila wall time", () => {
    expect(zonedTimeToUtc("2026-09-26", "09:00", "Asia/Manila").toISOString()).toBe("2026-09-26T01:00:00.000Z");
  });
  it("handles DST zones", () => {
    expect(zonedTimeToUtc("2026-07-01", "12:00", "America/New_York").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedTimeToUtc("2026-12-01", "12:00", "America/New_York").toISOString()).toBe("2026-12-01T17:00:00.000Z");
  });
});

describe("FR-3.3.5 teacher flashcards carry no audio", () => {
  it("rejects audioUrl in teacher input", () => {
    const r = teacherFlashcardSchema.safeParse({ lessonId: "l1", term: "食べる", reading: "たべる", meaning: "to eat", audioUrl: "https://x" });
    expect(r.success).toBe(false);
  });
  it("enforces SRS content rules", () => {
    expect(contentDocRulesSchema.safeParse({ source: "teacher", classId: "c", audioUrl: "https://x" }).success).toBe(false);
    expect(contentDocRulesSchema.safeParse({ source: "builtin", classId: "c", level: "N5" }).success).toBe(false);
    expect(contentDocRulesSchema.safeParse({ source: "builtin" }).success).toBe(false);
    expect(contentDocRulesSchema.safeParse({ source: "builtin", level: "N5", audioUrl: "https://x" }).success).toBe(true);
  });
});
