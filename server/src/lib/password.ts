import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// scrypt из стандартной библиотеки: на сервере нет sudo, а bcrypt тянет нативную сборку.
const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/** Хэш в одну строку: «scrypt$соль$ключ», оба куска в base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, key] = stored.split("$");
  if (algo !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Пароль, который не стыдно выдать человеку: читаемый и без похожих символов. */
export function suggestPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(12), (b) => alphabet[b % alphabet.length]).join("");
}
