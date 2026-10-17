import { DATA_DIR, DOWNLOAD_DIR, FFMPEG_PATH, YTDLP_PATH } from '@/lib/config';
import { binaryVersion, diskInfo, json } from '@/lib/server-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [ffmpeg, ytdlp] = await Promise.all([
    binaryVersion(FFMPEG_PATH, ['-version']),
    binaryVersion(YTDLP_PATH, ['--version']),
  ]);
  return json({
    ffmpeg,
    ytdlp,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    dataDir: DATA_DIR,
    downloadDir: DOWNLOAD_DIR,
    disk: diskInfo(),
    authEnabled: !!process.env.PASSWORD,
  });
}
