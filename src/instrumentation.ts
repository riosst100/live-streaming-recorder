// Dijalankan sekali saat server Next.js start: nyalakan worker perekam.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getManager } = await import('./lib/manager');
    getManager();
    const { getMediaManager } = await import('./lib/media-manager');
    getMediaManager();
  }
}
