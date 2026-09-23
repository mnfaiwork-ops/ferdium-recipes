// FairGuard - panel setelan di dalam WhatsApp Web.
//
// Di ekstensi Chrome, setelan dibuka di halaman options.html terpisah. Di
// Ferdium nggak ada halaman begitu: renderer-nya langsung DOM WhatsApp Web,
// jadi panel ini ditempel ke document.body.
//
// PENEMPATAN: sebelumnya gear + panel ini position:fixed di area chat, jadi
// ngambang nutupin percakapan. Sekarang dipindah ke rail kiri WhatsApp (kolom
// ikon Chat/Status/Channels/Community), nempel di bawahnya. Badge counter
// (badge.js) TIDAK ikut pindah - dia tetap mengambang di kanan, itu memang
// tempatnya.
//
// Bahaya rail kiri: itu DOM milik WhatsApp, bisa dibongkar-ulang tiap render.
// Karena itu rail jadi TARGET, bukan rumah: dipasang lewat MutationObserver,
// dan kalau rail-nya masih belum ada kita jatuh balik ke fixed di tepi kiri.
//
// Penting: `document` di sini punya WhatsApp, bukan document kosong. Makanya
// semua id/class dikasih awalan `fg-` biar nggak ketiban CSS WhatsApp.
//
// Jalur tulis TUNGGAL: simpan -> FairGuardGlue.setSetelan(). Panel ini nggak
// pernah nulis localStorage sendiri; kalau nulis sendiri, badge nggak ikut
// update (yang baca cuma glue). Baca buat nampilin nilai awal boleh langsung.
(function (root) {
  'use strict';

  var DEFAULT = { batasChatBaru: 15, jedaMinDetik: 30, diagnosa: false };
  var KUNCI_SETELAN = 'fairguard.setelan';

  var GEAR = 'fg-gear';
  var PANEL = 'fg-panel';
  var GAYA = 'fg-style';

  // Rail kiri WhatsApp Web. Nama class WhatsApp diacak tiap update, jadi
  // pemilihnya berbasis PERAN, bukan class: kolom ikon itu satu-satunya
  // elemen role="navigation" yang menganggur di kiri atas dan isinya tombol
  // ikon. Kalau WhatsApp ganti struktur, ini satu-satunya baris yang dibetulin.
  var SELEKTOR_RAIL = '[role="navigation"]';

  var terpasang = false;
  var rafTempel = null;
  var observerRail = null;
  // Guard khusus listener. `terpasang` di-reset saat re-init modul (DOM tetap
  // ada), tapi listener nempel di `document` yang siklus hidupnya beda. Dua
  // guard terpisah: DOM (elemen gear) jadi sumber kebenaran saat reload,
  // sementara boolean ini menjaga listener cuma dipasang sekali per instance
  // modul ini. Tanpa ini, kalau modul pernah ke-evict dari cache, listener
  // numpuk diam-diam.
  var pendengarTerpasang = false;
  var timerStatus = null;

  function bacaSetelanAwal() {
    try {
      var raw = localStorage.getItem(KUNCI_SETELAN);
      var s = raw ? JSON.parse(raw) : null;
      return Object.assign({}, DEFAULT, s || {});
    } catch (e) {
      return Object.assign({}, DEFAULT);
    }
  }

  function pasangGaya(dokumen) {
    if (dokumen.getElementById(GAYA)) return;

    var gaya = dokumen.createElement('style');
    gaya.id = GAYA;
    gaya.textContent = [
      // --- Tombol: diam di rail kiri WhatsApp, bukan mengambang di chat ---
      //
      // Di dalam rail, tombolnya ikut lebar rail (kolom ikon). `position:relative`
      // + `z-index` cuma buat jaga-jaga kalau WhatsApp membungkusnya dengan
      // lapisan sendiri. Kalau rail belum ketemu, .is-ngolet narik dia ke tepi
      // kiri layar - lihat penjelasan di konteks kelas itu di bawah.
      '#fg-gear{position:relative;z-index:2;flex:none;box-sizing:border-box;',
      'margin:6px 0 0;padding:0;width:26px;height:26px;display:flex;',
      'align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.16);',
      'border-radius:8px;background:#0d1117;color:#8a94a6;cursor:pointer;',
      'box-shadow:0 0 0 1px rgba(0,0,0,.28),0 2px 10px rgba(2,6,23,.34);',
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
      '-webkit-font-smoothing:antialiased;}',
      '#fg-gear:hover{color:#f2f5fa;background:#161b22;}',
      '#fg-gear.is-ngolet{position:fixed;top:72px;left:14px;z-index:2147483001;}',

      // --- Panel: mengambang di sebelah tombol, TAPI di luar area chat yang
      //     sempit. Panel butuh 280px, rail cuma ~64px, jadi panel nggak boleh
      //     dibatasi lebar rail - kecuali dia berakhir numpuk balik ke chat,
      //     yang justru masalah lama. Jalan tengah: panel tetap `fixed` menempel
      //     ke tepi kiri, berhenti di ruas rail sehingga tidak menutupi filter
      //     chat, tapi juga tidak menyentuh jendela percakapan.
      '.fg-panel{position:fixed;top:84px;left:78px;z-index:2147483002;',
      'box-sizing:border-box;width:280px;max-width:calc(100vw - 96px);',
      'max-height:calc(100vh - 120px);overflow:auto;',
      'padding:14px 15px 15px;border:1px solid rgba(255,255,255,.16);',
      'border-radius:11px;background:#0d1117;color:#8a94a6;',
      'box-shadow:0 0 0 1px rgba(0,0,0,.28),0 6px 22px rgba(2,6,23,.46);',
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
      'font-size:13px;line-height:1.4;-webkit-font-smoothing:antialiased;}',
      // Panel yang nempel ke tepi kiri saat rail belum ada: geser ke kanan
      // tombolnya, biar tidak saling tutup.
      '#fg-gear.is-ngolet ~ .fg-panel{left:52px;top:84px;}',
      '.fg-panel[hidden]{display:none;}',
      '.fg-panel-head{display:flex;align-items:baseline;gap:8px;margin:0 0 12px;}',
      '.fg-panel-head b{color:#f2f5fa;font-size:13.5px;font-weight:600;}',
      '.fg-panel-head span{color:#8a94a6;font-size:11px;}',
      '.fg-field{display:flex;flex-direction:column;gap:5px;margin-bottom:12px;}',
      '.fg-field > label{color:#c7cedb;font-size:12.5px;font-weight:600;}',
      '.fg-row{display:flex;align-items:center;gap:8px;}',
      '.fg-input{width:100%;min-width:0;box-sizing:border-box;padding:8px 10px;',
      'border:1px solid rgba(255,255,255,.18);border-radius:8px;background:#161b22;',
      'color:#f2f5fa;font-family:ui-monospace,"SF Mono","Segoe UI Mono",monospace;',
      'font-size:14px;}',
      '.fg-input:focus{outline:none;border-color:#4f46e5;',
      'box-shadow:0 0 0 3px rgba(79,70,229,.25);}',
      '.fg-unit{color:#8a94a6;font-size:12.5px;flex:none;}',
      '.fg-hint{color:#79839a;font-size:11.5px;line-height:1.55;}',
      '.fg-switch{display:flex;gap:9px;align-items:flex-start;cursor:pointer;',
      'color:#c7cedb;font-size:12.5px;font-weight:600;}',
      '.fg-switch input{margin:1px 0 0;width:15px;height:15px;flex:none;',
      'accent-color:#4f46e5;cursor:pointer;}',
      '.fg-switch .fg-hint{display:block;margin-top:3px;font-weight:400;}',
      '.fg-sep{border:none;height:1px;background:rgba(255,255,255,.14);margin:2px 0 12px;}',
      '.fg-actions{display:flex;align-items:center;gap:10px;margin-top:2px;}',
      '.fg-simpan{flex:1;padding:9px 14px;border:none;border-radius:8px;',
      'background:#4f46e5;color:#fff;font:inherit;font-size:13px;font-weight:600;',
      'cursor:pointer;}',
      '.fg-simpan:hover{background:#4338ca;}',
      '.fg-status{color:#10b981;font-size:12px;font-weight:600;opacity:0;',
      'transition:opacity 160ms ease;}',
      '.fg-status.is-show{opacity:1;}',
      '.fg-privacy{margin:12px 0 0;color:#79839a;font-size:11.5px;line-height:1.55;}'
    ].join('');

    (dokumen.head || dokumen.body || dokumen.documentElement).appendChild(gaya);
  }

  function simpan(dokumen, batasEl, jedaEl, diagnosaEl, statusEl) {
    var setelan = {
      batasChatBaru: Math.max(1, parseInt(batasEl.value, 10) || DEFAULT.batasChatBaru),
      jedaMinDetik: Math.max(1, parseInt(jedaEl.value, 10) || DEFAULT.jedaMinDetik),
      diagnosa: !!diagnosaEl.checked
    };
    batasEl.value = setelan.batasChatBaru;
    jedaEl.value = setelan.jedaMinDetik;

    var glue = root.FairGuardGlue;
    if (glue && typeof glue.setSetelan === 'function') {
      glue.setSetelan(setelan);
    }

    if (statusEl) {
      statusEl.classList.add('is-show');
      if (timerStatus) clearTimeout(timerStatus);
      timerStatus = setTimeout(function () { statusEl.classList.remove('is-show'); }, 1600);
    }
  }

  function buatPanel(dokumen) {
    var panel = dokumen.createElement('div');
    panel.id = PANEL;
    panel.className = 'fg-panel';
    panel.hidden = true;

    // Label & salinan disamain dengan options.html (versi ekstensi).
    panel.innerHTML =
      '<div class="fg-panel-head"><b>FairGuard</b><span>setelan badge</span></div>' +      '<div class="fg-field">' +
        '<label for="fg-batas">Batas chat baru per hari</label>' +
        '<input id="fg-batas" class="fg-input" type="number" min="1" max="200" step="1">' +
        '<div class="fg-hint">Mepet mulai di 70% dari batas, kelewat di batas. ' +
          'Bawaan 15 \u2014 angka hasil uji komunitas, bukan angka resmi Meta.</div>' +
      '</div>' +
      '<div class="fg-field">' +
        '<label for="fg-jeda">Jeda minimal antar kiriman</label>' +
        '<div class="fg-row">' +
          '<input id="fg-jeda" class="fg-input" type="number" min="1" max="600" step="1">' +
          '<span class="fg-unit">detik</span>' +
        '</div>' +
        '<div class="fg-hint">Di bawah nilai ini badge jadi mepet; setengahnya jadi kelewat.</div>' +
      '</div>' +
      '<hr class="fg-sep">' +
      '<label class="fg-switch" for="fg-diagnosa">' +
        '<input id="fg-diagnosa" type="checkbox">' +
        '<span>Tampilkan baris diagnosa' +
          '<span class="fg-hint">Deretan angka mentah di bawah badge. Dipakai waktu ' +
            'WhatsApp mengubah tampilannya dan angka FairGuard ikut macet \u2014 ' +
            'biasanya biarkan mati.</span>' +
        '</span>' +
      '</label>' +
      '<div class="fg-actions">' +
        '<button id="fg-simpan" class="fg-simpan" type="button">Simpan</button>' +
        '<span id="fg-status" class="fg-status">Tersimpan</span>' +
      '</div>' +
      '<p class="fg-privacy">FairGuard cuma menghitung dari layar. Nggak baca isi pesan, ' +
        'nggak ngirim apa pun, nggak lapor ke mana pun. Nomor HP customer nggak pernah ' +
        'disimpan \u2014 cuma hash bersalt, dan saltnya beda tiap laptop.</p>';

    return panel;
  }

  function isiLapangan(dokumen) {
    var s = bacaSetelanAwal();
    var batas = dokumen.getElementById('fg-batas');
    var jeda = dokumen.getElementById('fg-jeda');
    var diagnosa = dokumen.getElementById('fg-diagnosa');
    if (batas) batas.value = s.batasChatBaru;
    if (jeda) jeda.value = s.jedaMinDetik;
    if (diagnosa) diagnosa.checked = !!s.diagnosa;
  }

  function panelTerbuka(dokumen) {
    var panel = dokumen.getElementById(PANEL);
    return !!panel && !panel.hidden;
  }

  // aria-expanded mesti ikut state, bukan cuma dipasang sekali di mount:
  // tombol ini di rail kiri, dan pembaca layar memakai status itu buat tahu
  // panelnya lagi kebuka atau nggak.
  function tandaiTombol(dokumen, terbuka) {
    var gear = dokumen.getElementById(GEAR);
    if (gear) gear.setAttribute('aria-expanded', terbuka ? 'true' : 'false');
  }

  function buka() {
    var panel = document.getElementById(PANEL);
    if (!panel) return;
    isiLapangan(document);
    panel.hidden = false;
    tandaiTombol(document, true);
    var batas = document.getElementById('fg-batas');
    if (batas && typeof batas.focus === 'function') batas.focus();
  }

  function tutup() {
    var panel = document.getElementById(PANEL);
    if (panel) panel.hidden = true;
    tandaiTombol(document, false);
  }

  function toggle() {
    if (panelTerbuka(document)) tutup();
    else buka();
  }

  // --- Penempatan tombol: rail kiri WhatsApp, dengan mundur aman ---
  //
  // Rail itu DOM milik WhatsApp. WhatsApp membongkar-ulang layarnya tiap
  // render; kalau kita langsung nempel dan WhatsApp membuang node-nya, tombol
  // FairGuard hilang tanpa error. Karena itu:
  //   1. `cariRail()` nyari kolom ikon kiri;
  //   2. `tempatkan()` dipanggil tiap siklus render, bukan sekali;
  //   3. kalau rail belum ada, tombolnya "nggolet" - `fixed` di tepi kiri,
  //      masih kepakai walau sementara.
  function cariRail(dokumen) {
    try {
      var kandidat = dokumen.querySelectorAll(SELEKTOR_RAIL);
      for (var i = 0; i < kandidat.length; i++) {
        var el = kandidat[i];
        // Kolom ikon: sempit, di tepi kiri, ada tombol. Header chat juga
        // role="navigation" di beberapa versi, jadi lebar & posisi dipakai
        // buat misahin keduanya.
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.width <= 110 && r.left <= 8 && r.height > 200) {
          return el;
        }
      }
    } catch (e) { /* DOM WhatsApp belum siap; dianggap belum ketemu */ }
    return null;
  }

  function tempatkan(dokumen) {
    var gear = dokumen.getElementById(GEAR);
    var panel = dokumen.getElementById(PANEL);
    if (!gear || !panel) return;

    var rail = cariRail(dokumen);
    var rumah = gear.parentNode;

    if (rail) {
      // Ke rail. Ditaruh di paling bawah kolom biar nggak nyempil di antara
      // ikon WhatsApp (Chat/Status/Channels) - itu jalur cepat CS.
      if (rumah !== rail) {
        rail.appendChild(gear);
        gear.classList.remove('is-ngolet');
      }
    } else if (rumah !== dokumen.body) {
      // Belum ada rail: nggolet di tepi kiri. Panel tetap satu induk dengan
      // tombol supaya pemilih `#fg-gear.is-ngolet ~ .fg-panel` jalan.
      dokumen.body.appendChild(gear);
      dokumen.body.appendChild(panel);
      gear.classList.add('is-ngolet');
    }

    if (panel.parentNode !== dokumen.body) dokumen.body.appendChild(panel);
  }

  function pantauRail(dokumen) {
    if (observerRail) return;
    // Tiap perubahan DOM dijadwalkan sekali per frame: observer WhatsApp
    // nembak puluhan kali per detik waktu chat ramai, dan cariRail() itu
    // querySelectorAll + getBoundingClientRect (reflow). Tanpa throttle,
    // panel ini sendiri jadi sumber lag.
    observerRail = new root.MutationObserver(function () {
      if (rafTempel) return;
      rafTempel = (root.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); })(function () {
        rafTempel = null;
        tempatkan(dokumen);
      });
    });
    observerRail.observe(dokumen.body, { childList: true, subtree: true });
  }

  function mount() {
    var dokumen = document;

    // Body belum ada: jangan lanjut (appendChild bakal throw). Aman kalau
    // mount() kepanggil terlalu dini.
    if (!dokumen.body) return;

    // Gaya mesti ada walau tombolnya sudah terpasang (mis. setelah re-mount
    // karena WhatsApp membongkar body). pasangGaya() idempoten.
    pasangGaya(dokumen);

    // Idempoten: kalau tombolnya udah ada di DOM, jangan bikin lagi - cukup
    // pastikan posisinya benar.
    if (dokumen.getElementById(GEAR)) {
      terpasang = true;
      tempatkan(dokumen);
      pantauRail(dokumen);
      return;
    }

    var gear = dokumen.createElement('button');
    gear.id = GEAR;
    gear.type = 'button';
    gear.title = 'FairGuard \u2014 setelan';
    gear.setAttribute('aria-label', 'Setelan FairGuard');
    gear.setAttribute('aria-haspopup', 'dialog');
    gear.setAttribute('aria-expanded', 'false');
    gear.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="3"></circle>' +
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 ' +
      '1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 ' +
      '1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 ' +
      '0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 ' +
      '2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 ' +
      '0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 ' +
      '1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z">' +
      '</path></svg>';
    gear.addEventListener('click', function (ev) {
      ev.stopPropagation();
      toggle();
    });

    var panel = buatPanel(dokumen);

    var simpanBtn = dokumen.getElementById('fg-simpan');
    if (simpanBtn) {
      simpanBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        simpan(dokumen,
          dokumen.getElementById('fg-batas'),
          dokumen.getElementById('fg-jeda'),
          dokumen.getElementById('fg-diagnosa'),
          dokumen.getElementById('fg-status'));
      });
    }

    dokumen.body.appendChild(gear);
    dokumen.body.appendChild(panel);
    tempatkan(dokumen);
    pantauRail(dokumen);

    // Klik luar panel nutup. Gear nggak dihitung "luar" (dia toggle sendiri).
    // Cuma dipasang sekali per instance modul (lihat pendengarTerpasang).
    if (!pendengarTerpasang) {
      pendengarTerpasang = true;

      dokumen.addEventListener('click', function (ev) {
        if (!panelTerbuka(dokumen)) return;
        var target = ev.target;
        if (panel.contains(target) || gear.contains(target)) return;
        tutup();
      });

      dokumen.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') tutup();
      });
    }

    terpasang = true;
  }

  root.FairGuardSettings = { mount: mount, buka: buka, tutup: tutup };
})(typeof globalThis !== 'undefined' ? globalThis : this);
