/* ============================================================
   J Park Hotel — guest bookings routes
   GET    /api/guest-bookings          list all (auth)
   GET    /api/guest-bookings/:id      single booking (auth)
   POST   /api/guest-bookings          ingest / create booking
   PATCH  /api/guest-bookings/:id      confirm a pending slot / mark read /
                                        assign room / record payment (auth)
   POST   /api/guest-bookings/:id/cancel  staff-mediated cancel (auth)
   POST   /api/guest-bookings/:id/reopen  restore a cancelled booking (auth)
   DELETE /api/guest-bookings/:id      permanently delete (admin)
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendEmail } = require('../mailer');
const T = require('../lib/emailTemplate');
const PD = require('../lib/payments/detail');
// Rebuild a payment record from a stored booking row, so an email sent
// hours after the charge is as complete as one sent inline.
const detailFromRow = (row) => PD.fromColumns(row);
const { makeLimiter } = require('../lib/rateLimit');
const { countOverlappingPool } = require('../lib/availability');
const roomRates = require('../lib/roomRates');
const rateOverrides = require('../lib/rateOverrides');
const { resolveBuilding } = require('../lib/buildings');

const router = express.Router();

// Generous limit — the Gmail-forwarder OTA bridge is known to burst dozens
// of requests when clearing a backlog (a single run has ingested 105 real
// bookings), so this only needs to bound a genuine flood, not normal use.
const rateLimited = makeLimiter(120, 10 * 60 * 1000);

// Optional shared-secret gate for the public ingest endpoint (POST below).
// A channel manager / OTA bridge authenticates server-to-server with
//   X-API-Key: <OTA_WEBHOOK_SECRET>
// When OTA_WEBHOOK_SECRET is unset the endpoint stays open (local dev / the
// demo browser ingest). When it IS set, an inbound POST must present the
// matching key — this stops anyone from spamming fake reservations (and the
// hotel/guest emails each one triggers) at the live property. Uses the same
// secret as /api/v1/ota-sync so the channel manager only needs one key.
function ingestKeyOk(provided) {
  const expected = process.env.OTA_WEBHOOK_SECRET || '';
  if (!expected) return true;            // no secret configured → endpoint open
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Where new-booking notifications land. This is the hotel's own inbox (the same
// address the OTAs send their confirmations to), so the front desk gets a copy of
// every reservation that flows through the Guest Booking system. Override with the
// HOTEL_NOTIFY_EMAIL env var; comma-separated values are allowed for multiple staff.
function hotelRecipients() {
  return (process.env.HOTEL_NOTIFY_EMAIL || 'jparkhotel1@gmail.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Build a hotel-facing "new booking" notice from a booking row. Sent to the front
// desk inbox so staff see every OTA / direct reservation as it arrives, mirroring
// the Guest Booking entry in the staff console.
// Was this booking paid through an online payment GATEWAY, as opposed to at
// the front desk or not through this system at all?
//
// Written as "has a provider, and it isn't the front desk" rather than as a
// list of gateway names on purpose. It used to read `=== 'omise'`, which
// quietly became wrong the moment the hotel switched acquirer: a real,
// fully-paid GB Prime Pay booking would have been described to the guest as
// never having paid — including on the cancellation email's refund line,
// which would have told someone who really was charged that there was
// nothing to refund. Anchoring on 'in_person' means a future third gateway
// is correct here with no edit at all.
//   - NULL / 'n/a'    OTA and manually-entered bookings (never paid here)
//   - 'in_person'     pay-at-check-in and day-use requests
//   - anything else   an online gateway (see backend/lib/payments/)
function isOnlineProvider(provider) {
  return Boolean(provider) && provider !== 'in_person';
}

/* What a cancellation email tells the guest about their money.

   The hotel's policy is that online payments are NOT refundable (see
   policies.html / assets/js/i18n-policies.js). This used to promise the
   opposite — "please contact us to arrange a refund" — which would have
   committed the hotel in writing, to the guest, at the worst possible moment,
   to something it does not do.

   It is one function because the text body and the HTML body are built
   separately and had already drifted: the group cancellation's HTML hard-coded
   "there is nothing to refund" regardless of payment, so a group booking that
   really had been paid online was told, in the HTML most mail clients render,
   that it had paid nothing. One source, both bodies, both shapes.

   A billing MISTAKE is deliberately still invited. Refusing refunds is a
   policy; refusing to correct a double charge is not one, and the offer costs
   nothing to make honestly. */
function cancellationRefundLine(paidOnline, money) {
  if (!paidOnline) {
    return 'No payment was taken online for this booking, so there is nothing to refund.';
  }
  return `You paid ${money} online for this booking. As set out in our booking terms, ` +
    'payments made online are non-refundable, so this amount is not returned. If you think ' +
    'you were charged in error or charged twice, reply to this email with your confirmation ' +
    'number and we will look into it. Our full terms are at https://jparkhotel.com/policies.html';
}

// Accounting-friendly line for the front-desk/hotel notice. A genuine online
// gateway charge (card or PromptPay) is called out distinctly — with the
// charge reference, so staff can reconcile against the gateway's own
// dashboard/settlement reports without opening the staff console — rather
// than blending in with the plain "Method — Status" wording every other
// payment state still uses.
function paymentLabel(bk) {
  if (!bk.payment_status || bk.payment_status === 'n/a') return null;
  const method = bk.payment_method === 'cash' ? 'Cash'
    : bk.payment_method === 'card' ? 'Card'
    : bk.payment_method === 'promptpay_instore' ? 'PromptPay (in person)'
    : bk.payment_method === 'pay_at_checkin' ? 'Pay at check-in (cash / card / PromptPay)'
    : bk.payment_method === 'promptpay' ? 'PromptPay'
    : bk.payment_provider || 'Online';
  const online = isOnlineProvider(bk.payment_provider);
  const money = bk.total != null ? formatMoney(bk.total, bk.currency) : '—';
  const chargeSuffix = bk.payment_charge_id ? ` (gateway ref: ${bk.payment_charge_id})` : '';
  if (online && bk.payment_status === 'paid') {
    return `✓ PAID ONLINE — ${method} — ${money}${chargeSuffix}`;
  }
  if (online && bk.payment_status === 'pending') {
    return `AWAITING ${method.toUpperCase()} CONFIRMATION — ${money}${chargeSuffix}`;
  }
  const statusWord = bk.payment_status === 'paid' ? 'Paid'
    : bk.payment_status === 'pending' ? 'Awaiting payment'
    : bk.payment_status === 'failed' ? 'Failed'
    : bk.payment_status;
  return `${method} — ${statusWord}`;
}

// A prominent, guest-facing "here's what you owe and how to pay it" callout
// — distinct from the terse `Payment: {label}` row above, which stays a
// uniform one-liner across every booking type in the inbox. Only shown for
// a reservation still awaiting its in-person payment (see routes/payments.js
// POST /reservations, which always creates bookings in this state).
function formatMoney(amount, currency) {
  const cur = currency || 'THB';
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount == null ? '' : amount) + ' ' + cur;
  // Thai hotel rates are whole baht; show decimals only if there really are any.
  const body = Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return body + ' ' + cur;
}

function balanceDueNote(bk) {
  if (bk.payment_method !== 'pay_at_checkin' || bk.payment_status !== 'pending') return null;
  const money = bk.total != null ? formatMoney(bk.total, bk.currency) : '—';
  return {
    text: `Balance due: ${money}. Payable in person at check-in by cash, credit/debit card, or PromptPay QR at our front desk.`,
    html: `<p style="background:#eef6f4;border:1px solid #a9d6cb;border-radius:8px;padding:10px 14px;color:#0f4a3e">` +
      `<strong>Balance due: ${money}.</strong> Payable in person at check-in by cash, credit/debit card, or PromptPay QR at our front desk.</p>`,
  };
}

function guestCountLabel(adults, children) {
  const a = Number(adults) || 0;
  const c = Number(children) || 0;
  return `${a} ${a === 1 ? 'adult' : 'adults'}` + (c > 0 ? `, ${c} ${c === 1 ? 'child' : 'children'}` : '');
}

function smokingLabel(bk) {
  return bk.smoking_preference === 'smoking' ? 'Smoking' : 'Non-Smoking';
}

function breakfastLabel(bk) {
  return bk.breakfast ? 'Yes' : 'No';
}

// House-wide check-in/check-out hours (see chat.a.checkin in i18n-app.js and
// the demo seed text in store.js for the same 14:00/12:00 convention) — ICT
// spelled out explicitly since guests booking from abroad won't know the
// local UTC offset. There is no per-booking "requested time" field, so every
// confirmation always quotes these two standard house times — never invent
// a different time even if a guest's free-text note mentions one; front desk
// handles early/late arrival requests manually.
const CHECKIN_TIME_NOTE = '(from 14:00 ICT)';
const CHECKOUT_TIME_NOTE = '(until 12:00 ICT)';
const CHECKIN_TIME = '14:00';
const CHECKOUT_TIME = '12:00';

// `check_in`/`check_out` come back from pg as JS Date objects (DATE column,
// UTC midnight) — interpolating one directly into a template literal calls
// its default .toString(), which dumps the full "GMT+0000 (Coordinated
// Universal Time)" tail. This renders a clean, unambiguous
// "Sat Jul 25 2026 14:00 ICT" instead, explicitly pinned to UTC so a
// server/host timezone other than UTC can never shift the calendar date by
// a day.
function formatPlainDate(dateVal) {
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return String(dateVal == null ? '—' : dateVal);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${weekday} ${month} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
}

function formatCheckDate(dateVal, hhmm) {
  const d = new Date(dateVal);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${weekday} ${month} ${d.getUTCDate()} ${d.getUTCFullYear()} ${hhmm} ICT`;
}

// Guest-facing confirmation email vocabulary, one entry per site language
// (same 5 codes as assets/js/i18n.js: en/th/ja/zh-Hans/zh-Hant). Selected by
// the booking's own `lang` (set at booking time from the guest's active site
// language — see booking-payment.js). Staff-facing emails (hotelNotice) stay
// English-only; this is deliberately scoped to the guest confirmation, since
// that's the email a guest actually reads and is expected to read in their
// own language for a 4-5★ property.
const EMAIL_I18N = {
  en: {
    greeting: (name) => `Dear ${name || 'Guest'},`,
    intro: 'Thank you for choosing J Park Hotel, Chonburi. Your reservation is confirmed.',
    confirmation: 'Confirmation', room: 'Room', checkin: 'Check-in', checkout: 'Check-out',
    nights: 'Nights', guests: 'Guests', roomPref: 'Room preference', breakfast: 'Breakfast',
    extraBed: 'Extra bed',
    specialRequests: 'Special requests',
    total: 'Total', payment: 'Payment',
    adultsChildren: (a, c) => `${a} ${a === 1 ? 'adult' : 'adults'}` + (c > 0 ? `, ${c} ${c === 1 ? 'child' : 'children'}` : ''),
    childAgesSuffix: (ages) => (ages && ages.length ? ` (ages: ${ages.join(', ')})` : ''),
    nonSmoking: 'Non-Smoking', smoking: 'Smoking', yes: 'Yes', no: 'No',
    balanceDue: (money) => `Balance due: ${money}. Payable in person at check-in by cash, credit/debit card, or PromptPay QR at our front desk.`,
    paidOnline: (money) => `✓ Payment received — thank you! You paid ${money} online for this stay.`,
    awaitingOnlinePayment: (money) => `Your PromptPay payment of ${money} is being confirmed. Your reservation is already confirmed either way — we'll email you as soon as payment is confirmed, or you're welcome to pay at check-in instead.`,
    paymentConfirmedHeading: 'Payment confirmed',
    nonRefundableNote: 'This is a prepaid, non-refundable reservation — the amount paid online is not refunded in the event of a no-show or cancellation. (The key-card deposit noted above is separate and still fully refundable at check-out.)',
    depositNote: 'Please note: a 200 THB deposit for your room key card is collected in cash at check-in and refunded in full at check-out. Thai guests may leave a national ID card or driving license instead of the cash deposit.',
    depositNoteMulti: (n) => `Please note: a ${200 * n} THB deposit for your room key cards (200 THB × ${n} rooms) is collected in cash at check-in and refunded in full at check-out. Thai guests may leave a national ID card or driving license instead of the cash deposit.`,
    roomLabel: (i) => `Room ${i}`,
    roomsSummary: (n) => `${n} rooms`,
    subtotal: 'Room total',
    grandTotal: 'Total (all rooms)',
    closing: 'We look forward to welcoming you. Reply to this email if you need anything before arrival.',
    spamNote: "Can't find this email later, or missing a reply from us? Please check your spam/junk folder — and consider adding us to your contacts.",
    heading: 'Your reservation is confirmed',
    paymentMethod: { cash: 'Cash', card: 'Card', promptpay_instore: 'PromptPay (in person)', pay_at_checkin: 'Pay at check-in (cash / card / PromptPay)', promptpay: 'PromptPay' },
    paymentStatus: { paid: 'Paid', pending: 'Awaiting payment', failed: 'Failed' },
  },
  th: {
    greeting: (name) => `เรียน คุณ${name || 'ผู้เข้าพัก'}`,
    intro: 'ขอบคุณที่เลือกพักกับ J Park Hotel, Chonburi การจองของท่านได้รับการยืนยันแล้ว',
    confirmation: 'หมายเลขยืนยัน', room: 'ห้องพัก', checkin: 'เช็คอิน', checkout: 'เช็คเอาท์',
    nights: 'จำนวนคืน', guests: 'ผู้เข้าพัก', roomPref: 'ห้องสูบบุหรี่/ปลอดบุหรี่', breakfast: 'อาหารเช้า',
    extraBed: 'เตียงเสริม',
    specialRequests: 'คำขอพิเศษ',
    total: 'ยอดรวม', payment: 'การชำระเงิน',
    adultsChildren: (a, c) => `ผู้ใหญ่ ${a} ท่าน` + (c > 0 ? `, เด็ก ${c} ท่าน` : ''),
    childAgesSuffix: (ages) => (ages && ages.length ? ` (อายุ: ${ages.join(', ')})` : ''),
    nonSmoking: 'ห้องปลอดบุหรี่', smoking: 'ห้องสูบบุหรี่', yes: 'มี', no: 'ไม่มี',
    balanceDue: (money) => `ยอดคงเหลือที่ต้องชำระ: ${money} ชำระได้ที่หน้าเคาน์เตอร์ในวันเช็คอิน ด้วยเงินสด บัตรเครดิต/เดบิต หรือ PromptPay QR`,
    paidOnline: (money) => `✓ ได้รับการชำระเงินแล้ว ขอบคุณที่ชำระเงินจำนวน ${money} ออนไลน์สำหรับการเข้าพักครั้งนี้`,
    awaitingOnlinePayment: (money) => `กำลังตรวจสอบการชำระเงินผ่าน PromptPay จำนวน ${money} การจองของท่านได้รับการยืนยันแล้วไม่ว่าผลการชำระเงินจะเป็นอย่างไร เราจะแจ้งให้ท่านทราบทางอีเมลทันทีที่ได้รับการยืนยันการชำระเงิน หรือท่านสามารถชำระเงินที่หน้าเคาน์เตอร์แทนได้`,
    paymentConfirmedHeading: 'ยืนยันการชำระเงินแล้ว',
    nonRefundableNote: 'การจองนี้เป็นแบบชำระเงินล่วงหน้าและไม่สามารถขอคืนเงินได้ — ยอดที่ชำระออนไลน์จะไม่คืนหากท่านไม่เข้าพัก (No-show) หรือยกเลิกการจอง (ทั้งนี้เงินมัดจำบัตรกุญแจห้องที่ระบุด้านบนเป็นคนละส่วน และยังคืนเต็มจำนวนตอนเช็คเอาท์)',
    depositNote: 'โปรดทราบ: มีการเรียกเก็บเงินมัดจำบัตรคีย์การ์ด 200 บาท ณ วันเช็คอิน โดยชำระเป็นเงินสด หรือฝากบัตรประจำตัวประชาชน/ใบขับขี่แทนเงินมัดจำก็ได้ และจะคืนให้เต็มจำนวนเมื่อเช็คเอาท์',
    depositNoteMulti: (n) => `โปรดทราบ: มีการเรียกเก็บเงินมัดจำบัตรคีย์การ์ด ${200 * n} บาท (200 บาท × ${n} ห้อง) ณ วันเช็คอิน โดยชำระเป็นเงินสด หรือฝากบัตรประจำตัวประชาชน/ใบขับขี่แทนเงินมัดจำก็ได้ และจะคืนให้เต็มจำนวนเมื่อเช็คเอาท์`,
    roomLabel: (i) => `ห้องที่ ${i}`,
    roomsSummary: (n) => `${n} ห้อง`,
    subtotal: 'ยอดรวมห้องพัก',
    grandTotal: 'ยอดรวมทั้งหมด',
    closing: 'เรารอต้อนรับท่านด้วยความยินดี หากท่านต้องการความช่วยเหลือใด ๆ ก่อนเดินทางมาถึง กรุณาตอบกลับอีเมลฉบับนี้',
    spamNote: 'หากไม่พบอีเมลนี้ในภายหลัง หรือไม่ได้รับการตอบกลับจากเรา กรุณาตรวจสอบโฟลเดอร์สแปม/จดหมายขยะ และแนะนำให้เพิ่มอีเมลของเราไว้ในรายชื่อผู้ติดต่อ',
    heading: 'การจองของท่านได้รับการยืนยันแล้ว',
    paymentMethod: { cash: 'เงินสด', card: 'บัตรเครดิต/เดบิต', promptpay_instore: 'PromptPay (ชำระที่โรงแรม)', pay_at_checkin: 'ชำระที่เคาน์เตอร์เมื่อเช็คอิน (เงินสด/บัตร/PromptPay)', promptpay: 'PromptPay' },
    paymentStatus: { paid: 'ชำระแล้ว', pending: 'รอชำระเงิน', failed: 'ไม่สำเร็จ' },
  },
  ja: {
    greeting: (name) => `${name || 'ゲスト'} 様`,
    intro: 'この度はJ Park Hotel, Chonburiをお選びいただき、誠にありがとうございます。ご予約が確定いたしましたのでご案内申し上げます。',
    confirmation: '確認番号', room: '客室', checkin: 'チェックイン', checkout: 'チェックアウト',
    nights: '宿泊数', guests: '宿泊人数', roomPref: 'お部屋のご希望', breakfast: '朝食',
    extraBed: 'エキストラベッド',
    specialRequests: 'ご要望',
    total: '合計金額', payment: 'お支払い',
    adultsChildren: (a, c) => `大人 ${a}名` + (c > 0 ? `、子供 ${c}名` : ''),
    childAgesSuffix: (ages) => (ages && ages.length ? ` (年齢: ${ages.join('、')})` : ''),
    nonSmoking: '禁煙', smoking: '喫煙可', yes: 'あり', no: 'なし',
    balanceDue: (money) => `お支払い残額：${money}。チェックイン時にフロントにて現金、クレジット/デビットカード、またはプロンプトペイQRでお支払いください。`,
    paidOnline: (money) => `✓ お支払いを確認いたしました。ご滞在分のお支払い ${money} をオンラインで承りました。誠にありがとうございます。`,
    awaitingOnlinePayment: (money) => `プロンプトペイでのお支払い（${money}）を確認中です。ご予約はいずれにしても確定しております。お支払いの確認が取れ次第メールにてご案内いたしますので、チェックイン時にお支払いいただくことも可能です。`,
    paymentConfirmedHeading: 'お支払い確認のお知らせ',
    nonRefundableNote: '本予約は前払い・返金不可です。ご到着がない場合（ノーショー）やキャンセルの場合、オンラインでお支払いいただいた金額は返金されません。（上記のルームキーカードのデポジットはこれとは別で、チェックアウト時に全額返金されます。）',
    depositNote: 'ご注意：ルームキーカードのデポジット200THBを、チェックイン時に現金でお預かりいたします（タイ国籍のお客様は、現金の代わりに国民IDカードまたは運転免許証をお預けいただくことも可能です）。チェックアウト時に全額返金（またはご返却）いたします。',
    depositNoteMulti: (n) => `ご注意：ルームキーカードのデポジット${200 * n} THB（200 THB × ${n}室）を、チェックイン時に現金でお預かりいたします（タイ国籍のお客様は、現金の代わりに国民IDカードまたは運転免許証をお預けいただくことも可能です）。チェックアウト時に全額返金（またはご返却）いたします。`,
    roomLabel: (i) => `お部屋 ${i}`,
    roomsSummary: (n) => `${n}室`,
    subtotal: '客室料金',
    grandTotal: '合計金額（全室）',
    closing: 'ご到着を心よりお待ち申し上げております。ご到着前に何かご要望がございましたら、本メールにご返信ください。',
    spamNote: '後ほどこのメールが見つからない場合や、当ホテルからの返信が届かない場合は、迷惑メールフォルダをご確認いただき、当方のアドレスを連絡先にご登録いただけますようお願いいたします。',
    heading: 'ご予約確定のお知らせ',
    paymentMethod: { cash: '現金', card: 'クレジット/デビットカード', promptpay_instore: 'プロンプトペイ（現地でのお支払い）', pay_at_checkin: 'チェックイン時にお支払い（現金・カード・プロンプトペイ）', promptpay: 'プロンプトペイ' },
    paymentStatus: { paid: '支払い済み', pending: '支払い待ち', failed: '失敗' },
  },
  'zh-Hans': {
    greeting: (name) => `尊敬的${name || '客人'}：`,
    intro: '感谢您选择下榻J Park Hotel, Chonburi。您的预订已确认。',
    confirmation: '确认号', room: '房型', checkin: '入住', checkout: '退房',
    nights: '住宿晚数', guests: '入住人数', roomPref: '房间偏好', breakfast: '早餐',
    extraBed: '加床',
    specialRequests: '特殊要求',
    total: '总计', payment: '付款方式',
    adultsChildren: (a, c) => `成人 ${a} 位` + (c > 0 ? `，儿童 ${c} 位` : ''),
    childAgesSuffix: (ages) => (ages && ages.length ? ` (年龄：${ages.join('、')})` : ''),
    nonSmoking: '无烟房', smoking: '吸烟房', yes: '含', no: '不含',
    balanceDue: (money) => `尚需支付金额：${money}。可于入住时在前台以现金、信用卡/借记卡或PromptPay二维码支付。`,
    paidOnline: (money) => `✓ 已收到付款，感谢您！您已在线支付本次入住费用 ${money}。`,
    awaitingOnlinePayment: (money) => `您的PromptPay付款（${money}）正在确认中。无论付款结果如何，您的预订均已确认。付款确认后我们将通过邮件通知您，您也可以选择于入住时付款。`,
    paymentConfirmedHeading: '付款已确认',
    nonRefundableNote: '本预订为预付、不可退款：如未入住（No-show）或取消，线上已付金额恕不退还。（上述房卡押金为另计，退房时仍全额退还。）',
    depositNote: '请注意：房卡押金200泰铢，于入住时以现金收取（泰国籍客人也可以国民身份证或驾驶证代替现金作为押金），退房时全额退还（或归还证件）。',
    depositNoteMulti: (n) => `请注意：房卡押金${200 * n}泰铢（200泰铢 × ${n}间），于入住时以现金收取（泰国籍客人也可以国民身份证或驾驶证代替现金作为押金），退房时全额退还（或归还证件）。`,
    roomLabel: (i) => `房间 ${i}`,
    roomsSummary: (n) => `${n} 间房`,
    subtotal: '房费',
    grandTotal: '总计（全部房间）',
    closing: '期待您的光临。如在抵达前需要任何协助，请直接回复此邮件。',
    spamNote: '稍后找不到这封邮件，或没有收到我们的回复？请检查您的垃圾邮件/垃圾箱文件夹，并建议将我们添加到您的联系人中。',
    heading: '您的预订已确认',
    paymentMethod: { cash: '现金', card: '信用卡/借记卡', promptpay_instore: 'PromptPay（现场支付）', pay_at_checkin: '入住时支付（现金/银行卡/PromptPay）', promptpay: 'PromptPay' },
    paymentStatus: { paid: '已支付', pending: '待支付', failed: '支付失败' },
  },
  'zh-Hant': {
    greeting: (name) => `尊敬的${name || '貴賓'}：`,
    intro: '感謝您選擇下榻J Park Hotel, Chonburi。您的預訂已確認。',
    confirmation: '確認號', room: '房型', checkin: '入住', checkout: '退房',
    nights: '住宿晚數', guests: '入住人數', roomPref: '房間偏好', breakfast: '早餐',
    extraBed: '加床',
    specialRequests: '特殊要求',
    total: '總計', payment: '付款方式',
    adultsChildren: (a, c) => `成人 ${a} 位` + (c > 0 ? `，兒童 ${c} 位` : ''),
    childAgesSuffix: (ages) => (ages && ages.length ? ` (年齡：${ages.join('、')})` : ''),
    nonSmoking: '無菸房', smoking: '吸菸房', yes: '含', no: '不含',
    balanceDue: (money) => `尚需支付金額：${money}。可於入住時在前台以現金、信用卡/簽帳卡或PromptPay二維碼支付。`,
    paidOnline: (money) => `✓ 已收到付款，感謝您！您已在線支付本次入住費用 ${money}。`,
    awaitingOnlinePayment: (money) => `您的PromptPay付款（${money}）正在確認中。無論付款結果如何，您的預訂均已確認。付款確認後我們將透過郵件通知您，您也可以選擇於入住時付款。`,
    paymentConfirmedHeading: '付款已確認',
    nonRefundableNote: '本訂房為預付、不可退款：如未入住（No-show）或取消，線上已付金額恕不退還。（上述房卡押金為另計，退房時仍全額退還。）',
    depositNote: '請注意：房卡押金200泰銖，於入住時以現金收取（泰國籍貴賓亦可以國民身分證或駕駛執照代替現金作為押金），退房時全額退還（或歸還證件）。',
    depositNoteMulti: (n) => `請注意：房卡押金${200 * n}泰銖（200泰銖 × ${n}間），於入住時以現金收取（泰國籍貴賓亦可以國民身分證或駕駛執照代替現金作為押金），退房時全額退還（或歸還證件）。`,
    roomLabel: (i) => `房間 ${i}`,
    roomsSummary: (n) => `${n} 間房`,
    subtotal: '房費',
    grandTotal: '總計（全部房間）',
    closing: '期待您的光臨。如在抵達前需要任何協助，請直接回覆此郵件。',
    spamNote: '稍後找不到這封郵件，或沒有收到我們的回覆？請檢查您的垃圾郵件資料夾，並建議將我們加入您的聯絡人。',
    heading: '您的預訂已確認',
    paymentMethod: { cash: '現金', card: '信用卡/簽帳卡', promptpay_instore: 'PromptPay（現場支付）', pay_at_checkin: '入住時支付（現金/銀行卡/PromptPay）', promptpay: 'PromptPay' },
    paymentStatus: { paid: '已支付', pending: '待付款', failed: '支付失敗' },
  },
};

function guestPaymentLabel(bk, L) {
  if (!bk.payment_status || bk.payment_status === 'n/a') return null;
  const method = L.paymentMethod[bk.payment_method] || bk.payment_provider || 'Online';
  const statusWord = L.paymentStatus[bk.payment_status] || bk.payment_status;
  return `${method} — ${statusWord}`;
}

// Branding + contact block appended to guest/staff-facing emails so a
// forwarded or printed copy is self-identifying without needing the site.
// The logo is loaded from the live public site since email clients can't
// reach a relative/local file path.
const SITE_ORIGIN = 'https://jparkhotel.com';
const HOTEL_ADDRESS = '88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi District, Chon Buri 20000, Thailand';
const HOTEL_PHONES = ['+66 86 326 0664', '+66 38 448 111'];
const HOTEL_EMAIL = 'jparkhotel1@gmail.com';

/* The address block for the HTML side of every email.

   emailLetterhead() below still provides the PLAIN TEXT half, which is a
   different job: text bodies are read by people with images off, by screen
   readers, and by the spam filters that penalise an HTML-only message. */
function emailFooterHtml() {
  return T.footerBlock({
    address: HOTEL_ADDRESS,
    phones: HOTEL_PHONES,
    email: HOTEL_EMAIL,
    site: SITE_ORIGIN,
  });
}

function emailLetterhead() {
  const text =
    '\n' +
    'J Park Hotel, Chonburi\n' +
    `${HOTEL_ADDRESS}\n` +
    `Tel: ${HOTEL_PHONES.join(' / ')}\n` +
    `Email: ${HOTEL_EMAIL}`;
  const html =
    '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e2e2;text-align:center">' +
    `<img src="${SITE_ORIGIN}/images/logo-full.png" alt="J Park Hotel" width="160" style="max-width:160px;height:auto;margin-bottom:10px" />` +
    '<p style="color:#666;font-size:12px;line-height:1.6;margin:0">' +
    `${HOTEL_ADDRESS}<br>` +
    `Tel: ${HOTEL_PHONES.join(' &nbsp;/&nbsp; ')} &nbsp;&middot;&nbsp; Email: <a href="mailto:${HOTEL_EMAIL}" style="color:#0f766e">${HOTEL_EMAIL}</a>` +
    '</p></div>';
  return { text, html };
}

function hotelNotice(bk) {
  const money = bk.total != null ? formatMoney(bk.total, bk.currency) : '—';
  const childAges = Array.isArray(bk.child_ages) && bk.child_ages.length ? ` (ages: ${bk.child_ages.join(', ')})` : '';
  const guests = `${guestCountLabel(bk.adults, bk.children)}${childAges}`;
  const via = bk.channel_name || bk.channel || 'Direct';
  const payment = paymentLabel(bk);
  const balanceDue = balanceDueNote(bk);
  const lines = [
    `New booking via ${via}.`,
    '',
    `Confirmation: ${bk.ref}`,
    `Guest: ${bk.guest_name || '—'}`,
    `Guest email: ${bk.guest_email || '—'}`,
    `Guest phone: ${bk.guest_phone || '—'}`,
    `Room: ${bk.room || '—'}`,
    `Check-in: ${formatCheckDate(bk.check_in, CHECKIN_TIME)}`,
    `Check-out: ${formatCheckDate(bk.check_out, CHECKOUT_TIME)}`,
    `Nights: ${bk.nights}`,
    `Guests: ${guests}`,
    `Room preference: ${smokingLabel(bk)}`,
    `Breakfast: ${breakfastLabel(bk)}`,
    ...(bk.extra_bed ? ['Extra bed: Yes'] : []),
    ...(bk.special_requests ? [`Special requests: ${bk.special_requests}`] : []),
    `Total: ${money}`,
    ...(payment ? [`Payment: ${payment}`] : []),
    ...(balanceDue ? ['', balanceDue.text] : []),
    '',
    'This reservation is now in the Guest Booking inbox of the staff console.',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html = T.wrap({
    // Staff scan these in a list, so the preview line has to carry the two
    // facts that decide whether it needs opening now: who, and when they arrive.
    preheader: `${bk.guest_name || 'Guest'} · ${formatCheckDate(bk.check_in, CHECKIN_TIME)} · ${bk.ref}`,
    accent: T.BRAND.gold,
    footer: emailFooterHtml(),
    body:
      T.heading(`New booking via ${via}`) +
      T.refBlock('Confirmation', bk.ref) +
      T.table(
        // Guest name, email and phone come straight from the public booking
        // form. T.row() escapes them; before this template existed they were
        // interpolated raw, so a booking made under a name containing markup
        // rendered as live HTML inside this very message — a credible place
        // to hide a link, since the mail genuinely comes from the hotel.
        T.row('Guest', bk.guest_name || '—', { strong: true }) +
        T.row('Guest email', bk.guest_email || '—') +
        T.row('Guest phone', bk.guest_phone || '—') +
        T.row('Room', bk.room || '—') +
        T.row('Check-in', formatCheckDate(bk.check_in, CHECKIN_TIME)) +
        T.row('Check-out', formatCheckDate(bk.check_out, CHECKOUT_TIME)) +
        T.row('Nights', bk.nights) +
        T.row('Guests', guests) +
        T.row('Room preference', smokingLabel(bk)) +
        T.row('Breakfast', breakfastLabel(bk)) +
        (bk.extra_bed ? T.row('Extra bed', 'Yes') : '') +
        (bk.special_requests ? T.row('Special requests', bk.special_requests) : '') +
        T.row('Total', money, { strong: true }) +
        (payment ? T.row('Payment', payment) : '')
      ) +
      (balanceDue ? T.notice('due', balanceDue.text) : '') +
      T.paragraph('This reservation is now in the Guest Booking inbox of the staff console.', { small: true, muted: true }),
  });
  return { text, html };
}

// Some inboxes (Yahoo, Outlook, etc.) route new senders to spam even on a
// verified domain until enough mail has been exchanged to build sender
// reputation — so every guest-facing confirmation proactively tells the
// guest where to look instead of relying on them to think of it.
const SPAM_NOTE_TEXT =
  "Can't find this email later, or missing a reply from us? Please check your spam/junk folder — and consider adding us to your contacts.";
const SPAM_NOTE_HTML =
  '<p style="color:#888;font-size:0.85rem">Can\'t find this email later, or missing a reply from us? Please check your <strong>spam/junk folder</strong> — and consider adding us to your contacts.</p>';

function confirmationEmail(bk) {
  const L = EMAIL_I18N[bk.lang] || EMAIL_I18N.en;
  const money = bk.total != null ? formatMoney(bk.total, bk.currency) : '—';
  const payment = guestPaymentLabel(bk, L);
  const paidOnline = isOnlineProvider(bk.payment_provider) && bk.payment_status === 'paid';
  const awaitingOnline = isOnlineProvider(bk.payment_provider) && bk.payment_status === 'pending';
  const balanceDueMoney = (bk.payment_method === 'pay_at_checkin' && bk.payment_status === 'pending' && bk.total != null)
    ? formatMoney(bk.total, bk.currency) : null;
  const smokingText = bk.smoking_preference === 'smoking' ? L.smoking : L.nonSmoking;
  const breakfastText = bk.breakfast ? L.yes : L.no;
  const lines = [
    L.greeting(bk.guest_name),
    '',
    L.intro,
    '',
    `${L.confirmation}: ${bk.ref}`,
    `${L.room}: ${bk.room || '—'}`,
    `${L.checkin}: ${formatCheckDate(bk.check_in, CHECKIN_TIME)}`,
    `${L.checkout}: ${formatCheckDate(bk.check_out, CHECKOUT_TIME)}`,
    `${L.nights}: ${bk.nights}`,
    `${L.guests}: ${L.adultsChildren(bk.adults, bk.children)}${L.childAgesSuffix(bk.child_ages)}`,
    `${L.roomPref}: ${smokingText}`,
    `${L.breakfast}: ${breakfastText}`,
    ...(bk.extra_bed ? [`${L.extraBed}: ${L.yes}`] : []),
    ...(bk.special_requests ? [`${L.specialRequests}: ${bk.special_requests}`] : []),
    `${L.total}: ${money}`,
    ...(payment ? [`${L.payment}: ${payment}`] : []),
    // Whichever payment-outcome note applies sits directly next to the
    // deposit note below it — a guest who just paid online in full is
    // exactly the person most likely to skim past a policy line that isn't
    // right next to the "you're paid up" message.
    ...(paidOnline ? ['', L.paidOnline(money)] : []),
    ...(awaitingOnline ? ['', L.awaitingOnlinePayment(money)] : []),
    ...(balanceDueMoney ? ['', L.balanceDue(balanceDueMoney)] : []),
    ...(bk.non_refundable ? ['', L.nonRefundableNote] : []),
    '',
    L.depositNote,
    '',
    L.closing,
    '',
    L.spamNote,
    '',
    'J Park Hotel, Chonburi',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html = T.wrap({
    // The inbox preview line. Says what happened and names the reference, so
    // the message is identifiable without opening it.
    preheader: `${L.confirmation}: ${bk.ref} · ${formatCheckDate(bk.check_in, CHECKIN_TIME)}`,
    footer: emailFooterHtml(),
    body:
      T.heading(L.heading) +
      T.paragraph(L.greeting(bk.guest_name)) +
      T.paragraph(L.intro) +
      T.refBlock(L.confirmation, bk.ref) +
      T.table(
        T.row(L.room, bk.room || '—', { strong: true }) +
        T.row(L.checkin, formatCheckDate(bk.check_in, CHECKIN_TIME)) +
        T.row(L.checkout, formatCheckDate(bk.check_out, CHECKOUT_TIME)) +
        T.row(L.nights, bk.nights) +
        T.row(L.guests, `${L.adultsChildren(bk.adults, bk.children)}${L.childAgesSuffix(bk.child_ages)}`) +
        T.row(L.roomPref, smokingText) +
        T.row(L.breakfast, breakfastText) +
        (bk.extra_bed ? T.row(L.extraBed, L.yes) : '') +
        (bk.special_requests ? T.row(L.specialRequests, bk.special_requests) : '') +
        T.row(L.total, money, { strong: true }) +
        (payment ? T.row(L.payment, payment) : '')
      ) +
      (paidOnline ? T.notice('paid', L.paidOnline(money), { strong: true }) : '') +
      (awaitingOnline ? T.notice('pending', L.awaitingOnlinePayment(money)) : '') +
      (balanceDueMoney ? T.notice('due', L.balanceDue(balanceDueMoney)) : '') +
      (bk.non_refundable ? T.notice('alert', L.nonRefundableNote, { strong: true }) : '') +
      T.notice('warn', L.depositNote) +
      T.divider() +
      T.paragraph(L.closing) +
      T.paragraph(L.spamNote, { small: true, muted: true }),
  });
  return { text, html };
}

// Guest confirmation for a MULTI-ROOM ("group") booking. `rows` are all the
// guest_bookings rows sharing one group_ref (one per room), ordered by
// group_index. They share lang/guest/dates/special_requests; each carries its
// own room/occupancy/breakfast/smoking/total. Renders one line-item per room,
// then a grand total = the SUM of the authoritative per-room totals — the same
// numbers computeTotal() charged each row, never a re-derived figure. Localized
// (all 5 langs) exactly like the single-room confirmationEmail().
function groupConfirmationEmail(rows) {
  const first = rows[0];
  const L = EMAIL_I18N[first.lang] || EMAIL_I18N.en;
  const n = rows.length;
  const currency = first.currency || 'THB';
  const grand = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const grandMoney = formatMoney(grand, currency);
  const balanceDueMoney = (first.payment_method === 'pay_at_checkin' && first.payment_status === 'pending')
    ? grandMoney : null;
  const paidOnline = isOnlineProvider(first.payment_provider) && first.payment_status === 'paid';
  const awaitingOnline = isOnlineProvider(first.payment_provider) && first.payment_status === 'pending';
  const payment = guestPaymentLabel(first, L);
  const roomMoney = (r) => (r.total != null ? formatMoney(r.total, currency) : '—');

  const roomTextBlock = (r, i) => {
    const smokingText = r.smoking_preference === 'smoking' ? L.smoking : L.nonSmoking;
    return [
      `— ${L.roomLabel(i + 1)}: ${r.room || '—'}`,
      `    ${L.guests}: ${L.adultsChildren(r.adults, r.children)}${L.childAgesSuffix(r.child_ages)}`,
      `    ${L.roomPref}: ${smokingText}`,
      `    ${L.breakfast}: ${r.breakfast ? L.yes : L.no}`,
      ...(r.extra_bed ? [`    ${L.extraBed}: ${L.yes}`] : []),
      `    ${L.subtotal}: ${roomMoney(r)}`,
    ].join('\n');
  };

  const lines = [
    L.greeting(first.guest_name),
    '',
    L.intro,
    '',
    `${L.confirmation}: ${first.group_ref} (${L.roomsSummary(n)})`,
    `${L.checkin}: ${formatCheckDate(first.check_in, CHECKIN_TIME)}`,
    `${L.checkout}: ${formatCheckDate(first.check_out, CHECKOUT_TIME)}`,
    `${L.nights}: ${first.nights}`,
    '',
    ...rows.map((r, i) => roomTextBlock(r, i)),
    '',
    `${L.grandTotal}: ${grandMoney}`,
    ...(payment ? [`${L.payment}: ${payment}`] : []),
    ...(first.special_requests ? [`${L.specialRequests}: ${first.special_requests}`] : []),
    ...(paidOnline ? ['', L.paidOnline(grandMoney)] : []),
    ...(awaitingOnline ? ['', L.awaitingOnlinePayment(grandMoney)] : []),
    ...(balanceDueMoney ? ['', L.balanceDue(balanceDueMoney)] : []),
    ...(first.non_refundable ? ['', L.nonRefundableNote] : []),
    '',
    L.depositNoteMulti(n),
    '',
    L.closing,
    '',
    L.spamNote,
    '',
    'J Park Hotel, Chonburi',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;

  const roomRowsHtml = rows.map((r, i) => {
    const smokingText = r.smoking_preference === 'smoking' ? L.smoking : L.nonSmoking;
    return (
      `<tr><td colspan="2" style="padding:16px 0 5px;border-top:1px solid ${T.BRAND.hairline};font-family:${T.FONT};font-size:14px;color:${T.BRAND.teal};font-weight:600">${escapeHtml(L.roomLabel(i + 1))} — ${escapeHtml(r.room || '—')}</td></tr>` +
      T.row(L.guests, `${L.adultsChildren(r.adults, r.children)}${L.childAgesSuffix(r.child_ages)}`) +
      T.row(L.roomPref, smokingText) +
      T.row(L.breakfast, r.breakfast ? L.yes : L.no) +
      (r.extra_bed ? T.row(L.extraBed, L.yes) : '') +
      T.row(L.subtotal, roomMoney(r))
    );
  }).join('');

  const html =
    T.wrap({
      preheader: `${L.confirmation}: ${first.group_ref} · ${L.roomsSummary(n)}`,
      footer: emailFooterHtml(),
      body:
        T.heading(L.heading) +
        T.paragraph(L.greeting(first.guest_name)) +
        T.paragraph(L.intro) +
        T.refBlock(`${L.confirmation} (${L.roomsSummary(n)})`, first.group_ref) +
        T.table(
          T.row(L.checkin, formatCheckDate(first.check_in, CHECKIN_TIME)) +
          T.row(L.checkout, formatCheckDate(first.check_out, CHECKOUT_TIME)) +
          T.row(L.nights, first.nights) +
          roomRowsHtml +
          T.row(T.raw(`<span style="color:${T.BRAND.teal};font-weight:600">${escapeHtml(L.grandTotal)}</span>`), grandMoney, { strong: true }) +
          (payment ? T.row(L.payment, payment) : '') +
          (first.special_requests ? T.row(L.specialRequests, first.special_requests) : '')
        ) +
        (paidOnline ? T.notice('paid', L.paidOnline(grandMoney), { strong: true }) : '') +
        (awaitingOnline ? T.notice('pending', L.awaitingOnlinePayment(grandMoney)) : '') +
        (balanceDueMoney ? T.notice('due', L.balanceDue(balanceDueMoney)) : '') +
        (first.non_refundable ? T.notice('alert', L.nonRefundableNote, { strong: true }) : '') +
        T.notice('warn', L.depositNoteMulti(n)) +
        T.divider() +
        T.paragraph(L.closing) +
        T.paragraph(L.spamNote, { small: true, muted: true }),
    });
  return { text, html };
}

// Front-desk notice for a multi-room booking (English, like hotelNotice()).
function groupHotelNotice(rows) {
  const first = rows[0];
  const n = rows.length;
  const currency = first.currency || 'THB';
  const grand = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const via = first.channel_name || first.channel || 'Direct';
  const roomMoney = (r) => (r.total != null ? formatMoney(r.total, currency) : '—');
  const roomLine = (r, i) => {
    const childAges = Array.isArray(r.child_ages) && r.child_ages.length ? ` (ages: ${r.child_ages.join(', ')})` : '';
    return `  Room ${i + 1}: ${r.room || '—'} — ${guestCountLabel(r.adults, r.children)}${childAges}, `
      + `${smokingLabel(r)}, breakfast: ${breakfastLabel(r)}${r.extra_bed ? ', extra bed' : ''}, ${roomMoney(r)}`;
  };
  const lines = [
    `New ${n}-room booking via ${via}.`,
    '',
    `Confirmation: ${first.group_ref}`,
    `Guest: ${first.guest_name || '—'}`,
    `Guest email: ${first.guest_email || '—'}`,
    `Guest phone: ${first.guest_phone || '—'}`,
    `Check-in: ${formatCheckDate(first.check_in, CHECKIN_TIME)}`,
    `Check-out: ${formatCheckDate(first.check_out, CHECKOUT_TIME)}`,
    `Nights: ${first.nights}`,
    '',
    'Rooms:',
    ...rows.map((r, i) => roomLine(r, i)),
    '',
    ...(first.special_requests ? [`Special requests: ${first.special_requests}`, ''] : []),
    `Grand total (all rooms): ${grand} ${currency}`,
    '',
    'This reservation is now in the Guest Booking inbox of the staff console.',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const roomRowsHtml = rows.map((r, i) => {
    const childAges = Array.isArray(r.child_ages) && r.child_ages.length ? ` (ages: ${escapeHtml(r.child_ages.join(', '))})` : '';
    return T.row(`Room ${i + 1}`, `${r.room || '—'} — ${guestCountLabel(r.adults, r.children)}${childAges}, ${smokingLabel(r)}, breakfast: ${breakfastLabel(r)}${r.extra_bed ? ', extra bed' : ''}, ${roomMoney(r)}`);
  }).join('');
  const html =
    T.wrap({
      preheader: `${first.guest_name || 'Guest'} · ${n} rooms · ${formatCheckDate(first.check_in, CHECKIN_TIME)}`,
      accent: T.BRAND.gold,
      footer: emailFooterHtml(),
      body:
        T.heading(`New ${n}-room booking via ${via}`) +
        T.refBlock('Confirmation', first.group_ref) +
        T.table(
          T.row('Guest', first.guest_name || '—', { strong: true }) +
          T.row('Guest email', first.guest_email || '—') +
          T.row('Guest phone', first.guest_phone || '—') +
          T.row('Check-in', formatCheckDate(first.check_in, CHECKIN_TIME)) +
          T.row('Check-out', formatCheckDate(first.check_out, CHECKOUT_TIME)) +
          T.row('Nights', first.nights) +
          roomRowsHtml +
          (first.special_requests ? T.row('Special requests', first.special_requests) : '') +
          T.row(T.raw(`<span style="color:${T.BRAND.teal};font-weight:600">Grand total</span>`), formatMoney(grand, currency), { strong: true })
        ) +
        T.paragraph('This reservation is now in the Guest Booking inbox of the staff console.', { small: true, muted: true }),
    });
  return { text, html };
}

// Guest-facing cancellation notice. Deliberately generic — the staff-entered
// cancellation reason (if any) is internal shorthand for front-desk handoff,
// not guest-facing copy, so it is never included here.
function cancellationEmail(bk) {
  // When this booking is one room of a multi-room group, make crystal-clear
  // that ONLY this room is cancelled and the guest's other rooms are unaffected
  // — and reference the group's confirmation number they actually hold.
  const grouped = !!bk.group_ref;
  const confValue = grouped ? bk.group_ref : bk.ref;
  const roomValue = grouped && bk.group_index && bk.group_size
    ? `${bk.room || '—'} (Room ${bk.group_index} of ${bk.group_size})`
    : (bk.room || '—');
  const intro = grouped
    ? 'This is to confirm that one room of your booking at J Park Hotel, Chonburi has been cancelled. Any other rooms in the same booking remain confirmed.'
    : 'This is to confirm that your reservation at J Park Hotel, Chonburi has been cancelled.';
  // A room actually charged online (card or PromptPay) really did take real
  // money — unlike every other booking, which never collected anything
  // online — so the refund line must not claim there's nothing to refund.
  // See cancellationRefundLine() above for what it now says, and why one
  // shared function produces it for the text and HTML bodies alike.
  const wasPaidOnline = isOnlineProvider(bk.payment_provider) && bk.payment_status === 'paid';
  const money = bk.total != null ? formatMoney(bk.total, bk.currency) : 'the amount';
  const refundLine = cancellationRefundLine(wasPaidOnline, money);
  const lines = [
    `Dear ${bk.guest_name || 'Guest'},`,
    '',
    intro,
    '',
    `Confirmation: ${confValue}`,
    `Room: ${roomValue}`,
    `Check-in: ${bk.check_in}`,
    `Check-out: ${bk.check_out}`,
    '',
    refundLine,
    '',
    'If this cancellation was made in error, or you would like to make a new reservation, please reply to this email or call us.',
    '',
    'J Park Hotel, Chonburi',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html =
    T.wrap({
      preheader: `Cancelled · ${confValue}`,
      accent: '#b45309',
      footer: emailFooterHtml(),
      body:
        T.heading(grouped ? 'One room of your booking has been cancelled' : 'Your reservation has been cancelled') +
        T.paragraph(`Dear ${bk.guest_name || 'Guest'},`) +
        T.paragraph(intro) +
        T.refBlock('Confirmation', confValue) +
        T.table(
          T.row('Room', roomValue) +
          T.row('Check-in', formatPlainDate(bk.check_in)) +
          T.row('Check-out', formatPlainDate(bk.check_out))
        ) +
        T.notice(wasPaidOnline ? 'alert' : 'info', refundLine) +
        T.divider() +
        T.paragraph('If this cancellation was made in error, or you would like to make a new reservation, please reply to this email or call us.'),
    });
  return { text, html };
}

// Guest-facing notice when an ENTIRE multi-room booking is cancelled at once
// (staff "Cancel entire booking" → POST /group/:groupRef/cancel). One email
// for the whole group instead of one per room. `rows` are the rooms that were
// cancelled, ordered by group_index.
function groupCancellationEmail(rows) {
  const first = rows[0];
  const roomLines = rows.map((r, i) => `  Room ${r.group_index || i + 1}: ${r.room || '—'}`);
  // Every room in a group shares one gateway charge, so checking the first row
  // is representative of the whole group's payment outcome.
  const wasPaidOnline = isOnlineProvider(first.payment_provider) && first.payment_status === 'paid';
  const grand = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const grandMoney = formatMoney(grand, first.currency);
  const refundLine = cancellationRefundLine(wasPaidOnline, grandMoney);
  const lines = [
    `Dear ${first.guest_name || 'Guest'},`,
    '',
    `This is to confirm that your entire booking at J Park Hotel, Chonburi (${rows.length} rooms) has been cancelled.`,
    '',
    `Confirmation: ${first.group_ref}`,
    `Check-in: ${first.check_in}`,
    `Check-out: ${first.check_out}`,
    'Rooms cancelled:',
    ...roomLines,
    '',
    refundLine,
    '',
    'If this cancellation was made in error, or you would like to make a new reservation, please reply to this email or call us.',
    '',
    'J Park Hotel, Chonburi',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const roomRowsHtml = rows.map((r, i) =>
    T.row(`Room ${r.group_index || i + 1}`, r.room || '—')
  ).join('');
  const html =
    T.wrap({
      preheader: `Cancelled · ${first.group_ref} · ${rows.length} rooms`,
      accent: '#b45309',
      footer: emailFooterHtml(),
      body:
        T.heading('Your booking has been cancelled') +
        T.paragraph(`Dear ${first.guest_name || 'Guest'},`) +
        T.paragraph(`This is to confirm that your entire booking at J Park Hotel, Chonburi (${rows.length} rooms) has been cancelled.`) +
        T.refBlock('Confirmation', first.group_ref) +
        T.table(
          T.row('Check-in', formatPlainDate(first.check_in)) +
          T.row('Check-out', formatPlainDate(first.check_out)) +
          roomRowsHtml
        ) +
        T.notice(wasPaidOnline ? 'alert' : 'info', refundLine) +
        T.divider() +
        T.paragraph('If this cancellation was made in error, or you would like to make a new reservation, please reply to this email or call us.'),
    });
  return { text, html };
}

// ── Payment-confirmed follow-ups (PromptPay, post-webhook) ──────────────────
// A card charge resolves synchronously, so the very first confirmation email
// already says "paid" — no follow-up needed. PromptPay does not: the guest
// may well have closed the browser before scanning, so payments.js's webhook
// handler calls sendPaymentConfirmedEmail()/sendGroupPaymentConfirmedEmail()
// once the gateway confirms the charge, to close the loop for BOTH the guest (who
// might otherwise never learn their payment went through) and the front desk
// (who saw the original booking notice arrive as "awaiting confirmation" and
// would otherwise have no signal that it later resolved).

function paymentConfirmedEmail(bk) {
  const L = EMAIL_I18N[bk.lang] || EMAIL_I18N.en;
  const money = bk.total != null ? formatMoney(bk.total, bk.currency) : '—';
  const lines = [
    L.greeting(bk.guest_name),
    '',
    L.paidOnline(money),
    '',
    `${L.confirmation}: ${bk.ref}`,
    '',
    L.depositNote,
    '',
    L.closing,
    '',
    L.spamNote,
    '',
    'J Park Hotel, Chonburi',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html =
    T.wrap({
      preheader: `${L.paidOnline(money)}`,
      footer: emailFooterHtml(),
      body:
        T.heading(L.paymentConfirmedHeading) +
        T.paragraph(L.greeting(bk.guest_name)) +
        T.notice('paid', L.paidOnline(money), { strong: true }) +
        T.refBlock(L.confirmation, bk.ref) +
        T.notice('warn', L.depositNote) +
        T.divider() +
        T.paragraph(L.closing) +
        T.paragraph(L.spamNote, { small: true, muted: true }),
    });
  return { text, html };
}

function groupPaymentConfirmedEmail(rows) {
  const first = rows[0];
  const L = EMAIL_I18N[first.lang] || EMAIL_I18N.en;
  const n = rows.length;
  const grandMoney = formatMoney(rows.reduce((s, r) => s + Number(r.total || 0), 0), first.currency);
  const lines = [
    L.greeting(first.guest_name),
    '',
    L.paidOnline(grandMoney),
    '',
    `${L.confirmation}: ${first.group_ref} (${L.roomsSummary(n)})`,
    '',
    L.depositNoteMulti(n),
    '',
    L.closing,
    '',
    L.spamNote,
    '',
    'J Park Hotel, Chonburi',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html =
    T.wrap({
      preheader: L.paidOnline(grandMoney),
      footer: emailFooterHtml(),
      body:
        T.heading(L.paymentConfirmedHeading) +
        T.paragraph(L.greeting(first.guest_name)) +
        T.notice('paid', L.paidOnline(grandMoney), { strong: true }) +
        T.refBlock(`${L.confirmation} (${L.roomsSummary(n)})`, first.group_ref) +
        T.notice('warn', L.depositNoteMulti(n)) +
        T.divider() +
        T.paragraph(L.closing) +
        T.paragraph(L.spamNote, { small: true, muted: true }),
    });
  return { text, html };
}

/* ── The payment detail block, shared by every hotel-facing email ────────
   One builder, so the "payment confirmed" notice, the group notice, the
   failed-payment notice and the daily report cannot drift into describing the
   same charge three different ways.

   English only, deliberately: these go to the hotel's own inbox, not to a
   guest. Every guest-facing template stays in its five languages, untouched.

   Nothing here pre-escapes. T.row/T.notice/T.paragraph all run their
   arguments through render(), which escapes unless handed T.raw() — so
   escaping here would double-escape and print &amp;#39; at a front desk. That
   matters more than usual on one field: card.name is the cardholder name as
   typed by whoever used the card, which makes it the only value in a payment
   record chosen by a stranger. */
function paymentDetailFields(detail, bk) {
  if (!detail) return [];
  const money = (v) => (v == null ? null : formatMoney(v, detail.currency || (bk && bk.currency) || 'THB'));
  const card = detail.card || {};
  const settle = detail.settlement || {};
  const fields = [];
  const add = (label, value) => { if (value != null && value !== '') fields.push([label, String(value)]); };

  add('Amount charged', money(detail.amount));
  add('Gateway fee', detail.fee == null ? null
    : money(detail.fee) + (detail.feeVat != null ? ` (+ ${money(detail.feeVat)} VAT)` : ''));
  // The number that will actually appear on the hotel's bank statement — the
  // most useful line here, and the one nothing in this system could answer
  // before.
  add('Net to the hotel', money(detail.net));
  add('Refunded', detail.refundedAmount ? money(detail.refundedAmount) : null);

  add('Paid by', card.last4
    ? `${card.brand || 'Card'} •••• ${card.last4}`
    : (detail.method === 'promptpay' ? 'PromptPay QR' : detail.method));
  add('Card expiry', card.expiry);
  add('Cardholder', card.name);
  add('Issuing bank', card.bank ? card.bank + (card.country ? ` (${card.country})` : '') : null);
  add('Card type', card.funding);
  add('3-D Secure', detail.threeDS === 'not_required' ? 'Not required by the bank'
    : detail.threeDS === 'passed' ? 'Passed'
    : detail.threeDS === 'pending' ? 'Started but not completed'
    : detail.threeDS === 'failed' ? 'Not completed' : null);

  // When the guest paid, and — separately — when the hotel actually gets it.
  add('Guest paid at', PD.formatBangkok(detail.paidAt, { seconds: true }));
  add('Clears the hold', PD.formatBangkok(settle.transferableAt));
  add('Paid into the bank', PD.formatBangkok(settle.paidAt));
  if (settle.transferId) {
    add('Bank transfer', settle.bank
      ? `${settle.transferId} → ${settle.bank}${settle.last4 ? ' ••••' + settle.last4 : ''}`
      : settle.transferId);
  }

  add('Gateway charge id', detail.chargeId);
  add('Gateway transaction id', detail.transactionId);
  if (detail.failure) add('Failure reason', detail.failure.text || detail.failure.message || detail.failure.code);
  return fields;
}

function paymentDetailLines(detail, bk) {
  return paymentDetailFields(detail, bk).map(([k, v]) => `${k}: ${v}`);
}

function paymentDetailRows(detail, bk) {
  return paymentDetailFields(detail, bk).map(([k, v]) => T.row(k, v)).join('');
}

/* An unmissable warning when the gateway is running on TEST keys.

   A test charge is identical to a real one in every field a person looks at —
   same amount, same card, same "paid" banner, same confirmation email — and
   the only thing separating them is a boolean nobody would think to check.
   Unsaid, the hotel's own accounts would count play money as income. */
function testModeNoticeText(detail) {
  if (!detail || detail.livemode !== false) return null;
  return 'TEST MODE — no money moved. This charge was made against the payment gateway’s test keys.';
}

function testModeNoticeHtml(detail) {
  const t = testModeNoticeText(detail);
  return t ? T.notice('alert', t, { strong: true }) : '';
}

/* ── When a card is refused ──────────────────────────────────────────────
   Nothing in this system used to say this out loud. A declined charge rolls
   back its transaction, returns a kind sentence to the guest, and leaves. The
   hotel found out by logging into the acquirer's dashboard and reading a
   percentage.

   But a guest whose card was refused is a guest who WANTED to book. Somebody
   should be able to call them back — which means knowing it happened, who
   they are, and what the bank actually said. */
function paymentDeclinedHotelNotice(a) {
  const failure = a.failure || {};
  const detail = a.detail || null;
  const card = (detail && detail.card) || {};
  const cardLine = card.last4
    ? `${card.brand || 'Card'} •••• ${card.last4}`
    : (a.method === 'promptpay' ? 'PromptPay' : 'Card');
  const money = a.amount != null ? formatMoney(a.amount, 'THB') : '—';
  const reason = failure.text || failure.message || failure.code || 'The gateway gave no reason.';

  const rows = [
    ['Guest', [a.guestName, a.guestEmail, a.guestPhone].filter(Boolean).join(' · ') || '—'],
    // The room TYPE, not a room number — no room is assigned at booking time.
    ['Room type', a.room || '—'],
    ['Dates', a.checkIn && a.checkOut ? `${a.checkIn} → ${a.checkOut}` : '—'],
    ['Amount attempted', money],
    ['Paid by', cardLine],
    ['Issuing bank', card.bank ? card.bank + (card.country ? ` (${card.country})` : '') : '—'],
    ['Reason', reason],
    ['Gateway code', failure.code || '—'],
    ['Reference offered', a.bookingRef || '—'],
  ];

  const lines = [
    'A guest tried to pay and their bank refused the payment.',
    '',
    'NO BOOKING WAS CREATED. The room is still available, and the guest has not been charged.',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'If you can reach them: most declines of this kind are fixed by the guest',
    'switching on online or overseas payments in their banking app, or by using',
    'a different card. You can also take the booking over the phone.',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html = T.wrap({
    preheader: `Card declined · ${money} · ${a.guestName || 'guest'}`,
    accent: T.BRAND.gold,
    footer: emailFooterHtml(),
    body:
      T.heading('A guest’s card was declined') +
      T.notice('alert', reason, { strong: true }) +
      testModeNoticeHtml(detail) +
      T.paragraph(T.raw('<strong>No booking was created.</strong> The room is still available, and the guest has not been charged.')) +
      T.table(rows.map(([k, v]) => T.row(k, v)).join('')) +
      T.paragraph('Most declines of this kind are fixed by the guest switching on online or overseas payments in their banking app, or by trying a different card. You can also take the booking over the phone.', { small: true, muted: true }),
  });
  return { text, html };
}

/* A card-testing script can produce hundreds of declines a minute, and an
   inbox buried under them is an inbox nobody reads — including for the one
   real guest whose payment failed. One notice per guest per hour, plus a
   global ceiling.

   A ceiling rather than a queue, on purpose: nobody wants the backlog later. */
const declineNoticeLimiter = makeLimiter(1, 60 * 60 * 1000);
const declineNoticeGlobalLimiter = makeLimiter(12, 60 * 60 * 1000);

function sendDeclinedAttemptNotice(a) {
  try {
    // A gateway that could not be reached is an outage, not a guest whose card
    // failed. Staff can do nothing about it, and it is already logged.
    if (a && a.failure && a.failure.code === 'gateway_unreachable') return;
    const key = String((a && (a.guestEmail || a.bookingRef)) || 'unknown').toLowerCase();
    if (declineNoticeLimiter(key)) return;
    if (declineNoticeGlobalLimiter('all')) return;
    const to = hotelRecipients();
    if (!to.length) return;
    const { text, html } = paymentDeclinedHotelNotice(a || {});
    sendEmail({
      to,
      subject: `Card declined — ${(a && a.guestName) || 'guest'} (${(a && a.bookingRef) || 'no ref'})`,
      text,
      html,
    }).catch((err) => console.error('[guest-bookings] declined-attempt notice error', err));
  } catch (e) {
    console.error('[guest-bookings] declined-attempt notice failed', e);
  }
}

/* The other half of that gap: a payment that WAS in flight and then didn't
   make it — an abandoned 3-D Secure challenge, a PromptPay QR that expired.

   Unlike a decline, the booking exists here: it was written the moment the
   charge was accepted as pending, so the room is held and the guest is
   expected to arrive. They simply have not paid, and the front desk needs to
   know to collect on arrival rather than waving them through as prepaid. */
function paymentFailedHotelNotice(bk, detail) {
  const money = bk.total != null ? formatMoney(bk.total, bk.currency) : '—';
  const failure = (detail && detail.failure) || {};
  const reason = failure.text || failure.message || 'The payment did not complete.';
  const rows = [
    ['Guest', bk.guest_name || '—'],
    ['Booking', bk.ref || '—'],
    ['Room type', bk.room || '—'],
    ['Dates', bk.check_in && bk.check_out
      ? `${String(bk.check_in).slice(0, 10)} → ${String(bk.check_out).slice(0, 10)}` : '—'],
    ['Amount outstanding', money],
    ['Reason', reason],
    ['Gateway charge id', bk.payment_charge_id || '—'],
  ];
  const lines = [
    `The online payment for booking ${bk.ref} did not complete.`,
    '',
    'THE RESERVATION STILL STANDS — the room is held and the guest is expected.',
    'Collect payment at check-in.',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html = T.wrap({
    preheader: `Payment not completed · ${money} · ${bk.ref}`,
    accent: T.BRAND.gold,
    footer: emailFooterHtml(),
    body:
      T.heading(`Payment not completed — ${bk.ref}`) +
      T.notice('warn', reason, { strong: true }) +
      T.paragraph(T.raw('<strong>The reservation still stands.</strong> The room is held and the guest is expected — collect payment at check-in.')) +
      T.table(rows.map(([k, v]) => T.row(k, v)).join('')),
  });
  return { text, html };
}

function sendPaymentFailedEmail(bk, detail) {
  const to = hotelRecipients();
  if (!to.length) return;
  const { text, html } = paymentFailedHotelNotice(bk, detail);
  sendEmail({
    to,
    subject: `Payment not completed — ${bk.ref}`,
    text,
    html,
  }).catch((err) => console.error('[guest-bookings] payment-failed notice error', err));
}

// Front-desk follow-up (English, like hotelNotice()) — the accounting
// paper-trail piece: the original booking notice showed this as "awaiting
// PromptPay confirmation," so staff need a second, distinctly-subjected
// email once it actually resolves, rather than having to notice a status
// change themselves.
function paymentConfirmedHotelNotice(bk, detail) {
  const money = bk.total != null ? formatMoney(bk.total, bk.currency) : '—';
  const method = bk.payment_method === 'card' ? 'Card' : bk.payment_method === 'promptpay' ? 'PromptPay' : (bk.payment_provider || 'Online');
  // The full gateway answer, if we have it. `detail` is passed in by the
  // caller that just spoke to the gateway; a caller that only has a row
  // rebuilds it from the stored snapshot, so an email sent hours later by the
  // reconciler is as complete as one sent inline.
  const d = detail || detailFromRow(bk);
  const testWarning = testModeNoticeText(d);
  const detailLines = paymentDetailLines(d, bk);
  const lines = [
    `Payment confirmed for booking ${bk.ref}.`,
    ...(testWarning ? ['', testWarning] : []),
    '',
    `Guest: ${bk.guest_name || '—'}`,
    `Room type: ${bk.room || '—'}`,
    `Dates: ${bk.check_in ? String(bk.check_in).slice(0, 10) : '—'} → ${bk.check_out ? String(bk.check_out).slice(0, 10) : '—'}`,
    `Booking total: ${money}`,
    `Method: ${method} (online)`,
    ...(detailLines.length ? ['', '— Payment record —', ...detailLines] : [`Gateway ref: ${bk.payment_charge_id || '—'}`]),
    '',
    'This booking now shows as paid in the Guest Booking inbox of the staff console,',
    'where the full payment record and a printable receipt are available.',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html =
    T.wrap({
      preheader: `Payment confirmed · ${money} · ${bk.ref}`,
      accent: T.BRAND.gold,
      footer: emailFooterHtml(),
      body:
        T.heading(`Payment confirmed — ${bk.ref}`) +
        testModeNoticeHtml(d) +
        T.notice('paid', `${money} received online.`, { strong: true }) +
        T.table(
          T.row('Guest', bk.guest_name || '—', { strong: true }) +
          T.row('Room type', bk.room || '—') +
          T.row('Dates', `${bk.check_in ? String(bk.check_in).slice(0, 10) : '—'} → ${bk.check_out ? String(bk.check_out).slice(0, 10) : '—'}`) +
          T.row('Booking total', money, { strong: true }) +
          T.row('Method', `${method} (online)`) +
          (paymentDetailRows(d, bk) || T.row('Gateway ref', bk.payment_charge_id || '—'))
        ) +
        T.paragraph('This booking now shows as paid in the Guest Booking inbox of the staff console, where the full payment record and a printable receipt are available.', { small: true, muted: true }),
    });
  return { text, html };
}

function groupPaymentConfirmedHotelNotice(rows, detail) {
  const first = rows[0];
  const d = detail || detailFromRow(first);
  const n = rows.length;
  const grand = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const method = first.payment_method === 'card' ? 'Card' : first.payment_method === 'promptpay' ? 'PromptPay' : (first.payment_provider || 'Online');
  const lines = [
    `Payment confirmed for group booking ${first.group_ref} (${n} rooms).`,
    '',
    `Guest: ${first.guest_name || '—'}`,
    `Amount: ${formatMoney(grand, first.currency)}`,
    `Method: ${method} (online)`,
    ...(paymentDetailLines(d, first).length
      ? ['', '— Payment record —', ...paymentDetailLines(d, first)]
      : [`Gateway ref: ${first.payment_charge_id || '—'}`]),
    '',
    'This booking now shows as paid in the Guest Booking inbox of the staff console,',
    'where the full payment record and a printable receipt are available.',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html =
    T.wrap({
      preheader: `Payment confirmed · ${formatMoney(grand, first.currency)} · ${first.group_ref}`,
      accent: T.BRAND.gold,
      footer: emailFooterHtml(),
      body:
        T.heading(`Payment confirmed — ${first.group_ref} (${n} rooms)`) +
        T.notice('paid', `${formatMoney(grand, first.currency)} received online.`, { strong: true }) +
        T.table(
          T.row('Guest', first.guest_name || '—', { strong: true }) +
          T.row('Amount', formatMoney(grand, first.currency), { strong: true }) +
          T.row('Method', `${method} (online)`) +
          // One charge covers the whole group, so the payment record is shown
          // once against the grand total — never per room, which would read as
          // the guest having paid N times.
          (paymentDetailRows(d, first) || T.row('Gateway ref', first.payment_charge_id || '—'))
        ) +
        T.paragraph('This booking now shows as paid in the Guest Booking inbox of the staff console, where the full payment record and a printable receipt are available.', { small: true, muted: true }),
    });
  return { text, html };
}

async function sendPaymentConfirmedEmail(bk, detail) {
  if (bk.guest_email) {
    const { text, html } = paymentConfirmedEmail(bk);
    sendEmail({
      to: bk.guest_email,
      subject: `J Park Hotel — payment confirmed (${bk.ref})`,
      text,
      html,
    }, { bookingId: bk.id, bookingRef: bk.ref, kind: 'payment_confirmed' })
      .then((r) => { if (r.ok) console.log(`[guest-bookings] payment-confirmed emailed to ${bk.guest_email} (${bk.ref})`); })
      .catch((err) => console.error('[guest-bookings] payment-confirmed guest email error', err));
  }
  const to = hotelRecipients();
  if (to.length) {
    const { text, html } = paymentConfirmedHotelNotice(bk, detail);
    sendEmail({
      to,
      subject: `✓ Payment confirmed — ${bk.ref}`,
      text,
      html,
    }).catch((err) => console.error('[guest-bookings] payment-confirmed hotel notice error', err));
  }
}

async function sendGroupPaymentConfirmedEmail(rows, detail) {
  const first = rows[0];
  if (first.guest_email) {
    const { text, html } = groupPaymentConfirmedEmail(rows);
    sendEmail({
      to: first.guest_email,
      subject: `J Park Hotel — payment confirmed (${first.group_ref})`,
      text,
      html,
    }, { bookingId: first.id, bookingRef: first.group_ref, kind: 'payment_confirmed' })
      .catch((err) => console.error('[guest-bookings] group payment-confirmed guest email error', err));
  }
  const to = hotelRecipients();
  if (to.length) {
    const { text, html } = groupPaymentConfirmedHotelNotice(rows, detail);
    sendEmail({
      to,
      subject: `✓ Payment confirmed — ${first.group_ref} (${rows.length} rooms)`,
      text,
      html,
    }).catch((err) => console.error('[guest-bookings] group payment-confirmed hotel notice error', err));
  }
}

// Drops a system-authored broadcast into the internal Messages inbox so a
// cancellation is visible to the whole team on shift handoff — same pattern
// routes/otaSync.js's alertStaff() already uses for its own booking events.
// Idempotent by subject: every system booking notice embeds the booking ref in
// its subject, so an identical notice is posted at most once. Without this the
// OTA auto-cancel/auto-restore flip-flop — and every redeploy re-running the
// boot-time cancellation re-audit — re-flooded the staff announcements with the
// same "Booking auto-cancelled/-restored — Channel (REF)" lines (hundreds of
// duplicates).
async function broadcastStaffMessage(subject, body) {
  const existing = await db.query(
    `SELECT 1 FROM messages WHERE to_all = TRUE AND from_role = 'system' AND subject = $1 LIMIT 1`,
    [subject]
  );
  if (existing.rows.length) return;
  await db.query(
    `INSERT INTO messages (from_id, from_name, from_role, subject, body, to_all)
     VALUES ('system', 'Booking System', 'system', $1, $2, TRUE)`,
    [subject, body]
  );
}

// Shared by POST /:id/cancel (staff-initiated) and ingestGuestBooking()'s
// auto-detect path (an OTA cancellation email arriving for a known ref).
// `actorName` is a staff member's name for a manual cancel, or null for an
// auto-detected one. `wasConfirmed` gates the guest email: only send it when
// the guest had previously been told "confirmed" — a booking that arrives
// already-cancelled (first email ever seen for that ref) never had anything
// to correct, so emailing a cancellation notice for it would just confuse.
function fireCancellationNotice(bk, { actorName, wasConfirmed } = {}) {
  const auto = !actorName;
  if (wasConfirmed && bk.guest_email) {
    const { text, html } = cancellationEmail(bk);
    sendEmail({
      to: bk.guest_email,
      subject: `J Park Hotel — booking cancelled (${bk.ref})`,
      text,
      html,
    }, {
      bookingId: bk.id, bookingRef: bk.ref, kind: 'cancellation',
      sentByName: actorName || 'System (auto-detected)',
    }).then((r) => {
      if (r.ok) console.log(`[guest-bookings] cancellation emailed to ${bk.guest_email} (${bk.ref})`);
      else if (!r.skipped) console.warn(`[guest-bookings] cancellation email failed (${bk.ref}): ${r.error}`);
    }).catch((err) => console.error('[guest-bookings] cancellation email error', err));
  }

  const via = bk.channel_name || bk.channel || 'Direct';
  const subject = auto
    ? `⚠ Booking auto-cancelled — ${via} (${bk.ref})`
    : `Booking cancelled by ${actorName} — ${bk.ref}`;
  const bodyLines = [
    auto
      ? `Detected from an incoming ${via} email — please verify.`
      : `Cancelled by ${actorName}.`,
    `Guest: ${bk.guest_name || '—'}`,
    `Room: ${bk.room || '—'}`,
    `Check-in: ${bk.check_in}`,
    `Check-out: ${bk.check_out}`,
    `Ref: ${bk.ref}`,
    ...(bk.cancellation_reason ? [`Reason: ${bk.cancellation_reason}`] : []),
  ];
  broadcastStaffMessage(subject, bodyLines.join('\n')).catch((err) =>
    console.error('[guest-bookings] cancellation broadcast error', err)
  );
}

function row2js(r) {
  return {
    id: r.id,
    ref: r.ref,
    channel: r.channel,
    channelName: r.channel_name,
    channelEmail: r.channel_email,
    guestName: r.guest_name,
    lastName: r.guest_last_name,
    guestEmail: r.guest_email,
    guestPhone: r.guest_phone,
    room: r.room,
    roomNumber: r.room_number,
    // Which of the five buildings, resolved once at intake (lib/buildings.js).
    // The staff console shows it next to the room on the guest panel and the
    // live-chat identity strip — a room number alone doesn't locate a guest here.
    building: r.building != null ? Number(r.building) : null,
    groupRef: r.group_ref || null,
    groupIndex: r.group_index != null ? Number(r.group_index) : null,
    groupSize: r.group_size != null ? Number(r.group_size) : null,
    checkIn: r.check_in,
    checkOut: r.check_out,
    nights: r.nights,
    adults: r.adults,
    children: r.children,
    childAges: Array.isArray(r.child_ages) ? r.child_ages : [],
    smokingPreference: r.smoking_preference || 'non_smoking',
    breakfast: !!r.breakfast,
    extraBed: !!r.extra_bed,
    nonRefundable: !!r.non_refundable,
    specialRequests: r.special_requests || null,
    total: r.total ? Number(r.total) : null,
    currency: r.currency,
    status: r.status,
    lang: r.lang,
    confirmation: r.confirmation,
    paymentProvider: r.payment_provider,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    paymentChargeId: r.payment_charge_id,
    /* The full gateway record — card, fee, net, settlement, failure reason.

       NULL on every row that came from the polled LIST, and that is
       deliberate, not an oversight: LIST_COLUMNS below does not select these
       columns, so `payment` is only ever populated when a single booking is
       fetched on its own (GET /:id) or by the payments ledger. Twenty-odd
       extra columns multiplied by the whole booking history, on a list the
       staff console polls every ten seconds and then writes to localStorage,
       is the exact shape of the egress that took this API down on
       2026-07-13 — and it would push the console's localStorage toward its
       quota besides.

       So: the board shows the status it always did, and the detail arrives
       when somebody opens the booking. */
    payment: PD.fromColumns(r),
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at).getTime() : null,
    cancelledById: r.cancelled_by_id,
    cancelledByName: r.cancelled_by_name,
    cancellationReason: r.cancellation_reason,
    previousStatus: r.previous_status,
    needsReview: !!r.needs_review,
    starred: !!r.starred,
    staffLabel: r.staff_label || null,
    lastAmendedAt: r.last_amended_at ? new Date(r.last_amended_at).getTime() : null,
    readBy: r.read_by || [],
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
  };
}

/* A booking as a GUEST may see it.

   row2js is written for the staff console, and now carries the whole payment
   record — issuing bank, cardholder name, the hotel's fee and net takings.
   None of that belongs in the body of a PUBLIC, unauthenticated endpoint, and
   three of them return a booking straight to the browser that just made it
   (POST /reservations, POST /reservations/group, POST /dayuse-booking).

   A guest may legitimately be told THAT their payment succeeded — that is
   what the confirmation screen is for — so the status fields stay. What goes
   is the merchant's side of the transaction. */
function row2jsPublic(r) {
  const out = row2js(r);
  delete out.payment;
  return out;
}

/* The staff console polls the booking list every few seconds, so the list
   response must stay lean. `confirmation` (the full raw OTA / guest-confirmation
   email — up to many KB per booking, and it grows with every booking ever made)
   is deliberately EXCLUDED here and fetched on demand via GET /:id only when a
   booking is actually opened or forwarded. Selecting it on every poll is what
   silently ran the Neon free-tier network-transfer allowance up to ~6 GB and
   took the whole API down on 2026-07-13. Keep this list in sync with row2js:
   it is every column row2js reads EXCEPT `confirmation`. */
/* NOTE FOR THE NEXT PERSON ADDING A COLUMN: this list is deliberately NOT
   "every column row2js reads" any more. It is every column row2js reads
   EXCEPT `confirmation` (the raw OTA email) AND except the payment_* detail
   block — both of which are fetched on demand instead. Adding a payment_*
   column here would silently multiply every poll by the whole booking
   history. See the comment on `payment:` in row2js above. */
const LIST_COLUMNS = [
  'id', 'ref', 'channel', 'channel_name', 'channel_email',
  'guest_name', 'guest_last_name', 'guest_email', 'guest_phone',
  'room', 'room_number', 'building', 'group_ref', 'group_index', 'group_size',
  'check_in', 'check_out', 'nights',
  'adults', 'children', 'child_ages', 'smoking_preference', 'breakfast', 'extra_bed',
  'non_refundable',
  'special_requests',
  'total', 'currency', 'status', 'lang',
  'payment_provider', 'payment_method', 'payment_status', 'payment_charge_id',
  'cancelled_at', 'cancelled_by_id', 'cancelled_by_name', 'cancellation_reason',
  'previous_status', 'needs_review', 'starred', 'staff_label', 'last_amended_at',
  'read_by', 'created_at', 'updated_at',
].join(', ');

/* GET /api/guest-bookings
   The staff console polls this constantly. To keep DB network transfer flat as
   the booking history grows, the client passes ?v=<fingerprint> (the version it
   last saw). We first run a CHEAP probe — MAX(updated_at) + COUNT(*) — and if it
   still matches, we answer `{ unchanged: true }` WITHOUT ever selecting the full
   rows, so an idle poll transfers almost nothing. guest_bookings has a BEFORE
   UPDATE trigger bumping updated_at, so this pair changes on any insert, update
   OR delete — no separate deletion tracking needed. Requests with no ?v (legacy
   callers) still get the plain array. This is the durable follow-on to dropping
   the raw `confirmation` column from the list (2026-07-13 outage fix). */
async function bookingsVersion() {
  const { rows } = await db.query(
    `SELECT COALESCE(MAX(updated_at)::text, '') AS m, COUNT(*)::int AS c FROM guest_bookings`
  );
  return rows[0].m + '|' + rows[0].c;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    if (req.query.v !== undefined) {
      const version = await bookingsVersion();
      if (req.query.v === version) return res.json({ unchanged: true, v: version });
      const { rows } = await db.query(
        `SELECT ${LIST_COLUMNS} FROM guest_bookings ORDER BY created_at DESC`
      );
      return res.json({ v: version, bookings: rows.map(row2js) });
    }
    const { rows } = await db.query(
      `SELECT ${LIST_COLUMNS} FROM guest_bookings ORDER BY created_at DESC`
    );
    res.json(rows.map(row2js));
  } catch (e) {
    console.error('[guest-bookings] list', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /api/guest-bookings/:id */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(row2js(rows[0]));
  } catch (e) {
    console.error('[guest-bookings] get', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ---------------------------------------------------------------------------
// OTA / channel-manager switches.
//
// 2026-07-15: the hotel asked for OTA reservations (Agoda, Booking.com,
// Airbnb, Trip.com, Expedia, Traveloka, Hotels.com, generic "other" …) to be
// dropped entirely, because the resulting notices were reaching
// jparkhotel1@gmail.com and could reach guests. That was done with a single
// flag covering BOTH storing the booking and emailing about it.
//
// 2026-07-23: the hotel then asked that OTA guests be able to use guest
// services, the guest portal and live chat, and that the staff see which
// BUILDING each guest is in — which is only knowable from the confirmation
// itself. Both need the reservation to exist in guest_bookings, so the one
// flag is now two:
//
//   STORE_OTA_BOOKINGS — file the reservation, so an OTA guest signs in as a
//     verified guest and their room type + building are known.
//   SEND_OTA_EMAILS    — the part the hotel actually objected to. Stays OFF:
//     no hotel notice, no guest confirmation, for any non-direct booking.
//
// The Guest Bookings inbox is filtered separately in the console
// (SHOW_OTA_BOOKINGS in staff.js), so the list the front desk reads is
// unaffected by storing these. Set STORE_OTA_BOOKINGS back to false to
// restore the 2026-07-15 drop-everything behaviour.
const STORE_OTA_BOOKINGS = true;
const SEND_OTA_EMAILS = false;

// The only kind of booking still processed. payments.js inserts website
// bookings with channel_name "Direct (Website)"; that name is the sole reliable
// marker because normChannel() folds any unrecognized OTA down to the "direct"
// channel column (see the note in staff.js visibleBookings()). Accepts either
// the snake_case DB row or the camelCase intake payload.
const DIRECT_CHANNEL_NAME = 'Direct (Website)';
function isDirectWebsiteBooking(b) {
  return !!b && (b.channel_name === DIRECT_CHANNEL_NAME || b.channelName === DIRECT_CHANNEL_NAME);
}

/* Fire the hotel notice + guest confirmation for a freshly-inserted booking.
   Fire-and-forget: never awaited, never throws into the request path. Only runs
   for a genuinely new, confirmed booking so webhook / re-forward retries
   (ON CONFLICT updates, inserted=false) don't re-send. */
function fireBookingEmails(saved) {
  if (!saved || !saved.inserted || saved.status !== 'confirmed') return;

  // OTA notifications stay disabled — never email the hotel or the guest for a
  // non-direct booking. This is now the ONLY thing stopping those emails: OTA
  // reservations are filed again (STORE_OTA_BOOKINGS) so guest services and
  // the building lookup work, and they reach this function like any other.
  if (!SEND_OTA_EMAILS && !isDirectWebsiteBooking(saved)) {
    console.log(`[guest-bookings] OTA emails disabled — skipped notice/confirmation for ${saved.ref} (${saved.channel_name || saved.channel})`);
    return;
  }

  // 1) Notify the hotel front desk (jparkhotel1@gmail.com) for EVERY booking,
  //    even when the OTA didn't pass a guest email. Mirrors the Guest Booking
  //    entry that staff also see in the console.
  const to = hotelRecipients();
  if (to.length) {
    const { text, html } = hotelNotice(saved);
    sendEmail({
      to,
      subject: `New booking — ${saved.channel_name || saved.channel || 'Direct'} (${saved.ref})`,
      text,
      html,
      replyTo: saved.guest_email || undefined,
    }).then((r) => {
      if (r.ok) console.log(`[guest-bookings] hotel notified at ${to.join(', ')} (${saved.ref})`);
      else if (!r.skipped) console.warn(`[guest-bookings] hotel notice failed (${saved.ref}): ${r.error}`);
    }).catch((err) => console.error('[guest-bookings] hotel notice error', err));
  }

  // 2) Send the guest their confirmation, when the booking carries a guest email.
  if (saved.guest_email) {
    sendGuestConfirmation(saved).catch((err) => console.error('[guest-bookings] email error', err));
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Turns a staff-edited plain-text email body into simple HTML (one <p> per
// blank-line-separated paragraph, <br> for single line breaks within one).
// Used only for the resend-confirmation override path below — the
// auto-generated confirmationEmail()/hotelNotice() templates keep their own
// richer hand-built HTML untouched.
function textToHtml(text) {
  return String(text || '').split(/\n{2,}/).map((para) =>
    '<p>' + escapeHtml(para).replace(/\n/g, '<br>') + '</p>'
  ).join('');
}

// Guest confirmation send, factored out of fireBookingEmails() so the manual
// "Resend confirmation" staff action (POST /:id/resend-confirmation below)
// can reuse the exact same email content instead of duplicating it. Sets a
// Reply-To of the hotel's own inbox — previously unset, so a guest replying
// to their confirmation would silently go to the noreply@ sender address.
// `override` (optional) lets staff hand-edit the subject/body before it goes
// out — e.g. to correct a wrong price shown in the original auto-generated
// confirmation — instead of always re-sending the template verbatim.
// `actor` (optional) is the signed-in staff member manually triggering a
// resend (req.user); omitted for the automatic send on initial booking, so
// email_log can tell the two apart.
async function sendGuestConfirmation(saved, override, actor) {
  const auto = confirmationEmail(saved);
  const text = (override && override.text) ? override.text : auto.text;
  const html = (override && override.text) ? textToHtml(override.text) : auto.html;
  const subject = (override && override.subject) || `J Park Hotel — booking confirmed (${saved.ref})`;
  const to = hotelRecipients();
  const r = await sendEmail({
    to: saved.guest_email,
    subject,
    text,
    html,
    replyTo: to[0] || undefined,
  }, {
    bookingId: saved.id, bookingRef: saved.ref,
    kind: actor ? 'resend' : 'confirmation',
    sentById: actor ? actor.id : null,
    sentByName: actor ? actor.name : null,
  });
  if (r.ok) console.log(`[guest-bookings] confirmation emailed to ${saved.guest_email} (${saved.ref})`);
  else if (!r.skipped) console.warn(`[guest-bookings] confirmation email failed (${saved.ref}): ${r.error}`);
  return r;
}

/* Fire the hotel notice + guest confirmation for a freshly-created MULTI-ROOM
   booking. Fetches every room of the group (by group_ref) so the two emails
   aggregate the whole booking — one email to the guest listing all rooms + the
   grand total, one to the front desk. Fire-and-forget, mirrors
   fireBookingEmails(). The guest confirmation is logged against the primary row
   (group_index 1) with the group_ref as its booking ref. */
async function fireGroupBookingEmails(groupRef) {
  let rows;
  try {
    const r = await db.query(
      'SELECT * FROM guest_bookings WHERE group_ref = $1 ORDER BY group_index ASC',
      [groupRef]
    );
    rows = r.rows;
  } catch (err) {
    console.error('[guest-bookings] group email fetch error', err);
    return;
  }
  if (!rows.length) return;
  const first = rows[0];

  const to = hotelRecipients();
  if (to.length) {
    const { text, html } = groupHotelNotice(rows);
    sendEmail({
      to,
      subject: `New booking — ${first.channel_name || first.channel || 'Direct'} · ${rows.length} rooms (${groupRef})`,
      text,
      html,
      replyTo: first.guest_email || undefined,
    }).then((r) => {
      if (r.ok) console.log(`[guest-bookings] hotel notified of group ${groupRef} (${rows.length} rooms)`);
      else if (!r.skipped) console.warn(`[guest-bookings] group hotel notice failed (${groupRef}): ${r.error}`);
    }).catch((err) => console.error('[guest-bookings] group hotel notice error', err));
  }

  if (first.guest_email) {
    sendGroupConfirmation(rows).catch((err) => console.error('[guest-bookings] group email error', err));
  }
}

// Group guest confirmation send, factored out so the staff "Resend
// confirmation" action can reuse the exact same aggregated content. `override`
// lets staff hand-edit the subject/body (e.g. correct a price) before it goes
// out; `actor` is the signed-in staff member for a manual resend (else null).
async function sendGroupConfirmation(rows, override, actor) {
  const first = rows[0];
  const auto = groupConfirmationEmail(rows);
  const text = (override && override.text) ? override.text : auto.text;
  const html = (override && override.text) ? textToHtml(override.text) : auto.html;
  const subject = (override && override.subject) || `J Park Hotel — booking confirmed (${first.group_ref})`;
  const to = hotelRecipients();
  const r = await sendEmail({
    to: first.guest_email,
    subject,
    text,
    html,
    replyTo: to[0] || undefined,
  }, {
    bookingId: first.id, bookingRef: first.group_ref,
    kind: actor ? 'resend' : 'confirmation',
    sentById: actor ? actor.id : null,
    sentByName: actor ? actor.name : null,
  });
  if (r.ok) console.log(`[guest-bookings] group confirmation emailed to ${first.guest_email} (${first.group_ref})`);
  else if (!r.skipped) console.warn(`[guest-bookings] group confirmation email failed (${first.group_ref}): ${r.error}`);
  return r;
}

/* Core ingest: upsert one booking (de-duped on `ref`) and fire its emails.
   Shared by the POST route below and the OTA email-forwarding bridge
   (routes/otaEmail.js) so both intake paths behave identically. Accepts both
   camelCase and snake_case field names. Returns the saved row (with an
   `inserted` flag). Throws on DB error. */
async function ingestGuestBooking(b) {
  b = b || {};
  // Every booking arriving here is from an OTA / channel manager (direct
  // website bookings are inserted by payments.js, never through this
  // function). With STORE_OTA_BOOKINGS on they are filed normally — emails are
  // suppressed further down instead (fireBookingEmails). Returns null when
  // storage is off; the webhook and email-bridge callers turn that into a
  // benign "ignored" acknowledgement.
  if (!STORE_OTA_BOOKINGS && !isDirectWebsiteBooking(b)) {
    console.log(`[guest-bookings] OTA intake disabled — ignored ${b.ref || b.bookingId || b.confirmationCode || 'booking'} (${b.channelName || b.channel_name || b.channel || 'other'})`);
    return null;
  }
  const channel = normChannel(b.channel || b.source || 'direct');
  const ref = b.ref || b.bookingId || b.confirmationCode
    || ('GB-' + Date.now().toString(36).toUpperCase());
  const checkIn = b.checkIn || b.check_in;
  const checkOut = b.checkOut || b.check_out;
  if (!checkIn || !checkOut) {
    throw new Error('check_in and check_out are required');
  }
  const nights = b.nights || computeNights(checkIn, checkOut);

  // Looked up ahead of the upsert purely so ingestGuestBooking() can tell,
  // after the fact, whether THIS call is the one flipping the booking into
  // 'cancelled' (an OTA cancellation email arriving for a known ref) — see
  // the auto-cancel handling below. A plain SELECT (not FOR UPDATE) is fine
  // here: the worst case on a race is a missed/duplicate notification, never
  // a lost booking, since the upsert itself is still atomic.
  const { rows: existingRows } = await db.query(
    'SELECT status FROM guest_bookings WHERE ref = $1', [ref]
  );
  const prevStatus = existingRows.length ? existingRows[0].status : null;

  const { rows } = await db.query(
    `INSERT INTO guest_bookings
       (ref, channel, channel_name, channel_email, guest_name, guest_last_name,
        guest_email, guest_phone, room, building, check_in, check_out, nights, adults,
        children, total, currency, status, lang, confirmation,
        payment_provider, payment_method, payment_status, payment_charge_id,
        needs_review)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     ON CONFLICT (ref) DO UPDATE SET
       status = EXCLUDED.status,
       -- A re-forwarded confirmation may be the one that finally names the
       -- building; never overwrite a known building with an unknown one.
       building = COALESCE(EXCLUDED.building, guest_bookings.building),
       -- Only stamp cancellation metadata when THIS update is the one moving
       -- the row into 'cancelled' — avoids clobbering a staff cancellation's
       -- reason/actor if the same OTA cancellation email is ever re-forwarded.
       cancelled_at = CASE WHEN EXCLUDED.status = 'cancelled' AND guest_bookings.status <> 'cancelled'
                            THEN NOW() ELSE guest_bookings.cancelled_at END,
       previous_status = CASE WHEN EXCLUDED.status = 'cancelled' AND guest_bookings.status <> 'cancelled'
                            THEN guest_bookings.status ELSE guest_bookings.previous_status END,
       -- Take the new value each time, not OR'd with the old one, so a
       -- corrected re-forward of a previously-flagged booking can clear it.
       needs_review = EXCLUDED.needs_review,
       updated_at = NOW()
     RETURNING *, (xmax = 0) AS inserted`,
    [
      ref,
      channel,
      b.channelName || b.channel_name || channel,
      b.channelEmail || b.channel_email || null,
      b.guestName || b.guest_name || 'Guest',
      (b.guestName || b.guest_name || '').split(' ').pop().toLowerCase() || null,
      b.guestEmail || b.guest_email || null,
      b.guestPhone || b.guest_phone || null,
      b.room || b.roomType || b.room_type || null,
      // Which of the five buildings, read off the room type and — for an OTA
      // reservation — the confirmation email itself. This is the only point
      // where that whole email is in hand, so it's resolved once, here.
      b.building != null
        ? b.building
        : resolveBuilding(b.room || b.roomType || b.room_type, b.confirmation || b.body),
      checkIn,
      checkOut,
      nights,
      b.adults != null ? b.adults : 1,
      b.children != null ? b.children : 0,
      b.total != null ? b.total : null,
      b.currency || 'THB',
      b.status || 'confirmed',
      b.lang || 'en',
      b.confirmation || b.body || null,
      b.paymentProvider || b.payment_provider || null,
      b.paymentMethod || b.payment_method || null,
      b.paymentStatus || b.payment_status || 'n/a',
      b.paymentChargeId || b.payment_charge_id || null,
      Boolean(b.needsReview || b.needs_review),
    ]
  );
  const saved = rows[0];
  fireBookingEmails(saved);

  const justCancelled = saved.status === 'cancelled' && prevStatus !== 'cancelled';
  if (justCancelled) {
    fireCancellationNotice(saved, { wasConfirmed: prevStatus === 'confirmed' });
  }
  return saved;
}

/* POST /api/guest-bookings — ingest from OTA bridge / channel manager.
   Protected by an optional X-API-Key (see ingestKeyOk): open when
   OTA_WEBHOOK_SECRET is unset, key-gated once it is. */
router.post('/', async (req, res) => {
  if (rateLimited(req.ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  if (!ingestKeyOk(req.get('x-api-key'))) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  try {
    const saved = await ingestGuestBooking(req.body || {});
    // null → OTA storage is disabled (see STORE_OTA_BOOKINGS). Acknowledge so
    // the channel manager doesn't retry, but store nothing and email no one.
    if (!saved) {
      return res.status(202).json({ status: 'ignored', reason: 'Only Direct (Website) bookings are handled' });
    }
    res.status(201).json(row2js(saved));
  } catch (e) {
    if (/check_in and check_out/.test(e.message)) {
      return res.status(400).json({ error: e.message });
    }
    console.error('[guest-bookings] create', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// Staff can only ever move a payment forward to "paid" via this endpoint —
// never trust a client-supplied paymentMethod string beyond this allow-list.
const ALLOWED_PAYMENT_METHODS = ['cash', 'card', 'promptpay_instore'];

// The generic PATCH status field only ever confirms a pending day-use slot.
// 'cancelled' is deliberately excluded — see POST /:id/cancel below.
const ALLOWED_STATUS_PATCH = ['confirmed'];

/* PATCH /api/guest-bookings/:id — requires staff auth: beyond the original
   mark-read/status use, this now also assigns the physical room number and
   records in-person payment, both front-desk-only actions. */
router.patch('/:id', requireAuth, async (req, res) => {
  const { status, readBy, userId, roomNumber, paymentMethod, starred, staffLabel, specialRequests } = req.body || {};
  try {
    if (userId) {
      // mark read for this user
      await db.query(
        `UPDATE guest_bookings
            SET read_by = array_append(read_by, $1)
          WHERE id = $2 AND NOT ($1 = ANY(read_by))`,
        [userId, req.params.id]
      );
    }
    if (status) {
      // The only legitimate free-form transition left here is confirming a
      // pending day-use slot once front desk has checked the time works.
      // Cancelling must go through POST /:id/cancel (stamps actor/reason,
      // sends the guest a notice) — this endpoint used to accept ANY string,
      // which meant a typo silently broke the overlap/inventory accounting
      // in lib/availability.js (it only ever recognizes the exact strings
      // 'confirmed' / 'pending').
      if (!ALLOWED_STATUS_PATCH.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Use POST /:id/cancel to cancel a booking.' });
      }
      await db.query(
        `UPDATE guest_bookings SET status = $1 WHERE id = $2 AND status = 'pending'`,
        [status, req.params.id]
      );
    }
    if (roomNumber !== undefined) {
      const rn = String(roomNumber).trim().slice(0, 10);
      await db.query(
        'UPDATE guest_bookings SET room_number = $1 WHERE id = $2',
        [rn || null, req.params.id]
      );
    }
    if (paymentMethod !== undefined) {
      if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
        return res.status(400).json({ error: 'Invalid paymentMethod' });
      }
      await db.query(
        `UPDATE guest_bookings SET payment_method = $1, payment_status = 'paid' WHERE id = $2`,
        [paymentMethod, req.params.id]
      );
    }
    if (starred !== undefined) {
      await db.query(
        'UPDATE guest_bookings SET starred = $1 WHERE id = $2',
        [Boolean(starred), req.params.id]
      );
    }
    if (staffLabel !== undefined) {
      const label = String(staffLabel || '').trim().slice(0, 120);
      await db.query(
        'UPDATE guest_bookings SET staff_label = $1 WHERE id = $2',
        [label || null, req.params.id]
      );
    }
    // Guest-facing special request. Unlike staff_label (private), this shows on
    // the booking and is what a resent confirmation would include — front desk
    // edits it when a guest phones in a request after booking, or to record one
    // that arrived with an OTA booking. Same 1000-char cap as booking creation.
    if (specialRequests !== undefined) {
      const sr = String(specialRequests || '').trim().slice(0, 1000);
      await db.query(
        'UPDATE guest_bookings SET special_requests = $1 WHERE id = $2',
        [sr || null, req.params.id]
      );
    }
    const { rows } = await db.query('SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(row2js(rows[0]));
  } catch (e) {
    console.error('[guest-bookings] patch', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /api/guest-bookings/:id/confirmation-preview — returns the exact
   subject/text the auto "Resend confirmation" would send, so the staff
   console's edit-before-sending panel can prefill from the real template
   instead of duplicating it client-side (which would drift out of sync). */
router.get('/:id/confirmation-preview', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const bk = rows[0];
    // A multi-room booking previews/resends as ONE aggregated email listing
    // every room in the group + the grand total, keyed off the group_ref.
    if (bk.group_ref) {
      const { rows: grp } = await db.query(
        'SELECT * FROM guest_bookings WHERE group_ref = $1 ORDER BY group_index ASC', [bk.group_ref]
      );
      const { text } = groupConfirmationEmail(grp);
      return res.json({ subject: `J Park Hotel — booking confirmed (${bk.group_ref})`, text });
    }
    const { text } = confirmationEmail(bk);
    res.json({ subject: `J Park Hotel — booking confirmed (${bk.ref})`, text });
  } catch (e) {
    console.error('[guest-bookings] confirmation-preview', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/guest-bookings/:id/resend-confirmation — lets staff manually
   re-send the guest-facing confirmation email on demand (e.g. a guest says
   they never got it — could be stuck in spam, mistyped address, etc. — or a
   real error like a wrong price was found after the fact). Reuses the exact
   same sendGuestConfirmation() used on initial booking, and surfaces the
   real Resend result to the console instead of it only ever being visible
   in server logs. Optional body `{ subject, text }` lets staff send an
   edited version instead of the auto-generated template verbatim — both
   must be non-empty strings to take effect; either one omitted/blank falls
   back to the template's own default for that part. */
router.post('/:id/resend-confirmation', requireAuth, async (req, res) => {
  if (rateLimited(req.ip || 'unknown')) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  try {
    const { rows } = await db.query('SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const bk = rows[0];
    if (!bk.guest_email) return res.status(400).json({ error: 'This booking has no guest email on file' });

    const b = req.body || {};
    const override = {
      subject: typeof b.subject === 'string' && b.subject.trim() ? b.subject.trim() : null,
      text: typeof b.text === 'string' && b.text.trim() ? b.text : null,
    };

    // For a multi-room booking, resend the ONE aggregated group confirmation
    // and mark every room of the group amended; otherwise the single-room path.
    let result;
    if (bk.group_ref) {
      const { rows: grp } = await db.query(
        'SELECT * FROM guest_bookings WHERE group_ref = $1 ORDER BY group_index ASC', [bk.group_ref]
      );
      result = await sendGroupConfirmation(grp, override, req.user);
    } else {
      result = await sendGuestConfirmation(bk, override, req.user);
    }
    if (!result.ok) {
      return res.status(result.skipped ? 503 : 502).json({ error: result.error || 'Send failed' });
    }

    if (bk.group_ref) {
      await db.query(`UPDATE guest_bookings SET last_amended_at = NOW() WHERE group_ref = $1`, [bk.group_ref]);
    } else {
      await db.query(`UPDATE guest_bookings SET last_amended_at = NOW() WHERE id = $1`, [req.params.id]);
    }
    const { rows: updated } = await db.query('SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]);
    res.json({ status: 'sent', to: bk.guest_email, booking: row2js(updated[0]) });
  } catch (e) {
    console.error('[guest-bookings] resend-confirmation', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /api/guest-bookings/:id/email-log — every guest-facing email actually
   sent for this booking (confirmation, resend, cancellation notice, day-use
   request), most recent first. Powers the Staff Console's "Sent Emails"
   panel — see backend/mailer.js's sendEmail(msg, meta) for what gets logged
   and why (internal hotel-notice emails are deliberately excluded). */
router.get('/:id/email-log', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, to_address, subject, body, kind, status, error,
              sent_by_name, created_at
         FROM email_log
        WHERE booking_id = $1
        ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      to: r.to_address,
      subject: r.subject,
      body: r.body,
      kind: r.kind,
      status: r.status,
      error: r.error,
      sentByName: r.sent_by_name,
      createdAt: new Date(r.created_at).getTime(),
    })));
  } catch (e) {
    console.error('[guest-bookings] email-log', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/guest-bookings/:id/cancel — staff-mediated cancel (any signed-in
   employee, matching the existing PATCH/assign-room/mark-paid permission
   level). Idempotent: cancelling an already-cancelled booking is a no-op
   that still returns 200, mirroring routes/otaSync.js's own
   already_cancelled handling for its separate channel-manager booking
   system. */
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const reason = typeof (req.body && req.body.reason) === 'string'
    ? (req.body.reason.trim().slice(0, 500) || null)
    : null;
  try {
    const { rows: found } = await db.query('SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]);
    if (!found.length) return res.status(404).json({ error: 'Not found' });
    const bk = found[0];
    if (bk.status === 'cancelled') {
      return res.json({ status: 'already_cancelled', booking: row2js(bk) });
    }

    const { rows } = await db.query(
      `UPDATE guest_bookings
          SET status = 'cancelled',
              previous_status = status,
              cancelled_at = NOW(),
              cancelled_by_id = $1,
              cancelled_by_name = $2,
              cancellation_reason = $3
        WHERE id = $4
        RETURNING *`,
      [req.user.id, req.user.name, reason, req.params.id]
    );
    const saved = rows[0];
    fireCancellationNotice(saved, { actorName: req.user.name, wasConfirmed: bk.status === 'confirmed' });
    res.json(row2js(saved));
  } catch (e) {
    console.error('[guest-bookings] cancel', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/guest-bookings/group/:groupRef/cancel — cancel an ENTIRE
   multi-room booking at once. Cancels every still-active room of the group in
   one transaction (stamping actor/reason on each), then sends the guest ONE
   group cancellation email + one staff broadcast, instead of a separate notice
   per room. Already-cancelled rooms are left untouched. Distinct 3-segment
   path so it never collides with POST /:id/cancel. */
router.post('/group/:groupRef/cancel', requireAuth, async (req, res) => {
  const reason = typeof (req.body && req.body.reason) === 'string'
    ? (req.body.reason.trim().slice(0, 500) || null)
    : null;
  const groupRef = req.params.groupRef;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: all } = await client.query(
      "SELECT * FROM guest_bookings WHERE group_ref = $1 ORDER BY group_index ASC FOR UPDATE",
      [groupRef]
    );
    if (!all.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    const active = all.filter((r) => r.status !== 'cancelled');
    if (!active.length) {
      await client.query('ROLLBACK');
      return res.json({ status: 'already_cancelled', groupRef, cancelled: 0 });
    }
    const anyWasConfirmed = active.some((r) => r.status === 'confirmed');
    const { rows: updated } = await client.query(
      `UPDATE guest_bookings
          SET status = 'cancelled',
              previous_status = status,
              cancelled_at = NOW(),
              cancelled_by_id = $1,
              cancelled_by_name = $2,
              cancellation_reason = $3
        WHERE group_ref = $4 AND status <> 'cancelled'
        RETURNING *`,
      [req.user.id, req.user.name, reason, groupRef]
    );
    await client.query('COMMIT');

    const first = updated[0];
    if (anyWasConfirmed && first.guest_email) {
      const { text, html } = groupCancellationEmail(updated);
      sendEmail({
        to: first.guest_email,
        subject: `J Park Hotel — booking cancelled (${groupRef})`,
        text,
        html,
      }, {
        bookingId: first.id, bookingRef: groupRef, kind: 'cancellation',
        sentByName: req.user.name,
      }).then((r) => {
        if (r.ok) console.log(`[guest-bookings] group cancellation emailed to ${first.guest_email} (${groupRef})`);
        else if (!r.skipped) console.warn(`[guest-bookings] group cancellation email failed (${groupRef}): ${r.error}`);
      }).catch((err) => console.error('[guest-bookings] group cancellation email error', err));
    }
    broadcastStaffMessage(
      `Booking cancelled by ${req.user.name} — ${groupRef} (${updated.length} rooms)`,
      `Guest: ${first.guest_name || '—'}\nRooms: ${updated.map((r) => r.room).join(', ')}\n` +
        `Check-in: ${first.check_in}\nCheck-out: ${first.check_out}\nRef: ${groupRef}` +
        (reason ? `\nReason: ${reason}` : '')
    ).catch((err) => console.error('[guest-bookings] group cancel broadcast error', err));

    res.json({ status: 'cancelled', groupRef, cancelled: updated.length, bookings: updated.map(row2js) });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[guest-bookings] group cancel', e);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

/* POST /api/guest-bookings/:id/reopen — restores a cancelled booking to its
   prior status. For a 'direct' overnight booking this re-runs the same
   advisory-lock + overlap guard routes/payments.js's POST /reservations
   uses, since the room may have been sold to someone else while this
   booking sat cancelled. The guard is scoped to channel==='direct' only:
   OTA-sourced bookings carry a free-text `room` string from the channel's
   own listing (extracted by lib/otaEmailParser.js) that was never validated
   against roomRates' inventory map and was never subject to this guard at
   creation time either (ingestGuestBooking() does a plain insert, no
   overlap check) — running the same guard on them would false-positive
   block almost every OTA reopen, since an unrecognized room name resolves
   to zero inventory. Day-use rows (check_in === check_out) never hold
   nightly inventory, matching how their original booking flow also skips
   this guard. */
router.post('/:id/reopen', requireAuth, async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: found } = await client.query(
      'SELECT * FROM guest_bookings WHERE id = $1 FOR UPDATE', [req.params.id]
    );
    if (!found.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    const bk = found[0];
    if (bk.status !== 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Booking is not cancelled' });
    }

    const isOvernightDirect = bk.channel === 'direct' && bk.room && String(bk.check_in) !== String(bk.check_out);
    if (isOvernightDirect) {
      // Lock/count by the shared POOL (Single/Twin siblings draw from one
      // physical pool of rooms — see roomRates.js) not just this exact key.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [roomRates.getInventoryPoolKey(bk.room)]);
      const cnt = await countOverlappingPool(client, roomRates.getInventoryPoolRooms(bk.room), bk.check_in, bk.check_out);
      // The admin-editable count from the Site Editor, not the static
      // fallback — reopening must respect a ceiling staff have since lowered.
      if (cnt >= await rateOverrides.getEffectiveInventory(bk.room)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Sorry, this room type is no longer available for those dates.' });
      }
    }

    const restoredStatus = bk.previous_status || 'confirmed';
    const { rows } = await client.query(
      `UPDATE guest_bookings
          SET status = $1,
              previous_status = NULL,
              cancelled_at = NULL,
              cancelled_by_id = NULL,
              cancelled_by_name = NULL,
              cancellation_reason = NULL
        WHERE id = $2
        RETURNING *`,
      [restoredStatus, req.params.id]
    );
    await client.query('COMMIT');
    const saved = rows[0];
    broadcastStaffMessage(
      `Booking reopened by ${req.user.name} — ${saved.ref}`,
      `Guest: ${saved.guest_name || '—'}\nRoom: ${saved.room || '—'}\nCheck-in: ${saved.check_in}\nCheck-out: ${saved.check_out}\nRef: ${saved.ref}`
    ).catch((err) => console.error('[guest-bookings] reopen broadcast error', err));
    res.json(row2js(saved));
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[guest-bookings] reopen', e);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

/* DELETE /api/guest-bookings/:id (admin) */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM guest_bookings WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (e) {
    console.error('[guest-bookings] delete', e);
    res.status(500).json({ error: 'Database error' });
  }
});

function normChannel(raw) {
  const k = String(raw || '').toLowerCase();
  if (k.includes('agoda'))   return 'agoda';
  if (k.includes('booking')) return 'booking';
  if (k.includes('airbnb'))  return 'airbnb';
  if (k.includes('trip'))    return 'trip';
  if (k.includes('expedia')) return 'expedia';
  return 'direct';
}

function computeNights(ci, co) {
  if (!ci || !co) return 1;
  const n = Math.round((new Date(co) - new Date(ci)) / 86400000);
  return n > 0 ? n : 1;
}

module.exports = router;
// Shared with routes/otaEmail.js (the email-forwarding bridge) and
// routes/payments.js (the online booking + card/PromptPay flow), so every
// intake path renders identically in the staff console and sends the same
// hotel-notice / guest-confirmation emails (including the deposit note).
module.exports.ingestGuestBooking = ingestGuestBooking;
module.exports.row2js = row2js;
module.exports.fireBookingEmails = fireBookingEmails;
module.exports.fireGroupBookingEmails = fireGroupBookingEmails;
module.exports.hotelNotice = hotelNotice;
module.exports.hotelRecipients = hotelRecipients;
module.exports.confirmationEmail = confirmationEmail;
module.exports.computeNights = computeNights;
module.exports.emailLetterhead = emailLetterhead;
module.exports.SPAM_NOTE_TEXT = SPAM_NOTE_TEXT;
module.exports.SPAM_NOTE_HTML = SPAM_NOTE_HTML;
module.exports.escapeHtml = escapeHtml;
// Exported so backend/test-emails.js can render every message and assert that
// guest-supplied text arrives inert. Nothing else calls these from outside.
module.exports.groupConfirmationEmail = groupConfirmationEmail;
module.exports.groupHotelNotice = groupHotelNotice;
module.exports.cancellationEmail = cancellationEmail;
module.exports.groupCancellationEmail = groupCancellationEmail;
module.exports.paymentConfirmedEmail = paymentConfirmedEmail;
module.exports.groupPaymentConfirmedEmail = groupPaymentConfirmedEmail;
module.exports.paymentConfirmedHotelNotice = paymentConfirmedHotelNotice;
module.exports.groupPaymentConfirmedHotelNotice = groupPaymentConfirmedHotelNotice;
module.exports.row2jsPublic = row2jsPublic;
module.exports.sendPaymentConfirmedEmail = sendPaymentConfirmedEmail;
module.exports.sendGroupPaymentConfirmedEmail = sendGroupPaymentConfirmedEmail;
module.exports.sendDeclinedAttemptNotice = sendDeclinedAttemptNotice;
module.exports.sendPaymentFailedEmail = sendPaymentFailedEmail;
module.exports.paymentDeclinedHotelNotice = paymentDeclinedHotelNotice;
module.exports.paymentFailedHotelNotice = paymentFailedHotelNotice;
module.exports.paymentDetailLines = paymentDetailLines;
module.exports.paymentDetailRows = paymentDetailRows;
module.exports.testModeNoticeText = testModeNoticeText;
module.exports.testModeNoticeHtml = testModeNoticeHtml;
module.exports.detailFromRow = detailFromRow;
