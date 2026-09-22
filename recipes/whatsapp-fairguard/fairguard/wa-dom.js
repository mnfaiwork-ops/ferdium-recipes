// FairGuard - SATU-SATUNYA file yang tahu bentuk layar WhatsApp Web.
//
// WhatsApp mengacak nama class-nya tiap update, jadi semua yang nyangkut ke DOM
// dikurung di sini. Kalau extension rusak setelah WhatsApp update, benerin file
// ini doang - counter.js / rules.js nggak perlu disentuh.
//
// Jangkarnya atribut `data-id` pada bubble pesan. Formatnya:
//   <arah>_<jid lawan chat>_<id pesan>[_<pengirim, khusus grup>]
//   contoh: true_628123456789@c.us_3EB0A1B2C3
// Atribut ini nggak diacak dan udah stabil bertahun-tahun.
//
// Yang dibaca: arah pesan, jid lawan chat, jam. ISI PESAN TIDAK PERNAH DIBACA.
(function (root) {
  'use strict';

  var SELEKTOR_BUBBLE = '[data-id]';

  // Ekor gelembung pesan. Nama ikon ini yang kelihatan di survei DOM 2026-09-10;
  // kalau WhatsApp ganti penamaannya, di sini tempat benerinnya.
  var EKOR_KELUAR = '[data-icon="tail-out"]';
  var EKOR_MASUK = '[data-icon="tail-in"]';

  // Nama CS sendiri, dipelajari dari pesan berekor keluar. Sengaja nggak
  // disimpan ke storage: kalau CS ganti nama profil, cukup refresh halaman.
  var namaSendiri = null;

  // Yang DIBUANG cuma grup & broadcast. Sisanya dianggap chat 1-on-1.
  //
  // Dulu kebalikannya: "bukan @c.us berarti grup". Begitu WhatsApp nambah format
  // alamat baru (@lid), semua chat pribadi kecap grup dan dibuang tanpa jejak —
  // badge tetap idup, angka mentok 0, nol error. Salah-buang itu nggak keliatan;
  // salah-hitung keliatan dari angka yang aneh. Makanya daftar hitam, bukan putih.
  var POLA_BUKAN_PRIBADI = /@(g\.us|broadcast)$/;

  function bukanSatuLawanSatu(jid) {
    return POLA_BUKAN_PRIBADI.test(jid);
  }

  function bacaDataId(dataId) {
    if (typeof dataId !== 'string') return null;
    var bagian = dataId.split('_');
    if (bagian.length < 3) return null;
    if (bagian[0] !== 'true' && bagian[0] !== 'false') return null;

    var jid = bagian[1];
    return {
      msgId: dataId,
      keluar: bagian[0] === 'true',
      jid: jid,
      grup: bukanSatuLawanSatu(jid)
    };
  }

  // --- Jangkar arah pesan & lawan chat (pengganti data-id lama) ---
  //
  // data-id sekarang cuma id acak: nggak ngandung arah maupun nomor lawan chat,
  // dan class message-in/message-out udah dihapus WhatsApp. Yang tersisa:
  //
  //   data-pre-plain-text = "[14:32, 10/09/2026] Nama Pengirim: "
  //   #main header [title] = nama lawan chat / judul chat
  //
  // Di chat 1-on-1 pengirim cuma dua kemungkinan: lawan chat, atau kita sendiri.
  // Nama pengirim == judul chat  -> pesan masuk. Beda -> pesan keluar.
  var POLA_PRE = /^\[[^\]]*\]\s*([\s\S]*?):\s*$/;

  function namaPengirim(pre) {
    if (typeof pre !== 'string') return null;
    var cocok = pre.match(POLA_PRE);
    return cocok ? cocok[1].trim() : null;
  }

  // null = belum bisa ditentukan. JANGAN ditebak: nebak salah bikin pesan masuk
  // kehitung sebagai kiriman CS, dan itu bikin angka badge bohong.
  function arahKeluar(pengirim, judulChat) {
    if (!pengirim || !judulChat) return null;
    return String(pengirim).trim() !== String(judulChat).trim();
  }

  // Jangkar arah yang dipakai sekarang: bandingin ke nama CS sendiri.
  //
  // Cara di atas (pengirim vs judul header) TERBUKTI GAGAL di lapangan: judul
  // dari '#main header [title]' nggak pernah sama dengan nama pengirim mana pun,
  // jadi semua pesan kecap keluar (msk0 dari 97 pesan). Elemen ber-title pertama
  // di header ternyata bukan nama lawan chat.
  //
  // Nama sendiri dipelajari dari ekor gelembung: baris yang punya data-icon
  // "tail-out" itu pasti kiriman kita, jadi nama pengirimnya = nama kita.
  // Ekor cuma nempel di pesan pertama tiap rentetan, makanya dipakai buat
  // BELAJAR sekali, bukan buat ngecek tiap pesan.
  function arahDariNamaSendiri(pengirim, namaSendiri) {
    if (!pengirim || !namaSendiri) return null;
    return String(pengirim).trim() === String(namaSendiri).trim();
  }

  // Buka chat lama bikin WhatsApp nge-render belasan bubble sekaligus. Itu riwayat,
  // bukan kiriman baru - kalau dihitung, angka CS langsung ngaco. Kiriman beneran
  // datang satu-satu.
  var BATAS_BATCH = 3;

  function apakahRenderRiwayat(jumlahDalamBatch) {
    return jumlahDalamBatch > BATAS_BATCH;
  }

  // --- SEMENTARA: penghitung diagnosa. Dibuang setelah observer kebukti jalan. ---
  // Kenapa ada: kalau angka badge diem di 0, dari luar nggak kelihatan bedanya
  // antara "mutation nggak pernah datang", "data-id nggak kebaca", dan "kebaca
  // tapi kebuang". Tiga itu perbaikannya beda-beda.
  var statistik = {
    batch: 0,        // callback observer kepanggil berapa kali
    nodeMasuk: 0,    // node baru yang punya data-id
    parseGagal: 0,   // punya data-id tapi bentuknya nggak kekenal
    lolos: 0,        // lolos parser, diteruskan ke content.js
    jalurLama: 0,    // kebaca lewat data-id format lama
    jalurBaru: 0,    // kebaca lewat data-pre-plain-text + judul header
    bukanPesan: 0,   // punya data-id tapi bukan baris pesan
    arahGagal: 0,    // baris pesan tapi arahnya nggak bisa ditentukan
    identitasGagal: 0, // arah kebaca tapi nama lawan chat nggak kebaca
    contohGagal: [],    // bentuk tersamar dari data-id yang ditolak, maks 3 macam
    contohPengirim: [], // bentuk tersamar nama pengirim yang beda-beda, maks 4
    namaSendiri: '-',   // bentuk tersamar nama sendiri, begitu kepelajari
    judulUnik: [],      // bentuk tersamar judul chat yang beda-beda, maks 5
    jejak: []           // 8 batch terakhir: <jumlah><r=riwayat/h=hitung>:<judul>
  };

  // Angka -> '#', deretan panjang -> '12x'. Nomor HP & isi id nggak kebaca,
  // yang kesisa cuma kerangkanya: pemisah, jumlah bagian, nama domain.
  function samarkan(teks) {
    return String(teks)
      .replace(/\d/g, '#')
      .replace(/[A-Za-z#]{10,}/g, function (m) { return m.length + 'x'; })
      .slice(0, 44);
  }

  // SEMENTARA: kumpulin bentuk nama pengirim yang beda-beda, buat dibandingin
  // sama judul header. Kalau nggak ada satu pun yang sama, berarti perbandingan
  // nama emang nggak pernah cocok - bukan chatnya yang kebetulan satu arah.
  function catatPengirim(nama) {
    if (!nama || statistik.contohPengirim.length >= 4) return;
    var bentuk = samarkanKeras(nama);
    if (statistik.contohPengirim.indexOf(bentuk) === -1) {
      statistik.contohPengirim.push(bentuk);
    }
  }

  function catatContohGagal(dataId) {
    if (statistik.contohGagal.length >= 3) return;
    var bentuk = samarkan(dataId);
    if (statistik.contohGagal.indexOf(bentuk) === -1) {
      statistik.contohGagal.push(bentuk);
    }
  }

  // --- SEMENTARA: pelacak identitas lawan chat. Dibuang bareng DIAG. ---
  // Satu pertanyaan: kandidat mana yang nilainya GANTI pas pindah chat. Yang
  // nilainya cuma satu macam sepanjang sesi berarti bukan identitas lawan chat,
  // dan identitas yang konstan bikin semua chat kecap satu kontak: jeda nggak
  // pernah disetel ulang, chat baru mentok 0.
  var KANDIDAT_JUDUL = [
    ['t', '#main header [title]', 'title'],
    ['s', '#main header span[dir="auto"]', null],
    ['h', '#main header h1, #main header h2', null],
    ['b', '#main header button[title]', 'title']
  ];

  var kandidatUnik = { t: [], s: [], h: [], b: [] };

  function nilaiKandidat(dokumen, k) {
    try {
      var el = dokumen.querySelector(k[1]);
      if (!el) return null;
      var nilai = k[2] ? el.getAttribute(k[2]) : el.textContent;
      return nilai ? String(nilai) : null;
    } catch (e) { return null; }
  }

  function catatKandidat(dokumen) {
    KANDIDAT_JUDUL.forEach(function (k) {
      var nilai = nilaiKandidat(dokumen, k);
      if (!nilai) return;
      var bentuk = samarkanKeras(nilai);
      var daftar = kandidatUnik[k[0]];
      if (daftar.indexOf(bentuk) === -1 && daftar.length < 5) daftar.push(bentuk);
    });
  }

  function catatJudul(judul) {
    if (!judul || statistik.judulUnik.length >= 5) return;
    var bentuk = samarkanKeras(judul);
    if (statistik.judulUnik.indexOf(bentuk) === -1) statistik.judulUnik.push(bentuk);
  }

  function ringkasKandidat() {
    return KANDIDAT_JUDUL.map(function (k) {
      return k[0] + kandidatUnik[k[0]].length;
    }).join(' ');
  }

  // --- SEMENTARA: survei jangkar. Dibuang setelah jangkar baru ketemu. ---
  // Nyari tahu penanda mana yang masih ada di WA Web sekarang, dan yang penting:
  // apakah data-id itu punya bubble pesan (#main) atau cuma baris daftar chat
  // (#pane-side). Dua-duanya kena selektor [data-id] yang sama.
  var SURVEI = [
    ['row', '#main div[role="row"]'],
    ['centang', '#main [data-icon^="msg-"]'],
    ['ck', '#main [data-icon="msg-check"]'],
    ['dck', '#main [data-icon="msg-dblcheck"]'],
    ['jam', '#main [data-icon="msg-time"]'],
    ['jid', '[data-jid]'],
    ['hdr', '#main header [title]']
  ];

  // Penyamaran keras: SEMUA deretan huruf/angka jadi '<panjang>x'. Dipakai buat
  // field yang isinya nama orang atau nomor - yang kesisa cuma tanda baca &
  // kerangkanya. samarkan() biasa masih nyisain kata pendek, di sini nggak boleh.
  function samarkanKeras(teks) {
    return String(teks)
      .replace(/[A-Za-z0-9]+/g, function (m) { return m.length + 'x'; })
      .slice(0, 46);
  }

  function contohAtribut(dokumen, selektor, atribut) {
    try {
      var el = dokumen.querySelectorAll(selektor);
      if (!el.length) return '-';
      var nilai = el[el.length - 1].getAttribute(atribut);
      return nilai === null ? '-' : samarkanKeras(nilai);
    } catch (e) { return '?'; }
  }

  function surveiDom(dokumen) {
    var hasil = [];
    SURVEI.forEach(function (pasangan) {
      var n = 0;
      try { n = dokumen.querySelectorAll(pasangan[1]).length; } catch (e) { n = -1; }
      hasil.push(pasangan[0] + n);
    });

    // Nama ikon bukan data pribadi, jadi ditampilkan apa adanya. Ini kandidat
    // jangkar arah yang belum pernah kecek: dulu cuma dicari prefix "msg-".
    var ikon = '-';
    try {
      var semua = dokumen.querySelectorAll('#main [data-icon]');
      var unik = [];
      Array.prototype.forEach.call(semua, function (el) {
        var n = el.getAttribute('data-icon');
        if (n && unik.indexOf(n) === -1 && unik.length < 8) unik.push(n);
      });
      ikon = unik.length ? unik.join(',') : '(kosong)';
    } catch (e) { ikon = '?'; }

    // SEMENTARA: kandidat sumber nama lawan chat. '#main header [title]' yang
    // dipakai sekarang TERBUKTI SALAH - isinya nggak pernah sama dengan nama
    // pengirim mana pun. Identitas kontak butuh sumber lain.
    var judulUji = KANDIDAT_JUDUL.map(function (k) {
      var nilai = nilaiKandidat(dokumen, k);
      return k[0] + ':' + (nilai ? samarkanKeras(nilai) : '-');
    }).join('  ');

    return hasil.join(' ') +
      '\njudul: ' + judulUji +
      '\nikon: ' + ikon +
      '\nkirim: ' + (statistik.contohPengirim.join(' | ') || '-') +
      '\nppt: ' + contohAtribut(dokumen, '#main [data-pre-plain-text]', 'data-pre-plain-text') +
      '\nhdr: ' + contohAtribut(dokumen, '#main header [title]', 'title') +
      '\njid: ' + contohAtribut(dokumen, '[data-jid]', 'data-jid') +
      '\naria: ' + contohAtribut(dokumen, '#main div[role="row"]', 'aria-label') +
      '\nkand: ' + ringkasKandidat() +
      '\njdl: ' + (statistik.judulUnik.join(' | ') || '-') +
      '\njejak: ' + (statistik.jejak.join('  ') || '-');
  }

  // --- Identitas lawan chat ---
  //
  // JANGAN pakai '#main header [title]'. Elemen ber-title pertama di header itu
  // tombol tetap, nilainya sama di semua chat. Diukur di lapangan 2026-09-15:
  // kandidat t (header [title]) = 1 nilai sepanjang sesi, kandidat s (header
  // span[dir="auto"]) = 4 nilai untuk 4 chat yang dibuka. Identitas yang konstan
  // bikin semua kontak kecap satu orang - jeda nggak pernah disetel ulang
  // (gnt0 dari 3 kiriman), chat baru mentok 0, dan nol error yang keliatan.
  //
  // Nomor HP-nya sendiri udah nggak ada di DOM: '[data-jid]' nol di seluruh
  // halaman. Jadi identitas cuma bisa dari nama tampilan, dengan konsekuensi
  // yang diterima: dua kontak bernama sama persis kehitung satu orang, dan
  // kontak yang diganti namanya kehitung orang baru.
  var SELEKTOR_NAMA_CHAT = '#main header span[dir="auto"]';

  function namaLawanChat(dokumen) {
    try {
      var el = dokumen.querySelector(SELEKTOR_NAMA_CHAT);
      if (!el) return null;
      var nama = String(el.textContent || '').trim();
      return nama || null;
    } catch (e) { return null; }
  }

  // Panggil balik tiap kali ada bubble pesan baru muncul di layar.
  // onPesan(hasil, { riwayat: true/false })

  function pantauPesan(dokumen, onPesan) {
    function kumpulkan(node, keranjang, judul) {
      if (!node || node.nodeType !== 1) return;
      var kandidat = node.matches && node.matches(SELEKTOR_BUBBLE)
        ? [node]
        : (node.querySelectorAll ? node.querySelectorAll(SELEKTOR_BUBBLE) : []);
      Array.prototype.forEach.call(kandidat, function (el) {
        statistik.nodeMasuk++;
        var dataId = el.getAttribute('data-id');

        // Jalur lama: data-id yang masih ngandung arah + jid. Dipertahankan biar
        // laptop yang WhatsApp-nya belum kena update tetap jalan.
        var hasil = bacaDataId(dataId);
        if (hasil) { statistik.lolos++; statistik.jalurLama++; keranjang.push(hasil); return; }

        // Jalur baru: arah dari data-pre-plain-text vs judul header.
        var pptEl = el.matches('[data-pre-plain-text]')
          ? el
          : (el.querySelector ? el.querySelector('[data-pre-plain-text]') : null);
        if (!pptEl) { statistik.bukanPesan++; return; }

        var nama = namaPengirim(pptEl.getAttribute('data-pre-plain-text'));
        catatPengirim(nama);

        // Ekor gelembung: jawaban paling pasti, tapi cuma ada di pesan pertama
        // tiap rentetan. Dipakai buat belajar nama sendiri sekali seumur sesi.
        var keluar = null;
        if (el.querySelector && el.querySelector(EKOR_KELUAR)) {
          keluar = true;
          if (nama && !namaSendiri) {
            namaSendiri = nama;
            statistik.namaSendiri = samarkanKeras(nama);
          }
        } else if (el.querySelector && el.querySelector(EKOR_MASUK)) {
          keluar = false;
        } else {
          keluar = arahDariNamaSendiri(nama, namaSendiri);
        }

        // Belum ada satu pun pesan berekor sejak halaman dibuka, jadi nama
        // sendiri belum kekenal. Nggak dihitung - lebih baik kurang daripada
        // salah hitung. Beres sendiri begitu ada satu kiriman berekor.
        if (keluar === null) { statistik.arahGagal++; return; }

        // Identitas nggak kebaca -> nggak dihitung. Dulu nilainya diterusin apa
        // adanya, dan null/nilai tetap bikin semua kontak nyatu diam-diam.
        // Lebih baik angkanya kurang daripada tiga orang kecatat satu orang.
        if (!judul) { statistik.identitasGagal++; return; }

        statistik.lolos++;
        statistik.jalurBaru++;
        keranjang.push({
          msgId: dataId || (nama + '|' + pptEl.getAttribute('data-pre-plain-text')),
          keluar: keluar,
          jid: judul,
          // BELUM KEPEGANG: nomor lawan chat ilang dari DOM, jadi grup nggak bisa
          // dibedain dari chat pribadi. Lihat catatan di SPEC 4.4.
          grup: false
        });
      });
    }

    var observer = new root.MutationObserver(function (mutations) {
      var keranjang = [];
      var judul = namaLawanChat(dokumen);
      mutations.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) {
          kumpulkan(n, keranjang, judul);
        });
      });
      if (!keranjang.length) return;
      statistik.batch++;
      catatJudul(judul);
      catatKandidat(dokumen);
      var konteks = { riwayat: apakahRenderRiwayat(keranjang.length) };

      // SEMENTARA: jejak batch. Dari angka ringkasan doang nggak kebedain
      // "kiriman asli ketelen ambang riwayat" sama "identitas dua chat nyatu" -
      // dua-duanya keluar sebagai angka kecil. Jejak per batch misahin keduanya:
      // keliatan batch mana yang dibuang, isinya berapa, dan atas nama siapa.
      var keluarDiBatch = keranjang.filter(function (h) { return h.keluar; }).length;
      statistik.jejak.push(keranjang.length + '/' + keluarDiBatch +
        (konteks.riwayat ? 'r' : 'h') + ':' + samarkanKeras(judul || '-'));
      if (statistik.jejak.length > 8) statistik.jejak.shift();
      keranjang.forEach(function (hasil) { onPesan(hasil, konteks); });
    });
    observer.observe(dokumen.body, { childList: true, subtree: true });
    return observer;
  }

  root.FairGuardWaDom = {
    SELEKTOR_BUBBLE: SELEKTOR_BUBBLE,
    bacaDataId: bacaDataId,
    namaPengirim: namaPengirim,
    namaLawanChat: namaLawanChat,
    arahKeluar: arahKeluar,
    arahDariNamaSendiri: arahDariNamaSendiri,
    apakahRenderRiwayat: apakahRenderRiwayat,
    pantauPesan: pantauPesan,
    statistik: statistik,
    surveiDom: surveiDom
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
