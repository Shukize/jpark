/* ============================================================
   J Park Hotel — online booking / reservation modal.
   Loaded after booking-page.js (which owns date/room search and calls
   window.JPark.bookingFlow.open(ctx) from each room card's "Book Now"
   button).

   Permanent policy: no online payment is ever collected here. Submitting
   this form creates an immediately CONFIRMED reservation (it holds the
   room-type inventory the same way a paid booking would — see
   backend/routes/payments.js's POST /reservations) and emails the guest a
   confirmation showing the balance due; the guest pays in person at
   check-in by cash, credit/debit card, or PromptPay QR at the front desk.
   ============================================================ */
(function () {
  'use strict';
  window.JPark = window.JPark || {};

  var I = window.JPark.i18n || null;
  function TR(key) { return I ? I.t(key) : key; }
  function esc(s) { return (window.JPark.util && window.JPark.util.escapeHtml) ? window.JPark.util.escapeHtml(s) : String(s); }
  function money(n) { return window.JPark.util ? window.JPark.util.money(n) : ('฿' + Number(n).toLocaleString()); }
  var NB = ' ';
  function countWord(n, singleKey, pluralKey) { return n + NB + TR(n === 1 ? singleKey : pluralKey); }
  function nightsWord(n) { return countWord(n, 'bk.night', 'bk.nights'); }
  function fmtDate(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ============================================================
  //  i18n — this file owns the guest-details/reservation-modal vocabulary;
  //  booking-page.js owns the room-card strings (bk.pay.bookNow etc) and the
  //  day-use vocabulary (bk.dayuse.*). Both merge into the same shared
  //  dictionary via registerI18n.
  // ============================================================
  var STR = {
    en: {
      'bk.pay.roomType': 'Room type', 'bk.pay.guestDetails': 'Guest details',
      'bk.pay.firstName': 'First name', 'bk.pay.lastName': 'Last name (optional)',
      'bk.pay.email': 'Email', 'bk.pay.phone': 'Phone (optional)',
      'bk.pay.note': 'Special requests (optional)', 'bk.pay.notePlaceholder': 'Late arrival, high floor, allergies…',
      'bk.pay.depositTitle': 'Please note',
      'bk.pay.depositNote': 'A 200 THB deposit for your room key card is collected in cash only at check-in, and refunded in full at check-out.',
      'bk.pay.total': 'Total',
      'bk.pay.extraBedLine': 'Extra bed (3rd guest)', 'bk.pay.extraBreakfastLine': 'Extra breakfast guest',
      'bk.pay.processingText': 'Processing…',
      'bk.pay.cancel': 'Cancel', 'bk.pay.close': 'Close',
      'bk.pay.successTitle': 'Booking confirmed!', 'bk.pay.confirmationLabel': 'Confirmation number',
      'bk.pay.emailSentNote': 'A confirmation has been sent to your email, with the deposit note above.',
      'bk.pay.done': 'Done',
      'bk.pay.reserveTitle': 'Reserve now — pay at check-in',
      'bk.pay.checkinNote': "You're not paying online. We'll email your confirmation now, and you'll settle the balance in person at check-in — by cash, credit/debit card, or PromptPay QR at our front desk.",
      'bk.pay.confirmReservation': 'Confirm reservation',
      'bk.pay.err.required': 'Please fill in your first name and email.',
      'bk.pay.err.generic': 'Something went wrong. Please try again.',
      'bk.pay.err.network': 'Network error — please check your connection and try again.',
      'bk.pay.err.soldOut': 'Sorry, this room type just sold out for those dates.',
    },
    th: {
      'bk.pay.roomType': 'ประเภทห้อง', 'bk.pay.guestDetails': 'ข้อมูลผู้เข้าพัก',
      'bk.pay.firstName': 'ชื่อ', 'bk.pay.lastName': 'นามสกุล (ไม่บังคับ)',
      'bk.pay.email': 'อีเมล', 'bk.pay.phone': 'เบอร์โทร (ไม่บังคับ)',
      'bk.pay.note': 'คำขอพิเศษ (ไม่บังคับ)', 'bk.pay.notePlaceholder': 'มาถึงดึก ต้องการชั้นสูง แพ้อาหาร…',
      'bk.pay.depositTitle': 'โปรดทราบ',
      'bk.pay.depositNote': 'มีการเรียกเก็บเงินมัดจำบัตรคีย์การ์ด 200 บาท เป็นเงินสดเท่านั้น ณ วันเช็คอิน และคืนเต็มจำนวนเมื่อเช็คเอาท์',
      'bk.pay.total': 'ยอดรวม',
      'bk.pay.extraBedLine': 'เตียงเสริม (ผู้เข้าพักคนที่ 3)', 'bk.pay.extraBreakfastLine': 'อาหารเช้าเพิ่มเติม',
      'bk.pay.processingText': 'กำลังดำเนินการ…',
      'bk.pay.cancel': 'ยกเลิก', 'bk.pay.close': 'ปิด',
      'bk.pay.successTitle': 'ยืนยันการจองแล้ว!', 'bk.pay.confirmationLabel': 'หมายเลขยืนยัน',
      'bk.pay.emailSentNote': 'เราได้ส่งอีเมลยืนยันพร้อมข้อมูลเงินมัดจำข้างต้นให้ท่านแล้ว',
      'bk.pay.done': 'เสร็จสิ้น',
      'bk.pay.reserveTitle': 'จองเลย ชำระเงินที่โรงแรม',
      'bk.pay.checkinNote': 'ท่านไม่ต้องชำระเงินออนไลน์ เราจะส่งอีเมลยืนยันการจองให้ทันที และท่านสามารถชำระยอดคงเหลือได้ที่หน้าเคาน์เตอร์เมื่อเช็คอิน — ด้วยเงินสด บัตรเครดิต/เดบิต หรือ QR พร้อมเพย์',
      'bk.pay.confirmReservation': 'ยืนยันการจอง',
      'bk.pay.err.required': 'กรุณากรอกชื่อและอีเมลของท่าน',
      'bk.pay.err.generic': 'เกิดข้อผิดพลาด กรุณาลองใหม่',
      'bk.pay.err.network': 'เกิดข้อผิดพลาดของเครือข่าย กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่',
      'bk.pay.err.soldOut': 'ขออภัย ห้องประเภทนี้เต็มสำหรับวันที่เลือกแล้ว',
    },
    ja: {
      'bk.pay.roomType': '客室タイプ', 'bk.pay.guestDetails': 'ご宿泊者情報',
      'bk.pay.firstName': '名', 'bk.pay.lastName': '姓（任意）',
      'bk.pay.email': 'メールアドレス', 'bk.pay.phone': '電話番号（任意）',
      'bk.pay.note': 'ご要望（任意）', 'bk.pay.notePlaceholder': '到着が遅れる、高層階希望、アレルギーなど…',
      'bk.pay.depositTitle': 'ご注意',
      'bk.pay.depositNote': 'ルームキーカードのデポジット200THBを、チェックイン時に現金のみで頂戴いたします。チェックアウト時に全額返金いたします。',
      'bk.pay.total': '合計',
      'bk.pay.extraBedLine': 'エキストラベッド（3人目）', 'bk.pay.extraBreakfastLine': '追加の朝食',
      'bk.pay.processingText': '処理中…',
      'bk.pay.cancel': 'キャンセル', 'bk.pay.close': '閉じる',
      'bk.pay.successTitle': 'ご予約が確定しました！', 'bk.pay.confirmationLabel': '確認番号',
      'bk.pay.emailSentNote': '上記のデポジットのご案内を含む確認メールをお送りしました。',
      'bk.pay.done': '完了',
      'bk.pay.reserveTitle': '今すぐご予約 — お支払いはチェックイン時に',
      'bk.pay.checkinNote': 'オンラインでのお支払いは不要です。ご予約確認メールをすぐにお送りいたします。残額はチェックイン時にフロントにて、現金・クレジット/デビットカード、またはプロンプトペイQRでお支払いいただけます。',
      'bk.pay.confirmReservation': '予約を確定する',
      'bk.pay.err.required': 'お名前とメールアドレスをご入力ください。',
      'bk.pay.err.generic': '問題が発生しました。再度お試しください。',
      'bk.pay.err.network': 'ネットワークエラーです。接続をご確認のうえ再度お試しください。',
      'bk.pay.err.soldOut': '申し訳ございません、この客室タイプは選択された日程で満室になりました。',
    },
    'zh-Hans': {
      'bk.pay.roomType': '房型', 'bk.pay.guestDetails': '入住人信息',
      'bk.pay.firstName': '名字', 'bk.pay.lastName': '姓氏（可选）',
      'bk.pay.email': '电子邮箱', 'bk.pay.phone': '电话（可选）',
      'bk.pay.note': '特殊要求（可选）', 'bk.pay.notePlaceholder': '晚到、高楼层、过敏信息等…',
      'bk.pay.depositTitle': '请注意',
      'bk.pay.depositNote': '房卡押金200泰铢，仅收现金，于入住时收取，退房时全额退还。',
      'bk.pay.total': '总计',
      'bk.pay.extraBedLine': '加床（第3位客人）', 'bk.pay.extraBreakfastLine': '额外早餐',
      'bk.pay.processingText': '处理中…',
      'bk.pay.cancel': '取消', 'bk.pay.close': '关闭',
      'bk.pay.successTitle': '预订成功！', 'bk.pay.confirmationLabel': '确认号',
      'bk.pay.emailSentNote': '包含上述押金说明的确认邮件已发送至您的邮箱。',
      'bk.pay.done': '完成',
      'bk.pay.reserveTitle': '立即预订 — 入住时付款',
      'bk.pay.checkinNote': '您无需在线支付。我们会立即发送预订确认邮件，您可在入住时于前台以现金、信用卡/借记卡或PromptPay二维码支付余款。',
      'bk.pay.confirmReservation': '确认预订',
      'bk.pay.err.required': '请填写您的名字和电子邮箱。',
      'bk.pay.err.generic': '出现了一些问题，请重试。',
      'bk.pay.err.network': '网络错误，请检查连接后重试。',
      'bk.pay.err.soldOut': '抱歉，该房型在所选日期已订满。',
    },
    'zh-Hant': {
      'bk.pay.roomType': '房型', 'bk.pay.guestDetails': '入住人資訊',
      'bk.pay.firstName': '名字', 'bk.pay.lastName': '姓氏（可選）',
      'bk.pay.email': '電子郵箱', 'bk.pay.phone': '電話（可選）',
      'bk.pay.note': '特殊要求（可選）', 'bk.pay.notePlaceholder': '晚到、高樓層、過敏資訊等…',
      'bk.pay.depositTitle': '請注意',
      'bk.pay.depositNote': '房卡押金200泰銖，僅收現金，於入住時收取，退房時全額退還。',
      'bk.pay.total': '總計',
      'bk.pay.extraBedLine': '加床（第3位客人）', 'bk.pay.extraBreakfastLine': '額外早餐',
      'bk.pay.processingText': '處理中…',
      'bk.pay.cancel': '取消', 'bk.pay.close': '關閉',
      'bk.pay.successTitle': '預訂成功！', 'bk.pay.confirmationLabel': '確認號',
      'bk.pay.emailSentNote': '包含上述押金說明的確認郵件已發送至您的郵箱。',
      'bk.pay.done': '完成',
      'bk.pay.reserveTitle': '立即預訂 — 入住時付款',
      'bk.pay.checkinNote': '您無需線上支付。我們會立即發送預訂確認郵件，您可在入住時於前台以現金、信用卡/簽帳卡或PromptPay二維碼支付餘款。',
      'bk.pay.confirmReservation': '確認預訂',
      'bk.pay.err.required': '請填寫您的名字和電子郵箱。',
      'bk.pay.err.generic': '出現了一些問題，請重試。',
      'bk.pay.err.network': '網路錯誤，請檢查連線後重試。',
      'bk.pay.err.soldOut': '抱歉，該房型在所選日期已訂滿。',
    },
  };
  if (I) I.registerI18n(STR);

  // ============================================================
  //  Modal DOM (built once, reused across opens)
  // ============================================================
  var overlay = null;
  var box = null;
  var state = null; // current booking context while the modal is open

  function build() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'bk-pay-overlay';
    overlay.hidden = true;
    overlay.innerHTML = '<div class="bk-pay-box" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(overlay);
    box = overlay.querySelector('.bk-pay-box');

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) close();
    });
  }

  function qs(sel) { return box.querySelector(sel); }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove('bk-pay-open');
    state = null;
  }

  // ---- Views -------------------------------------------------
  function currentVariant() { return state.variants[state.variantIndex]; }
  function currentRate() { var v = currentVariant(); return state.breakfast ? v.bf : v.room; }
  // Per-night surcharge for guests beyond the base 2 a variant's rate
  // already covers — same formula backend/lib/rateOverrides.js's
  // computeGuestSurcharge() uses server-side, shared via
  // window.JPark.pricing (booking-page.js) so this is never a second,
  // divergent copy of the formula. Purely a display estimate: the real
  // charge is always recomputed server-side.
  function currentSurcharge() {
    var P = window.JPark && window.JPark.pricing;
    if (!P) return 0;
    var totalGuests = (state.adults || 0) + (state.children || 0);
    return P.computeGuestSurcharge({ extraBedAvailable: state.extraBedAvailable }, totalGuests, state.breakfast);
  }
  function currentTotal() { return (currentRate() + currentSurcharge()) * state.nights; }

  // 0-2 lines describing the per-night surcharges currently in effect (only
  // ever non-empty for a 3rd guest — see currentSurcharge()).
  function surchargeNotesHTML() {
    var P = window.JPark && window.JPark.pricing;
    if (!P) return '';
    var totalGuests = (state.adults || 0) + (state.children || 0);
    if (totalGuests <= 2) return '';
    var surcharges = P.getSurcharges();
    var lines = [];
    if (state.breakfast) {
      lines.push('<div class="bkp-surcharge-line">+ ' + TR('bk.pay.extraBreakfastLine') + ': ' + money(surcharges.extraBreakfastGuest) + '</div>');
    }
    if (state.extraBedAvailable) {
      lines.push('<div class="bkp-surcharge-line">+ ' + TR('bk.pay.extraBedLine') + ': ' + money(surcharges.extraBed) + '</div>');
    }
    return lines.join('');
  }

  // The only reservation view: no online payment step exists anywhere in
  // this modal. Submitting posts straight to POST /api/v1/reservations,
  // which creates an immediately CONFIRMED booking (holding the room-type
  // inventory) and emails the guest a confirmation showing the balance due
  // — see backend/routes/payments.js.
  function renderReservationForm() {
    var v = currentVariant();
    var guestsStr = countWord(state.adults, 'bk.gAdult1', 'bk.gAdultN') +
      (state.children > 0 ? ' · ' + countWord(state.children, 'bk.gChild1', 'bk.gChildN') : '');

    var variantHTML = state.variants.length > 1
      ? '<div class="bkp-field"><label class="bkp-label">' + TR('bk.pay.roomType') + '</label>' +
          '<div class="bkp-radio-row" id="bkpVariantRow">' +
          state.variants.map(function (vv, i) {
            return '<label class="bkp-radio"><input type="radio" name="bkpVariant" value="' + i + '"' +
              (i === state.variantIndex ? ' checked' : '') + '> ' + esc(vv.label) + '</label>';
          }).join('') +
          '</div></div>'
      : '';

    box.innerHTML =
      '<div class="bkp-head"><span class="bkp-title">' + esc(state.roomDisplayName) + '</span>' +
        '<button type="button" class="bkp-close" aria-label="' + TR('bk.pay.close') + '">&times;</button></div>' +
      '<div class="bkp-body">' +
      '<div class="bkp-view" id="bkpViewForm">' +

        '<div class="bkp-summary">' +
          '<div class="bkp-summary-row"><span>' + fmtDate(state.checkIn) + ' &rarr; ' + fmtDate(state.checkOut) + '</span><span>' + nightsWord(state.nights) + '</span></div>' +
          '<div class="bkp-summary-row bkp-summary-guests">' + guestsStr + '</div>' +
        '</div>' +

        '<h3 class="bkp-unavail-title">' + TR('bk.pay.reserveTitle') + '</h3>' +

        variantHTML +

        '<div class="bkp-field"><div class="bkp-radio-row" id="bkpBreakfastRow">' +
          '<label class="bkp-radio"><input type="radio" name="bkpBreakfast" value="0"' + (!state.breakfast ? ' checked' : '') + '> ' + TR('bk.roomOnly') + ' — ' + money(v.room) + '</label>' +
          '<label class="bkp-radio"><input type="radio" name="bkpBreakfast" value="1"' + (state.breakfast ? ' checked' : '') + '> ' + TR('bk.withBreakfast') + ' — ' + money(v.bf) + '</label>' +
        '</div></div>' +

        '<div id="bkpSurchargeNotes">' + surchargeNotesHTML() + '</div>' +
        '<div class="bkp-total-row"><span>' + TR('bk.pay.total') + '</span><strong id="bkpTotal">' + money(currentTotal()) + '</strong></div>' +

        '<div class="bkp-guest-fields">' +
          '<p class="bkp-section-label">' + TR('bk.pay.guestDetails') + '</p>' +
          '<div class="bkp-grid-2">' +
            '<div class="bkp-field"><label>' + TR('bk.pay.firstName') + '</label><input id="bkpFirstName" autocomplete="given-name"></div>' +
            '<div class="bkp-field"><label>' + TR('bk.pay.lastName') + '</label><input id="bkpLastName" autocomplete="family-name"></div>' +
          '</div>' +
          '<div class="bkp-field"><label>' + TR('bk.pay.email') + '</label><input type="email" id="bkpEmail" autocomplete="email"></div>' +
          '<div class="bkp-field"><label>' + TR('bk.pay.phone') + '</label><input type="tel" id="bkpPhone" autocomplete="tel"></div>' +
          '<div class="bkp-field"><label>' + TR('bk.pay.note') + '</label><textarea id="bkpNote" rows="2" placeholder="' + esc(TR('bk.pay.notePlaceholder')) + '"></textarea></div>' +
        '</div>' +

        '<div class="bkp-deposit-note"><strong>' + TR('bk.pay.depositTitle') + ':</strong> ' + TR('bk.pay.depositNote') + '</div>' +

        '<p class="bkp-pp-note">' + TR('bk.pay.checkinNote') + '</p>' +

        '<p class="bkp-form-error" id="bkpFormError" hidden></p>' +

        '<button type="button" class="btn btn-solid bkp-submit-btn" id="bkpSubmitBtn">' + TR('bk.pay.confirmReservation') + '</button>' +
      '</div>' +
      resultViewsHTML() +
      '</div>';

    wireReservationForm();
  }

  function updateReservationTotals() {
    var totalEl = qs('#bkpTotal');
    if (totalEl) totalEl.textContent = money(currentTotal());
    var notesEl = qs('#bkpSurchargeNotes');
    if (notesEl) notesEl.innerHTML = surchargeNotesHTML();
    var v = currentVariant();
    var row = qs('#bkpBreakfastRow');
    if (row) {
      var labels = row.querySelectorAll('.bkp-radio');
      if (labels[0]) labels[0].lastChild.textContent = ' ' + TR('bk.roomOnly') + ' — ' + money(v.room);
      if (labels[1]) labels[1].lastChild.textContent = ' ' + TR('bk.withBreakfast') + ' — ' + money(v.bf);
    }
  }

  function wireReservationForm() {
    qs('.bkp-close').addEventListener('click', close);
    var variantRow = qs('#bkpVariantRow');
    if (variantRow) {
      variantRow.addEventListener('change', function (e) {
        if (e.target.name === 'bkpVariant') {
          state.variantIndex = parseInt(e.target.value, 10);
          updateReservationTotals();
        }
      });
    }
    qs('#bkpBreakfastRow').addEventListener('change', function (e) {
      if (e.target.name === 'bkpBreakfast') {
        state.breakfast = e.target.value === '1';
        updateReservationTotals();
      }
    });
    qs('#bkpSubmitBtn').addEventListener('click', onReservationSubmit);
  }

  function setReservationSubmitting(isSubmitting) {
    var btn = qs('#bkpSubmitBtn');
    if (btn) {
      btn.disabled = isSubmitting;
      btn.textContent = isSubmitting ? TR('bk.pay.processingText') : TR('bk.pay.confirmReservation');
    }
  }

  function onReservationSubmit() {
    clearFormError();
    if (!validateGuestFields()) return;
    var v = currentVariant();
    var body = {
      room: state.room,
      variantLabel: v.label,
      breakfast: state.breakfast,
      checkIn: state.checkIn,
      checkOut: state.checkOut,
      adults: state.adults,
      children: state.children,
      guest: guestPayload(),
      lang: I ? I.getLang() : 'en',
    };
    setReservationSubmitting(true);
    window.JPark.api.post('/api/v1/reservations', body).then(function (r) {
      if (!r || r.error) {
        setReservationSubmitting(false);
        showFormError((r && r.status === 409) ? TR('bk.pay.err.soldOut') : ((r && r.error) || TR('bk.pay.err.generic')));
        return;
      }
      showSuccess(r.booking.ref);
    }).catch(function () {
      setReservationSubmitting(false);
      showFormError(TR('bk.pay.err.network'));
    });
  }

  // Shared by the reservation form and the day-use form — showSuccess()'s
  // outcome renders into this view.
  function resultViewsHTML() {
    return (
      '<div class="bkp-view" id="bkpViewSuccess" hidden>' +
        '<div class="bkp-success-icon" aria-hidden="true">&#10003;</div>' +
        '<h3>' + TR('bk.pay.successTitle') + '</h3>' +
        '<p>' + TR('bk.pay.confirmationLabel') + ': <strong id="bkpRefText"></strong></p>' +
        '<div class="bkp-deposit-note"><strong>' + TR('bk.pay.depositTitle') + ':</strong> ' + TR('bk.pay.depositNote') + '</div>' +
        '<p class="bkp-success-note">' + TR('bk.pay.emailSentNote') + '</p>' +
        '<button type="button" class="btn btn-solid" id="bkpDoneBtn">' + TR('bk.pay.done') + '</button>' +
      '</div>'
    );
  }

  function showFormError(msg) {
    var el = qs('#bkpFormError');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }
  function clearFormError() {
    var el = qs('#bkpFormError');
    if (el) el.hidden = true;
  }

  function showView(id) {
    Array.prototype.forEach.call(box.querySelectorAll('.bkp-view'), function (v) {
      v.hidden = (v.id !== id);
    });
  }

  function validateGuestFields() {
    var firstName = val('bkpFirstName');
    var email = val('bkpEmail');
    if (!firstName || !email || email.indexOf('@') === -1) {
      showFormError(TR('bk.pay.err.required'));
      return false;
    }
    return true;
  }

  function guestPayload() {
    return {
      firstName: val('bkpFirstName'),
      lastName: val('bkpLastName') || undefined,
      email: val('bkpEmail'),
      phone: val('bkpPhone') || undefined,
      note: val('bkpNote') || undefined,
    };
  }

  // `opts.pending` swaps in "request received, awaiting confirmation" copy
  // — used only by the day-use flow (renderDayUseForm/onDayUseSubmit), which
  // still stays pending until front desk confirms the exact time slot. The
  // overnight reservation flow above is confirmed immediately, so it always
  // uses the default "Booking confirmed!" copy.
  function showSuccess(ref, opts) {
    showView('bkpViewSuccess');
    var refEl = qs('#bkpRefText');
    if (refEl) refEl.textContent = ref;
    if (opts && opts.pending) {
      var titleEl = qs('#bkpViewSuccess h3');
      var noteEl = qs('#bkpViewSuccess .bkp-success-note');
      if (titleEl) titleEl.textContent = TR(opts.titleKey);
      if (noteEl) noteEl.textContent = TR(opts.noteKey);
    }
    var doneBtn = qs('#bkpDoneBtn');
    if (doneBtn) doneBtn.addEventListener('click', close);
  }

  // ============================================================
  //  Public entry point, called by booking-page.js's "Book Now" button.
  // ============================================================
  function open(ctx) {
    build();
    state = {
      room: ctx.room,
      roomDisplayName: ctx.roomDisplayName,
      maxGuests: ctx.maxGuests,
      extraBedAvailable: ctx.extraBedAvailable,
      variants: ctx.variants,
      checkIn: ctx.checkIn,
      checkOut: ctx.checkOut,
      nights: ctx.nights,
      adults: ctx.adults,
      children: ctx.children,
      variantIndex: 0,
      breakfast: false,
    };
    overlay.hidden = false;
    document.body.classList.add('bk-pay-open');
    renderReservationForm();
  }

  // ============================================================
  //  Day-use (3-hour) booking — a much simpler sibling flow to open()/
  //  renderReservationForm() above: a flat price (no nights, no breakfast/
  //  extra-guest surcharges, no variant choice), a single preferred date +
  //  free-text preferred time (front desk assigns/confirms the exact slot
  //  — see POST /api/v1/payments/dayuse-booking). A day-use request always
  //  stays PENDING after submission (front desk must confirm the time slot
  //  is available), independent of the (also in-person) payment method.
  // ============================================================
  function openDayUse(ctx) {
    build();
    state = { dayUse: true, room: ctx.room, roomDisplayName: ctx.roomDisplayName, price: ctx.price };
    overlay.hidden = false;
    document.body.classList.add('bk-pay-open');
    renderDayUseForm();
  }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function renderDayUseForm() {
    box.innerHTML =
      '<div class="bkp-head"><span class="bkp-title">' + esc(state.roomDisplayName) + '</span>' +
        '<button type="button" class="bkp-close" aria-label="' + TR('bk.pay.close') + '">&times;</button></div>' +
      '<div class="bkp-body">' +
      '<div class="bkp-view" id="bkpViewForm">' +
        '<h3 class="bkp-unavail-title">' + TR('bk.dayuse.title') + '</h3>' +

        '<div class="bkp-field"><label>' + TR('bk.dayuse.dateLabel') + '</label><input type="date" id="bkpDayUseDate" min="' + todayISO() + '"></div>' +
        '<div class="bkp-field"><label>' + TR('bk.dayuse.timeLabel') + '</label><input type="text" id="bkpDayUseTime" placeholder="' + esc(TR('bk.dayuse.timePlaceholder')) + '"></div>' +

        '<div class="bkp-total-row"><span>' + TR('bk.pay.total') + '</span><strong>' + money(state.price) + '</strong></div>' +

        '<div class="bkp-guest-fields">' +
          '<p class="bkp-section-label">' + TR('bk.pay.guestDetails') + '</p>' +
          '<div class="bkp-grid-2">' +
            '<div class="bkp-field"><label>' + TR('bk.pay.firstName') + '</label><input id="bkpFirstName" autocomplete="given-name"></div>' +
            '<div class="bkp-field"><label>' + TR('bk.pay.lastName') + '</label><input id="bkpLastName" autocomplete="family-name"></div>' +
          '</div>' +
          '<div class="bkp-field"><label>' + TR('bk.pay.email') + '</label><input type="email" id="bkpEmail" autocomplete="email"></div>' +
          '<div class="bkp-field"><label>' + TR('bk.pay.phone') + '</label><input type="tel" id="bkpPhone" autocomplete="tel"></div>' +
        '</div>' +

        '<p class="bkp-pp-note">' + TR('bk.pay.checkinNote') + '</p>' +

        '<p class="bkp-form-error" id="bkpFormError" hidden></p>' +

        '<button type="button" class="btn btn-solid bkp-submit-btn" id="bkpSubmitBtn">' + TR('bk.dayuse.submit') + '</button>' +
      '</div>' +
      resultViewsHTML() +
      '</div>';

    qs('.bkp-close').addEventListener('click', close);
    qs('#bkpSubmitBtn').addEventListener('click', onDayUseSubmit);
  }

  function setDayUseSubmitting(isSubmitting) {
    var btn = qs('#bkpSubmitBtn');
    if (btn) {
      btn.disabled = isSubmitting;
      btn.textContent = isSubmitting ? TR('bk.pay.processingText') : TR('bk.dayuse.submit');
    }
  }

  function onDayUseSubmit() {
    clearFormError();
    if (!validateGuestFields()) return;
    var date = val('bkpDayUseDate');
    if (!date) {
      showFormError(TR('bk.pay.err.required'));
      return;
    }
    var body = {
      room: state.room,
      date: date,
      preferredTime: val('bkpDayUseTime'),
      guest: guestPayload(),
      lang: I ? I.getLang() : 'en',
    };
    setDayUseSubmitting(true);
    window.JPark.api.post('/api/v1/payments/dayuse-booking', body).then(function (r) {
      if (!r || r.error) {
        setDayUseSubmitting(false);
        showFormError((r && r.error) || TR('bk.pay.err.generic'));
        return;
      }
      showSuccess(r.booking.ref, { pending: true, titleKey: 'bk.dayuse.successTitle', noteKey: 'bk.dayuse.successNote' });
    }).catch(function () {
      setDayUseSubmitting(false);
      showFormError(TR('bk.pay.err.network'));
    });
  }

  window.JPark.bookingFlow = { open: open, openDayUse: openDayUse };
})();
