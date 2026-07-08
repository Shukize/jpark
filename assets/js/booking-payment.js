/* ============================================================
   J Park Hotel — online booking payment modal.
   Loaded after booking-page.js (which owns date/room search and calls
   window.JPark.bookingFlow.open(ctx) from each room card's "Book Now"
   button).

   PromptPay QR is the only online payment method, by permanent policy —
   card and cash are in-person-only (see the fallback note in each form).
   Two states: while Omise isn't configured (no publicKey — see
   loadConfig/open below), renderManual() shows a static PromptPay QR image
   and posts to POST /api/v1/payments/manual-booking for staff to confirm
   by hand. Once a real Omise account exists, renderForm() creates a live
   PromptPay source/charge server-side (backend/routes/payments.js) — never
   a card charge in either state.
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
  //  i18n — this file owns the guest-details/payment-modal vocabulary;
  //  booking-page.js owns the room-card strings (bk.pay.bookNow etc).
  //  Both merge into the same shared dictionary via registerI18n.
  // ============================================================
  var STR = {
    en: {
      'bk.pay.roomType': 'Room type', 'bk.pay.guestDetails': 'Guest details',
      'bk.pay.firstName': 'First name', 'bk.pay.lastName': 'Last name (optional)',
      'bk.pay.email': 'Email', 'bk.pay.phone': 'Phone (optional)',
      'bk.pay.note': 'Special requests (optional)', 'bk.pay.notePlaceholder': 'Late arrival, high floor, allergies…',
      'bk.pay.depositTitle': 'Please note',
      'bk.pay.depositNote': 'A 200 THB deposit for your room key card is collected in cash only at check-in, and refunded in full at check-out.',
      'bk.pay.promptpayNote': 'After you tap Pay, scan the QR code with your banking app to complete payment instantly.',
      'bk.pay.total': 'Total', 'bk.pay.generateQr': 'Generate PromptPay QR',
      'bk.pay.extraBedLine': 'Extra bed (3rd guest)', 'bk.pay.extraBreakfastLine': 'Extra breakfast guest',
      'bk.pay.fallback1': 'Prefer to pay by card or cash instead? ', 'bk.pay.fallbackCall': 'Call us',
      'bk.pay.fallback2': ' or ', 'bk.pay.fallbackEmail': 'email us', 'bk.pay.fallback3': ' to arrange payment in person.',
      'bk.pay.processingText': 'Processing your payment…',
      'bk.pay.qrTitle': 'Scan to pay {amount}', 'bk.pay.qrWaiting': 'Waiting for payment confirmation…',
      'bk.pay.cancel': 'Cancel', 'bk.pay.close': 'Close',
      'bk.pay.successTitle': 'Booking confirmed!', 'bk.pay.confirmationLabel': 'Confirmation number',
      'bk.pay.emailSentNote': 'A confirmation has been sent to your email, with the deposit note above.',
      'bk.pay.done': 'Done',
      'bk.pay.unavailableTitle': 'Online payment is launching soon',
      'bk.pay.unavailableText': 'We are not yet taking online payments for this room. Please call or email us and we will gladly confirm your reservation directly.',
      'bk.pay.manualTitle': 'Reserve now, pay by PromptPay',
      'bk.pay.manualQrCaption': 'Scan with your banking app to pay by PromptPay — we will confirm your reservation by phone or email.',
      'bk.pay.manualSubmit': 'Send reservation request',
      'bk.pay.manualSuccessTitle': 'Request received — pending confirmation',
      'bk.pay.manualSuccessNote': 'Please complete payment via the PromptPay QR shown above. We will confirm your reservation by phone or email once payment is received.',
      'bk.pay.err.required': 'Please fill in your first name and email.',
      'bk.pay.err.declined': 'Payment was not completed. Please try again.',
      'bk.pay.err.timeout': 'We have not received your payment yet. You can keep waiting or contact us with your confirmation number.',
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
      'bk.pay.promptpayNote': 'หลังจากกดชำระเงิน ให้สแกน QR โค้ดด้วยแอปธนาคารของท่านเพื่อชำระเงินทันที',
      'bk.pay.total': 'ยอดรวม', 'bk.pay.generateQr': 'สร้าง QR พร้อมเพย์',
      'bk.pay.extraBedLine': 'เตียงเสริม (ผู้เข้าพักคนที่ 3)', 'bk.pay.extraBreakfastLine': 'อาหารเช้าเพิ่มเติม',
      'bk.pay.fallback1': 'ต้องการชำระด้วยบัตรหรือเงินสดแทน? ', 'bk.pay.fallbackCall': 'โทรหาเรา',
      'bk.pay.fallback2': ' หรือ ', 'bk.pay.fallbackEmail': 'ส่งอีเมลถึงเรา', 'bk.pay.fallback3': ' เพื่อนัดชำระเงินด้วยตนเอง',
      'bk.pay.processingText': 'กำลังดำเนินการชำระเงิน…',
      'bk.pay.qrTitle': 'สแกนเพื่อชำระ {amount}', 'bk.pay.qrWaiting': 'กำลังรอการยืนยันการชำระเงิน…',
      'bk.pay.cancel': 'ยกเลิก', 'bk.pay.close': 'ปิด',
      'bk.pay.successTitle': 'ยืนยันการจองแล้ว!', 'bk.pay.confirmationLabel': 'หมายเลขยืนยัน',
      'bk.pay.emailSentNote': 'เราได้ส่งอีเมลยืนยันพร้อมข้อมูลเงินมัดจำข้างต้นให้ท่านแล้ว',
      'bk.pay.done': 'เสร็จสิ้น',
      'bk.pay.unavailableTitle': 'การชำระเงินออนไลน์กำลังจะเปิดให้บริการเร็วๆ นี้',
      'bk.pay.unavailableText': 'เรายังไม่เปิดรับชำระเงินออนไลน์สำหรับห้องนี้ กรุณาโทรหรืออีเมลถึงเรา เรายินดียืนยันการจองให้ท่านโดยตรง',
      'bk.pay.manualTitle': 'จองเลย ชำระด้วยพร้อมเพย์',
      'bk.pay.manualQrCaption': 'สแกนด้วยแอปธนาคารของท่านเพื่อชำระผ่านพร้อมเพย์ — เราจะยืนยันการจองของท่านทางโทรศัพท์หรืออีเมล',
      'bk.pay.manualSubmit': 'ส่งคำขอจอง',
      'bk.pay.manualSuccessTitle': 'ได้รับคำขอแล้ว — รอการยืนยัน',
      'bk.pay.manualSuccessNote': 'กรุณาชำระเงินผ่าน QR พร้อมเพย์ตามที่แสดงไว้ข้างต้น เราจะยืนยันการจองของท่านทางโทรศัพท์หรืออีเมลเมื่อได้รับการชำระเงินแล้ว',
      'bk.pay.err.required': 'กรุณากรอกชื่อและอีเมลของท่าน',
      'bk.pay.err.declined': 'การชำระเงินไม่สำเร็จ กรุณาลองใหม่',
      'bk.pay.err.timeout': 'เรายังไม่ได้รับการชำระเงินของท่าน ท่านสามารถรอต่อหรือติดต่อเราพร้อมหมายเลขยืนยัน',
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
      'bk.pay.promptpayNote': 'お支払いをタップした後、銀行アプリでQRコードをスキャンして即座にお支払いください。',
      'bk.pay.total': '合計', 'bk.pay.generateQr': 'プロンプトペイQRを発行',
      'bk.pay.extraBedLine': 'エキストラベッド（3人目）', 'bk.pay.extraBreakfastLine': '追加の朝食',
      'bk.pay.fallback1': 'カードまたは現金でのお支払いをご希望ですか？ ', 'bk.pay.fallbackCall': 'お電話',
      'bk.pay.fallback2': ' または ', 'bk.pay.fallbackEmail': 'メール', 'bk.pay.fallback3': ' にてご連絡いただき、直接お支払いをご相談ください。',
      'bk.pay.processingText': 'お支払いを処理しています…',
      'bk.pay.qrTitle': '{amount} を支払うにはスキャン', 'bk.pay.qrWaiting': 'お支払い確認を待っています…',
      'bk.pay.cancel': 'キャンセル', 'bk.pay.close': '閉じる',
      'bk.pay.successTitle': 'ご予約が確定しました！', 'bk.pay.confirmationLabel': '確認番号',
      'bk.pay.emailSentNote': '上記のデポジットのご案内を含む確認メールをお送りしました。',
      'bk.pay.done': '完了',
      'bk.pay.unavailableTitle': 'オンライン決済は近日公開予定です',
      'bk.pay.unavailableText': 'この客室のオンライン決済はまだ対応しておりません。お電話またはメールにてご連絡いただければ、直接ご予約を確定いたします。',
      'bk.pay.manualTitle': '今すぐご予約 — プロンプトペイでお支払い',
      'bk.pay.manualQrCaption': '銀行アプリでQRコードをスキャンしてプロンプトペイでお支払いください — お電話またはメールにてご予約を確認いたします。',
      'bk.pay.manualSubmit': '予約リクエストを送信',
      'bk.pay.manualSuccessTitle': 'リクエストを受け付けました — 確認待ち',
      'bk.pay.manualSuccessNote': '上記のプロンプトペイQRにてお支払いください。お支払い確認後、お電話またはメールにてご予約を確定いたします。',
      'bk.pay.err.required': 'お名前とメールアドレスをご入力ください。',
      'bk.pay.err.declined': 'お支払いが完了しませんでした。再度お試しください。',
      'bk.pay.err.timeout': 'お支払いがまだ確認できておりません。そのままお待ちいただくか、確認番号とともにご連絡ください。',
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
      'bk.pay.promptpayNote': '点击支付后，请使用您的银行App扫描二维码即可立即完成支付。',
      'bk.pay.total': '总计', 'bk.pay.generateQr': '生成 PromptPay 二维码',
      'bk.pay.extraBedLine': '加床（第3位客人）', 'bk.pay.extraBreakfastLine': '额外早餐',
      'bk.pay.fallback1': '想使用银行卡或现金支付？ ', 'bk.pay.fallbackCall': '致电我们',
      'bk.pay.fallback2': ' 或 ', 'bk.pay.fallbackEmail': '发送邮件', 'bk.pay.fallback3': ' 与我们约定当面付款。',
      'bk.pay.processingText': '正在处理您的付款…',
      'bk.pay.qrTitle': '扫描以支付 {amount}', 'bk.pay.qrWaiting': '正在等待付款确认…',
      'bk.pay.cancel': '取消', 'bk.pay.close': '关闭',
      'bk.pay.successTitle': '预订成功！', 'bk.pay.confirmationLabel': '确认号',
      'bk.pay.emailSentNote': '包含上述押金说明的确认邮件已发送至您的邮箱。',
      'bk.pay.done': '完成',
      'bk.pay.unavailableTitle': '在线支付即将上线',
      'bk.pay.unavailableText': '此房型暂未开放在线支付，请致电或发送邮件给我们，我们将很乐意为您直接确认预订。',
      'bk.pay.manualTitle': '立即预订，使用 PromptPay 支付',
      'bk.pay.manualQrCaption': '使用您的银行App扫描二维码以PromptPay支付——我们将通过电话或邮件为您确认预订。',
      'bk.pay.manualSubmit': '发送预订请求',
      'bk.pay.manualSuccessTitle': '已收到请求 — 待确认',
      'bk.pay.manualSuccessNote': '请通过上述PromptPay二维码完成付款。收到付款后，我们将通过电话或邮件为您确认预订。',
      'bk.pay.err.required': '请填写您的名字和电子邮箱。',
      'bk.pay.err.declined': '支付未完成，请重试。',
      'bk.pay.err.timeout': '尚未收到您的付款，您可以继续等待，或携带确认号与我们联系。',
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
      'bk.pay.promptpayNote': '點擊付款後，請使用您的銀行App掃描二維碼即可立即完成付款。',
      'bk.pay.total': '總計', 'bk.pay.generateQr': '產生 PromptPay 二維碼',
      'bk.pay.extraBedLine': '加床（第3位客人）', 'bk.pay.extraBreakfastLine': '額外早餐',
      'bk.pay.fallback1': '想使用銀行卡或現金付款？ ', 'bk.pay.fallbackCall': '致電我們',
      'bk.pay.fallback2': ' 或 ', 'bk.pay.fallbackEmail': '發送郵件', 'bk.pay.fallback3': ' 與我們約定當面付款。',
      'bk.pay.processingText': '正在處理您的付款…',
      'bk.pay.qrTitle': '掃描以支付 {amount}', 'bk.pay.qrWaiting': '正在等待付款確認…',
      'bk.pay.cancel': '取消', 'bk.pay.close': '關閉',
      'bk.pay.successTitle': '預訂成功！', 'bk.pay.confirmationLabel': '確認號',
      'bk.pay.emailSentNote': '包含上述押金說明的確認郵件已發送至您的郵箱。',
      'bk.pay.done': '完成',
      'bk.pay.unavailableTitle': '線上付款即將上線',
      'bk.pay.unavailableText': '此房型暫未開放線上付款，請致電或發送郵件給我們，我們將很樂意為您直接確認預訂。',
      'bk.pay.manualTitle': '立即預訂，使用 PromptPay 付款',
      'bk.pay.manualQrCaption': '使用您的銀行App掃描二維碼以PromptPay付款——我們將透過電話或郵件為您確認預訂。',
      'bk.pay.manualSubmit': '傳送預訂請求',
      'bk.pay.manualSuccessTitle': '已收到請求 — 待確認',
      'bk.pay.manualSuccessNote': '請透過上述PromptPay二維碼完成付款。收到付款後，我們將透過電話或郵件為您確認預訂。',
      'bk.pay.err.required': '請填寫您的名字和電子郵箱。',
      'bk.pay.err.declined': '付款未完成，請重試。',
      'bk.pay.err.timeout': '尚未收到您的付款，您可以繼續等待，或攜帶確認號與我們聯絡。',
      'bk.pay.err.generic': '出現了一些問題，請重試。',
      'bk.pay.err.network': '網路錯誤，請檢查連線後重試。',
      'bk.pay.err.soldOut': '抱歉，該房型在所選日期已訂滿。',
    },
  };
  if (I) I.registerI18n(STR);

  // ============================================================
  //  Config (Omise public key) — fetched once, lazily.
  // ============================================================
  var config = null;
  var configPromise = null;
  function loadConfig() {
    if (configPromise) return configPromise;
    var API = window.JPark.api;
    configPromise = API
      ? API.get('/api/v1/payments/config').then(function (r) {
          config = (r && !r.error) ? r : { publicKey: null };
          return config;
        }).catch(function () { config = { publicKey: null }; return config; })
      : Promise.resolve({ publicKey: null });
    return configPromise;
  }
  loadConfig();

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

  // Shown instead of the live Omise PromptPay form while Omise isn't
  // configured (no publicKey — see open()). Rather than just telling the
  // guest to call or email (the old behavior), this collects the same
  // room/guest details and lets them scan the hotel's static PromptPay QR;
  // POST /api/v1/payments/manual-booking records a *pending* booking for
  // staff to confirm by hand once payment is verified — see
  // backend/routes/payments.js for that endpoint.
  function renderManual() {
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

        '<h3 class="bkp-unavail-title">' + TR('bk.pay.manualTitle') + '</h3>' +

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

        '<div class="bkp-manual-qr">' +
          '<img src="images/promptpay-qr.jpg" alt="PromptPay QR code" class="bkp-qr-img" />' +
          '<p class="bkp-pp-note">' + TR('bk.pay.manualQrCaption') + '</p>' +
        '</div>' +

        '<p class="bkp-form-error" id="bkpFormError" hidden></p>' +

        '<button type="button" class="btn btn-solid bkp-submit-btn" id="bkpSubmitBtn">' + TR('bk.pay.manualSubmit') + '</button>' +
        '<p class="bkp-fallback-note">' + TR('bk.pay.fallback1') +
          '<a href="tel:+66863260664">' + TR('bk.pay.fallbackCall') + '</a>' + TR('bk.pay.fallback2') +
          '<a href="mailto:jparkhotel1@gmail.com">' + TR('bk.pay.fallbackEmail') + '</a>' + TR('bk.pay.fallback3') +
        '</p>' +
      '</div>' +
      resultViewsHTML() +
      '</div>';

    wireManualForm();
  }

  function updateManualTotals() {
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

  function wireManualForm() {
    qs('.bkp-close').addEventListener('click', close);
    var variantRow = qs('#bkpVariantRow');
    if (variantRow) {
      variantRow.addEventListener('change', function (e) {
        if (e.target.name === 'bkpVariant') {
          state.variantIndex = parseInt(e.target.value, 10);
          updateManualTotals();
        }
      });
    }
    qs('#bkpBreakfastRow').addEventListener('change', function (e) {
      if (e.target.name === 'bkpBreakfast') {
        state.breakfast = e.target.value === '1';
        updateManualTotals();
      }
    });
    qs('#bkpSubmitBtn').addEventListener('click', onManualSubmit);
  }

  function setManualSubmitting(isSubmitting) {
    var btn = qs('#bkpSubmitBtn');
    if (btn) {
      btn.disabled = isSubmitting;
      btn.textContent = isSubmitting ? TR('bk.pay.processingText') : TR('bk.pay.manualSubmit');
    }
  }

  function onManualSubmit() {
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
      method: 'promptpay_manual',
    };
    setManualSubmitting(true);
    window.JPark.api.post('/api/v1/payments/manual-booking', body).then(function (r) {
      if (!r || r.error) {
        setManualSubmitting(false);
        showFormError((r && r.status === 409) ? TR('bk.pay.err.soldOut') : ((r && r.error) || TR('bk.pay.err.generic')));
        return;
      }
      showSuccess(r.booking.ref, { pending: true });
    }).catch(function () {
      setManualSubmitting(false);
      showFormError(TR('bk.pay.err.network'));
    });
  }

  function renderForm() {
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

        '<div class="bkp-pay-panel" id="bkpPanelPromptpay">' +
          '<p class="bkp-pp-note">' + TR('bk.pay.promptpayNote') + '</p>' +
        '</div>' +

        '<p class="bkp-form-error" id="bkpFormError" hidden></p>' +

        '<button type="button" class="btn btn-solid bkp-submit-btn" id="bkpSubmitBtn">' + payBtnLabel() + '</button>' +
        '<p class="bkp-fallback-note">' + TR('bk.pay.fallback1') +
          '<a href="tel:+66863260664">' + TR('bk.pay.fallbackCall') + '</a>' + TR('bk.pay.fallback2') +
          '<a href="mailto:jparkhotel1@gmail.com">' + TR('bk.pay.fallbackEmail') + '</a>' + TR('bk.pay.fallback3') +
        '</p>' +
      '</div>' +
      resultViewsHTML() +
      '</div>'; // .bkp-body

    wireForm();
  }

  // Shared by the full form (renderForm) — pollStatus()'s QR/success/error
  // outcomes render into these views.
  function resultViewsHTML() {
    return (
      '<div class="bkp-view" id="bkpViewQr" hidden>' +
        '<p id="bkpQrTitle"></p>' +
        '<img id="bkpQrImg" class="bkp-qr-img" alt="PromptPay QR code" />' +
        '<p class="bkp-qr-waiting">' + TR('bk.pay.qrWaiting') + '</p>' +
        '<button type="button" class="btn btn-ghost dark" id="bkpCancelQrBtn">' + TR('bk.pay.cancel') + '</button>' +
      '</div>' +

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

  function payBtnLabel() {
    return TR('bk.pay.generateQr');
  }

  function updateTotals() {
    var totalEl = qs('#bkpTotal');
    if (totalEl) totalEl.textContent = money(currentTotal());
    var notesEl = qs('#bkpSurchargeNotes');
    if (notesEl) notesEl.innerHTML = surchargeNotesHTML();
    var submitBtn = qs('#bkpSubmitBtn');
    if (submitBtn) submitBtn.textContent = payBtnLabel();
    var v = currentVariant();
    var row = qs('#bkpBreakfastRow');
    if (row) {
      var labels = row.querySelectorAll('.bkp-radio');
      if (labels[0]) labels[0].lastChild.textContent = ' ' + TR('bk.roomOnly') + ' — ' + money(v.room);
      if (labels[1]) labels[1].lastChild.textContent = ' ' + TR('bk.withBreakfast') + ' — ' + money(v.bf);
    }
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

  function setSubmitting(isSubmitting) {
    var btn = qs('#bkpSubmitBtn');
    if (btn) {
      btn.disabled = isSubmitting;
      btn.textContent = isSubmitting ? TR('bk.pay.processingText') : payBtnLabel();
    }
  }

  function showView(id) {
    Array.prototype.forEach.call(box.querySelectorAll('.bkp-view'), function (v) {
      v.hidden = (v.id !== id);
    });
  }

  function wireForm() {
    qs('.bkp-close').addEventListener('click', close);

    var variantRow = qs('#bkpVariantRow');
    if (variantRow) {
      variantRow.addEventListener('change', function (e) {
        if (e.target.name === 'bkpVariant') {
          state.variantIndex = parseInt(e.target.value, 10);
          updateTotals();
        }
      });
    }
    qs('#bkpBreakfastRow').addEventListener('change', function (e) {
      if (e.target.name === 'bkpBreakfast') {
        state.breakfast = e.target.value === '1';
        updateTotals();
      }
    });

    qs('#bkpSubmitBtn').addEventListener('click', onSubmit);
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

  function onSubmit() {
    clearFormError();
    if (!validateGuestFields()) return;
    setSubmitting(true);
    sendCharge({ method: 'promptpay' });
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

  function sendCharge(extra) {
    var API = window.JPark.api;
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
      method: extra.method,
    };

    API.post('/api/v1/payments/charge', body).then(function (r) {
      if (!r || r.error) {
        setSubmitting(false);
        showFormError((r && r.status === 409) ? TR('bk.pay.err.soldOut') : ((r && r.error) || TR('bk.pay.err.generic')));
        return;
      }
      if (r.status === 'paid') {
        showSuccess(r.booking.ref);
      } else if (r.status === 'pending' && r.qrImage) {
        showQr(r.qrImage, r.bookingId);
      } else {
        setSubmitting(false);
        showFormError(TR('bk.pay.err.generic'));
      }
    }).catch(function () {
      setSubmitting(false);
      showFormError(TR('bk.pay.err.network'));
    });
  }

  function showQr(qrImage, bookingId) {
    showView('bkpViewQr');
    qs('#bkpQrTitle').textContent = TR('bk.pay.qrTitle').replace('{amount}', money(currentTotal()));
    qs('#bkpQrImg').src = qrImage;
    qs('#bkpCancelQrBtn').addEventListener('click', close);
    pollStatus(bookingId);
  }

  // `opts.pending` swaps in the "request received, awaiting confirmation"
  // copy used by the manual PromptPay flow (renderManual/onManualSubmit) in
  // place of the default "booking confirmed" copy used by the live Omise
  // PromptPay flow.
  function showSuccess(ref, opts) {
    showView('bkpViewSuccess');
    var refEl = qs('#bkpRefText');
    if (refEl) refEl.textContent = ref;
    if (opts && opts.pending) {
      var titleEl = qs('#bkpViewSuccess h3');
      var noteEl = qs('#bkpViewSuccess .bkp-success-note');
      if (titleEl) titleEl.textContent = TR(opts.titleKey || 'bk.pay.manualSuccessTitle');
      if (noteEl) noteEl.textContent = TR(opts.noteKey || 'bk.pay.manualSuccessNote');
    }
    var doneBtn = qs('#bkpDoneBtn');
    if (doneBtn) doneBtn.addEventListener('click', close);
  }

  function pollStatus(bookingId) {
    var API = window.JPark.api;
    var tries = 0;
    var maxTries = 200; // ~10 minutes at 3s intervals
    function tick() {
      if (!overlay || overlay.hidden) return; // guest closed the modal — stop polling
      tries++;
      API.get('/api/v1/payments/status/' + encodeURIComponent(bookingId)).then(function (r) {
        if (!overlay || overlay.hidden) return;
        if (!r || r.error) {
          if (tries < maxTries) setTimeout(tick, 3000);
          return;
        }
        if (r.paymentStatus === 'paid') {
          showSuccess(r.ref);
        } else if (r.paymentStatus === 'failed') {
          showView('bkpViewForm');
          setSubmitting(false);
          showFormError(TR('bk.pay.err.declined'));
        } else if (tries < maxTries) {
          setTimeout(tick, 3000);
        } else {
          showView('bkpViewForm');
          setSubmitting(false);
          showFormError(TR('bk.pay.err.timeout'));
        }
      }).catch(function () {
        if (tries < maxTries) setTimeout(tick, 3000);
      });
    }
    tick();
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
      method: 'promptpay', // inert — only one method exists, kept for readability
    };
    overlay.hidden = false;
    document.body.classList.add('bk-pay-open');
    box.innerHTML = '<div class="bkp-view"><div class="bkp-spinner" aria-hidden="true"></div></div>';

    loadConfig().then(function (cfg) {
      if (!state) return; // closed before config resolved
      if (!cfg || !cfg.publicKey) {
        renderManual();
      } else {
        renderForm();
      }
    });
  }

  // ============================================================
  //  Day-use (3-hour) booking — a much simpler sibling flow to open()/
  //  renderForm() above: a flat price (no nights, no breakfast/extra-guest
  //  surcharges, no variant choice), a single preferred date + free-text
  //  preferred time (front desk assigns/confirms the exact slot — see
  //  POST /api/v1/payments/dayuse-booking), and always goes through the
  //  same manual PromptPay-QR/cash request pattern as renderManual()
  //  regardless of whether Omise is configured, since a day-use slot
  //  always needs a human to confirm availability anyway.
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

        '<div class="bkp-manual-qr">' +
          '<img src="images/promptpay-qr.jpg" alt="PromptPay QR code" class="bkp-qr-img" />' +
          '<p class="bkp-pp-note">' + TR('bk.pay.manualQrCaption') + '</p>' +
        '</div>' +

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
      method: 'promptpay_manual',
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
