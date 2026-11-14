// Regenerates the built-in audio in apps/api/seed/clips/ with the Windows Japanese voices.
// Windows only: add the Japanese voice first (Settings > Time & language > Speech > Add voices).
//   node scripts/seed-audio/build.mjs
// Word clips say one word, slowly. eki-de.wav is the 「駅で」 listening dialogue, one voice per
// speaker. Afterwards it prints the reading the engine used for every line (check them: it
// misreads some numbers) and fails if a file is malformed or part of a word was trimmed off.
// Keep WORDS and DIALOGUE in step with apps/api/seed/library.ts.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../apps/api/seed/clips");
const RAW = join(tmpdir(), "nihongo-seed-audio");
const powershell = (script, args) => execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(here, script), ...args], { encoding: "utf8" });

// [file name without .wav (the seed's audioFileName), what is said]
const WORDS = [
  ["mizu", "水"], ["hon", "本"], ["gakkou", "学校"], ["sensei", "先生"], ["taberu", "食べる"],
  ["nomu", "飲む"], ["iku", "行く"], ["miru", "見る"], ["ookii", "大きい"], ["chiisai", "小さい"],
  ["keiken", "経験"], ["junbi", "準備"], ["setsumei", "説明"], ["todokeru", "届ける"], ["atsumeru", "集める"],
  ["isogu", "急ぐ"], ["atatakai", "暖かい"], ["koshou", "故障"],
  // Quiz correct-answer audio: the word the question is about.
  ["taberu-quiz", "食べる"], ["nomu-quiz", "飲む"], ["miru-quiz", "見る"], ["junbi-quiz", "準備"],
];
// [speaker, what is said, pause after in ms (on top of the 180 ms of air kept around each line)]
// Times and 何番線 are written in kana: the engine reads 十時 as とどき, 九時半 as きゅうじはん
// and 何番線 as なにばんせん. The script people see keeps the kanji (seed/clips/README.md).
const DIALOGUE = [
  ["narrator", "駅で、男の人と駅員が話しています。", 850],
  ["man", "すみません。新宿駅へ行きたいんですが、電車はなんじに出ますか。", 450],
  ["staff", "新宿行きの電車は、じゅうじに出ます。", 450],
  ["man", "くじはんの電車はありませんか。", 450],
  ["staff", "くじはんの電車は、渋谷行きですよ。", 450],
  ["man", "そうですか。じゃあ、じゅうじの電車に乗ります。なんばんせんですか。", 450],
  ["staff", "三番線です。二番線のとなりです。", 450],
  ["man", "三番線ですね。ありがとうございます。", 0],
];
const WORD_RATE = 0.85;
const TALK_RATE = 0.9;
// The voices pause about 1.1 s after every sentence, which drags inside one speaker's turn,
// so each sentence is made on its own and the turn is joined with this gap instead.
const SENTENCE_GAP_MS = 250;
// Cut each take where any sound starts (-66 dBFS), keep some air, and fade the ends.
const TRIM = { thr: 0.0005, preMs: 60, postMs: 120, fadeMs: 8 };

// ---------- Voices ----------
const ja = JSON.parse(powershell("synth.ps1", ["-List"])).filter((v) => v.language === "ja-JP");
if (!ja.length) throw new Error("No Japanese voice. Add one in Settings > Time & language > Speech > Add voices > Japanese.");
const pick = (prefs, avoid) => {
  const list = ja.filter((v) => v.name !== avoid).length ? ja.filter((v) => v.name !== avoid) : ja;
  return (prefs.map((p) => list.find((v) => v.name.includes(p))).find(Boolean) ?? list[0]).name;
};
const V = { word: pick(["Haruka", "Ayumi"]), man: pick(["Ichiro"]), narrator: pick(["Haruka", "Ayumi"]) };
V.staff = pick(["Ayumi", "Haruka"], V.man);

// ---------- WAV helpers (16-bit PCM mono) ----------
function readWav(path) {
  const b = readFileSync(path);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error(`${path}: not a WAV`);
  let fmt, data;
  for (let o = 12; o + 8 <= b.length; ) {
    const id = b.toString("ascii", o, o + 4), size = b.readUInt32LE(o + 4);
    if (id === "fmt ") fmt = { format: b.readUInt16LE(o + 8), channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === "data") data = b.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.channels !== 1 || fmt.bits !== 16) throw new Error(`${path}: expected 16-bit PCM mono, got ${JSON.stringify(fmt)}`);
  const samples = new Float64Array(data.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2) / 32768;
  return { rate: fmt.rate, samples };
}
function writeWav(path, rate, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}
const silence = (rate, ms) => new Float64Array(Math.round((rate * ms) / 1000));
const concat = (parts) => {
  const out = new Float64Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const firstAbove = (s, t) => s.findIndex((x) => Math.abs(x) > t);
const lastAbove = (s, t) => { for (let i = s.length - 1; i >= 0; i--) if (Math.abs(s[i]) > t) return i; return -1; };
function trim({ rate, samples }) {
  const a = firstAbove(samples, TRIM.thr), z = lastAbove(samples, TRIM.thr);
  if (a < 0) throw new Error("take is silent");
  const out = samples.slice(Math.max(0, a - Math.round((rate * TRIM.preMs) / 1000)), Math.min(samples.length, z + Math.round((rate * TRIM.postMs) / 1000)));
  const n = Math.min(Math.round((rate * TRIM.fadeMs) / 1000), out.length >> 1);
  for (let i = 0; i < n; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return out;
}
function resample(samples, from, to) {
  if (from === to) return samples;
  const out = new Float64Array(Math.round((samples.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const x = (i * from) / to, i0 = Math.floor(x), f = x - i0;
    out[i] = (samples[i0] ?? 0) * (1 - f) + (samples[i0 + 1] ?? samples[i0] ?? 0) * f;
  }
  return out;
}
// Every clip peaks at -1 dBFS, so they all play at the same level.
function normalize(samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = 0.891 / peak;
  return samples.map((s) => s * gain);
}

// ---------- Speak ----------
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });
const sentences = DIALOGUE.map(([, text]) => text.split(/(?<=。)/).filter(Boolean));
const jobs = [
  ...WORDS.map(([file, text]) => ({ out: join(RAW, `${file}.wav`), voice: V.word, text, rate: WORD_RATE })),
  ...DIALOGUE.flatMap(([who], i) => sentences[i].map((text, j) => ({ out: join(RAW, `line-${i}-${j}.wav`), voice: V[who], text, rate: TALK_RATE }))),
];
writeFileSync(join(RAW, "jobs.json"), JSON.stringify(jobs), "utf8");
powershell("synth.ps1", ["-JobFile", join(RAW, "jobs.json")]);

// ---------- Assemble ----------
for (const [file] of WORDS) {
  const w = readWav(join(RAW, `${file}.wav`));
  writeWav(join(OUT, `${file}.wav`), w.rate, normalize(concat([silence(w.rate, 150), trim(w), silence(w.rate, 200)])));
}
const takes = sentences.map((list, i) => list.map((_, j) => readWav(join(RAW, `line-${i}-${j}.wav`))));
const rate = Math.max(...takes.flat().map((t) => t.rate));
const parts = [silence(rate, 300)];
DIALOGUE.forEach(([, , pause], i) => {
  takes[i].forEach((t, j) => parts.push(...(j ? [silence(rate, SENTENCE_GAP_MS)] : []), resample(trim(t), t.rate, rate)));
  parts.push(silence(rate, pause));
});
parts.push(silence(rate, 500));
writeWav(join(OUT, "eki-de.wav"), rate, normalize(concat(parts)));

// ---------- Check ----------
const problems = [];
for (const j of jobs) {
  // Nothing fainter than the cut (down to -70 dBFS) may lie outside the air that was kept.
  const { rate: r, samples: s } = readWav(j.out);
  const ms = (n) => (n * 1000) / r;
  const lostStart = ms(firstAbove(s, TRIM.thr) - firstAbove(s, 0.0003)) > TRIM.preMs;
  const lostEnd = ms(lastAbove(s, 0.0003) - lastAbove(s, TRIM.thr)) > TRIM.postMs;
  if (lostStart || lostEnd) problems.push(`${j.text}: part of the sound falls outside the kept air`);
}
for (const file of [...WORDS.map(([f]) => f), "eki-de"]) {
  const { rate: r, samples: s } = readWav(join(OUT, `${file}.wav`));
  const secs = s.length / r;
  const ok = file === "eki-de" ? secs > 20 && secs < 60 : secs > 0.5 && secs < 2.5;
  if (!ok) problems.push(`${file}.wav: unexpected length ${secs.toFixed(2)} s`);
}
writeFileSync(join(RAW, "texts.txt"), [...new Set(jobs.map((j) => j.text))].join("\n") + "\n", "utf8");
console.log(`Voices: words ${V.word}; dialogue ${V.narrator} (narrator), ${V.man} (man), ${V.staff} (station attendant)\n`);
console.log("Reading the engine used for each line (check these):");
console.log(powershell("readings.ps1", ["-TextFile", join(RAW, "texts.txt")]));
if (problems.length) {
  console.error(`Problems:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`Wrote ${WORDS.length + 1} clips to ${OUT}`);
