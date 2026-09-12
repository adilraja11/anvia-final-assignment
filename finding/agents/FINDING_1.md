# Case 1
## Input
```
"prompt": {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "PS5 / PS 5 / PlayStation 5 Slim Digital Version 1TB (Mulus & Terawat)\n\nPlaystation 5 Slim Digital 1TB\nPembelian 2025 (Garansi Off)\nFisik PS5 & DualSense Mulus 95%\nMesin Segel (Belum Pernah Service / Bongkar)\nTidak Pernah Overheat\nFungsi Semua Normal Lancar Jaya No Minus\nKelengkapan : PS , Stick 1, Kabel2, Dus, Dll.\nHarga 8.500.000\nBisa Cek Langsung / COD\nLok. DEPOK"
      },
      {
        "type": "image",
        "image": {
          "type": "data",
          "data": "C:\Users\user\Downloads\803102429_1464961115444429_5533819959004865357_n.jpg
        },
        "mediaType": "image/jpeg"
      }
    ]
  },
```
## Output
```
"Status: MORE_INFORMATION_REQUIRED\n\nIdentitas yang terdeteksi:\n- Kategori: konsol gim\n- Merek/model: Sony PlayStation 5 Slim Digital Edition\n- Penyimpanan: 1 TB\n- Kondisi: tampaknya barang bekas, dengan kondisi yang Anda nyatakan “mulus & terawat”\n- Lokasi: Depok\n\nSebelum pencarian marketplace, mohon lengkapi:\n1. **Edisi/bundle secara spesifik**: konsol saja atau termasuk game/aksesori tambahan tertentu?\n2. **Konfirmasi isi bundle**: apakah benar 1 DualSense original dan kabel-kabel bawaan, tanpa game atau aksesori lain?\n3. **Kondisi yang dipilih**: “Seperti baru”, “Baik”, “Cukup”, atau “Rusak”.\n\nHarga Rp8.500.000 akan diperlakukan hanya sebagai **harga penawaran dari listing Anda**, bukan harga transaksi selesai.\nStatus: MORE_INFORMATION_REQUIRED\n\nMohon konfirmasi **isi bundle** untuk PS5 Slim Digital Edition 1 TB:\n\n- Apakah paket berisi konsol, **1 DualSense**, kabel-kabel, dan dus?\n- Apakah ada game atau aksesori tambahan?\n- Pilih kondisi: **Seperti baru**, **Baik**, **Cukup**, atau **Rusak**.\n\nSetelah dikonfirmasi, pencarian bukti marketplace dapat dilakukan untuk wilayah Depok. Harga Rp8.500.000 akan diperlakukan sebagai **harga penawaran**, bukan harga transaksi selesai."
```

> [!ERROR] Agent think that the information is not enough
> Agent return with status MORE_INFORMATION_REQUIRED. Which is not what the user expected because user think the information give already enough. Think about none details one, perhaps we need a little bit adjustment