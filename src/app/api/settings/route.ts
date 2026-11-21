import { error, json, readBody } from '@/lib/server-utils';
import { validateSettings } from '@/lib/settings-validate';
import { getStore } from '@/lib/store';
import type { Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return json(getStore().getSettings());
}

export async function PUT(req: Request) {
  const r = validateSettings(await readBody<Settings>(req));
  if ('error' in r) return error(r.error);
  return json(getStore().updateSettings(r.patch));
}
