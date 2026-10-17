import type { TikTokQuality } from '../types';
import { DESKTOP_UA, fetchJson, fetchText } from './http';
import type { LiveInfo } from './types';

const QUALITY_ORDER: TikTokQuality[] = ['origin', 'uhd', 'hd', 'sd', 'ld'];
const LEGACY_KEY: Record<TikTokQuality, string> = {
  origin: 'FULL_HD1',
  uhd: 'FULL_HD1',
  hd: 'HD1',
  sd: 'SD1',
  ld: 'SD2',
};

/** Urutan kualitas: yang dipilih dulu, lalu turun, lalu naik sebagai fallback. */
function qualityPreference(q: TikTokQuality): TikTokQuality[] {
  const i = QUALITY_ORDER.indexOf(q);
  return [...QUALITY_ORDER.slice(i), ...QUALITY_ORDER.slice(0, i).reverse()];
}

function pickStream(streamUrl: any, quality: TikTokQuality): string | undefined {
  if (!streamUrl) return undefined;
  const prefs = qualityPreference(quality);

  // Format baru: stream_data JSON berisi semua kualitas termasuk "origin" (bitrate asli).
  try {
    const raw = streamUrl.live_core_sdk_data?.pull_data?.stream_data;
    if (raw) {
      const data = JSON.parse(raw)?.data ?? {};
      for (const q of prefs) {
        const main = data[q]?.main;
        if (main?.flv) return main.flv;
        if (main?.hls) return main.hls;
      }
    }
  } catch {
    // abaikan, pakai format lama
  }

  const flv = streamUrl.flv_pull_url ?? {};
  for (const q of prefs) {
    if (flv[LEGACY_KEY[q]]) return flv[LEGACY_KEY[q]];
  }
  const anyFlv = Object.values(flv)[0] as string | undefined;
  return anyFlv || streamUrl.rtmp_pull_url || streamUrl.hls_pull_url || undefined;
}

export async function checkTikTok(username: string, cookie: string, quality: TikTokQuality): Promise<LiveInfo> {
  const headers: Record<string, string> = {
    'User-Agent': DESKTOP_UA,
    Referer: 'https://www.tiktok.com/',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (cookie) headers.Cookie = cookie;

  let roomId: string | undefined;
  let nickname: string | undefined;
  let avatar: string | undefined;

  // 1) API ringan untuk mendapatkan roomId
  try {
    const r = await fetchJson(
      `https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(username)}`,
      headers,
    );
    const user = r?.data?.user;
    roomId = user?.roomId || undefined;
    nickname = user?.nickname;
    avatar = user?.avatarThumb || user?.avatarMedium;
    if (r?.statusCode === 19881007) throw new Error(`User TikTok @${username} tidak ditemukan`);
  } catch (e) {
    if (e instanceof Error && e.message.includes('tidak ditemukan')) throw e;
  }

  // 2) Fallback: parse halaman /live
  if (!roomId) {
    const html = await fetchText(`https://www.tiktok.com/@${encodeURIComponent(username)}/live`, headers);
    roomId = (html.match(/"roomId":"(\d+)"/) || html.match(/room_id=(\d+)/))?.[1];
  }

  if (!roomId || roomId === '0') return { isLive: false, nickname, avatar };

  // 3) Info room: status 2 = sedang live
  const info = await fetchJson(`https://webcast.tiktok.com/webcast/room/info/?aid=1988&room_id=${roomId}`, headers);
  const d = info?.data;
  nickname = d?.owner?.nickname ?? nickname;
  avatar = d?.owner?.avatar_thumb?.url_list?.[0] ?? avatar;

  if (!d || d.status !== 2) return { isLive: false, roomId, nickname, avatar };

  const streamUrl = pickStream(d.stream_url, quality);
  if (!streamUrl) throw new Error('Live terdeteksi tapi URL stream tidak ditemukan (coba isi cookies TikTok)');

  return {
    isLive: true,
    roomId,
    title: d.title,
    nickname,
    avatar,
    streamUrl,
    streamType: streamUrl.includes('.m3u8') ? 'hls' : 'flv',
    // Cookies ikut dikirim ke ffmpeg/yt-dlp supaya stream diambil sebagai user login, bukan guest
    headers: { 'User-Agent': DESKTOP_UA, Referer: 'https://www.tiktok.com/', ...(cookie ? { Cookie: cookie } : {}) },
  };
}
