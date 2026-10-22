import { col, enrollmentId, type EnrollmentDoc, type FlashcardDoc, type QuizDoc } from "../src/db";
import { db } from "../src/firebase";
import { now } from "../src/lib/time";
import type { SeedContext } from "./seed";

type Card = [term: string, reading: string, meaning: string, example: string];
type Question = [text: string, a: string, b: string, c: string, d: string, correct: number];

interface LessonSeed {
  title: string;
  description: string;
  cards: Card[];
  quiz?: { title: string; questions: Question[] };
}

const N5_LESSONS: LessonSeed[] = [
  {
    title: "Lesson 1: あいさつ",
    description: "Everyday greetings for morning, afternoon, and evening.",
    cards: [
      ["おはようございます", "おはようございます", "good morning (polite)", "先生、おはようございます。"],
      ["こんにちは", "こんにちは", "hello, good afternoon", "田中さん、こんにちは。"],
      ["こんばんは", "こんばんは", "good evening", "こんばんは。寒いですね。"],
      ["ありがとうございます", "ありがとうございます", "thank you (polite)", "手伝ってくれて、ありがとうございます。"],
      ["すみません", "すみません", "excuse me; I'm sorry", "すみません、駅はどこですか。"],
      ["おやすみなさい", "おやすみなさい", "good night", "もう寝ます。おやすみなさい。"],
    ],
    quiz: {
      title: "あいさつクイズ",
      questions: [
        ["「おはようございます」の意味は？", "good morning", "good night", "thank you", "excuse me", 0],
        ["朝、学校で先生に会いました。何と言いますか。", "おはようございます", "こんばんは", "おやすみなさい", "いただきます", 0],
        ["「ありがとうございます」の意味は？", "I'm sorry", "hello", "thank you", "goodbye", 2],
        ["寝る前に、家族に何と言いますか。", "こんにちは", "おやすみなさい", "すみません", "おはようございます", 1],
        ["道を聞くとき、最初に何と言いますか。", "ありがとうございます", "こんばんは", "すみません", "おやすみなさい", 2],
      ],
    },
  },
  {
    title: "Lesson 2: 家族",
    description: "Talking about your own family members.",
    cards: [
      ["父", "ちち", "(my) father", "父は会社員です。"],
      ["母", "はは", "(my) mother", "母は料理が上手です。"],
      ["兄", "あに", "(my) older brother", "兄は東京に住んでいます。"],
      ["姉", "あね", "(my) older sister", "姉は看護師です。"],
      ["弟", "おとうと", "younger brother", "弟は高校生です。"],
      ["妹", "いもうと", "younger sister", "妹はピアノが好きです。"],
    ],
  },
];

const N4_LESSONS: LessonSeed[] = [
  {
    title: "Lesson 1: 〜てもいいです",
    description: "Asking for and giving permission.",
    cards: [
      ["写真", "しゃしん", "photograph", "ここで写真を撮ってもいいですか。"],
      ["許可", "きょか", "permission", "先生に許可をもらいました。"],
      ["窓", "まど", "window", "窓を開けてもいいですか。"],
      ["座る", "すわる", "to sit", "この席に座ってもいいですか。"],
    ],
    quiz: {
      title: "〜てもいいですか",
      questions: [
        ["ここで写真を＿＿もいいですか。", "撮って", "撮る", "撮った", "撮り", 0],
        ["「許可」の読み方は？", "きょか", "きょうか", "ゆるか", "きよか", 0],
        ["暑いですね。窓を＿＿もいいですか。", "開けて", "開ける", "開けた", "開け", 0],
        ["「座ってもいいですか」の意味は？", "May I sit down?", "Please stand up.", "Do you want to sit?", "I sat down.", 0],
      ],
    },
  },
  {
    title: "Lesson 2: 旅行",
    description: "Words for planning a trip.",
    cards: [
      ["予約", "よやく", "reservation", "ホテルを予約しました。"],
      ["旅館", "りょかん", "traditional Japanese inn", "京都の旅館に泊まります。"],
      ["空港", "くうこう", "airport", "空港までバスで行きます。"],
      ["切符", "きっぷ", "ticket", "駅で切符を買います。"],
      ["荷物", "にもつ", "luggage", "荷物が重いです。"],
    ],
  },
];

async function seedClass(
  ctx: SeedContext,
  id: string,
  code: string,
  name: string,
  level: "N5" | "N4",
  teacherUid: string,
  lessons: LessonSeed[],
) {
  await col.classes().doc(id).set({
    schoolId: ctx.schoolId,
    name,
    level,
    code,
    teacherIds: [teacherUid],
    status: "active",
    createdBy: ctx.adminUid,
    createdAt: now(),
    updatedAt: now(),
  });
  await col.classCodes().doc(code).set({ classId: id });
  const lessonIds: string[] = [];
  for (const [order, l] of lessons.entries()) {
    const lessonId = `${id}-lesson-${order + 1}`;
    lessonIds.push(lessonId);
    await col.lessons().doc(lessonId).set({ classId: id, title: l.title, description: l.description, order });
    const batch = db.batch();
    l.cards.forEach(([term, reading, meaning, example], i) => {
      const card: FlashcardDoc = {
        term,
        reading,
        meaning,
        exampleSentence: example,
        source: "teacher",
        classId: id,
        lessonId,
        level: null,
        status: "published",
        shuffleKey: Math.random(),
        createdBy: teacherUid,
        createdAt: now(),
        updatedAt: now(),
      };
      batch.set(col.flashcards().doc(`${lessonId}-card-${i + 1}`), card);
    });
    if (l.quiz) {
      const quiz: QuizDoc = {
        title: l.quiz.title,
        questions: l.quiz.questions.map(([text, a, b, c, d, correctIndex]) => ({ text, choices: [a, b, c, d], correctIndex })),
        source: "teacher",
        classId: id,
        lessonId,
        level: null,
        status: "published",
        passingScorePct: 60,
        shuffleKey: Math.random(),
        createdBy: teacherUid,
        createdAt: now(),
        updatedAt: now(),
      };
      batch.set(col.quizzes().doc(`${lessonId}-quiz`), quiz);
    }
    await batch.commit();
  }
  return { id, lessonIds };
}

export async function enroll(classId: string, uid: string, schoolId: string, overrides: Partial<EnrollmentDoc> = {}) {
  await col.enrollments().doc(enrollmentId(classId, uid)).set({
    classId,
    uid,
    schoolId,
    status: "active",
    addedBy: "self",
    joinedAt: now(),
    activatedAt: now(),
    ...overrides,
  });
}

export async function seedClasses(ctx: SeedContext) {
  const [tanaka, sato] = ctx.teacherUids;
  const [juan, ana, paolo, bea, carlo, liza] = ctx.studentUids;
  const n5 = await seedClass(ctx, "n5-saturday", "N5SATK", "N5 Saturday Class", "N5", tanaka, N5_LESSONS);
  const n4 = await seedClass(ctx, "n4-evening", "N4EVE7", "N4 Evening Class", "N4", sato, N4_LESSONS);
  for (const uid of [juan, ana, carlo]) await enroll(n5.id, uid, ctx.schoolId);
  // Classes are free: students join with the class code.
  for (const uid of [paolo, bea, liza]) await enroll(n4.id, uid, ctx.schoolId);
  return { n5, n4 };
}
