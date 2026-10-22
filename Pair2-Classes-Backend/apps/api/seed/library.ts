import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JlptLevel } from "@nihongo/shared";
import { col, type FlashcardDoc, type ListeningTestDoc, type QuizDoc, type ReadingTestDoc } from "../src/db";
import { putPublicAudio } from "../src/lib/storage";
import { now } from "../src/lib/time";
import type { SeedContext } from "./seed";
import { toneWav } from "./tone";

const AUDIO_DIR = join(dirname(fileURLToPath(import.meta.url)), "audio");

let toneIndex = 0;
/**
 * §15: short placeholder tones stand in for real recordings, which the
 * Content Admin replaces later.
 */
async function placeholderAudio(name: string, storagePath: string) {
  mkdirSync(AUDIO_DIR, { recursive: true });
  const local = join(AUDIO_DIR, `${name}.wav`);
  writeFileSync(local, toneWav(330 + (toneIndex++ % 8) * 55, 700));
  const url = await putPublicAudio(local, storagePath, "audio/wav");
  return { audioUrl: url, audioPath: storagePath, audioFileName: `${name}.wav` };
}

type Card = [term: string, reading: string, meaning: string, example: string, audioName: string];
type Q = [text: string, a: string, b: string, c: string, d: string, correct: number];

const CARDS: Record<"N5" | "N4", Card[]> = {
  N5: [
    ["水", "みず", "water", "水を飲みます。", "mizu"],
    ["本", "ほん", "book", "この本はおもしろいです。", "hon"],
    ["学校", "がっこう", "school", "毎日学校へ行きます。", "gakkou"],
    ["先生", "せんせい", "teacher", "田中先生は優しいです。", "sensei"],
    ["食べる", "たべる", "to eat", "朝ごはんを食べます。", "taberu"],
    ["飲む", "のむ", "to drink", "毎朝お茶を飲みます。", "nomu"],
    ["行く", "いく", "to go", "明日、駅に行きます。", "iku"],
    ["見る", "みる", "to see, to watch", "夜、テレビを見ます。", "miru"],
    ["大きい", "おおきい", "big", "大きい犬がいます。", "ookii"],
    ["小さい", "ちいさい", "small", "小さい猫がいます。", "chiisai"],
  ],
  N4: [
    ["経験", "けいけん", "experience", "海外で働いた経験があります。", "keiken"],
    ["準備", "じゅんび", "preparation", "旅行の準備をしています。", "junbi"],
    ["説明", "せつめい", "explanation", "先生がもう一度説明してくれました。", "setsumei"],
    ["届ける", "とどける", "to deliver", "荷物を友だちの家に届けます。", "todokeru"],
    ["集める", "あつめる", "to collect", "古い切手を集めています。", "atsumeru"],
    ["急ぐ", "いそぐ", "to hurry", "時間がないので、急いでください。", "isogu"],
    ["暖かい", "あたたかい", "warm", "今日は春のように暖かいです。", "atatakai"],
    ["故障", "こしょう", "breakdown, malfunction", "エアコンが故障しました。", "koshou"],
  ],
};

const QUIZZES: Record<"N5" | "N4", { title: string; questions: (Q & { audio?: string })[] }> = {
  N5: {
    title: "N5 基本の動詞",
    questions: [
      Object.assign(["「食べる」の意味は？", "to eat", "to drink", "to sleep", "to walk", 0] as Q, { audio: "taberu-quiz" }),
      Object.assign(["「飲む」の意味は？", "to eat", "to drink", "to read", "to go", 1] as Q, { audio: "nomu-quiz" }),
      Object.assign(["「見る」の意味は？", "to hear", "to say", "to see", "to buy", 2] as Q, { audio: "miru-quiz" }),
      ["「行く」の意味は？", "to come", "to return", "to wait", "to go", 3] as Q,
      ["「わたしは毎朝コーヒーを＿＿。」", "飲みます", "食べます", "行きます", "見ます", 0] as Q,
    ],
  },
  N4: {
    title: "N4 漢字の読み方",
    questions: [
      Object.assign(["「準備」の読み方は？", "じゅんび", "じゅんぴ", "しゅんび", "じゅうび", 0] as Q, { audio: "junbi-quiz" }),
      ["「経験」の読み方は？", "けいげん", "けいけん", "きょうけん", "けいかん", 1] as Q,
      ["「故障」の読み方は？", "こうしょう", "こじょう", "こしょう", "ごしょう", 2] as Q,
      ["「説明」の読み方は？", "せつめい", "せつみょう", "せいめい", "せつべい", 0] as Q,
    ],
  },
};

const READING: { level: JlptLevel; title: string; passage: string; questions: Q[] }[] = [
  {
    level: "N5",
    title: "わたしの一日",
    passage:
      "わたしは毎朝六時に起きます。朝ごはんを食べてから、七時半に家を出ます。学校まではバスで二十分かかります。学校は八時に始まります。\n\n昼ごはんは友だちと食堂で食べます。午後四時に家に帰って、宿題をします。夜は十一時に寝ます。",
    questions: [
      ["この人は何時に起きますか。", "五時", "六時", "七時", "八時", 1],
      ["学校まで何で行きますか。", "電車", "自転車", "バス", "車", 2],
      ["昼ごはんはどこで食べますか。", "家", "食堂", "公園", "教室", 1],
      ["夜は何時に寝ますか。", "九時", "十時", "十一時", "十二時", 2],
    ],
  },
  {
    level: "N4",
    title: "図書館のお知らせ",
    passage:
      "市立図書館からのお知らせです。来月から、図書館の開館時間が変わります。平日は午前九時から午後八時まで、土曜日と日曜日は午前十時から午後六時までです。毎週月曜日は休館日です。\n\n本は一人十冊まで、二週間借りることができます。返すのが遅れた場合は、一週間本を借りることができません。",
    questions: [
      ["土曜日は何時に閉まりますか。", "午後六時", "午後八時", "午後五時", "午前十時", 0],
      ["休館日はいつですか。", "日曜日", "月曜日", "土曜日", "金曜日", 1],
      ["本は何冊まで借りられますか。", "五冊", "八冊", "十冊", "十二冊", 2],
      ["返すのが遅れたら、どうなりますか。", "お金を払う", "一週間本を借りられない", "図書館に入れない", "本を買う", 1],
    ],
  },
];

export async function seedLibrary(ctx: SeedContext) {
  const base = { createdBy: ctx.contentAdminUid, createdAt: now(), updatedAt: now() };
  for (const level of ["N5", "N4"] as const) {
    for (const [i, [term, reading, meaning, example, audioName]] of CARDS[level].entries()) {
      const id = `builtin-${level.toLowerCase()}-card-${i + 1}`;
      const audio = await placeholderAudio(audioName, `builtin/audio/flashcards/${id}/${audioName}.wav`);
      const card: FlashcardDoc = { term, reading, meaning, exampleSentence: example, ...audio, audioMimeType: "audio/wav", source: "builtin", level, classId: null, lessonId: null, status: "published", shuffleKey: Math.random(), ...base };
      await col.flashcards().doc(id).set(card);
    }
    const quizDef = QUIZZES[level];
    const quizId = `builtin-${level.toLowerCase()}-quiz-1`;
    const questions = [];
    for (const q of quizDef.questions) {
      const [text, a, b, c, d, correctIndex] = q;
      const audio = q.audio ? await placeholderAudio(q.audio, `builtin/audio/quizzes/${quizId}/${q.audio}.wav`) : {};
      questions.push({ text, choices: [a, b, c, d], correctIndex, ...audio });
    }
    const quiz: QuizDoc = { title: quizDef.title, questions, source: "builtin", level, classId: null, lessonId: null, status: "published", passingScorePct: 60, shuffleKey: Math.random(), ...base };
    await col.quizzes().doc(quizId).set(quiz);
  }
  // A draft, so the library overview shows one.
  await col.flashcards().doc("builtin-n5-card-draft").set({ term: "電車", reading: "でんしゃ", meaning: "train", exampleSentence: "電車で会社に行きます。", expectedAudioName: "densha.mp3", source: "builtin", level: "N5", classId: null, lessonId: null, status: "draft", shuffleKey: Math.random(), ...base });

  for (const [i, r] of READING.entries()) {
    const doc: ReadingTestDoc = { title: r.title, level: r.level, passage: r.passage, questions: r.questions.map(([text, a, b, c, d, correctIndex]) => ({ text, choices: [a, b, c, d], correctIndex })), status: "published", passingScorePct: 60, ...base };
    await col.readingTests().doc(`builtin-reading-${i + 1}`).set(doc);
  }

  const listeningAudio = await placeholderAudio("eki-de", "builtin/audio/listening-tests/builtin-listening-1/eki-de.wav");
  const listening: ListeningTestDoc = {
    title: "駅で",
    level: "N5",
    ...listeningAudio,
    audioMimeType: "audio/wav",
    questions: [
      { text: "男の人はどこへ行きたいですか。", choices: ["東京駅", "新宿駅", "上野駅", "渋谷駅"], correctIndex: 1 },
      { text: "電車は何時に出ますか。", choices: ["九時", "九時半", "十時", "十時半"], correctIndex: 2 },
      { text: "男の人は何番線に行きますか。", choices: ["一番線", "二番線", "三番線", "四番線"], correctIndex: 2 },
    ],
    status: "published",
    passingScorePct: 60,
    ...base,
  };
  await col.listeningTests().doc("builtin-listening-1").set(listening);
}
