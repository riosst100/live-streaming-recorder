// Tipe bersama (aman diimport dari client maupun server).

export type Platform = 'tiktok' | 'instagram';
export type ChannelStatus = 'unknown' | 'offline' | 'live' | 'recording' | 'error';
export type RecordingStatus = 'recording' | 'processing' | 'done' | 'failed';
export type Engine = 'ffmpeg' | 'ytdlp';
export type TikTokQuality = 'origin' | 'uhd' | 'hd' | 'sd' | 'ld';

export interface Channel {
  id: string;
  platform: Platform;
  username: string;
  url: string;
  nickname?: string;
  avatar?: string;
  platformUserId?: string;
  /** Rekam otomatis saat live terdeteksi */
  enabled: boolean;
  /** Cookies khusus channel ini (override cookies global platform) */
  cookies?: string;
  quality?: TikTokQuality;
  status: ChannelStatus;
  lastError?: string;
  lastCheckedAt?: number;
  lastLiveAt?: number;
  liveTitle?: string;
  /** Diset saat user menekan Stop: jangan rekam ulang sampai live ini selesai */
  skipUntilOffline?: boolean;
  createdAt: number;
}

export interface Recording {
  id: string;
  channelId: string;
  platform: Platform;
  username: string;
  nickname?: string;
  title?: string;
  /** Path relatif terhadap DOWNLOAD_DIR (pakai '/') */
  file: string;
  startedAt: number;
  endedAt?: number;
  size?: number;
  status: RecordingStatus;
  error?: string;
  engine: Engine;
}

export interface Settings {
  pollIntervalSec: number;
  tiktokCookies: string;
  instagramCookies: string;
  tiktokEngine: Engine;
  instagramEngine: Engine;
  tiktokQuality: TikTokQuality;
  remuxToMp4: boolean;
  deleteSourceAfterRemux: boolean;
  minFileSizeKB: number;
  webhookUrl: string;
  telegramBotToken: string;
  telegramChatId: string;
  /** Interval cek Stories (menit); story hilang setelah 24 jam jadi jangan terlalu jarang */
  storyIntervalMin: number;
  /** Interval cek Feed (menit) */
  feedIntervalMin: number;
  /** Jumlah postingan terbaru yang diperiksa tiap cek Feed (termasuk unduhan awal) */
  feedCount: number;
}

export type MediaKind = 'story' | 'feed';

/** Akun Instagram/TikTok yang dipantau untuk Stories / Feed */
export interface MediaSource {
  id: string;
  kind: MediaKind;
  platform: Platform;
  username: string;
  url: string;
  nickname?: string;
  avatar?: string;
  platformUserId?: string;
  enabled: boolean;
  cookies?: string;
  status: 'unknown' | 'ok' | 'error';
  lastError?: string;
  lastCheckedAt?: number;
  /** Terakhir kali ada media baru terunduh */
  lastNewAt?: number;
  createdAt: number;
}

export interface MediaItem {
  id: string;
  sourceId: string;
  kind: MediaKind;
  username: string;
  /** ID media dari platform (dipakai untuk mencegah unduh ganda) */
  mediaId: string;
  type: 'image' | 'video';
  /** Path relatif terhadap DOWNLOAD_DIR (pakai '/') */
  file: string;
  size: number;
  /** Waktu media diposting (ms) */
  takenAt: number;
  downloadedAt: number;
  caption?: string;
  /** Sudah dilihat di penampil; false = muncul di daftar "baru" */
  seen: boolean;
  /** File sudah dihapus dari disk; catatan dipertahankan supaya tidak diunduh ulang */
  deleted?: boolean;
  deletedAt?: number;
}

export type MediaSourceView = MediaSource & { checking?: boolean; itemCount: number; unseenCount: number };

export interface ActiveInfo {
  recordingId: string;
  startedAt: number;
  bytes: number;
}

export type ChannelView = Channel & { active?: ActiveInfo; checking?: boolean };

export interface DiskInfo {
  free: number;
  total: number;
  path: string;
}
