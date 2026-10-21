import { describe, expect, it } from "vitest";
import { matchAudio, type AudioTarget } from "./matchAudio";

const t = (key: string, expected: string | null, hasAudio = false): AudioTarget => ({ key, label: key, expected, hasAudio });

describe("FR-3.5.3 audio matching", () => {
  it("FR-3.5.3 matches files to rows by name, case-insensitively, and lists the leftovers", () => {
    const targets = [t("a", "taberu.mp3"), t("b", "Nomu.MP3"), t("c", "miru.mp3"), t("d", null), t("e", "kiku.mp3", true)];
    const files = [{ name: "TABERU.mp3" }, { name: "nomu.mp3" }, { name: "extra.mp3" }];
    const r = matchAudio(targets, files);
    expect(r.matched.map((m) => m.target.key)).toEqual(["a", "b"]);
    expect(r.unmatchedFiles.map((f) => f.name)).toEqual(["extra.mp3"]);
    // Rows that already have audio aren't listed as missing.
    expect(r.unmatchedTargets.map((x) => x.key)).toEqual(["c"]);
  });
});
