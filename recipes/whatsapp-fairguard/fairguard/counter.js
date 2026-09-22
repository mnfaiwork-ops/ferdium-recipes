// FairGuard - hitungan harian. Fungsi murni: nggak baca DOM, nggak nyentuh storage.
(function (root) {
  'use strict';

  var HARI_MS = 24 * 3600 * 1000;
  var AMBANG_CHAT_BARU_HARI = 7;   // kontak >7 hari dianggap chat baru lagi
  var UMUR_KONTAK_HARI = 30;       // kontak >30 hari dibuang biar storage nggak numpuk
  var RIWAYAT_JEDA = 4;            // berapa jeda terakhir yang diinget buat baca pola

  function tanggalLokal(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function stateAwal(nowTs) {
    return {
      tanggal: tanggalLokal(nowTs),
      dipasangTs: nowTs,
      pesanTerkirim: 0,
      chatBaru: 0,
      idTerlihat: [],
      kirimTerakhirTs: null,
      kirimTerakhirPesanTs: null,
      kontakTerakhirHash: null,
      jedaTerakhir: [],
      kontak: {}
    };
  }

  function buangKontakBasi(kontak, nowTs) {
    var batas = nowTs - UMUR_KONTAK_HARI * HARI_MS;
    var bersih = {};
    Object.keys(kontak).forEach(function (hash) {
      if (kontak[hash] >= batas) bersih[hash] = kontak[hash];
    });
    return bersih;
  }

  // Reset hitungan harian kalau tanggalnya udah ganti. Ingatan kontak tetap dibawa.
  function rollover(state, nowTs) {
    var tanggal = tanggalLokal(nowTs);
    if (tanggal === state.tanggal) return state;
    return Object.assign({}, state, {
      tanggal: tanggal,
      pesanTerkirim: 0,
      chatBaru: 0,
      idTerlihat: [],
      kirimTerakhirTs: null,
      kirimTerakhirPesanTs: null,
      kontakTerakhirHash: null,
      jedaTerakhir: [],
      kontak: buangKontakBasi(state.kontak, nowTs)
    });
  }

  function catatKirim(stateLama, event) {
    var state = rollover(stateLama, event.ts);

    // Layar WA sering di-render ulang; pesan yang sama bisa kebaca berkali-kali.
    if (state.idTerlihat.indexOf(event.msgId) !== -1) return state;

    var kontakTerakhir = state.kontak[event.hash];
    var chatBaru = (kontakTerakhir === undefined ||
      event.ts - kontakTerakhir > AMBANG_CHAT_BARU_HARI * HARI_MS) ? 1 : 0;

    var kontak = Object.assign({}, state.kontak);
    kontak[event.hash] = event.ts;

    // Jam jeda cuma disetel ulang kalau kontaknya GANTI. Yang dipantau itu
    // kecepatan pindah orang, bukan kecepatan ngetik: bales tiga kali dalam
    // sepuluh detik ke orang yang lagi diajak ngobrol itu wajar, sementara
    // ngirim ke tiga orang berbeda dalam sepuluh detik itu pola bot.
    var gantiKontak = state.kontakTerakhirHash !== event.hash;

    // Jeda yang BENERAN kepakai, bukan jam yang lagi jalan. Kirim di ritme yang
    // sama terus itu sendiri pola bot, dan CS nggak bisa ngira-ngira mau nyelang
    // berapa kalau dia nggak lihat selang yang barusan dia pakai.
    // Kiriman pertama hari itu nggak punya pembanding, jadi nggak nyatet apa-apa.
    var jedaTerakhir = state.jedaTerakhir || [];
    if (gantiKontak && state.kirimTerakhirTs) {
      var selang = Math.floor((event.ts - state.kirimTerakhirTs) / 1000);
      jedaTerakhir = [selang].concat(jedaTerakhir).slice(0, RIWAYAT_JEDA);
    }

    return Object.assign({}, state, {
      pesanTerkirim: state.pesanTerkirim + 1,
      chatBaru: state.chatBaru + chatBaru,
      idTerlihat: state.idTerlihat.concat([event.msgId]),
      kirimTerakhirTs: gantiKontak ? event.ts : state.kirimTerakhirTs,
      // Jam pesan disetel ulang tiap kiriman, siapa pun lawan chatnya. Ini
      // angka INFO buat CS ("jam yang jalan"), bukan pemicu warna - yang
      // mancing warna tetap jarak pindah orang di kirimTerakhirTs.
      kirimTerakhirPesanTs: event.ts,
      kontakTerakhirHash: event.hash,
      jedaTerakhir: jedaTerakhir,
      kontak: kontak
    });
  }

  // Dipakai buat pesan lama yang muncul gara-gara layar render ulang: id-nya
  // dicatat biar nggak kehitung, tapi nggak nambah angka apa pun.
  function tandaiSudahLihat(state, msgId) {
    if (state.idTerlihat.indexOf(msgId) !== -1) return state;
    return Object.assign({}, state, {
      idTerlihat: state.idTerlihat.concat([msgId])
    });
  }

  function detikSejakKirim(state, nowTs) {
    if (!state.kirimTerakhirTs) return null;
    return Math.floor((nowTs - state.kirimTerakhirTs) / 1000);
  }

  // null kalau belum ada kiriman hari ini - termasuk buat state bentuk lama
  // dari storage, yang belum punya field ini sama sekali.
  function detikSejakPesan(state, nowTs) {
    if (!state.kirimTerakhirPesanTs) return null;
    return Math.floor((nowTs - state.kirimTerakhirPesanTs) / 1000);
  }

  function sedangKalibrasi(state, nowTs) {
    return nowTs - state.dipasangTs < HARI_MS;
  }

  root.FairGuardCounter = {
    tanggalLokal: tanggalLokal,
    stateAwal: stateAwal,
    rollover: rollover,
    catatKirim: catatKirim,
    tandaiSudahLihat: tandaiSudahLihat,
    detikSejakKirim: detikSejakKirim,
    detikSejakPesan: detikSejakPesan,
    sedangKalibrasi: sedangKalibrasi
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
