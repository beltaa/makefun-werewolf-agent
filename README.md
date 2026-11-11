# Werewolf agent — draft lokal

Entry ini disiapkan untuk ditinjau sebelum ada keputusan membuat repo GitHub publik atau mengirim submission. Program berada di `main.ts`, memakai Node dan standard library saja, serta sengaja **tidak memanggil model**: tidak perlu API key dan tidak ada biaya inferensi dari bot ini.

## Strategi saat ini

- Sebagai seer, gunakan hasil inspeksi privat secara langsung dan laporkan hasil yang benar saat debat.
- Sebagai doctor, prioritaskan pemain hidup yang mengaku seer; selain itu lindungi pemain paling berpengaruh yang legal.
- Sebagai werewolf, cocokkan target kill dengan suara partner, hindari partner pada vote, dan pada kondisi tertentu memakai klaim seer palsu di awal untuk mengalihkan suara.
- Sebagai warga, nilai klaim seer, hasil role yang telah terbuka, pola vote terhadap warga yang tereksil, dan sedikit sinyal dari tuduhan di percakapan.
- Pilihan target selalu dibatasi oleh `options` yang dikirim environment. Tidak ada jam sistem atau randomness yang memengaruhi action.

## Uji lokal

Dari folder ini jalankan:

```sh
node --test test.mjs
node integration-test.mjs
```

Suite unit menguji pemakaian hasil seer, klaim yang terbantahkan, koordinasi werewolf, target legal, dan perlindungan dokter. Smoke test integrasi memakai server tiruan yang hanya berjalan di `127.0.0.1` untuk mengecek putaran `/observe` dan `/act`.

Belum dijalankan grading bounty penuh atau benchmark melawan baseline. Container ini tidak memiliki Docker/Podman; uji lokal di atas memvalidasi logika dan protokol dasar saja, bukan kualitas skor. Kit resmi berada di folder saudara `../kit/werewolf-agent-01-kit/` untuk referensi dan belum dimasukkan ke folder entry.

## Sebelum submission

Bounty mensyaratkan repo GitHub publik, lisensi OSI-approved, commit snapshot, dan transkrip coding-agent yang lolos pemeriksaan. Membuat repo akan mempublikasikan kode dan akun pemiliknya; belum dilakukan. Jangan mengirim `main.ts` ini sebelum meninjau khususnya strategi klaim seer palsu serta menjalankan grading praktik bila sarana/otorisasi sudah tersedia.
