import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
export const DOWNLOAD_DIR = path.resolve(process.env.DOWNLOAD_DIR || path.join(process.cwd(), 'downloads'));
export const LOG_DIR = path.join(DATA_DIR, 'logs');
export const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
export const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';
