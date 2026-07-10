import bcrypt from "bcryptjs";

const ROUNDS = 12;

// Versões assíncronas: com cost 12, hashSync/compareSync bloqueavam o event
// loop (~100-300ms) em cada login/signup.

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
