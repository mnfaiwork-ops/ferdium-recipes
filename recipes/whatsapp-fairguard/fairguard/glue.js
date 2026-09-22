// FairGuard - perekat: layar -> hitungan -> simpan -> badge.
//
// Semua logika hitungan ada di counter.js / rules.js (murni, ada unit test-nya).
// File ini cuma nyambungin ke Chrome API dan WA Web.
(function () {
  'use strict';

  var C = globalThis.FairGuardCounter;
  var B = globalThis.FairGuardBadge;
  var D = globalThis.FairGuardWaDom;
  var H = globalThis.FairGuardHash;

  var KUNCI = { state: 'fairguard.state', setelan: 'fairguard.setelan', salt: 'fairguard.salt' };
  function bacaKunci(k, dflt) {
    try { var raw = localStorage.getItem(KUNCI[k]); return raw ? JSON.parse(raw) : dflt; }
    catch (e) { return dflt; }
  }
  function tulisKunci(k, v) { localStorage.setItem(KUNCI[k], JSON.stringify(v)); }

  // --- SEMENTARA: diagnosa observer. Dibuang setelah hitungan kebukti jalan. ---
  // TANDA_BUILD dinaikin tiap kali file ini diubah, biar ketahuan extension-nya
  // beneran ke-reload apa masih pakai kode lama.
  var TANDA_BUILD = 'd16';
  var DIAG = { masuk: 0, grup: 0, keluarPribadi: 0, riwayat: 0, dihitung: 0,
    ganti: 0, hashUnik: [] };

  // Hash-nya sendiri nggak kebaca: cuma 4 huruf pertama, dipakai buat ngitung
  // ADA BERAPA kontak beda yang kecatat hari ini. Kalau 3 chat beda ternyata
  // cuma ngasih 1 hash, berarti sumber identitasnya yang salah.
  function catatHash(hash) {
    var potong = String(hash).slice(0, 4);
    if (DIAG.hashUnik.indexOf(potong) === -1 && DIAG.hashUnik.length < 6) {
      DIAG.hashUnik.push(potong);
    }
  }

  function barisDiagnosa() {
    var w = globalThis.FairGuardWaDom.statistik;
    return TANDA_BUILD +
      ' bt' + w.batch + ' nd' + w.nodeMasuk +
      ' lama' + w.jalurLama + ' baru' + w.jalurBaru +
      ' bkn' + w.bukanPesan + ' arah?' + w.arahGagal + ' id?' + w.identitasGagal +
      ' | msk' + DIAG.masuk + ' grp' + DIAG.grup + ' klr' + DIAG.keluarPribadi +
      ' riw' + DIAG.riwayat + ' htg' + DIAG.dihitung +
      ' gnt' + DIAG.ganti + ' hsh' + DIAG.hashUnik.length +
      ' aku:' + w.namaSendiri +
      (DIAG.hashGagal ? ' HASHGAGAL' + DIAG.hashGagal : '') +
      (DIAG.lanjutGagal ? ' LANJUTGAGAL' + DIAG.lanjutGagal : '') +
      (DIAG.sebab ? '\nsebab: ' + DIAG.sebab : '') +
      (w.contohGagal.length ? '\nbentuk: ' + w.contohGagal.join('  /  ') : '') +
      '\n' + D.surveiDom(document);
  }

  var state = null;
  var setelan = SETELAN_DEFAULT;
  var salt = null;
  var siap = false;

  function simpanState() {
    tulisKunci('state', state);
  }

  function gambar() {
    if (!siap) return;
    var now = Date.now();
    var sebelum = state;
    state = C.rollover(state, now);
    if (state !== sebelum) simpanState();

    // Satu objek dipakai dua kali: ringkasan() buat warna & teks, render() buat
    // angka mentahnya (angka besar, cincin ciut, penanda pemicu).
    var d = {
      pesanTerkirim: state.pesanTerkirim,
      chatBaru: state.chatBaru,
      detikSejakKirim: C.detikSejakKirim(state, now),
      detikSejakPesan: C.detikSejakPesan(state, now),
      jedaTerakhir: state.jedaTerakhir || [],
      batasChatBaru: setelan.batasChatBaru,
      jedaMinDetik: setelan.jedaMinDetik,
      kalibrasi: C.sedangKalibrasi(state, now)
    };
    B.render(document, B.ringkasan(d), d);

    // render() nulis ulang seluruh isi badge, jadi baris diagnosa selalu ikut
    // hilang duluan; hapusDiagnosa() di sini buat jaga-jaga kalau urutannya
    // berubah suatu saat.
    if (setelan.diagnosa) B.renderDiagnosa(document, barisDiagnosa());
    else B.hapusDiagnosa(document);
  }

  function onPesan(pesan, konteks) {
    if (!siap) return;
    if (!pesan.keluar) { DIAG.masuk++; return; }
    if (pesan.grup) { DIAG.grup++; return; }
    DIAG.keluarPribadi++;
    if (konteks.riwayat) DIAG.riwayat++;

    // Riwayat yang di-render ulang: id-nya dicatat biar nggak kehitung nanti.
    if (konteks.riwayat) {
      state = C.tandaiSudahLihat(state, pesan.msgId);
      simpanState();
      return;
    }

    H.hashNomor(pesan.jid, salt).then(function (hash) {
      var sebelum = state;
      catatHash(hash);
      state = C.catatKirim(state, { msgId: pesan.msgId, hash: hash, ts: Date.now() });
      if (state !== sebelum) {
        DIAG.dihitung++;
        if (state.kontakTerakhirHash !== sebelum.kontakTerakhirHash) DIAG.ganti++;
        simpanState();
      }
      gambar();
    }, function (e) {
      // Tanpa ini, hash gagal = angka diem tanpa jejak apa pun.
      DIAG.hashGagal = (DIAG.hashGagal || 0) + 1;
      DIAG.sebab = String((e && e.message) || e).slice(0, 38);
      console.error('[FairGuard] hash gagal:', e);
    })['catch'](function (e) {
      // Error DI DALAM penanganan sukses, bukan error hash. Dulu dua-duanya
      // masuk satu .catch dan kelaporan sebagai HASHGAGAL - padahal biasanya
      // ini "Extension context invalidated": extension di-reload tanpa refresh
      // tab, jadi chrome.storage-nya mati sementara skrip lama masih jalan.
      DIAG.lanjutGagal = (DIAG.lanjutGagal || 0) + 1;
      DIAG.sebab = String((e && e.message) || e).slice(0, 38);
      console.error('[FairGuard] lanjutan gagal:', e);
    });
  }

  function mulai(tersimpan) {
    var now = Date.now();
    salt = tersimpan.salt || H.buatSalt();
    setelan = Object.assign({}, SETELAN_DEFAULT, tersimpan.setelan || {});
    state = tersimpan.state || C.stateAwal(now);
    siap = true;

    if (!tersimpan.salt) tulisKunci('salt', salt);

    D.pantauPesan(document, onPesan);
    gambar();
    setInterval(gambar, 1000);
  }

  // Setelan diubah dari halaman options -> langsung kepakai tanpa reload.
  function setSetelan(next) {
    setelan = Object.assign({}, SETELAN_DEFAULT, next || {});
    tulisKunci('setelan', setelan);
    gambar();
  }

  mulai({ state: bacaKunci('state', null),
          setelan: bacaKunci('setelan', null),
          salt: bacaKunci('salt', null) });

  globalThis.FairGuardGlue = { mulai: mulai, gambar: gambar, setSetelan: setSetelan };
})();
