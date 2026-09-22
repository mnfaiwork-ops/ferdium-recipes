// FairGuard - ambang -> warna. Fungsi murni, tanpa DOM & tanpa storage.
(function (root) {
  'use strict';

  var URUTAN = { ijo: 0, kuning: 1, merah: 2 };

  function terburuk(a, b) {
    return URUTAN[a] >= URUTAN[b] ? a : b;
  }

  function warnaChatBaru(chatBaru, batasChatBaru) {
    if (chatBaru >= batasChatBaru) return 'merah';
    if (chatBaru >= batasChatBaru * 0.7) return 'kuning';
    return 'ijo';
  }

  function warnaJeda(detikSejakKirim, jedaMinDetik) {
    // null = belum kirim apa-apa hari ini, nggak ada yang perlu diperingatkan
    if (detikSejakKirim === null || detikSejakKirim === undefined) return 'ijo';
    if (detikSejakKirim < jedaMinDetik / 2) return 'merah';
    if (detikSejakKirim < jedaMinDetik) return 'kuning';
    return 'ijo';
  }

  function hitungWarna(input) {
    var jeda = warnaJeda(input.detikSejakKirim, input.jedaMinDetik);

    // Pas kalibrasi cuma chat baru yang diredam - extension belum tahu nomor mana
    // yang udah lama jadi customer, jadi angkanya belum bisa dipercaya. Jeda beda:
    // 8 detik ya 8 detik, nggak butuh riwayat kontak. Kalau ini ikut dimatiin,
    // hari pertama CS bisa ngebut tanpa peringatan sama sekali - dan hari pertama
    // justru paling rawan karena alatnya masih baru dan bikin penasaran.
    if (input.kalibrasi) return jeda === 'ijo' ? 'abu' : jeda;

    return terburuk(warnaChatBaru(input.chatBaru, input.batasChatBaru), jeda);
  }

  root.FairGuardRules = { hitungWarna: hitungWarna };
})(typeof globalThis !== 'undefined' ? globalThis : this);
