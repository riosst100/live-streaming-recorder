import { getCookieValue } from '../cookies';
import { impersonatedJson, impersonatedText } from './impersonate';

const IG_APP_ID = '936619743392459';

export interface IgMedia {
  /** Unik per file; carousel: `${pk}_${index}` */
  mediaId: string;
  type: 'image' | 'video';
  url: string;
  /** ms */
  takenAt: number;
  caption?: string;
}

export interface IgResult {
  userId: string;
  nickname?: string;
  avatar?: string;
  items: IgMedia[];
}

/** Header API ala yt-dlp. User-Agent sengaja tidak diisi: curl_cffi memakai UA Chrome yang cocok dengan TLS-nya. */
function apiHeaders(username: string, cookie: string): Record<string, string> {
  const h: Record<string, string> = {
    'X-IG-App-ID': IG_APP_ID,
    'X-ASBD-ID': '198387',
    'X-IG-WWW-Claim': '0',
    Origin: 'https://www.instagram.com',
    Accept: '*/*',
    Referer: `https://www.instagram.com/${username}/`,
    Cookie: cookie,
  };
  const csrf = getCookieValue(cookie, 'csrftoken');
  if (csrf) h['X-CSRFToken'] = csrf;
  return h;
}

/** Header untuk mengunduh file dari CDN Instagram. */
export const IG_DOWNLOAD_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  Referer: 'https://www.instagram.com/',
};

function requireCookie(cookie: string) {
  if (!getCookieValue(cookie, 'sessionid')) {
    throw new Error('Instagram butuh cookies login (sessionid). Isi di Pengaturan → Cookies Instagram.');
  }
}

/** Indeks kurung kurawal penutup untuk objek JSON yang dimulai di `start` (memperhatikan string). */
function matchBrace(text: string, start: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Cari objek `"user":{...}` milik `username` di HTML halaman Instagram. */
function findUserObject(html: string, username: string): any | null {
  const re = /"user":\s*\{/g;
  let m: RegExpExecArray | null;
  for (let n = 0; n < 60 && (m = re.exec(html)); n++) {
    const start = m.index + m[0].length - 1;
    const end = matchBrace(html, start);
    if (end < 0) continue;
    try {
      const o = JSON.parse(html.slice(start, end + 1));
      if ((o.pk || o.id) && String(o.username ?? '').toLowerCase() === username.toLowerCase()) return o;
    } catch {
      // bukan JSON utuh, lanjut
    }
  }
  return null;
}

const decodeHtml = (t: string) =>
  t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?64;/g, '@').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

const HTML_HEADERS = (cookie: string) => ({
  Cookie: cookie,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
});

/**
 * ID profil diambil dari HTML halaman profil (profile_id), BUKAN dari web_profile_info yang hampir
 * selalu kena 429. Halaman story dipakai sebagai cadangan (cara yt-dlp), tetapi halaman itu hanya
 * memuat data target jika akun punya story aktif. Hasilnya dipakai ulang lewat cachedUserId.
 */
async function resolveProfile(username: string, cookie: string, cachedUserId?: string) {
  if (cachedUserId) return { userId: cachedUserId, nickname: undefined, avatar: undefined };

  const html = await impersonatedText(`https://www.instagram.com/${encodeURIComponent(username)}/`, HTML_HEADERS(cookie));
  const id = /"profile_id":"(\d+)"/.exec(html)?.[1] ?? /profilePage_(\d+)/.exec(html)?.[1];
  if (id) {
    // og:title berbentuk `Nama (@user) • Instagram photos and videos`
    const title = /<meta property="og:title" content="([^"]*)"/.exec(html)?.[1];
    const name = title ? decodeHtml(title).split(/\s*\(@/)[0].trim() : '';
    const image = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
    return { userId: id, nickname: name || username, avatar: image ? decodeHtml(image) : undefined };
  }

  const story = await impersonatedText(`https://www.instagram.com/stories/${encodeURIComponent(username)}/`, HTML_HEADERS(cookie));
  const user = findUserObject(story, username);
  if (!user) throw new Error(`Profil Instagram @${username} tidak ditemukan / cookies tidak valid`);
  return {
    userId: String(user.pk ?? user.id) as string,
    nickname: (user.full_name || user.username) as string | undefined,
    avatar: user.profile_pic_url as string | undefined,
  };
}

/** Ubah satu objek media Instagram (post/story) menjadi daftar file yang bisa diunduh. */
function parseMedia(it: any, parentTime?: number, parentCaption?: string): IgMedia[] {
  const pk = String(it?.pk ?? it?.id ?? '');
  const takenAt = Number(it?.taken_at) * 1000 || parentTime || Date.now();
  const caption: string | undefined = it?.caption?.text ?? parentCaption;

  if (Array.isArray(it?.carousel_media)) {
    return it.carousel_media.flatMap((c: any, i: number) =>
      parseMedia({ ...c, pk: `${pk}_${i}`, taken_at: undefined }, takenAt, caption),
    );
  }
  const isVideo = Array.isArray(it?.video_versions) && it.video_versions.length > 0;
  const url: string | undefined = isVideo ? it.video_versions[0]?.url : it?.image_versions2?.candidates?.[0]?.url;
  if (!url || !pk) return [];
  return [{ mediaId: pk, type: isVideo ? 'video' : 'image', url, takenAt, caption }];
}

/** Media format GraphQL (web_profile_info): GraphImage / GraphVideo / GraphSidecar. */
function parseGraphNode(n: any, parentTime?: number, parentCaption?: string): IgMedia[] {
  const id = String(n?.id ?? '');
  const takenAt = Number(n?.taken_at_timestamp) * 1000 || parentTime || Date.now();
  const caption: string | undefined = n?.edge_media_to_caption?.edges?.[0]?.node?.text ?? parentCaption;

  const children: any[] | undefined = n?.edge_sidecar_to_children?.edges;
  if (children?.length) {
    return children.flatMap((c) => parseGraphNode(c.node, takenAt, caption));
  }
  const isVideo = !!n?.is_video && !!n?.video_url;
  const url: string | undefined = isVideo ? n.video_url : n?.display_url;
  if (!url || !id) return [];
  return [{ mediaId: id, type: isVideo ? 'video' : 'image', url, takenAt, caption }];
}

/** Story aktif (24 jam terakhir). Daftar kosong jika tidak ada story. */
export async function fetchStories(username: string, cookie: string, cachedUserId?: string): Promise<IgResult> {
  requireCookie(cookie);
  const profile = await resolveProfile(username, cookie, cachedUserId);
  const { userId } = profile;
  const headers = apiHeaders(username, cookie);

  const attempts: [string, (j: any) => any[] | undefined][] = [
    [`https://i.instagram.com/api/v1/feed/reels_media/?reel_ids=${userId}`, (j) => j?.reels?.[userId]?.items ?? j?.reels_media?.[0]?.items],
    [`https://i.instagram.com/api/v1/feed/user/${userId}/story/`, (j) => (j && 'reel' in j ? (j.reel?.items ?? []) : undefined)],
  ];

  let rawItems: any[] | undefined;
  let lastErr: unknown;
  for (const [url, pick] of attempts) {
    try {
      const j = await impersonatedJson(url, headers);
      // Respons valid tanpa story → reels kosong ({}), dianggap "tidak ada story"
      rawItems = pick(j) ?? (j && (j.reels || j.reels_media || 'reel' in j) ? [] : undefined);
      if (rawItems) break;
    } catch (e) {
      lastErr = e;
      if ((e as { status?: number }).status === 429) throw e;
    }
  }
  if (!rawItems) throw lastErr instanceof Error ? lastErr : new Error('Gagal mengambil story Instagram');

  return { ...profile, items: rawItems.flatMap((it) => parseMedia(it)) };
}

/**
 * Postingan feed terbaru (foto/video/carousel).
 * Utama: web_profile_info (12 postingan terakhir sekaligus info profil). Endpoint ini sering dibatasi
 * Instagram (429); jika ditolak karena alasan lain, dicoba endpoint feed sebagai cadangan.
 */
export async function fetchFeed(username: string, cookie: string, count: number, cachedUserId?: string): Promise<IgResult> {
  requireCookie(cookie);
  const headers = apiHeaders(username, cookie);

  try {
    const j = await impersonatedJson(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      headers,
    );
    const user = j?.data?.user;
    if (user?.id) {
      const edges: any[] = user.edge_owner_to_timeline_media?.edges ?? [];
      return {
        userId: String(user.id),
        nickname: (user.full_name || user.username) as string | undefined,
        avatar: user.profile_pic_url as string | undefined,
        items: edges.slice(0, count).flatMap((e) => parseGraphNode(e.node)),
      };
    }
  } catch (e) {
    if ((e as { status?: number }).status === 429) throw e;
  }

  const profile = await resolveProfile(username, cookie, cachedUserId);
  let j: any;
  try {
    j = await impersonatedJson(`https://i.instagram.com/api/v1/feed/user/${profile.userId}/?count=${count}`, headers);
  } catch (e) {
    if ((e as { status?: number }).status === 429) throw e;
    try {
      j = await impersonatedJson(
        `https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(username)}/username/?count=${count}`,
        headers,
      );
    } catch (e2) {
      if ((e2 as { status?: number }).status === 429) throw e2;
      throw new Error(`Instagram menolak endpoint feed @${username} dari server ini (profil & story tetap bisa dibaca)`);
    }
  }
  if (!Array.isArray(j?.items)) throw new Error(`Feed @${username} tidak bisa dibaca (akun privat?)`);

  const user = j.user ?? j.items[0]?.user;
  return {
    ...profile,
    nickname: profile.nickname ?? ((user?.full_name || user?.username) as string | undefined),
    avatar: profile.avatar ?? (user?.profile_pic_url as string | undefined),
    items: (j.items as any[]).slice(0, count).flatMap((it) => parseMedia(it)),
  };
}
