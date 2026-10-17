import { getCookieValue } from '../cookies';
import { DESKTOP_UA, fetchJson } from './http';
import type { LiveInfo } from './types';

const IG_APP_ID = '936619743392459';
const IG_MOBILE_UA =
  'Instagram 309.1.0.41.113 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; en_US; 541635890)';

export async function checkInstagram(username: string, cookie: string, cachedUserId?: string): Promise<LiveInfo> {
  if (!getCookieValue(cookie, 'sessionid')) {
    throw new Error('Instagram butuh cookies login (sessionid). Isi di Settings → Cookies Instagram.');
  }
  const csrf = getCookieValue(cookie, 'csrftoken');
  const headers: Record<string, string> = {
    'User-Agent': DESKTOP_UA,
    'X-IG-App-ID': IG_APP_ID,
    'X-Requested-With': 'XMLHttpRequest',
    'X-ASBD-ID': '129477',
    Referer: `https://www.instagram.com/${username}/`,
    Cookie: cookie,
  };
  if (csrf) headers['X-CSRFToken'] = csrf;

  let userId = cachedUserId;
  let nickname: string | undefined;
  let avatar: string | undefined;

  if (!userId) {
    const p = await fetchJson(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      headers,
    );
    const user = p?.data?.user;
    if (!user?.id) throw new Error(`Profil Instagram @${username} tidak ditemukan / cookies tidak valid`);
    userId = String(user.id);
    nickname = user.full_name || user.username;
    avatar = user.profile_pic_url;
  }

  let b: any = null;

  // 1) Endpoint web live info
  try {
    const res = await fetch(`https://www.instagram.com/api/v1/live/web_info/?target_user_id=${userId}`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) throw new Error('Rate limited Instagram (429), perbesar interval polling');
    if (res.ok) {
      const j = await res.json().catch(() => null);
      if (j?.dash_playback_url || j?.dash_abr_playback_url) b = j;
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('429')) throw e;
  }

  // 2) Fallback: feed story user (berisi objek "broadcast" saat live)
  if (!b) {
    const j = await fetchJson(`https://i.instagram.com/api/v1/feed/user/${userId}/story/`, {
      ...headers,
      'User-Agent': IG_MOBILE_UA,
    });
    b = j?.broadcast ?? j?.reel?.broadcast ?? null;
  }

  if (!b || (b.broadcast_status && b.broadcast_status !== 'active')) {
    return { isLive: false, userId, nickname, avatar };
  }

  const streamUrl: string | undefined = b.dash_abr_playback_url || b.dash_playback_url;
  if (!streamUrl) return { isLive: false, userId, nickname, avatar };

  return {
    isLive: true,
    userId,
    roomId: String(b.id ?? b.broadcast_id ?? ''),
    title: b.broadcast_message || `${username} live`,
    nickname: nickname ?? b.broadcast_owner?.full_name,
    avatar: avatar ?? b.broadcast_owner?.profile_pic_url,
    streamUrl,
    streamType: 'dash',
    headers: {
      'User-Agent': DESKTOP_UA,
      Referer: 'https://www.instagram.com/',
      Origin: 'https://www.instagram.com',
      Cookie: cookie,
    },
  };
}
