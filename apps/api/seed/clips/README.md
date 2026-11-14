# Built-in audio clips

`npm run seed` uploads these as the built-in library's audio (`../library.ts`). They were spoken with the Windows Japanese voices. The words use Haruka. In `eki-de.wav`, Haruka narrates, Ichiro is the man and Ayumi is the station attendant. A Content Admin can replace any clip with a real recording later.

## Putting them into a project seeded before these existed

Sign in to the website as the Content Admin and open **Library**. Open each item below, find its audio field, choose **Replace with a file**, and pick the file. The new clip plays right away on the website and the phone.

**Listening test** (field: **Listening clip**)

| File | Item |
|---|---|
| `eki-de.wav` | Listening tests · N5 · 駅で |

**Flashcards** (field: **Pronunciation**)

| File | Card | File | Card |
|---|---|---|---|
| `mizu.wav` | N5 · 水 | `keiken.wav` | N4 · 経験 |
| `hon.wav` | N5 · 本 | `junbi.wav` | N4 · 準備 |
| `gakkou.wav` | N5 · 学校 | `setsumei.wav` | N4 · 説明 |
| `sensei.wav` | N5 · 先生 | `todokeru.wav` | N4 · 届ける |
| `taberu.wav` | N5 · 食べる | `atsumeru.wav` | N4 · 集める |
| `nomu.wav` | N5 · 飲む | `isogu.wav` | N4 · 急ぐ |
| `iku.wav` | N5 · 行く | `atatakai.wav` | N4 · 暖かい |
| `miru.wav` | N5 · 見る | `koshou.wav` | N4 · 故障 |
| `ookii.wav` | N5 · 大きい | | |
| `chiisai.wav` | N5 · 小さい | | |

**Quizzes** (field: **Correct answer audio**, under each question; students hear it on the results screen)

| File | Quiz | Question |
|---|---|---|
| `taberu-quiz.wav` | N5 · N5 基本の動詞 | 1 「食べる」の意味は？ |
| `nomu-quiz.wav` | N5 · N5 基本の動詞 | 2 「飲む」の意味は？ |
| `miru-quiz.wav` | N5 · N5 基本の動詞 | 3 「見る」の意味は？ |
| `junbi-quiz.wav` | N4 · N4 漢字の読み方 | 1 「準備」の読み方は？ |

## The listening script

`eki-de.wav` says this (answers: 新宿駅, 十時, 三番線):

```
（駅で、男の人と駅員が話しています。）
男：すみません。新宿駅へ行きたいんですが、電車は何時に出ますか。
駅員：新宿行きの電車は、十時に出ます。
男：九時半の電車はありませんか。
駅員：九時半の電車は、渋谷行きですよ。
男：そうですか。じゃあ、十時の電車に乗ります。何番線ですか。
駅員：三番線です。二番線のとなりです。
男：三番線ですね。ありがとうございます。
```

## Regenerating

This only works on Windows. First add the Japanese voice: Settings → Time & language → Speech → Add voices → Japanese. Then run:

```
node scripts/seed-audio/build.mjs
```

It rewrites the clips here and prints the reading the voice engine used for every line. Check those readings. The engine misreads some numbers (十時 as とどき, 九時半 as きゅうじはん, 何番線 as なにばんせん), so the script spells those in kana for the voice. If you change a word or the dialogue in `../library.ts`, change it in `build.mjs` too.
