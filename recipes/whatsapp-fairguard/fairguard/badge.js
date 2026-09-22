// FairGuard - tampilan badge. Isi teks & warna dihitung di ringkasan() (murni),
// bagian render cuma nempel hasilnya ke layar.
(function (root) {
  'use strict';

  // "ganti chat", bukan "terakhir": sejak counter.js menghitung jeda antar
  // kontak berbeda, angka ini adalah jarak ke pergantian chat terakhir. Bales
  // berkali-kali ke orang yang sama nggak nyetel ulang.
  function teksDurasi(detik, ekor) {
    // di bawah 2 menit tetap dalam detik: rentang inilah yang jadi peringatan
    if (detik < 120) return detik + ' dtk ' + ekor;
    return Math.floor(detik / 60) + ' mnt ' + ekor;
  }

  function teksJeda(detik) {
    if (detik === null || detik === undefined) return 'belum ganti chat hari ini';
    return teksDurasi(detik, 'sejak ganti chat');
  }

  // Jam kedua: jarak ke kiriman terakhir, siapa pun lawan chatnya. Ini yang CS
  // cari pas dia ngetik terus tapi angka jeda diem - jeda emang ngitung jarak
  // pindah orang, bukan kecepatan ngetik. Angka ini INFO doang, nggak ikut
  // nentuin warna: bales tiga kali cepet ke satu orang itu ngobrol wajar.
  function teksPesan(detik) {
    if (detik === null || detik === undefined) return 'belum kirim hari ini';
    return teksDurasi(detik, 'sejak kirim');
  }

  // Deretan jeda yang udah kepakai, terbaru di depan: "pola jeda: 34·31·42m·33".
  // Angka polos = detik, akhiran m = menit. Satuan campur disengaja - jeda
  // istirahat CS ikut kelihatan sebagai angka besar, jadi ritme yang kepotong
  // nggak disamarkan jadi seolah-olah bagian dari pola kerja.
  function teksPola(jedaTerakhir) {
    var daftar = jedaTerakhir || [];
    if (!daftar.length) return null;
    return 'pola jeda: ' + daftar.map(function (detik) {
      return detik < 120 ? String(detik) : Math.floor(detik / 60) + 'm';
    }).join('\u00b7');
  }

  function ringkasan(d) {
    var pola = teksPola(d.jedaTerakhir);
    return {
      warna: root.FairGuardRules.hitungWarna(d),
      kalibrasi: !!d.kalibrasi,
      baris: [
        d.kalibrasi
          ? 'kalibrasi — chat baru belum dihitung'
          : d.chatBaru + ' / ' + d.batasChatBaru + ' chat baru',
        d.pesanTerkirim + ' pesan terkirim',
        teksPesan(d.detikSejakPesan),
        teksJeda(d.detikSejakKirim)
      ].concat(pola ? [pola] : [])
    };
  }

  // Nama warna dipakai di rules.js & test; nama status dipakai di CSS desain.
  // Dipisah biar rules.js nggak perlu tahu urusan tampilan.
  var STATUS = { abu: 'kalibrasi', ijo: 'aman', kuning: 'mepet', merah: 'kelewat' };

  function statusDari(warna) {
    return STATUS[warna] || 'aman';
  }

  // Angka dipisah dari satuannya supaya angkanya bisa dikasih warna sendiri
  // pas dia yang jadi pemicu status.
  function bagianDurasi(detik, ekor, kosong) {
    if (detik === null || detik === undefined) {
      return { angka: null, satuan: kosong };
    }
    if (detik < 120) return { angka: String(detik), satuan: 'dtk ' + ekor };
    return { angka: String(Math.floor(detik / 60)), satuan: 'mnt ' + ekor };
  }

  function bagianJeda(detik) {
    return bagianDurasi(detik, 'sejak ganti chat', 'belum ganti chat hari ini');
  }

  function bagianPesan(detik) {
    return bagianDurasi(detik, 'sejak kirim', 'belum kirim hari ini');
  }

  // --- di bawah ini bagian DOM: dites manual lewat checklist, bukan unit test ---

  var ID = 'fairguard-badge';

  var IKON = {
    kalibrasi: '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.4 2.2"/></svg>',
    aman:      '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="3.4" fill="currentColor"/></svg>',
    mepet:     '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.4 11 10.6H1z" fill="currentColor"/></svg>',
    kelewat:   '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.1 1h3.8L11 4.1v3.8L7.9 11H4.1L1 7.9V4.1z" fill="currentColor"/></svg>'
  };

  var LABEL = { kalibrasi: 'KALIBRASI', aman: 'AMAN', mepet: 'MEPET', kelewat: 'KELEWAT' };

  var ciut = false;
  var statusTerakhir = null;
  var terakhir = null;   // argumen render terakhir, buat gambar ulang pas diklik

  function pasangBadge(dokumen) {
    var el = dokumen.getElementById(ID);
    if (el) return el;

    el = dokumen.createElement('div');
    el.id = ID;
    el.addEventListener('click', function () {
      ciut = !ciut;
      if (terakhir) render(dokumen, terakhir.hasil, terakhir.data);
    });
    dokumen.body.appendChild(el);
    return el;
  }

  function render(dokumen, hasil, data) {
    var el = pasangBadge(dokumen);
    var d = data || {};
    var st = statusDari(hasil.warna);
    terakhir = { hasil: hasil, data: d };

    el.className = 'fg-badge is-' + st + (ciut ? ' is-ciut' : '');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.title = ciut ? 'FairGuard — klik buat mekar' : 'FairGuard — klik buat menciutkan';

    // Cincin mode ciut keisi sesuai rasio chat baru : batas. Penanda non-warna,
    // jadi status tetap kebaca walau badge lagi jadi titik.
    var rasio = d.batasChatBaru > 0 ? Math.min(1, (d.chatBaru || 0) / d.batasChatBaru) : 0;
    el.style.setProperty('--fg-arc', (rasio * 360).toFixed(1) + 'deg');

    var jeda = bagianJeda(d.detikSejakKirim);
    // angka jeda diwarnai cuma kalau jeda itu yang mancing status sekarang
    var jedaPemicu = d.detikSejakKirim !== null && d.detikSejakKirim !== undefined &&
      st !== 'kalibrasi' && d.detikSejakKirim < d.jedaMinDetik;

    var angka = st === 'kalibrasi'
      ? '<span class="fg-num">&mdash;</span>'
      : '<span class="fg-num">' + (d.chatBaru || 0) +
        '<span class="fg-sep"> / </span>' + d.batasChatBaru + '</span>';

    var pesan = bagianPesan(d.detikSejakPesan);
    var barisPesan = pesan.angka === null
      ? '<div class="fg-line">' + pesan.satuan + '</div>'
      : '<div class="fg-line"><b>' + pesan.angka + '</b> ' + pesan.satuan + '</div>';

    var barisJeda = jeda.angka === null
      ? '<div class="fg-line">' + jeda.satuan + '</div>'
      : '<div class="fg-line' + (jedaPemicu ? ' is-trigger' : '') + '"><b>' +
        jeda.angka + '</b> ' + jeda.satuan + '</div>';

    var pola = teksPola(d.jedaTerakhir);
    var barisPola = pola
      ? '<div class="fg-line fg-pola">' + pola + '</div>'
      : '';

    var isi = st === 'kalibrasi'
      ? '<div class="fg-note">Belum 24 jam &mdash; angka chat baru belum valid.</div>' +
        '<div class="fg-line"><b>' + (d.pesanTerkirim || 0) + '</b> pesan terkirim</div>' +
        barisPesan + barisJeda + barisPola
      : '<div class="fg-line"><b>' + (d.pesanTerkirim || 0) + '</b> pesan terkirim</div>' +
        barisPesan + barisJeda + barisPola;

    el.innerHTML =
      '<div class="fg-rail"></div>' +
      '<div class="fg-body">' +
        '<div class="fg-top">' + IKON[st] +
          '<span class="fg-state-text">' + LABEL[st] + '</span>' +
        '</div>' +
        '<div class="fg-count">' + angka + '<span class="fg-label">chat baru</span></div>' +
        isi +
      '</div>' +
      '<div class="fg-dot"><div class="fg-dot-inner">' + IKON[st] + '</div></div>';

    // kilau sekali jalan, cuma pas status pindah
    if (statusTerakhir !== null && statusTerakhir !== st) {
      el.classList.remove('fg-changed');
      void el.offsetWidth;
      el.classList.add('fg-changed');
    }
    statusTerakhir = st;
  }

  // --- Baris diagnosa: mati secara bawaan, dinyalain dari setelan ---
  //
  // Dulu ini direncanakan dibuang sebelum rilis. Nggak jadi: WhatsApp bakal
  // ganti struktur layarnya lagi, dan pas itu kejadian baris ini satu-satunya
  // cara tahu bagian mana yang putus tanpa bongkar 13 laptop. Disembunyiin,
  // bukan dihapus.
  //
  // Ditaruh di dalam .fg-body, bukan di root: root itu flex-row, kalau ditempel
  // di situ baris diagnosa jadi kolom ketiga di sebelah rel.
  function renderDiagnosa(dokumen, teks) {
    var el = dokumen.getElementById(ID);
    if (!el) return;
    var body = el.querySelector('.fg-body');
    if (!body) return;
    var baris = body.querySelector('.fg-diag');
    if (!baris) {
      baris = dokumen.createElement('div');
      baris.className = 'fg-diag';
      body.appendChild(baris);
    }
    baris.textContent = teks;
  }

  function hapusDiagnosa(dokumen) {
    var el = dokumen.getElementById(ID);
    if (!el) return;
    var baris = el.querySelector('.fg-diag');
    if (baris) baris.remove();
  }

  root.FairGuardBadge = {
    ringkasan: ringkasan,
    teksPola: teksPola,
    statusDari: statusDari,
    bagianJeda: bagianJeda,
    bagianPesan: bagianPesan,
    render: render,
    renderDiagnosa: renderDiagnosa,
    hapusDiagnosa: hapusDiagnosa,
    ID: ID
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
