import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config';
import type { Channel, Recording, Settings } from './types';

export const defaultSettings: Settings = {
  pollIntervalSec: 60,
  tiktokCookies: '',
  instagramCookies: '',
  tiktokEngine: 'ffmpeg',
  instagramEngine: 'ffmpeg',
  tiktokQuality: 'origin',
  remuxToMp4: true,
  deleteSourceAfterRemux: true,
  minFileSizeKB: 512,
  webhookUrl: '',
  telegramBotToken: '',
  telegramChatId: '',
};

interface DB {
  channels: Channel[];
  recordings: Recording[];
  settings: Settings;
}

/**
 * Penyimpanan JSON sederhana (data/db.json). Ditulis secara atomik (tmp + rename)
 * dengan debounce, cukup untuk ratusan channel & ribuan rekaman.
 */
class Store {
  private db: DB;
  private file = path.join(DATA_DIR, 'db.json');
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    this.db = this.load();
  }

  private load(): DB {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<DB>;
      return {
        channels: raw.channels ?? [],
        recordings: raw.recordings ?? [],
        settings: { ...defaultSettings, ...(raw.settings ?? {}) },
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        const backup = `${this.file}.corrupt-${Date.now()}`;
        try {
          fs.copyFileSync(this.file, backup);
        } catch {}
        console.error(`[store] db.json rusak, backup ke ${backup}`, e);
      }
      return { channels: [], recordings: [], settings: { ...defaultSettings } };
    }
  }

  private save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 300);
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // ---- settings
  getSettings(): Settings {
    return this.db.settings;
  }
  updateSettings(patch: Partial<Settings>): Settings {
    this.db.settings = { ...this.db.settings, ...patch };
    this.save();
    return this.db.settings;
  }

  // ---- channels
  listChannels(): Channel[] {
    return this.db.channels;
  }
  getChannel(id: string): Channel | undefined {
    return this.db.channels.find((c) => c.id === id);
  }
  addChannel(ch: Channel): Channel {
    this.db.channels.push(ch);
    this.save();
    return ch;
  }
  updateChannel(id: string, patch: Partial<Channel>): Channel | undefined {
    const ch = this.getChannel(id);
    if (!ch) return undefined;
    Object.assign(ch, patch);
    this.save();
    return ch;
  }
  removeChannel(id: string) {
    this.db.channels = this.db.channels.filter((c) => c.id !== id);
    this.save();
  }

  // ---- recordings
  listRecordings(): Recording[] {
    return this.db.recordings;
  }
  getRecording(id: string): Recording | undefined {
    return this.db.recordings.find((r) => r.id === id);
  }
  addRecording(r: Recording): Recording {
    this.db.recordings.push(r);
    this.save();
    return r;
  }
  updateRecording(id: string, patch: Partial<Recording>): Recording | undefined {
    const r = this.getRecording(id);
    if (!r) return undefined;
    Object.assign(r, patch);
    this.save();
    return r;
  }
  removeRecording(id: string) {
    this.db.recordings = this.db.recordings.filter((r) => r.id !== id);
    this.save();
  }
}

// Disimpan di globalThis supaya instrumentation & route handler memakai instance yang sama.
const g = globalThis as unknown as { __lrStore?: Store };

export function getStore(): Store {
  if (!g.__lrStore) g.__lrStore = new Store();
  return g.__lrStore;
}
