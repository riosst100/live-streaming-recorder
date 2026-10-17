import { createHash, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'lr_session';

export const authEnabled = () => !!process.env.PASSWORD;

export function sessionToken(): string {
  return createHash('sha256')
    .update(`live-recorder:v1:${process.env.PASSWORD ?? ''}`)
    .digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function isValidSession(token: string | undefined): boolean {
  if (!authEnabled()) return true;
  return !!token && safeEqual(token, sessionToken());
}
