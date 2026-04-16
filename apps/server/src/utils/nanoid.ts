import { randomBytes } from "node:crypto";

/** Tiny URL-safe nanoid — no external dep needed */
export function nanoid(size = 21): string {
  const bytes = randomBytes(size);
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
  return Array.from(bytes)
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}
