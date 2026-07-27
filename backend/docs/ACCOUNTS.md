# WIT — Akun Demo

Daftar akun bawaan untuk demo dan sosialisasi. Semua dibuat oleh migration, jadi
setiap orang yang menjalankan `make migrate-up` mendapat akun yang sama persis.

> **Ini akun demo, bukan akun produksi.** Passwordnya tertulis terbuka di file
> migration di dalam repo, jadi anggap semua orang yang punya akses repo tahu
> passwordnya. Jangan pakai alamat atau password ini untuk apa pun yang nyata,
> dan ganti seluruhnya sebelum aplikasi ini dipakai di luar lingkungan demo.

Terakhir diverifikasi: **27 Juli 2026** — keenam akun dites login satu per satu
dan mengembalikan role yang benar.

---

## Akun per peran

Dua set, isinya sama secara kemampuan. Set **Demo** dipakai tombol satu-klik di
halaman login; set **Lead** untuk dibagikan saat sosialisasi.

| # | Email | Password | Peran | Set |
|---|-------|----------|-------|-----|
| 1 | `admin@wit.id` | `admin1234` | Admin | Demo |
| 2 | `editor@wit.id` | `editor1234` | Editor | Demo |
| 3 | `viewer@wit.id` | `viewer1234` | Viewer | Demo |
| 4 | `lead-admin@wit.id` | `wit-admin-1234` | Admin | Lead |
| 5 | `lead-editor@wit.id` | `wit-editor-1234` | Editor | Lead |
| 6 | `lead-viewer@wit.id` | `wit-viewer-1234` | Viewer | Lead |

## Apa yang bisa dilakukan tiap peran

| Kemampuan | Admin | Editor | Viewer |
|---|:---:|:---:|:---:|
| Menjelajah katalog, membuka deck | ✅ | ✅ | ✅ |
| Menyimpan ke My Library (favorit) | ✅ | ✅ | ✅ |
| Menambah deck (upload PDF / link / video) | ✅ | ✅ | — |
| Mengubah & menghapus deck | ✅ | ✅ | — |
| Mengelola pengguna (tambah / ubah peran / hapus) | ✅ | — | — |

Pembatasan ini ditegakkan di **router backend**, bukan hanya disembunyikan di
tampilan. Jadi menyembunyikan tombol bukan satu-satunya penjaga — permintaan
langsung ke API dari peran yang tidak berhak tetap ditolak.

---

## Cara mencoba saat sosialisasi

**Paling cepat** — di halaman login ada tombol satu-klik untuk tiga akun Demo.
Tidak perlu mengetik apa pun; klik peran, dan bedanya langsung terlihat.

**Cara paling meyakinkan menunjukkan role gating:** masuk sebagai Viewer, lalu
tunjukkan tombol "Add deck" memang tidak ada. Keluar, masuk sebagai Editor,
tombolnya muncul. Masuk sebagai Admin, menu Settings punya tab Users yang tidak
dimiliki Editor.

**Ada juga tur otomatis** — menu akun → "How to use — auto demo". Aplikasi akan
mengklik dirinya sendiri melewati fitur-fitur utama. Berguna kalau Anda ingin
bicara sambil aplikasi berjalan sendiri.

---

## Daftar sendiri (registrasi mandiri)

Selain akun di atas, siapa pun bisa mendaftar sendiri lewat **Create account** di
halaman login.

Alurnya:

1. Isi nama, email, password (minimal 8 karakter)
2. Muncul layar "Check your inbox"
3. Buka link verifikasi
4. Otomatis masuk ke aplikasi

Dua hal yang perlu diketahui saat mendemokan ini:

- **Pendaftar mandiri selalu jadi `viewer`.** Peran tidak bisa diminta lewat
  form — kalau bisa, siapa pun bisa mendaftar sebagai admin.
- **Belum diverifikasi = belum bisa masuk.** Password yang benar pun ditolak
  sampai emailnya dikonfirmasi, dengan pesan yang mengarahkan ke inbox.

> **Di lingkungan demo, email tidak benar-benar dikirim.** Link verifikasinya
> dicetak ke terminal yang menjalankan API — cari blok bertuliskan
> `EMAIL (dev mailer — nothing was actually sent)`, lalu salin link-nya ke
> browser. Untuk mengirim email sungguhan, perlu mengganti mailer-nya (lihat
> `internal/mailer/`).

---

## Menyiapkan akun ini di komputer sendiri

```bash
cd backend && make migrate-up
```

Aman dijalankan berulang — migration-nya idempoten, tidak akan membuat akun
ganda. Untuk menghapus akun set Lead saja, jalankan `000006` bagian `down`.
