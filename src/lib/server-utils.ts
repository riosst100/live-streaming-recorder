import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { DOWNLOAD_DIR } from './config';
import { getManager } from './manager';
import { getMediaManager } from './media-manager';
import { getStore } from './store';
import type { ChannelView, DiskInfo, MediaSourceView } from './types';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export function channelView(id: string): ChannelView | undefined {
  const ch = getStore().getChannel(id);
  if (!ch) return undefined;
  const m = getManager();
  return { ...ch, active: m.activeInfo(id), checking: m.isChecking(id) };
}

export function listChannelViews(): ChannelView[] {
  return getStore()
    .listChannels()
    .map((c) => channelView(c.id)!)
    .filter(Boolean);
}

export function mediaSourceView(id: string): MediaSourceView | undefined {
  const store = getStore();
  const s = store.getMediaSource(id);
  if (!s) return undefined;
  const items = store.listMediaItems().filter((i) => i.sourceId === id);
  const unseenCount = items.filter((i) => !i.seen).length;
  return { ...s, checking: getMediaManager().isChecking(id), itemCount: items.length, unseenCount };
}

export function diskInfo(): DiskInfo | null {
  try {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    const s = fs.statfsSync(DOWNLOAD_DIR);
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize, path: DOWNLOAD_DIR };
  } catch {
    return null;
  }
}

export function binaryVersion(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 10_000 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(stdout.split('\n')[0].trim() || null);
    });
  });
}

export async function readBody<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}
