import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config';

export const SESSION_COOKIE = 'lr_session';

const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

interface StoredAuth {
  salt: string;
  hash: string;
}

// Ada dua password yang sama-sama bisa dipakai login:
//  - password sistem: env PASSWORD (tidak bisa diubah dari UI)
//  - password user: diubah lewat UI, disimpan ter-hash di data/auth.json
function readStored(): StoredAuth | null {
  try {
    const j = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    return typeof j.salt === 'string' && typeof j.hash === 'string' ? j : null;
  } catch {
    return null;
  }
}

export const authEnabled = () => !!readStored() || !!process.env.PASSWORD;

export type SessionKind = 'system' | 'user';

const digest = (secret: string) => createHash('sha256').update(`live-recorder:v1:${secret}`).digest('hex');

/** Token sesi untuk login dengan password sistem / password user. */
export function sessionToken(kind: SessionKind): string {
  return kind === 'system' ? digest(process.env.PASSWORD ?? '') : digest(`stored:${readStored()?.hash ?? ''}`);
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Password cocok dengan yang mana? null = salah. */
export function verifyPassword(password: string): SessionKind | null {
  if (process.env.PASSWORD && safeEqual(password, process.env.PASSWORD)) return 'system';
  const stored = readStored();
  if (stored) {
    const hash = scryptSync(password, Buffer.from(stored.salt, 'hex'), 64).toString('hex');
    if (safeEqual(hash, stored.hash)) return 'user';
  }
  return null;
}

/** Ganti password user (password sistem dari env tetap berlaku). */
export function setPassword(password: string): void {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64).toString('hex');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ salt: salt.toString('hex'), hash }), { mode: 0o600 });
}

export function sessionKind(token: string | undefined): SessionKind | null {
  if (!token) return null;
  if (process.env.PASSWORD && safeEqual(token, sessionToken('system'))) return 'system';
  if (readStored() && safeEqual(token, sessionToken('user'))) return 'user';
  return null;
}

export function isValidSession(token: string | undefined): boolean {
  return !authEnabled() || sessionKind(token) !== null;
}
