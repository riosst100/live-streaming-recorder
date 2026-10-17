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
}

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
