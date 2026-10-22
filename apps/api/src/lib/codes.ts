import { randomInt } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { CLASS_CODE_ALPHABET, CLASS_CODE_LENGTH } from "@nihongo/shared";
import { col } from "../db";
import { ApiError } from "./errors";

let generator = () => Array.from({ length: CLASS_CODE_LENGTH }, () => CLASS_CODE_ALPHABET[randomInt(CLASS_CODE_ALPHABET.length)]).join("");

/** Tests swap the generator to force collisions. */
export function setCodeGenerator(fn: () => string) {
  const previous = generator;
  generator = fn;
  return () => {
    generator = previous;
  };
}

/**
 * FR-3.2.2: picks an unused code inside the caller's transaction. The
 * classCodes/{code} document is read here and created by the caller with
 * tx.create, so two transactions can never claim the same code.
 */
export async function pickFreeCode(tx: Transaction): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generator();
    const snap = await tx.get(col.classCodes().doc(code));
    if (!snap.exists) return code;
  }
  throw new ApiError(503, "code_unavailable", "Couldn't generate a class code. Try again.");
}
