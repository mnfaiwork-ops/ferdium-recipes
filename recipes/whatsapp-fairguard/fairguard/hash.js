// FairGuard - identitas customer disimpan sebagai hash, bukan nomor asli.
//
// Ruang nomor HP itu kecil (bisa ditebak satu-satu), jadi hash polos gampang
// dibalik. Makanya tiap instalasi punya salt acak sendiri yang nggak pernah
// keluar dari laptop: tanpa salt itu, isi storage nggak bisa dicocokkan ke nomor.
(function (root) {
  'use strict';

  var kripto = root.crypto;

  function normalisasiNomor(input) {
    var angka = String(input).split('@')[0].replace(/\D/g, '');
    if (angka.indexOf('0') === 0) angka = '62' + angka.slice(1);
    return angka;
  }

  // Identitas lawan chat sekarang bisa dua rupa: jid/nomor (dari data-id format
  // lama, atau kontak yang belum disimpan dan tampil sebagai nomor) atau nama
  // tampilan (WA Web sekarang, nomornya udah nggak ada di DOM).
  //
  // Dulu semua input dipaksa lewat normalisasiNomor(), yang ngebuang setiap
  // karakter non-angka. Nama tanpa angka jadi string kosong, dan SEMUA kontak
  // begitu jatuh ke satu hash yang sama - empat chat kecatat dua kontak, tanpa
  // satu pun error. Makanya dipisah, dan hasilnya dikasih awalan biar nama yang
  // kebetulan angka semua nggak nabrak nomor beneran.
  var POLA_NOMOR = /^[+0-9 ()\-.]+$/;

  function normalisasiIdentitas(input) {
    if (input === null || input === undefined) return '';
    var teks = String(input).trim();
    if (!teks) return '';

    if (teks.indexOf('@') !== -1 || POLA_NOMOR.test(teks)) {
      var angka = normalisasiNomor(teks);
      return angka ? 'n:' + angka : '';
    }

    // Nama: beda kapital & spasi ganda itu orang yang sama.
    return 'x:' + teks.toLowerCase().replace(/\s+/g, ' ');
  }

  function keHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  async function hashNomor(nomor, salt) {
    var identitas = normalisasiIdentitas(nomor);

    // Identitas kosong DITOLAK, bukan dihash. Hash dari string kosong itu nilai
    // sah yang keliatan normal di storage, dan tiap kontak yang gagal kebaca
    // bakal numpuk di situ diam-diam. Ditolak = kehitung di diag, keliatan.
    if (!identitas) throw new Error('identitas kosong, nggak bisa dihash');

    var data = new TextEncoder().encode(salt + ':' + identitas);
    var digest = await kripto.subtle.digest('SHA-256', data);
    return keHex(digest).slice(0, 16);
  }

  function buatSalt() {
    var bytes = new Uint8Array(16);
    kripto.getRandomValues(bytes);
    return keHex(bytes.buffer);
  }

  root.FairGuardHash = {
    normalisasiNomor: normalisasiNomor,
    normalisasiIdentitas: normalisasiIdentitas,
    hashNomor: hashNomor,
    buatSalt: buatSalt
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
