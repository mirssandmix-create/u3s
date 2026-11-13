"use strict";
/* ShopPOS — งานนอก: คิดผลของแต่ละปุ่มในเครื่อง (กดแล้วเปลี่ยนทันที ไม่ต้องรอเว็บ)
   โค้ดส่วน "คำสั่งแต่ละปุ่ม" + ตัวช่วย คัดลอกจากเว็บงานนอก (งานนอก/รหัส.gs ใน PoomCode) ให้ผลตรงกับเว็บทุกปุ่ม
   ตัวโปรแกรมส่งคำสั่งเดิมให้เว็บคิดซ้ำ (เว็บเป็นตัวจริง: เลขงาน · ปฏิทิน · ชีทประวัติ) แล้วใช้ฉบับจากเว็บแทน
   แก้ปุ่มในเว็บงานนอก → คัดลอกส่วนนี้มาใหม่ด้วย */
window.NGN_CORE = (function () {
    const PRICE_T = 'ราคางาน';
    const PAY_M = ['เงินสด', 'โอน'];
    const EXP_SRC = ['หักจากเงินค่างาน', 'ลูกน้องออกก่อน', 'เงินร้าน'];
    const TYPES = ['ขนทิ้ง', 'ขนย้าย', 'รื้อ + ขนทิ้ง', 'อื่นๆ'];

  /* ---------------- คำสั่งแต่ละปุ่ม ---------------- */
  const ACTIONS = {
    confirm(j, p, by, now) {
      const r = open_(j, ['wait']);
      if (r.hold || !r.date) throw new Error('งานนี้พักไว้อยู่ ใส่วันนัดใหม่ก่อน (กด เลื่อนนัด)');
      r.st = 'ok';
      r.confAt = now || Date.now();
      return 'ลูกค้าคอนเฟิร์ม' + rn_(j);
    },
    depart(j, p, by, now) {
      const r = open_(j, ['ok']);
      r.st = 'go';
      r.goAt = now;
      return 'ออกเดินทาง ' + hm_(now) + rn_(j);
    },
    finish(j, p, by, now) {
      const r = open_(j, ['go']);
      const end = p.end === true;
      const payNow = end ? true : p.payNow === true;
      const exp = exps_(p.exp);
      const after = ids_(p.after);
      const times = finishTimes_(p, r, now);
      const endAt = times.endAt;
      let pay = null;
      if (payNow) {
        const m = String(p.m || '');
        const a = num_(p.a);
        if (PAY_M.indexOf(m) < 0) throw new Error('เลือกก่อนว่ารับเงินสดหรือเงินโอน');
        if (!(a > 0)) throw new Error('ใส่ยอดเงินที่รับจริง');
        const slip = m === 'โอน' ? String(p.slip || '') : '';
        if (m === 'โอน' && !slip) throw new Error('เงินโอนต้องแนบสลิปก่อนปิดงาน');
        pay = { m: m, a: a, slip: slip };
      }
      let next = null;
      if (!end) {
        const n = p.next || {};
        if (!n.told) throw new Error('ต้องติ๊กว่าแจ้งลูกค้าเรื่องรอบเพิ่ม/ราคาแล้ว');
        next = {
          no: j.rounds.length + 1, date: date_(n.date), from: time_(n.from, true), to: time_(n.to, false),
          trucks: trucks_(n.trucks), st: 'ok', fromCont: true, reason: str_(n.reason, 200),
          movedFrom: '', confAt: now, goAt: null, endAt: null, pay: null, payLater: false, exp: [], after: []
        };
      }
      const owedBefore = outstanding_(j);
      const pressedGo = r.goAt;
      r.st = 'done';
      r.endAt = endAt;
      r.goAt = times.goAt;
      r.exp = exp;
      r.after = after;
      r.pay = pay;
      r.payLater = !payNow;
      const otherDay = bkkDay_(endAt) !== bkkDay_(now);
      let t = 'เสร็จ' + (j.rounds.length > 1 ? 'รอบ ' + r.no : 'งาน') + ' ' +
              (otherDay ? dd_(bkkDay_(endAt)) + ' ' : '') + hm_(endAt);
      if (endAt !== now) t += ' (ใส่เวลาเอง · กดบันทึก ' + (otherDay ? dd_(bkkDay_(now)) + ' ' : '') + hm_(now) + ')';
      if (r.goAt !== pressedGo) t += ' · ออกเดินทางจริง ' + hm_(r.goAt) + (pressedGo ? ' (เดิมกด ' + hm_(pressedGo) + ')' : '');
      if (r.goAt) t += ' (ใช้เวลา ' + dur_(endAt - r.goAt) + ')';
      if (pay) {
        t += ' · รับ' + pay.m + ' ' + fmt_(pay.a) + (pay.slip ? ' + สลิป' : '');
        const expect = rPrice_(r) + owedBefore;
        if (pay.a !== expect) t += ' ⚠ ไม่ตรงยอดที่ต้องเก็บ ' + fmt_(expect);
      } else {
        t += ' · เก็บเงินรวมตอนจบงาน (' + fmt_(rPrice_(r)) + ')';
      }
      const ex = exp.reduce((s, e) => s + e[1], 0);
      t += ex ? ' · ค่าใช้จ่าย ' + fmt_(ex) : ' · ไม่มีค่าใช้จ่าย';
      if (end) {
        j.status = 'review';                           // รอตรวจสอบ → กดตรวจสอบ + ใส่จำนวนคน ถึงจะเป็น "เสร็จแล้ว"
        j.doneAt = endAt;
        t += ' · รอตรวจสอบ';
      } else {
        j.rounds.push(next);
        t += ' · เพิ่มรอบ ' + next.no + ' วันที่ ' + dd_(next.date) + ' ' + win_(next) + ' ' + fmt_(rPrice_(next)) + ' บาท' + (next.reason ? ' (' + next.reason + ')' : '');
      }
      return t;
    },
    reschedule(j, p) {
      const r = open_(j, ['wait', 'ok']);
      const old = r.date ? dd_(r.date) + ' ' + win_(r) : 'พักไว้';
      const reason = str_(p.reason, 200);
      if (p.hold === true) {                          // ลูกค้ายังไม่คอนเฟิร์มวันใหม่ → พักงาน ไม่มีวันนัด
        if (r.hold) throw new Error('งานนี้พักไว้อยู่แล้ว');
        if (r.date && !r.movedFrom) r.movedFrom = r.date;
        r.hold = true; r.date = ''; r.from = ''; r.to = '';
        r.st = 'wait'; r.confAt = null;
        return '⏸ พักงาน' + rn_(j) + ' (เดิม ' + old + ') รอลูกค้าคอนเฟิร์มวันใหม่' + (reason ? ' (' + reason + ')' : '');
      }
      const nd = date_(p.date), nf = time_(p.from, true), nt = time_(p.to, false);
      if (r.date && nd !== r.date && !r.movedFrom) r.movedFrom = r.date;
      r.date = nd; r.from = nf; r.to = nt; r.hold = false;
      return 'เลื่อนนัด' + rn_(j) + ' ' + old + ' → ' + dd_(nd) + ' ' + win_(r) + (reason ? ' (' + reason + ')' : '');
    },
    reprice(j, p) {
      const r = open_(j, ['wait', 'ok', 'go']);
      const o = rPrice_(r);
      r.trucks = price_(p);
      const reason = str_(p.reason, 200);
      return 'แก้ราคา' + rn_(j) + ' ' + fmt_(o) + ' → ' + fmt_(rPrice_(r)) + (reason ? ' (' + reason + ')' : '');
    },
    edit(j, p) {
      const names = { name: 'ชื่อ', tel: 'เบอร์', type: 'ประเภท', urgent: 'งานด่วน', detail: 'รายละเอียด', note: 'ข้อควรระวัง', pick: 'จุดรับของ', pickMap: 'แผนที่จุดรับ', drop: 'จุดส่ง', dropMap: 'แผนที่จุดส่ง' };
      const v = info_(p);
      const ch = [];
      Object.keys(names).forEach(k => { if (JSON.stringify(j[k]) !== JSON.stringify(v[k])) { ch.push(names[k]); j[k] = v[k]; } });
      if (!ch.length) throw new Error('ไม่มีอะไรเปลี่ยน');
      return 'แก้ไขข้อมูล: ' + ch.join(', ');
    },
    /** แก้ไขงานทุกช่องในครั้งเดียว (ฟอร์มเดียวกับรับงานใหม่) */
    editAll(j, p) {
      const r = cur_(j);
      const ch = [];
      const names = { name: 'ชื่อ', tel: 'เบอร์', type: 'ประเภท', urgent: 'งานด่วน', detail: 'รายละเอียด', note: 'ข้อควรระวัง', pick: 'จุดรับของ', pickMap: 'แผนที่จุดรับ', drop: 'จุดส่ง', dropMap: 'แผนที่จุดส่ง' };
      const v = info_(p);
      if (!v.name) throw new Error('ใส่ชื่อลูกค้า');
      Object.keys(names).forEach(k => { if (JSON.stringify(j[k]) !== JSON.stringify(v[k])) { ch.push(names[k]); j[k] = v[k]; } });
      const raw = str_(p.raw, 5000);
      if (raw !== (j.raw || '')) { j.raw = raw; ch.push('ข้อความจากแชท'); }
      if (Array.isArray(p.photos)) {
        const ids = ids_(p.photos);
        if (JSON.stringify(ids) !== JSON.stringify(j.photos || [])) { ch.push('รูป ' + (j.photos || []).length + '→' + ids.length); j.photos = ids; }
      }
      if (!(r.hold && !p.date)) {                     // งานที่พักไว้ ถ้ายังไม่ใส่วัน = พักต่อ
        const nd = date_(p.date), nf = time_(p.from, true), nt = time_(p.to, false);
        if (nd !== r.date || nf !== r.from || nt !== r.to) {
          if (j.status !== 'open' || ['wait', 'ok'].indexOf(r.st) < 0) throw new Error('งานนี้ออกเดินทาง/ปิดไปแล้ว แก้วัน-เวลาไม่ได้');
          const old = r.date ? dd_(r.date) + ' ' + win_(r) : 'พักไว้';
          if (r.date && nd !== r.date && !r.movedFrom) r.movedFrom = r.date;
          r.date = nd; r.from = nf; r.to = nt; r.hold = false;
          ch.push('วันนัด ' + old + ' → ' + dd_(nd) + ' ' + win_(r));
        }
      }
      const T = price_(p);
      if (rPrice_({ trucks: T }) !== rPrice_(r) || (p.price == null && JSON.stringify(T) !== JSON.stringify(r.trucks))) {
        if (j.status !== 'open' || r.st === 'done') throw new Error('งานนี้ปิดไปแล้ว แก้ราคาไม่ได้');
        const o = rPrice_(r); r.trucks = T;
        ch.push('ราคา ' + fmt_(o) + ' → ' + fmt_(rPrice_(r)));
      }
      if (!ch.length) throw new Error('ไม่มีอะไรเปลี่ยน');
      const reason = str_(p.reason, 200);
      return 'แก้ไขงาน: ' + ch.join(' · ') + (reason ? ' (' + reason + ')' : '');
    },
    addPhotos(j, p) {
      const ids = ids_(p.ids);
      if (!ids.length) throw new Error('ไม่มีรูป');
      j.photos = (j.photos || []).concat(ids);
      return 'เพิ่มรูป ' + ids.length + ' รูป';
    },
    delPhoto(j, p) {
      const i = (j.photos || []).indexOf(String(p.id));
      if (i < 0) throw new Error('ไม่พบรูปนี้');
      j.photos.splice(i, 1);
      return 'ลบรูป 1 รูป';
    },
    cancel(j, p) {
      if (j.status !== 'open') throw new Error('งานนี้ไม่ได้เปิดอยู่');
      j.status = 'cancel';
      j.cancelAt = Date.now();
      const reason = str_(p.reason, 200);
      return 'ยกเลิกงาน' + (reason ? ' (' + reason + ')' : '');
    },
    /** ตรวจสอบงานที่เสร็จแล้ว: ใส่จำนวนคนที่ไป แล้วยืนยัน → เสร็จแล้ว */
    verify(j, p, by, now) {
      if (j.status !== 'review') throw new Error(j.status === 'closed' ? 'งานนี้ตรวจสอบไปแล้ว' : 'งานนี้ยังไม่อยู่ในสถานะรอตรวจสอบ');
      const n = num_(p.crew);
      if (!(n >= 1 && n <= 50) || n !== Math.floor(n)) throw new Error('ใส่จำนวนคนที่ไปงาน');
      j.crew = n;
      j.status = 'closed';
      j.closedAt = now;
      j.verifiedBy = by;
      return 'ตรวจสอบแล้ว · ไป ' + n + ' คน · เสร็จแล้ว';
    },
    revert(j) {
      if (j.status === 'cancel') { j.status = 'open'; j.cancelAt = null; return '↩ เปิดงานที่ยกเลิกกลับมา'; }
      const r = cur_(j);
      const clearDone = x => { x.st = 'go'; x.pay = null; x.payLater = false; x.exp = []; x.after = []; x.endAt = null; };
      if (j.status === 'closed' && j.doneAt) {
        j.status = 'review'; j.closedAt = null; j.crew = null; j.verifiedBy = '';
        return '↩ ย้อนสถานะ: เสร็จแล้ว → รอตรวจสอบ';
      }
      if (j.status === 'closed' || j.status === 'review') {
        j.status = 'open'; j.closedAt = null; j.doneAt = null; j.crew = null; clearDone(r);
        return '↩ ย้อนสถานะ: กลับเป็น "กำลังไป" (ล้างข้อมูลรับเงิน/ค่าใช้จ่ายของรอบนี้)';
      }
      if (r.fromCont && (r.st === 'ok' || r.st === 'wait') && j.rounds.length > 1) {
        j.rounds.pop();
        const pr = cur_(j); clearDone(pr);
        return '↩ ย้อนสถานะ: ลบรอบ ' + r.no + ' และเปิดรอบ ' + pr.no + ' กลับเป็น "กำลังไป"';
      }
      if (r.st === 'go') { r.st = 'ok'; r.goAt = null; return '↩ ย้อนสถานะ: กำลังไป → คอนเฟิร์มแล้ว'; }
      if (r.st === 'ok') { r.st = 'wait'; r.confAt = null; return '↩ ย้อนสถานะ: คอนเฟิร์มแล้ว → ยังไม่คอนเฟิร์ม'; }
      throw new Error('ย้อนต่อไม่ได้แล้ว (งานอยู่ขั้นแรกสุด)');
    }
  };


  function addLog_(j, by, at, t) {
    j.log = j.log || [];
    j.log.unshift({ at: at, by: by, t: t });
  }


  function info_(p) {
    const type = TYPES.indexOf(p.type) >= 0 ? p.type : 'ขนทิ้ง';
    return {
      name: str_(p.name, 100), tel: str_(p.tel, 40), type: type, urgent: p.urgent === true,
      detail: str_(p.detail, 3000), note: str_(p.note, 300),
      pick: str_(p.pick, 500), pickMap: url_(p.pickMap), drop: str_(p.drop, 500), dropMap: url_(p.dropMap)
    };
  }

  /* ---------------- ตัวช่วย ---------------- */
  function cur_(j) { return j.rounds[j.rounds.length - 1]; }
  function open_(j, sts) {
    if (j.status !== 'open') throw new Error('งานนี้' + (j.status === 'closed' ? 'ปิดไปแล้ว' : j.status === 'review' ? 'เสร็จแล้ว รอตรวจสอบ' : 'ถูกยกเลิกแล้ว'));
    const r = cur_(j);
    if (sts.indexOf(r.st) < 0) throw new Error('สถานะงานเปลี่ยนไปแล้ว กดโหลดใหม่แล้วลองอีกครั้ง');
    return r;
  }
  function rn_(j) { return j.rounds.length > 1 ? ' (รอบ ' + j.rounds.length + ')' : ''; }
  function rPrice_(r) { return (r.trucks || []).reduce((s, t) => s + t[1] * t[2], 0); }
  function totalPrice_(j) { return j.rounds.reduce((s, r) => s + rPrice_(r), 0); }
  function received_(j) { return j.rounds.reduce((s, r) => s + (r.pay ? r.pay.a : 0), 0); }
  function totalExp_(j) { return j.rounds.reduce((s, r) => s + (r.exp || []).reduce((a, e) => a + e[1], 0), 0); }
  function outstanding_(j) {   // ยอดของรอบที่เสร็จแล้วแต่เลือก "เก็บรวมตอนจบงาน"
    let owe = 0;
    j.rounds.forEach(r => { if (r.st === 'done') owe += rPrice_(r) - (r.pay ? r.pay.a : 0); });
    return Math.max(0, owe);
  }
  function str_(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }
  function num_(v) { const x = Number(String(v).replace(/,/g, '')); return isFinite(x) ? Math.round(x * 100) / 100 : NaN; }
  function url_(v) { const s = str_(v, 2000); return /^https?:\/\//i.test(s) ? s : ''; }
  function date_(v) {
    const s = String(v || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('ใส่วันนัดให้ถูกต้อง');
    return s;
  }
  function time_(v, req) {
    const s = String(v || '');
    if (!s) { if (req) throw new Error('ใส่เวลานัด'); return ''; }
    if (!/^\d{2}:\d{2}$/.test(s)) throw new Error('เวลาไม่ถูกต้อง: ' + s);
    return s;
  }
  function trucks_(t) {
    if (!Array.isArray(t) || !t.length) throw new Error('ใส่รถและราคาอย่างน้อย 1 แถว');
    return t.map(x => {
      const name = str_(x[0], 40), q = num_(x[1]), pr = num_(x[2]);
      if (!name) throw new Error('ใส่ชนิดรถ');
      if (!(q >= 1) || q !== Math.floor(q)) throw new Error('จำนวนคันไม่ถูกต้อง');
      if (!(pr >= 0)) throw new Error('ราคาไม่ถูกต้อง');
      return [name, q, pr];
    });
  }
  /** ราคางานก้อนเดียว (เก็บในรูปแบบเดิม [['ราคางาน',1,ราคา]]) · ไม่ส่ง price มา = ใช้ trucks แบบเดิม */
  function price_(p) {
    if (p.price == null) return trucks_(p.trucks);
    const a = num_(p.price);
    if (p.price === '' || !(a >= 0)) throw new Error('ใส่ราคางาน');
    return [[PRICE_T, 1, a]];
  }
  function exps_(e) {
    if (!Array.isArray(e)) return [];
    return e.map(x => {
      const cat = str_(x[0], 40), a = num_(x[1]), src = EXP_SRC.indexOf(x[2]) >= 0 ? x[2] : EXP_SRC[0];
      if (!cat) throw new Error('ใส่ประเภทค่าใช้จ่าย');
      if (!(a > 0)) throw new Error('ใส่จำนวนเงินค่าใช้จ่ายให้ครบทุกรายการ');
      return [cat, a, src];
    });
  }
  function ids_(a) { return Array.isArray(a) ? a.map(x => String(x)).filter(x => /^[\w-]{10,}$/.test(x)).slice(0, 40) : []; }
  function win_(r) { return r.to ? r.from + '–' + r.to : (r.from || ''); }
  function dd_(d) { return d ? Number(d.slice(8)) + '/' + d.slice(5, 7) : ''; }
  function fmt_(n) { return Number(n).toLocaleString('en-US'); }
  function hm_(t) { const d = new Date(t + 7 * 36e5); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); }
  /** เวลาจริงตอนปิดงาน (เวลาไทย) — ลืมกดหน้างาน มาแก้ตอนเย็น/วันหลังได้
   *  endTime ไม่ใส่ = เวลาที่กด · endDate+endTime = วันเวลาที่เลือก (ห้ามเป็นอนาคต)
   *  endTime ไม่มี endDate (หน้าเว็บรุ่นเก่า) = เวลาที่ยังมาไม่ถึงวันนี้ถือเป็นของเมื่อวาน
   *  goTime = แก้เวลาออกเดินทาง (วันเดียวกับวันเสร็จ ถ้าหลังเวลาเสร็จ = วันก่อนหน้า)
   *  หน้าเว็บคิดแบบเดียวกันใน finishPick() — แก้ที่หนึ่งต้องแก้อีกที่ */
  /* เวลาจริงตอนปิดงาน — ต้องคิดแบบเดียวกับ finishPick ใน Index.html
     day = ช่อง "วันที่ไปทำงาน" (ส่งมาเสมอ) · ออกเดินทางจริง/เสร็จจริง อยู่บนวันนั้น
     เสร็จก่อนเวลาออก = ข้ามคืน → +1 วัน · เว้นเวลาเสร็จ: วันนี้ = ตอนนี้, วันอื่นต้องใส่ · ห้ามเป็นอนาคตทั้งคู่
     (2 ต.ค.: เดิมใช้ช่องวันที่เป็น "วันที่เสร็จ" สวนทางกับป้าย งานข้ามคืนใส่ 01:30 แล้วถูกด่าให้แก้ช่องออกเดินทาง) */
  function finishTimes_(p, r, now) {
    let day = String(p.endDate || '');
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('วันที่ไปทำงานไม่ถูกต้อง');
    if (!day) day = bkkDay_(now);
    let goAt = r.goAt || null;
    if (p.goTime) {
      const t = bkkTs_(day, hhmm_(p.goTime, 'เวลาออกเดินทาง'));
      goAt = (r.goAt && Math.abs(t - r.goAt) < 6e4) ? r.goAt : t;   // ไม่ได้แก้ = คงค่าที่กดไว้ (มีวินาที)
    }
    let endAt;
    if (p.endTime) {
      endAt = bkkTs_(day, hhmm_(p.endTime, 'เวลาเสร็จจริง'));
      if (goAt && endAt < goAt) endAt += 864e5;                       // ข้ามคืน
    } else {
      if (day !== bkkDay_(now)) throw new Error('งานวันที่ ' + dd_(day) + ' ไม่ใช่วันนี้ — ใส่เวลา "เสร็จจริง" ด้วย');
      endAt = now;
    }
    if (goAt && goAt > now + 5 * 6e4) throw new Error('เวลาออกเดินทางจริงอยู่ในอนาคต — เช็กวันที่กับเวลาอีกครั้ง');
    if (endAt > now + 5 * 6e4) throw new Error('เวลาเสร็จจริงอยู่ในอนาคต — เช็กวันที่กับเวลาอีกครั้ง');
    if (goAt && endAt < goAt) throw new Error('เวลาเสร็จ (' + hm_(endAt) + ') ต้องหลังเวลาออกเดินทาง (' + hm_(goAt) + ')');
    return { endAt: endAt, goAt: goAt };
  }
  function hhmm_(v, what) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(v || ''));
    if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(what + 'ไม่ถูกต้อง: ' + v);
    return m;
  }
  function bkkTs_(ds, m) { return Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10), +m[1], +m[2]) - 7 * 36e5; }
  function bkkDay_(t) { return new Date(t + 7 * 36e5).toISOString().slice(0, 10); }
  function dur_(ms) { const m = Math.max(0, Math.floor(ms / 6e4)), h = Math.floor(m / 60); return (h ? h + ' ชม. ' : '') + (m % 60) + ' นาที'; }
  /* ---------------- เพิ่มสำหรับในเครื่อง ---------------- */
  // งานใหม่ในเครื่อง: เลขชั่วคราว T… (เว็บออกเลขจริง N00001 ตอนส่งถึง แล้วโปรแกรมเปลี่ยนให้เอง)
  function newJobLocal_(p, by, now) {
    const v = info_(p);
    if (!v.name) throw new Error('ใส่ชื่อลูกค้า');
    const j = Object.assign({
      id: '', createdAt: now, createdBy: by, updatedAt: now, updatedBy: by,
      version: 1, status: 'open', photos: ids_(p.photos), raw: str_(p.raw, 5000), log: []
    }, v);
    j.rounds = [{
      no: 1, date: date_(p.date), from: time_(p.from, true), to: time_(p.to, false), trucks: price_(p),
      st: p.confirmed ? 'ok' : 'wait', confAt: p.confirmed ? now : null, fromCont: false, reason: '', movedFrom: '',
      goAt: null, endAt: null, pay: null, payLater: false, exp: [], after: []
    }];
    j.id = 'T' + now.toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase();
    return j;
  }
  /* เวลาที่กดจริงจากโปรแกรมร้าน (คำสั่งที่ค้างส่งทีหลัง) — เฉพาะปุ่มที่บันทึกเวลา · ไม่เกินตอนนี้ + 2 นาที · ไม่เก่ากว่า 48 ชม. (เหมือน clientAt_ ของเว็บ) */
  function clientAt_(req) {
    const at = Number(req && req.p && req.p.at);
    if (['depart', 'confirm', 'finish', 'verify'].indexOf(req && req.action) < 0 || !isFinite(at)) return 0;
    const n = Date.now();
    return at <= n + 2 * 6e4 && at >= n - 48 * 36e5 ? Math.round(at) : 0;
  }
  /* คำสั่งจากหน้าจอ (แบบ mutate_ ของเว็บ) → { job | del, text } หรือ { conflict, job, error } · jobs = งานบนจอ (id → job) */
  function mutate(req, jobs) {
    const by = String(req.by || '').trim().slice(0, 40) || 'ไม่ระบุชื่อ';
    const at = clientAt_(req);
    const now = at || Date.now();
    let p = req.p || {};
    if (at && p.autoEnd === true) { p = Object.assign({}, p); delete p.endTime; }   // เวลาเสร็จที่ใส่ให้เอง = ใช้เวลาที่กดจริง
    if (req.action === 'create') {
      const j = newJobLocal_(p, by, now);
      const text = 'สร้างงาน' + (j.rounds[0].st === 'ok' ? ' (คอนเฟิร์มแล้ว)' : '');
      addLog_(j, by, now, text);
      return { job: j, text: text };
    }
    if (req.action === 'deleteJobs') {
      const ids = (Array.isArray(p.ids) ? p.ids : []).map(String).filter(Boolean).slice(0, 300);
      if (!ids.length) throw new Error('ยังไม่ได้เลือกงานที่จะลบ');
      return { del: ids, text: '🗑 ลบงานถาวร' };
    }
    const act = ACTIONS[req.action];
    if (!act) throw new Error('ไม่รู้จักคำสั่ง: ' + req.action);
    const cur = jobs[req.id];
    if (!cur) throw new Error('ไม่พบงานนี้ (อาจถูกลบ)');
    if (req.ver != null && Number(req.ver) !== cur.version)
      return { conflict: true, job: cur, error: 'งานนี้มีคนแก้ไปก่อนแล้ว ระบบโหลดข้อมูลล่าสุดให้แล้ว ตรวจดูแล้วกดใหม่อีกครั้ง' };
    const j = JSON.parse(JSON.stringify(cur));
    const text = act(j, p, by, now);
    j.version++;
    j.updatedAt = now;
    j.updatedBy = by;
    addLog_(j, by, now, text);
    return { job: j, text: text };
  }
  return { mutate: mutate, ACTIONS: ACTIONS };
})();
