/* แอพมือถือคนส่ง: แทน google.script.run ของ Apps Script — หน้าคนส่ง (driver.html ชุดเดียวกับเว็บ) เรียกแบบเดิมทุกอย่าง
   google.script.run.withSuccessHandler(f).withFailureHandler(g).driverX(WHO, KEY, …)
     → ShopAndroid.call(id, 'drv', {fn, args}) → แอพ (มีเน็ต = ถามเว็บ · ไม่มีเน็ต = ของในเครื่อง / เก็บรอส่ง)
   ป้ายเล็กมุมบน: ไม่มีเน็ต / รอส่งกี่รายการ (กด = ส่งเดี๋ยวนี้) */
(function () {
  "use strict";
  var L = {};
  try { L = JSON.parse(ShopAndroid.link() || '{}'); } catch (e) {}
  window.APP_LINK = L;

  var CB = {}, N = 0;
  window.__apiDone = function (id, txt) { var c = CB[id]; delete CB[id]; if (c) c(txt); };
  function bridge(path, body, done) {
    var id = ++N;
    CB[id] = function (txt) { var j = null; try { j = JSON.parse(txt); } catch (e) {} done(j); };
    try { ShopAndroid.call(id, path, JSON.stringify(body || {})); }
    catch (e) { delete CB[id]; done(null); }
  }
  function call(fn, args, ok, bad) {
    bridge('drv', { fn: fn, args: args }, function (j) {
      if (j && j.status) paint(j.status);
      if (j && j.ok) {
        if (ok) ok(j.result);
        if (j.result && j.result.queued) savedNote(true);   // บันทึกในมือถือแล้ว กำลังส่ง
        return;
      }
      var msg = (j && j.error) || 'ติดต่อตัวแอพไม่ได้';
      // ลิงก์ถูกยกเลิก / เปลี่ยนรหัส → กลับไปหน้าใส่ลิงก์
      if (fn === 'driverInit' && /ลิงก์ไม่ถูกต้อง|ถูกยกเลิก/.test(msg)) { location.replace('setup.html?bad=' + encodeURIComponent(msg)); return; }
      if (bad) bad(new Error(msg));
    });
  }
  function runner(ok, bad) {
    return new Proxy({}, { get: function (_, name) {
      if (name === 'withSuccessHandler') return function (f) { return runner(f, bad); };
      if (name === 'withFailureHandler') return function (f) { return runner(ok, f); };
      if (name === 'withUserObject') return function () { return runner(ok, bad); };
      return function () { call(String(name), [].slice.call(arguments), ok, bad); };
    } });
  }
  window.google = { script: { run: runner(null, null) } };

  /* ป้ายสถานะ: มีของรอส่ง / ไม่มีเน็ต (ปกติไม่โชว์อะไร) */
  var pill = null;
  function paint(s) {
    if (!document.body) return;
    if (!pill) {
      pill = document.createElement('div');
      pill.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;padding:6px 14px;border-radius:999px;' +
        'font:600 13px/1.4 "Noto Sans Thai",sans-serif;box-shadow:0 2px 10px #0006;display:none;white-space:nowrap';
      pill.onclick = function () { bridge('drv/sync', {}, function (j) { if (j && j.status) paint(j.status); }); };
      document.body.appendChild(pill);
    }
    var n = +s.pending || 0, off = !s.online && s.err;
    if (!n) savedNote(false);
    if (!n && !off) { pill.style.display = 'none'; return; }
    pill.style.display = 'block';
    pill.style.background = n ? '#d89449' : '#475569';
    pill.style.color = '#fff';
    // รอส่งนานเกิน 1 วัน = บอกวันที่ค้าง (ส่งช้ามาก วันที่บิล/งวดค่ารอบอาจคลาด — รีบต่อเน็ต)
    var old = +s.oldest || 0, late = old && Date.now() - old > 864e5;
    var since = late ? ' · ค้างตั้งแต่ ' + new Date(old).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '';
    pill.textContent = n ? ('⏳ รอส่ง ' + n + ' รายการ' + (off ? ' · ไม่มีเน็ต' : ' · กำลังส่ง') + since) : '📴 ไม่มีอินเทอร์เน็ต';
    if (late) pill.style.background = '#dc2626';
  }

  function $(id) { return document.getElementById(id); }
  /* ข้อความใต้ "บันทึกแล้ว": รอส่ง = "บันทึกในมือถือแล้ว · กำลังส่งเข้าระบบร้าน" · ส่งหมดแล้ว = ข้อความเดิมของเว็บ */
  var SAVED_DONE = 'ส่งเข้าระบบร้านเรียบร้อย ไม่ต้องแจ้งซ้ำ';
  function savedNote(waiting) {
    var v = $('vSaved'); if (!v) return;
    var el = [].slice.call(v.querySelectorAll('.ok-wrap div')).filter(function (d) { return /ส่งเข้าระบบ/.test(d.textContent); })[0];
    if (el) el.textContent = waiting ? 'บันทึกในมือถือแล้ว · กำลังส่งเข้าระบบร้าน (ส่งเองอัตโนมัติ)' : SAVED_DONE;
  }
  function shown(id) { var e = $(id); return !!(e && !e.classList.contains('hidden')); }
  /* ปุ่มย้อนกลับของมือถือ: ปิดหน้ารายละเอียดบิล → กลับหน้าแรก → (อยู่หน้าแรกแล้ว) ออกจากแอพ */
  window.appBack = function () {
    try {
      if (shown('bdSheet') && typeof closeBill === 'function') { closeBill(); return true; }
      if (!shown('vHome') && typeof go === 'function') { go('home'); return true; }
    } catch (e) {}
    return false;
  };
  /* หน้าว่างพอจะโหลดหน้าแอพรุ่นใหม่ (WebUpdate · ตัวแอพเรียกตอนกลับเข้าแอพ) — ไม่มีหน้าต่างเปิด/ไม่ได้พิมพ์อยู่ · false = รอเปิดแอพครั้งหน้า */
  window.appIdle = function () {
    try { return shown('vHome') && !shown('bdSheet') && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || ""); } catch (e) { return false; }
  };
  /* กลับเข้าแอพ / ส่งของค้างเสร็จ / ข้อมูลบนเว็บเปลี่ยน → หน้าแรกโหลดใหม่ (เฉพาะตอนอยู่หน้าแรกและไม่ได้กำลังบันทึก) */
  window.appChanged = function () {
    // หน้าเปิดไม่ขึ้น (โหลดครั้งแรกไม่สำเร็จ = เหลือแต่ข้อความ) → โหลดใหม่ทั้งหน้า
    if (!$('vHome')) { location.reload(); return; }
    bridge('drv/stale', {}, function (j) {
      if (j && j.status) paint(j.status);
      try { if (shown('vHome') && !window.busy && typeof loadInit === 'function') loadInit(); } catch (e) {}
    });
  };
  /* กดแจ้งเตือน → เปิดหน้านั้น */
  window.appOpen = function (v) {
    var t = 0, iv = setInterval(function () {
      t++;
      if (typeof go === 'function' && document.readyState === 'complete') { clearInterval(iv); try { go(v === 'pay' || v === 'hist' ? v : 'home'); } catch (e) {} }
      if (t > 40) clearInterval(iv);
    }, 250);
  };
  /* เปลี่ยนลิงก์: กดชื่อคนส่งที่หัวหน้าค้างไว้ 3 วิ */
  document.addEventListener('DOMContentLoaded', function () {
    var h = $('hName'), tm = null;
    if (!h) return;
    h.addEventListener('touchstart', function () { tm = setTimeout(function () {
      if (confirm('เปลี่ยนลิงก์คนส่ง?\n(ใช้เมื่อร้านส่งลิงก์ใหม่ให้)')) bridge('drv/unlink', {}, function () { location.replace('setup.html'); });
    }, 3000); });
    h.addEventListener('touchend', function () { clearTimeout(tm); });
    bridge('drv/stale', {}, function (j) { if (j && j.status) paint(j.status); });
  });
  /* บอกตัวแอพว่าหน้าพร้อม (กดแจ้งเตือนแล้วเปิดหน้านั้น / กลับเข้าแอพแล้วโหลดใหม่ ทำได้หลังจากนี้) */
  window.addEventListener('load', function () { try { ShopAndroid.ready(); } catch (e) {} });
})();
