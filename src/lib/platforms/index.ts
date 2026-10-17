import { cookieHeader } from '../cookies';
import type { Channel, TikTokQuality } from '../types';
import { checkInstagram } from './instagram';
import { checkTikTok } from './tiktok';
import type { LiveInfo } from './types';

export type { LiveInfo };

export async function checkLive(ch: Channel, rawCookies: string, quality: TikTokQuality): Promise<LiveInfo> {
  if (ch.platform === 'tiktok') {
    return checkTikTok(ch.username, cookieHeader(rawCookies, 'tiktok.com'), quality);
  }
  return checkInstagram(ch.username, cookieHeader(rawCookies, 'instagram.com'), ch.platformUserId);
}
