import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DOWNLOAD_DIR, LOG_DIR } from './config';
import { notify } from './notify';
import { checkLive, type LiveInfo } from './platforms';
import { findOutput, prefixSize, remuxToMp4, startCapture, type Capture, type CaptureResult } from './recorder';
import { getStore } from './store';
import type { ActiveInfo, Channel } from './types';

const TICK_MS = 5_000;
const MAX_PARALLEL_CHECKS = 3;
/** Setelah rekaman berhenti, cek ulang secepat ini (siapa tahu hanya putus koneksi). */
const RECHECK_AFTER_END_MS = 15_000;
/** Rekaman yang putus setelah berjalan minimal selama ini langsung disambung ulang tanpa jeda. */
const MIN_RUN_FOR_INSTANT_RECONNECT_MS = 30_000;

interface Active {
  channelId: string;
  recordingId: string;
  capture: Capture;
  startedAt: number;
  stopRequested: boolean;
  /** Dimulai manual lewat tombol Rekam (walau auto-record mati) */
  forced: boolean;
}

/** Nama folder/file aman untuk Linux & Windows (tanpa titik di akhir, bukan nama terlarang seperti CON). */
export function safeName(s: string): string {
  const name = s.replace(/[^\w.-]+/g, '_').slice(0, 64).replace(/[. ]+$/, '_') || 'user';
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name) ? `_${name}` : name;
}

export function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const toRel = (abs: string) => path.relative(DOWNLOAD_DIR, abs).split(path.sep).join('/');
export const toAbs = (rel: string) => path.join(DOWNLOAD_DIR, ...rel.split('/'));
export const logPath = (recordingId: string) => path.join(LOG_DIR, `${recordingId}.log`);

class Manager {
  private active = new Map<string, Active>();
  private checking = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    fs.mkdirSync(LOG_DIR, { recursive: true });

    const store = getStore();
    for (const ch of store.listChannels()) {
      if (ch.status === 'recording' || ch.status === 'live') store.updateChannel(ch.id, { status: 'unknown' });
    }
    void this.recoverInterrupted();

    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref?.();
    this.tick();

    const onSignal = (sig: string) => {
      console.log(`[manager] ${sig}: menghentikan semua rekaman...`);
      void this.shutdown().finally(() => process.exit(0));
    };
    process.once('SIGTERM', () => onSignal('SIGTERM'));
    process.once('SIGINT', () => onSignal('SIGINT'));
    console.log(`[manager] berjalan. downloads=${DOWNLOAD_DIR}`);
  }

  private tick() {
    const store = getStore();
    const interval = Math.max(15, store.getSettings().pollIntervalSec) * 1000;
    const now = Date.now();
    for (const ch of store.listChannels()) {
      if (this.checking.size >= MAX_PARALLEL_CHECKS) break;
      if (!ch.enabled || this.active.has(ch.id) || this.checking.has(ch.id)) continue;
      if (ch.lastCheckedAt && now - ch.lastCheckedAt < interval) continue;
      void this.check(ch.id);
    }
  }

  isChecking(channelId: string) {
    return this.checking.has(channelId);
  }

  /** Cek status live. `force` = mulai rekam walau auto-record mati / sebelumnya di-stop. */
  async check(channelId: string, opts: { force?: boolean } = {}): Promise<Channel | undefined> {
    const store = getStore();
    const ch = store.getChannel(channelId);
    if (!ch) throw new Error('Channel tidak ditemukan');
    if (this.checking.has(channelId)) return ch;
    this.checking.add(channelId);

    try {
      const s = store.getSettings();
      const cookies = ch.cookies?.trim() || (ch.platform === 'tiktok' ? s.tiktokCookies : s.instagramCookies);
      const live = await checkLive(ch, cookies, ch.quality || s.tiktokQuality);
      if (!store.getChannel(channelId)) return undefined; // dihapus saat cek berlangsung

      const wasLive = ch.status === 'live' || ch.status === 'recording';
      const patch: Partial<Channel> = {
        lastCheckedAt: Date.now(),
        lastError: undefined,
        nickname: live.nickname ?? ch.nickname,
        avatar: live.avatar ?? ch.avatar,
        platformUserId: live.userId ?? ch.platformUserId,
      };

      if (!live.isLive) {
        Object.assign(patch, { status: 'offline', liveTitle: undefined, skipUntilOffline: false });
        return store.updateChannel(channelId, patch);
      }

      Object.assign(patch, {
        status: this.active.has(channelId) ? 'recording' : 'live',
        lastLiveAt: Date.now(),
        liveTitle: live.title,
      });
      if (opts.force) patch.skipUntilOffline = false;
      const updated = store.updateChannel(channelId, patch)!;

      if (!wasLive) {
        void notify(`🔴 ${updated.nickname || updated.username} (${updated.platform}) sedang LIVE: ${live.title ?? ''}\n${updated.url}`, {
          event: 'live_start',
          channel: updated.username,
          platform: updated.platform,
        });
      }

      const shouldRecord = (updated.enabled && !updated.skipUntilOffline) || opts.force;
      if (shouldRecord && !this.active.has(channelId) && live.streamUrl) {
        this.startRecording(updated, live, !!opts.force && !updated.enabled);
      }
      return store.getChannel(channelId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[manager] cek ${ch.platform}/${ch.username} gagal: ${msg}`);
      return store.updateChannel(channelId, {
        status: this.active.has(channelId) ? 'recording' : 'error',
        lastError: msg,
        lastCheckedAt: Date.now(),
      });
    } finally {
      this.checking.delete(channelId);
    }
  }

  private startRecording(ch: Channel, live: LiveInfo, forced: boolean) {
    const store = getStore();
    const s = store.getSettings();
    const engine = ch.platform === 'tiktok' ? s.tiktokEngine : s.instagramEngine;
    const user = safeName(ch.username);
    const dir = path.join(DOWNLOAD_DIR, ch.platform, user);
    fs.mkdirSync(dir, { recursive: true });
    // Sambung ulang bisa terjadi di detik yang sama: jangan sampai menimpa file sebelumnya
    const stem = `${user}_${stamp(new Date())}`;
    let base = stem;
    for (let n = 2; findOutput(dir, base); n++) base = `${stem}_${n}`;
    const recordingId = randomUUID();

    const capture = startCapture({
      engine,
      url: live.streamUrl!,
      type: live.streamType,
      headers: live.headers,
      dir,
      base,
      logFile: logPath(recordingId),
    });
    const startedAt = Date.now();
    store.addRecording({
      id: recordingId,
      channelId: ch.id,
      platform: ch.platform,
      username: ch.username,
      nickname: ch.nickname,
      title: live.title,
      file: toRel(path.join(dir, `${base}.ts`)),
      startedAt,
      status: 'recording',
      engine,
    });
    this.active.set(ch.id, { channelId: ch.id, recordingId, capture, startedAt, stopRequested: false, forced });
    store.updateChannel(ch.id, { status: 'recording' });
    console.log(`[manager] mulai rekam ${ch.platform}/${ch.username} -> ${base} (${engine})`);

    void capture.done.then((res) => this.onCaptureEnd(ch.id, recordingId, res));
  }

  private async onCaptureEnd(channelId: string, recordingId: string, res: CaptureResult) {
    const store = getStore();
    const s = store.getSettings();
    const a = this.active.get(channelId);
    this.active.delete(channelId);

    // Status channel diperbarui dulu. Jika putus sendiri (bukan Stop manual), langsung cek ulang
    // sebelum remux file lama supaya bagian live yang hilang sesingkat mungkin.
    const ch = store.getChannel(channelId);
    if (ch) {
      const ranMs = a ? Date.now() - a.startedAt : 0;
      const instant = !!a && !a.stopRequested && ranMs >= MIN_RUN_FOR_INSTANT_RECONNECT_MS;
      const interval = Math.max(15, s.pollIntervalSec) * 1000;
      store.updateChannel(channelId, {
        // 'live' (bukan 'unknown') agar notifikasi "sedang LIVE" tidak terkirim ulang
        status: instant ? 'live' : 'unknown',
        lastCheckedAt: instant ? Date.now() : Date.now() - Math.max(0, interval - RECHECK_AFTER_END_MS),
      });
      if (instant) {
        console.log(`[manager] ${ch.platform}/${ch.username} terputus, sambung ulang...`);
        void this.check(channelId, { force: a?.forced });
      }
    }

    let size = 0;
    try {
      size = fs.statSync(res.outFile).size;
    } catch {}
    const endedAt = Date.now();

    if (size < s.minFileSizeKB * 1024) {
      fs.rmSync(res.outFile, { force: true });
      store.updateRecording(recordingId, {
        status: 'failed',
        endedAt,
        size,
        error: `Rekaman kosong/terlalu kecil (exit ${res.code}). Lihat log.`,
      });
    } else {
      store.updateRecording(recordingId, { status: 'processing', endedAt, size, file: toRel(res.outFile) });
      await this.finalize(recordingId);
    }

    if (ch) {
      const rec = store.getRecording(recordingId);
      if (rec?.status === 'done') {
        void notify(`✅ Rekaman ${ch.nickname || ch.username} (${ch.platform}) selesai: ${rec.file}`, {
          event: 'record_done',
          channel: ch.username,
          platform: ch.platform,
          file: rec.file,
          size: rec.size,
        });
      }
    }
  }

  /** Remux ke MP4 (jika diaktifkan) lalu tandai selesai. */
  private async finalize(recordingId: string) {
    const store = getStore();
    const s = store.getSettings();
    const rec = store.getRecording(recordingId);
    if (!rec) return;
    const src = toAbs(rec.file);

    if (s.remuxToMp4 && !src.toLowerCase().endsWith('.mp4')) {
      const out = src.replace(/\.[^./\\]+$/, '') + '.mp4';
      const ok = await remuxToMp4(src, out, logPath(recordingId));
      if (ok) {
        if (s.deleteSourceAfterRemux) fs.rmSync(src, { force: true });
        store.updateRecording(recordingId, { status: 'done', file: toRel(out), size: fs.statSync(out).size });
        return;
      }
      store.updateRecording(recordingId, { status: 'done', error: 'Remux MP4 gagal, file asli disimpan.' });
      return;
    }
    store.updateRecording(recordingId, { status: 'done' });
  }

  /** Rekaman yang terputus karena server restart: selamatkan file-nya. */
  private async recoverInterrupted() {
    const store = getStore();
    for (const rec of store.listRecordings()) {
      if (rec.status !== 'recording' && rec.status !== 'processing') continue;
      const abs = toAbs(rec.file);
      const dir = path.dirname(abs);
      const base = path.basename(abs).replace(/\.[^.]+$/, '');
      const found = findOutput(dir, base);
      if (!found) {
        store.updateRecording(rec.id, { status: 'failed', error: 'Terputus (server restart), file tidak ditemukan.' });
        continue;
      }
      const size = fs.statSync(found).size;
      store.updateRecording(rec.id, {
        status: 'processing',
        file: toRel(found),
        size,
        endedAt: rec.endedAt ?? fs.statSync(found).mtimeMs,
        error: 'Terputus karena server restart (file diselamatkan).',
      });
      await this.finalize(rec.id);
    }
  }

  /** Hentikan rekaman; tidak akan direkam ulang sampai live ini selesai. */
  stop(channelId: string): boolean {
    const a = this.active.get(channelId);
    if (!a) return false;
    a.stopRequested = true;
    getStore().updateChannel(channelId, { skipUntilOffline: true });
    a.capture.stop();
    return true;
  }

  isRecordingActive(recordingId: string) {
    for (const a of this.active.values()) if (a.recordingId === recordingId) return true;
    return false;
  }

  activeInfo(channelId: string): ActiveInfo | undefined {
    const a = this.active.get(channelId);
    if (!a) return undefined;
    return {
      recordingId: a.recordingId,
      startedAt: a.startedAt,
      bytes: prefixSize(a.capture.dir, a.capture.base),
    };
  }

  activeBytesByRecording(): Map<string, number> {
    const m = new Map<string, number>();
    for (const a of this.active.values()) m.set(a.recordingId, prefixSize(a.capture.dir, a.capture.base));
    return m;
  }

  async removeChannel(channelId: string) {
    const a = this.active.get(channelId);
    if (a) {
      a.capture.stop();
      await a.capture.done;
    }
    getStore().removeChannel(channelId);
  }

  async shutdown() {
    if (this.timer) clearInterval(this.timer);
    const all = [...this.active.values()];
    for (const a of all) a.capture.stop();
    await Promise.race([
      Promise.allSettled(all.map((a) => a.capture.done)),
      new Promise((r) => setTimeout(r, 20_000)),
    ]);
    getStore().flush();
  }
}

const g = globalThis as unknown as { __lrManager?: Manager };

/** Singleton manager; otomatis mulai saat pertama dipanggil. */
export function getManager(): Manager {
  if (!g.__lrManager) g.__lrManager = new Manager();
  g.__lrManager.start();
  return g.__lrManager;
}
