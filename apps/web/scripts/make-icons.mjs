/* global Image, document -- the evaluate() callbacks run in Chromium */
// Generates the UI logo, favicon, and PWA icons in public/ from brand/logo-source.webp,
// and the sign-in background from brand/auth-background-source.* (any image format).
// Resizing runs in headless Chromium (installed for the Playwright tests), so no
// image library is needed:  node scripts/make-icons.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Detects the image type from its first bytes, whatever the file extension says. */
function sniff(b) {
  if (b.subarray(0, 4).toString("hex") === "89504e47") return "image/png";
  if (b.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (b.subarray(4, 12).toString().startsWith("ftypavi")) return "image/avif";
  throw new Error("Unsupported image format: use PNG, JPEG, WebP, or AVIF");
}

function readBrand(prefix) {
  const file = readdirSync(join(root, "brand")).find((f) => f.startsWith(prefix));
  if (!file) throw new Error(`Missing brand/${prefix}* image`);
  const bytes = readFileSync(join(root, "brand", file));
  return { file, mime: sniff(bytes), data: bytes.toString("base64") };
}

const logo = readBrand("logo-source.");
const background = readBrand("auth-background-source.");

/** [file, size, padding (fraction of size), background, mime] */
const icons = [
  ["logo-128.webp", 128, 0, null, "image/webp"],
  ["logo-256.webp", 256, 0, null, "image/webp"],
  ["favicon-64.png", 64, 0, null, "image/png"],
  ["pwa-192.png", 192, 0.02, "#ffffff", "image/png"],
  ["pwa-512.png", 512, 0.02, "#ffffff", "image/png"],
  // Maskable icons are cropped to a circle or squircle: keep the logo inside the 80% safe zone.
  ["pwa-maskable-512.png", 512, 0.12, "#ffffff", "image/png"],
  ["apple-touch-icon.png", 180, 0.06, "#ffffff", "image/png"],
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");

function save(file, dataUrl) {
  writeFileSync(join(root, "public", file), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(`wrote public/${file}`);
}

for (const [file, size, pad, bg, mime] of icons) {
  const dataUrl = await page.evaluate(
    async ({ src, srcMime, size, pad, bg, mime }) => {
      const img = new Image();
      img.src = "data:" + srcMime + ";base64," + src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);
      }
      const inset = Math.round(size * pad);
      ctx.drawImage(img, inset, inset, size - inset * 2, size - inset * 2);
      return c.toDataURL(mime, 0.9);
    },
    { src: logo.data, srcMime: logo.mime, size, pad, bg, mime },
  );
  save(file, dataUrl);
}

// Sign-in and sign-up background: at most 1920 px wide, saved as WebP.
const bgUrl = await page.evaluate(
  async ({ src, srcMime }) => {
    const img = new Image();
    img.src = "data:" + srcMime + ";base64," + src;
    await img.decode();
    const scale = Math.min(1, 1920 / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/webp", 0.8);
  },
  { src: background.data, srcMime: background.mime },
);
save("auth-background.webp", bgUrl);

await browser.close();
