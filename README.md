# Live Streaming Recorder

Aplikasi web self-hosted untuk merekam live **TikTok** dan **Instagram** secara otomatis. Anda cukup menambahkan URL profil.
Konsepnya mirip [olived web](https://olived.app/docs/web): satu proses, UI di browser (port **9843**), opsi `PASSWORD`,
serta folder `data/` (config, DB, log) dan `downloads/` (hasil rekaman).

## Fitur

- Tambah channel dari URL profil, satu per satu atau sekaligus:
  - `https://www.tiktok.com/@username`
  - `https://www.instagram.com/username/`
- Status live dicek otomatis secara berkala, dan perekaman dimulai sendiri saat channel live (auto-record bisa dimatikan per channel).
- Tombol **Rekam** (paksa rekam sekarang), **Stop** (tidak direkam ulang sampai live selesai), dan **Cek**.
- **Cookies** global per platform, juga override per channel. Format yang diterima: header string, Netscape `cookies.txt`, atau JSON Cookie-Editor.
- Pilihan kualitas TikTok: origin / uhd / hd / sd / ld.
- Engine perekam **ffmpeg** (default) atau **yt-dlp**.
- Rekaman ditulis ke `.ts` (aman jika putus), lalu di-remux otomatis ke **MP4** tanpa re-encode.
- Jika server restart, file rekaman yang terputus diselamatkan otomatis.
- Halaman Rekaman berisi daftar file, player di browser, unduh, log ffmpeg, dan hapus.
- Notifikasi Discord/Slack webhook dan Telegram saat live mulai dan saat rekaman selesai.
- Login dengan password (cookie httpOnly) dan rate-limit login.

## Struktur

```
src/
  instrumentation.ts        # menyalakan worker perekam saat server start
  middleware.ts             # proteksi password
  lib/
    manager.ts              # polling, start/stop rekaman, remux, recovery
    recorder.ts             # spawn ffmpeg / yt-dlp
    platforms/tiktok.ts     # deteksi live TikTok (webcast room info)
    platforms/instagram.ts  # deteksi live Instagram (butuh cookies)
    store.ts                # database JSON (data/db.json)
    cookies.ts              # parser cookies
  app/(main)/               # UI: Channel, Rekaman, Pengaturan
  app/api/                  # REST API
deploy/                     # installer Ubuntu + systemd + nginx
```

## Deploy di Ubuntu (22.04 / 24.04)

```bash
# salin folder project ke server (git clone / scp / rsync), lalu:
cd live-streaming-recorder
sudo bash deploy/install.sh
```

Script ini akan:

1. Memasang `ffmpeg`, Node.js 22, dan `yt-dlp` (yt-dlp juga diupdate otomatis tiap hari lewat cron).
2. Membuat user sistem `live-streaming-recorder` dan menyalin aplikasi ke `/opt/live-streaming-recorder`.
3. Membuat `/etc/live-streaming-recorder.env` dengan **password acak**, yang ditampilkan di akhir instalasi.
4. Menjalankan build lalu memasang service systemd `live-streaming-recorder`.

Buka `http://IP_SERVER:9843`.

| Perintah | Fungsi |
| --- | --- |
| `journalctl -u live-streaming-recorder -f` | lihat log |
| `sudo systemctl restart live-streaming-recorder` | restart (setelah ubah `/etc/live-streaming-recorder.env`) |
| `sudo bash deploy/update.sh` | update kode (dari folder source terbaru) |

Hasil rekaman tersimpan di `/opt/live-streaming-recorder/downloads/<platform>/<username>/<username>_YYYYMMDD-HHMMSS.mp4`.

Untuk akses publik + HTTPS, pakai contoh [deploy/nginx.conf.example](deploy/nginx.conf.example) lalu jalankan `certbot --nginx`.
Setelah itu tutup port 9843 dari luar (`ufw allow 'Nginx Full'` dan `ufw deny 9843`).

### Alternatif: Docker

```bash
docker compose up -d --build
```

## Development (lokal)

Butuh Node.js ≥ 20 dan `ffmpeg` di PATH (`yt-dlp` opsional).

```bash
cp .env.example .env    # isi PASSWORD (kosongkan = tanpa login)
npm install
npm run dev             # http://localhost:9843
```

## Cookies

| Platform | Wajib? | Cookie penting |
| --- | --- | --- |
| Instagram | **Ya**, karena API live butuh login | `sessionid`, `csrftoken`, `ds_user_id` |
| TikTok | Opsional, untuk live yang dibatasi umur/region | `sessionid` |

Cara mendapatkannya:

1. Login di browser.
2. Pasang extension **Cookie-Editor** lalu pilih Export → JSON. Bisa juga **Get cookies.txt LOCALLY**.
3. Tempel hasilnya di **Pengaturan → Cookies**.

Gunakan akun cadangan, dan jangan set interval cek terlalu kecil (≥ 60 detik untuk Instagram) supaya akun tidak kena rate-limit atau checkpoint.

## REST API

Semua endpoint butuh sesi login jika `PASSWORD` di-set.

| Method | Endpoint | Keterangan |
| --- | --- | --- |
| GET | `/api/channels` | daftar channel + status rekaman + info disk |
| POST | `/api/channels` | `{ url, enabled?, quality?, cookies? }` |
| PATCH | `/api/channels/:id` | `{ enabled?, quality?, cookies? }` |
| DELETE | `/api/channels/:id` | hapus channel (file rekaman tetap ada) |
| POST | `/api/channels/:id/check` \| `record` \| `stop` | aksi |
| GET | `/api/recordings` | daftar rekaman |
| GET | `/api/recordings/:id/file[?download=1]` | stream / unduh (mendukung Range) |
| GET | `/api/recordings/:id/log` | log ffmpeg |
| DELETE | `/api/recordings/:id` | hapus file + data |
| GET/PUT | `/api/settings` | pengaturan |
| GET | `/api/system` | versi ffmpeg/yt-dlp, disk |

## Troubleshooting

- **Instagram error "butuh cookies" atau "tidak valid"**: cookies sudah kadaluarsa, jadi export ulang. Kalau akun terkena checkpoint, login dulu di browser untuk menyelesaikannya.
- **Instagram terdeteksi live tapi file kosong**: ganti *Engine Instagram* ke `yt-dlp` di Pengaturan.
- **TikTok selalu offline padahal live**: isi cookies TikTok, karena beberapa region/live 18+ butuh login. Jika server berada di negara yang memblokir TikTok, pakai proxy/VPS di region lain.
- **Rekaman putus-putus**: aplikasi otomatis cek ulang sekitar 15 detik setelah stream putus, lalu memulai file baru jika masih live.
- Detail error per rekaman bisa dilihat lewat tombol **Log** di halaman Rekaman.

> Gunakan hanya untuk konten yang Anda berhak arsipkan dan patuhi ketentuan platform serta hak cipta kreator.
