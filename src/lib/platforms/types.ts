export interface LiveInfo {
  isLive: boolean;
  title?: string;
  nickname?: string;
  avatar?: string;
  userId?: string;
  roomId?: string;
  streamUrl?: string;
  streamType?: 'flv' | 'hls' | 'dash';
  /** Header HTTP yang dibutuhkan untuk mengambil stream */
  headers?: Record<string, string>;
}
