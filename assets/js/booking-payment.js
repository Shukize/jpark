/* ============================================================
   J Park Hotel — online booking / reservation modal.
   Loaded after booking-page.js (which owns date/room search and calls
   window.JPark.bookingFlow.open(ctx) from each room card's "Book Now"
   button).

   Submitting this form always creates an immediately CONFIRMED reservation
   (it holds the room-type inventory the same way any booking would — see
   backend/routes/payments.js's POST /reservations). Payment is the guest's
   choice, hybrid per booking: pay in person at check-in (cash / card /
   PromptPay QR at the front desk — the default, and the only option while
   the hotel's Omise account isn't live yet), or pay online now by card or
   PromptPay via Omise/Opn Payments. See paymentConfig below — the online
   choice only ever appears once GET /api/v1/payments/config reports it's
   available, so this degrades to exactly today's pay-at-checkin-only flow
   with zero visible change until then.
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
    return window.JPark.util.formatDate(iso);
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
      'bk.pay.roomPref': 'Room preference', 'bk.pay.nonSmoking': 'Non-Smoking', 'bk.pay.smoking': 'Smoking',
      'bk.pay.firstName': 'First name', 'bk.pay.lastName': 'Last name (optional)',
      'bk.pay.email': 'Email', 'bk.pay.phone': 'Phone',
      'bk.pay.note': 'Special requests (optional)', 'bk.pay.notePlaceholder': 'Late arrival, high floor, allergies…',
      'bk.pay.depositTitle': 'Please note',
      'bk.pay.depositNote': 'A 200 THB deposit for your room key card is collected at check-in — in cash, or (Thai guests only) a national ID card or driving license may be left instead — and is refunded/returned in full at check-out.',
      'bk.pay.cancelTitle': 'Changes and cancellation',
      'bk.pay.cancelNote': 'Nothing is charged now — you pay in person at check-in. To change or cancel your reservation, contact the hotel by phone or email with your confirmation number and the front desk will take care of it.',
      'bk.pay.depositAck': 'I understand a refundable key-card deposit is collected at check-in.',
      'bk.pay.err.depositAck': 'Please tick the box to confirm you understand the deposit.',
      'bk.pay.howToPay': 'How would you like to pay?',
      'bk.pay.payAtCheckin': 'Pay at check-in',
      'bk.pay.payOnlineCard': 'Pay online by card',
      'bk.pay.payOnlinePromptpay': 'Pay online by PromptPay',
      'bk.pay.cardName': 'Name on card', 'bk.pay.cardNumber': 'Card number',
      'bk.pay.cardExpiry': 'Expiry (MM/YY)', 'bk.pay.cardCvc': 'CVC',
      'bk.pay.payAmount': 'Pay {amount}',
      'bk.pay.qrTitle': 'Scan to pay with PromptPay',
      'bk.pay.qrInstructions': 'Open your banking app and scan this QR code to complete payment.',
      'bk.pay.qrWaiting': 'Waiting for payment confirmation…',
      'bk.pay.redirectTitle': 'Confirming with your bank',
      'bk.pay.redirectNote': 'You are being taken to your bank’s secure page to approve this payment. Your reservation is already confirmed — please note the confirmation number above.',
      'bk.pay.confirmingTitle': 'Checking your payment…',
      'bk.pay.confirmingNote': 'We are confirming this payment with your bank. Your reservation is confirmed either way — if the payment did not go through, you can simply pay at check-in.',
      'bk.pay.qrCloseNote': "Your reservation is confirmed either way. You can close this and finish paying later via the QR, or pay at check-in instead — we'll email you as soon as your PromptPay payment is confirmed.",
      'bk.pay.paidOnlineNote': 'You paid {amount} online. Thank you!',
      'bk.pay.onlinePayNote': "You're paying online now. We'll email your confirmation as soon as payment is processed.",
      'bk.pay.err.cardDeclined': 'Your card was declined. Please try a different card or pay at check-in.',
      'bk.pay.err.cardIncomplete': 'Please fill in all card details.',
      'bk.pay.err.paymentUnavailable': 'Online payment is not currently available. Please choose pay at check-in.',
      'bk.pay.total': 'Total',
      'bk.pay.extraBedLine': 'Extra bed (3rd guest)', 'bk.pay.extraBreakfastLine': 'Extra breakfast guest',
      'bk.pay.extraBedLabel': 'Extra bed', 'bk.pay.extraBedAdd': 'Add an extra bed',
      'bk.pay.processingText': 'Processing…',
      'bk.pay.cancel': 'Cancel', 'bk.pay.close': 'Close',
      'bk.pay.successTitle': 'Booking confirmed!', 'bk.pay.confirmationLabel': 'Confirmation number',
      'bk.pay.emailSentNote': 'A confirmation has been sent to your email, with the deposit note above.',
      'bk.pay.spamNote': "Don't see it in a few minutes? Please check your spam or junk folder.",
      'bk.pay.checkinTimeNote': 'Check-in from 14:00 ICT · Check-out until 12:00 ICT',
      'bk.pay.done': 'Done',
      'bk.pay.reserveTitle': 'Reserve now — pay at check-in',
      'bk.pay.checkinNote': "You're not paying online. We'll email your confirmation now, and you'll settle the balance in person at check-in — by cash, credit/debit card, or PromptPay QR at our front desk.",
      'bk.pay.prepayRequiredNote': "During this busy period, full prepayment is required — pay-at-check-in isn't available for these dates, and this booking is non-refundable if you don't arrive (no-show) or cancel.",
      'bk.pay.testModeTitle': 'Test mode — no payment will be taken.',
      'bk.pay.testModeNote': 'This booking page is connected to the payment gateway in test mode. You can complete the form, but no card is charged and no money is transferred. Please contact the hotel to confirm your reservation.',
      'bk.pay.noRefundTitle': 'Paying online is non-refundable.',
      'bk.pay.noRefundNote': 'If you pay now and later cancel, change your dates, arrive late or do not arrive, the amount is not returned. Choose “Pay at check-in” instead if you would rather keep your booking flexible — nothing is charged until you arrive. The 200 THB key-card deposit is separate and always refunded.',
      'bk.pay.confirmReservation': 'Confirm reservation',
      'bk.pay.err.required': 'Please fill in your first name, email, and phone number.',
      'bk.pay.err.generic': 'Something went wrong. Please try again.',
      'bk.pay.err.network': 'Network error — please check your connection and try again.',
      'bk.pay.err.offline': "We can't reach our booking system right now. Please call us to book — +66 086 326 0664 or +66 038 448 111 — and we'll be happy to help.",
      'bk.pay.err.soldOut': 'Sorry, this room type just sold out for those dates.',
      'bk.pay.childAgesLabel': "Children's ages",
      'bk.pay.childAgeN': 'Child {n} age',
      'bk.pay.err.childAges': "Please enter each child's age (0–17) so we can apply the correct breakfast pricing.",
      'bk.pay.addRoom': 'Add another room',
      'bk.pay.addToBooking': 'Add to booking',
      'bk.pay.reviewBook': 'Review & book',
      'bk.pay.cartTitle': 'Your booking',
      'bk.pay.roomWord': 'room', 'bk.pay.roomsWord': 'rooms',
      'bk.pay.grandTotal': 'Total (all rooms)',
      'bk.pay.remove': 'Remove', 'bk.pay.clearCart': 'Clear',
      'bk.pay.confirmBooking': 'Confirm booking',
      'bk.pay.roomsInBooking': 'Rooms in this booking',
      'bk.pay.datesMismatch': 'All rooms in one booking must share the same check-in and check-out dates. Please review your current booking, or set the dates back to keep adding rooms.',
      'bk.pay.depositNoteMulti': 'A {amount} THB deposit (200 THB × {n} rooms) for your room key cards is collected in cash only at check-in, and refunded in full at check-out.',
      'bk.pay.cartEmpty': 'Your booking is empty. Please add at least one room.',
    },
    th: {
      'bk.pay.roomType': 'ประเภทห้อง', 'bk.pay.guestDetails': 'ข้อมูลผู้เข้าพัก',
      'bk.pay.roomPref': 'ห้องสูบบุหรี่/ปลอดบุหรี่', 'bk.pay.nonSmoking': 'ห้องปลอดบุหรี่', 'bk.pay.smoking': 'ห้องสูบบุหรี่',
      'bk.pay.firstName': 'ชื่อ', 'bk.pay.lastName': 'นามสกุล (ไม่บังคับ)',
      'bk.pay.email': 'อีเมล', 'bk.pay.phone': 'เบอร์โทร',
      'bk.pay.note': 'คำขอพิเศษ (ไม่บังคับ)', 'bk.pay.notePlaceholder': 'มาถึงดึก ต้องการชั้นสูง แพ้อาหาร…',
      'bk.pay.depositTitle': 'โปรดทราบ',
      'bk.pay.depositNote': 'มีการเรียกเก็บเงินมัดจำบัตรคีย์การ์ด 200 บาท ณ วันเช็คอิน โดยชำระเป็นเงินสด หรือฝากบัตรประจำตัวประชาชน/ใบขับขี่แทนเงินมัดจำก็ได้ (เฉพาะผู้เข้าพักสัญชาติไทย) และจะคืนให้เต็มจำนวนเมื่อเช็คเอาท์',
      'bk.pay.cancelTitle': 'การเปลี่ยนแปลงและการยกเลิก',
      'bk.pay.cancelNote': 'ยังไม่มีการเรียกเก็บเงินในขณะนี้ ท่านชำระเงินด้วยตนเอง ณ วันเช็คอิน หากต้องการเปลี่ยนแปลงหรือยกเลิกการจอง กรุณาติดต่อโรงแรมทางโทรศัพท์หรืออีเมลพร้อมแจ้งหมายเลขการจอง แล้วแผนกต้อนรับจะดำเนินการให้',
      'bk.pay.depositAck': 'ข้าพเจ้าเข้าใจว่าต้องวางเงินมัดจำบัตรคีย์การ์ด (คืนเต็มจำนวน) ณ วันเช็คอิน',
      'bk.pay.err.depositAck': 'กรุณาทำเครื่องหมายในช่องเพื่อยืนยันว่าคุณเข้าใจเงื่อนไขการมัดจำ',
      'bk.pay.howToPay': 'ท่านต้องการชำระเงินด้วยวิธีใด?',
      'bk.pay.payAtCheckin': 'ชำระที่โรงแรมเมื่อเช็คอิน',
      'bk.pay.payOnlineCard': 'ชำระออนไลน์ด้วยบัตรเครดิต/เดบิต',
      'bk.pay.payOnlinePromptpay': 'ชำระออนไลน์ด้วย PromptPay',
      'bk.pay.cardName': 'ชื่อบนบัตร', 'bk.pay.cardNumber': 'หมายเลขบัตร',
      'bk.pay.cardExpiry': 'วันหมดอายุ (ด/ป)', 'bk.pay.cardCvc': 'รหัส CVC',
      'bk.pay.payAmount': 'ชำระเงิน {amount}',
      'bk.pay.qrTitle': 'สแกนเพื่อชำระเงินผ่าน PromptPay',
      'bk.pay.qrInstructions': 'เปิดแอปธนาคารของท่านแล้วสแกน QR โค้ดนี้เพื่อชำระเงินให้เสร็จสมบูรณ์',
      'bk.pay.qrWaiting': 'กำลังรอการยืนยันการชำระเงิน…',
      'bk.pay.redirectTitle': 'กำลังยืนยันกับธนาคารของท่าน',
      'bk.pay.redirectNote': 'ระบบกำลังนำท่านไปยังหน้าเว็บที่ปลอดภัยของธนาคารเพื่ออนุมัติการชำระเงิน การจองของท่านได้รับการยืนยันแล้ว โปรดจดหมายเลขการจองด้านบนไว้',
      'bk.pay.confirmingTitle': 'กำลังตรวจสอบการชำระเงิน…',
      'bk.pay.confirmingNote': 'ระบบกำลังยืนยันการชำระเงินกับธนาคารของท่าน ไม่ว่าผลจะเป็นอย่างไร การจองของท่านได้รับการยืนยันแล้ว หากการชำระเงินไม่สำเร็จ ท่านสามารถชำระที่เคาน์เตอร์เมื่อเช็คอินได้',
      'bk.pay.qrCloseNote': 'การจองของท่านได้รับการยืนยันแล้วไม่ว่าผลการชำระเงินจะเป็นอย่างไร ท่านสามารถปิดหน้าต่างนี้แล้วชำระเงินภายหลังผ่าน QR หรือชำระที่หน้าเคาน์เตอร์แทนก็ได้ — เราจะแจ้งให้ท่านทราบทางอีเมลทันทีที่ได้รับการยืนยันการชำระเงินผ่าน PromptPay',
      'bk.pay.paidOnlineNote': 'ท่านได้ชำระเงิน {amount} ออนไลน์เรียบร้อยแล้ว ขอบคุณที่ใช้บริการ',
      'bk.pay.onlinePayNote': 'ท่านกำลังชำระเงินออนไลน์ เราจะส่งอีเมลยืนยันให้ทันทีที่การชำระเงินเสร็จสมบูรณ์',
      'bk.pay.err.cardDeclined': 'บัตรของท่านถูกปฏิเสธ กรุณาลองใช้บัตรอื่น หรือเลือกชำระเงินที่หน้าเคาน์เตอร์แทน',
      'bk.pay.err.cardIncomplete': 'กรุณากรอกข้อมูลบัตรให้ครบถ้วน',
      'bk.pay.err.paymentUnavailable': 'ขณะนี้ไม่สามารถชำระเงินออนไลน์ได้ กรุณาเลือกชำระเงินที่หน้าเคาน์เตอร์แทน',
      'bk.pay.total': 'ยอดรวม',
      'bk.pay.extraBedLine': 'เตียงเสริม (ผู้เข้าพักคนที่ 3)', 'bk.pay.extraBreakfastLine': 'อาหารเช้าเพิ่มเติม',
      'bk.pay.extraBedLabel': 'เตียงเสริม', 'bk.pay.extraBedAdd': 'เพิ่มเตียงเสริม',
      'bk.pay.processingText': 'กำลังดำเนินการ…',
      'bk.pay.cancel': 'ยกเลิก', 'bk.pay.close': 'ปิด',
      'bk.pay.successTitle': 'ยืนยันการจองแล้ว!', 'bk.pay.confirmationLabel': 'หมายเลขยืนยัน',
      'bk.pay.emailSentNote': 'เราได้ส่งอีเมลยืนยันพร้อมข้อมูลเงินมัดจำข้างต้นให้ท่านแล้ว',
      'bk.pay.spamNote': 'หากไม่พบอีเมลภายในไม่กี่นาที กรุณาตรวจสอบโฟลเดอร์สแปมหรือจดหมายขยะ',
      'bk.pay.checkinTimeNote': 'เช็คอินตั้งแต่ 14:00 น. (เวลาไทย) · เช็คเอาท์ภายใน 12:00 น. (เวลาไทย)',
      'bk.pay.done': 'เสร็จสิ้น',
      'bk.pay.reserveTitle': 'จองเลย ชำระเงินที่โรงแรม',
      'bk.pay.checkinNote': 'ท่านไม่ต้องชำระเงินออนไลน์ เราจะส่งอีเมลยืนยันการจองให้ทันที และท่านสามารถชำระยอดคงเหลือได้ที่หน้าเคาน์เตอร์เมื่อเช็คอิน — ด้วยเงินสด บัตรเครดิต/เดบิต หรือ QR พร้อมเพย์',
      'bk.pay.prepayRequiredNote': 'ในช่วงที่มีผู้เข้าพักจำนวนมาก จำเป็นต้องชำระเงินล่วงหน้าเต็มจำนวน — ไม่สามารถเลือกชำระที่โรงแรมสำหรับวันดังกล่าวได้ และการจองนี้จะไม่คืนเงินหากท่านไม่เข้าพัก (No-show) หรือยกเลิก',
      'bk.pay.testModeTitle': 'โหมดทดสอบ — จะไม่มีการเรียกเก็บเงิน',
      'bk.pay.testModeNote': 'หน้าจองนี้เชื่อมต่อกับระบบชำระเงินในโหมดทดสอบ ท่านสามารถกรอกแบบฟอร์มได้ แต่จะไม่มีการตัดบัตรและไม่มีการโอนเงินใด ๆ กรุณาติดต่อโรงแรมเพื่อยืนยันการจองของท่าน',
      'bk.pay.noRefundTitle': 'การชำระเงินออนไลน์ไม่สามารถขอคืนเงินได้',
      'bk.pay.noRefundNote': 'หากท่านชำระเงินตอนนี้ แล้วภายหลังยกเลิก เปลี่ยนวันเข้าพัก มาถึงล่าช้า หรือไม่เข้าพัก จะไม่มีการคืนเงิน หากท่านต้องการความยืดหยุ่น กรุณาเลือก “ชำระเงิน ณ วันเช็คอิน” แทน ซึ่งจะไม่มีการเรียกเก็บเงินจนกว่าท่านจะเดินทางมาถึง ทั้งนี้เงินมัดจำบัตรคีย์การ์ด 200 บาท เป็นคนละส่วนและคืนให้เสมอ',
      'bk.pay.confirmReservation': 'ยืนยันการจอง',
      'bk.pay.err.required': 'กรุณากรอกชื่อ อีเมล และเบอร์โทรศัพท์ของท่าน',
      'bk.pay.err.generic': 'เกิดข้อผิดพลาด กรุณาลองใหม่',
      'bk.pay.err.network': 'เกิดข้อผิดพลาดของเครือข่าย กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่',
      'bk.pay.err.offline': 'ขณะนี้เราไม่สามารถเชื่อมต่อระบบการจองได้ กรุณาโทรจองโดยตรงที่ +66 086 326 0664 หรือ +66 038 448 111 เรายินดีให้บริการ',
      'bk.pay.err.soldOut': 'ขออภัย ห้องประเภทนี้เต็มสำหรับวันที่เลือกแล้ว',
      'bk.pay.childAgesLabel': 'อายุของเด็ก',
      'bk.pay.childAgeN': 'อายุเด็กคนที่ {n}',
      'bk.pay.err.childAges': 'กรุณาระบุอายุของเด็กแต่ละคน (0–17 ปี) เพื่อให้เราคิดราคาอาหารเช้าได้อย่างถูกต้อง',
      'bk.pay.addRoom': 'เพิ่มห้องพัก',
      'bk.pay.addToBooking': 'เพิ่มเข้าการจอง',
      'bk.pay.reviewBook': 'ตรวจสอบและจอง',
      'bk.pay.cartTitle': 'การจองของท่าน',
      'bk.pay.roomWord': 'ห้อง', 'bk.pay.roomsWord': 'ห้อง',
      'bk.pay.grandTotal': 'ยอดรวมทั้งหมด',
      'bk.pay.remove': 'ลบ', 'bk.pay.clearCart': 'ล้าง',
      'bk.pay.confirmBooking': 'ยืนยันการจอง',
      'bk.pay.roomsInBooking': 'ห้องพักในการจองนี้',
      'bk.pay.datesMismatch': 'ห้องพักทุกห้องในการจองเดียวกันต้องมีวันเช็คอินและเช็คเอาท์เดียวกัน กรุณาตรวจสอบการจองปัจจุบัน หรือปรับวันที่กลับเพื่อเพิ่มห้องต่อ',
      'bk.pay.depositNoteMulti': 'มีการเรียกเก็บเงินมัดจำบัตรคีย์การ์ด {amount} บาท (200 บาท × {n} ห้อง) เป็นเงินสดเท่านั้น ณ วันเช็คอิน และคืนเต็มจำนวนเมื่อเช็คเอาท์',
      'bk.pay.cartEmpty': 'การจองของท่านยังว่างอยู่ กรุณาเพิ่มห้องพักอย่างน้อยหนึ่งห้อง',
    },
    ja: {
      'bk.pay.roomType': '客室タイプ', 'bk.pay.guestDetails': 'ご宿泊者情報',
      'bk.pay.roomPref': 'お部屋のご希望', 'bk.pay.nonSmoking': '禁煙', 'bk.pay.smoking': '喫煙可',
      'bk.pay.firstName': '名', 'bk.pay.lastName': '姓（任意）',
      'bk.pay.email': 'メールアドレス', 'bk.pay.phone': '電話番号',
      'bk.pay.note': 'ご要望（任意）', 'bk.pay.notePlaceholder': '到着が遅れる、高層階希望、アレルギーなど…',
      'bk.pay.depositTitle': 'ご注意',
      'bk.pay.depositNote': 'ルームキーカードのデポジット200THBを、チェックイン時に現金でお預かりいたします（タイ国籍のお客様は、現金の代わりに国民IDカードまたは運転免許証をお預けいただくことも可能です）。チェックアウト時に全額返金（またはご返却）いたします。',
      'bk.pay.cancelTitle': '変更・キャンセルについて',
      'bk.pay.cancelNote': '現時点でのご請求はございません。お支払いはチェックイン時に現地にて承ります。ご予約の変更・キャンセルをご希望の場合は、予約番号をお控えのうえ、お電話またはメールにてホテルへご連絡ください。フロントにて対応いたします。',
      'bk.pay.depositAck': 'ルームキーカードのデポジット（返金あり）をチェックイン時にお支払いいただくことを理解しました。',
      'bk.pay.err.depositAck': 'デポジットについて理解したことを確認するため、チェックボックスにチェックを入れてください。',
      'bk.pay.howToPay': 'お支払い方法をお選びください',
      'bk.pay.payAtCheckin': 'チェックイン時に現地でお支払い',
      'bk.pay.payOnlineCard': 'オンラインでカード決済',
      'bk.pay.payOnlinePromptpay': 'オンラインでプロンプトペイ決済',
      'bk.pay.cardName': 'カード名義人', 'bk.pay.cardNumber': 'カード番号',
      'bk.pay.cardExpiry': '有効期限（MM/YY）', 'bk.pay.cardCvc': 'セキュリティコード',
      'bk.pay.payAmount': '{amount} を支払う',
      'bk.pay.qrTitle': 'プロンプトペイでお支払い（QRコードをスキャン）',
      'bk.pay.qrInstructions': '銀行アプリを開き、このQRコードをスキャンしてお支払いを完了してください。',
      'bk.pay.qrWaiting': 'お支払いの確認をお待ちしています…',
      'bk.pay.redirectTitle': '銀行での認証手続き',
      'bk.pay.redirectNote': 'お支払いを承認するため、ご利用銀行の安全なページへ移動します。ご予約はすでに確定しています。上記の予約番号をお控えください。',
      'bk.pay.confirmingTitle': 'お支払いを確認しています…',
      'bk.pay.confirmingNote': 'ご利用銀行にお支払いを確認しています。いずれの場合もご予約は確定済みです。お支払いが完了しなかった場合は、チェックイン時にお支払いいただけます。',
      'bk.pay.qrCloseNote': 'ご予約はいずれにしても確定しております。この画面を閉じて後ほどQRコードからお支払いいただくことも、チェックイン時にお支払いいただくことも可能です。プロンプトペイのお支払いが確認され次第メールにてご案内いたします。',
      'bk.pay.paidOnlineNote': '{amount} をオンラインでお支払いいただきました。誠にありがとうございます。',
      'bk.pay.onlinePayNote': 'ただいまオンラインでお支払い手続き中です。お支払い完了後、確認メールをお送りいたします。',
      'bk.pay.err.cardDeclined': 'カードが決済できませんでした。別のカードをお試しいただくか、チェックイン時のお支払いをお選びください。',
      'bk.pay.err.cardIncomplete': 'カード情報をすべてご入力ください。',
      'bk.pay.err.paymentUnavailable': 'ただいまオンライン決済をご利用いただけません。チェックイン時のお支払いをお選びください。',
      'bk.pay.total': '合計',
      'bk.pay.extraBedLine': 'エキストラベッド（3人目）', 'bk.pay.extraBreakfastLine': '追加の朝食',
      'bk.pay.extraBedLabel': 'エキストラベッド', 'bk.pay.extraBedAdd': 'エキストラベッドを追加',
      'bk.pay.processingText': '処理中…',
      'bk.pay.cancel': 'キャンセル', 'bk.pay.close': '閉じる',
      'bk.pay.successTitle': 'ご予約が確定しました！', 'bk.pay.confirmationLabel': '確認番号',
      'bk.pay.emailSentNote': '上記のデポジットのご案内を含む確認メールをお送りしました。',
      'bk.pay.spamNote': '数分経ってもメールが届かない場合は、迷惑メールフォルダをご確認ください。',
      'bk.pay.checkinTimeNote': 'チェックインは14:00（タイ時間）から、チェックアウトは12:00（タイ時間）までです',
      'bk.pay.done': '完了',
      'bk.pay.reserveTitle': '今すぐご予約 — お支払いはチェックイン時に',
      'bk.pay.checkinNote': 'オンラインでのお支払いは不要です。ご予約確認メールをすぐにお送りいたします。残額はチェックイン時にフロントにて、現金・クレジット/デビットカード、またはプロンプトペイQRでお支払いいただけます。',
      'bk.pay.prepayRequiredNote': '混雑期のため、全額前払いが必要です。この期間はチェックイン時のお支払いはお選びいただけず、ご到着がない場合（ノーショー）やキャンセルの場合は返金されません。',
      'bk.pay.testModeTitle': 'テストモード — お支払いは発生しません。',
      'bk.pay.testModeNote': 'この予約ページは決済システムのテストモードに接続されています。フォームの入力は可能ですが、カードへの請求も送金も行われません。ご予約の確定はホテルまでご連絡ください。',
      'bk.pay.noRefundTitle': 'オンラインでのお支払いは返金不可です。',
      'bk.pay.noRefundNote': '今お支払いいただいた後にキャンセル、日程の変更、到着の遅れ、ご不泊となった場合でも、料金は返金されません。変更の可能性がある場合は「チェックイン時にお支払い」をお選びください。ご到着まで請求は発生いたしません。なお、ルームキーカードのデポジット200THBはこれとは別で、必ず返金いたします。',
      'bk.pay.confirmReservation': '予約を確定する',
      'bk.pay.err.required': 'お名前、メールアドレス、電話番号をご入力ください。',
      'bk.pay.err.generic': '問題が発生しました。再度お試しください。',
      'bk.pay.err.network': 'ネットワークエラーです。接続をご確認のうえ再度お試しください。',
      'bk.pay.err.offline': 'ただいま予約システムに接続できません。お電話にてご予約ください（+66 086 326 0664 または +66 038 448 111）。喜んでご対応いたします。',
      'bk.pay.err.soldOut': '申し訳ございません、この客室タイプは選択された日程で満室になりました。',
      'bk.pay.childAgesLabel': 'お子様の年齢',
      'bk.pay.childAgeN': 'お子様{n}の年齢',
      'bk.pay.err.childAges': '朝食料金を正しく計算するため、お子様お一人おひとりの年齢（0〜17歳）をご入力ください。',
      'bk.pay.addRoom': '別のお部屋を追加',
      'bk.pay.addToBooking': '予約に追加',
      'bk.pay.reviewBook': '確認して予約',
      'bk.pay.cartTitle': 'ご予約内容',
      'bk.pay.roomWord': '室', 'bk.pay.roomsWord': '室',
      'bk.pay.grandTotal': '合計金額（全室）',
      'bk.pay.remove': '削除', 'bk.pay.clearCart': 'クリア',
      'bk.pay.confirmBooking': '予約を確定する',
      'bk.pay.roomsInBooking': 'この予約のお部屋',
      'bk.pay.datesMismatch': '1つの予約に含まれるすべてのお部屋は、同じチェックイン・チェックアウト日である必要があります。現在のご予約をご確認いただくか、日付を戻してお部屋を追加してください。',
      'bk.pay.depositNoteMulti': 'ルームキーカードのデポジット{amount} THB（200 THB × {n}室）を、チェックイン時に現金のみで頂戴いたします。チェックアウト時に全額返金いたします。',
      'bk.pay.cartEmpty': 'ご予約内容が空です。お部屋を1室以上追加してください。',
    },
    'zh-Hans': {
      'bk.pay.roomType': '房型', 'bk.pay.guestDetails': '入住人信息',
      'bk.pay.roomPref': '房间偏好', 'bk.pay.nonSmoking': '无烟房', 'bk.pay.smoking': '吸烟房',
      'bk.pay.firstName': '名字', 'bk.pay.lastName': '姓氏（可选）',
      'bk.pay.email': '电子邮箱', 'bk.pay.phone': '电话',
      'bk.pay.note': '特殊要求（可选）', 'bk.pay.notePlaceholder': '晚到、高楼层、过敏信息等…',
      'bk.pay.depositTitle': '请注意',
      'bk.pay.depositNote': '房卡押金200泰铢，于入住时以现金收取（泰国籍客人也可以国民身份证或驾驶证代替现金作为押金），退房时全额退还（或归还证件）。',
      'bk.pay.cancelTitle': '变更与取消',
      'bk.pay.cancelNote': '现在不收取任何费用，您在入住时当面付款。如需变更或取消预订，请携预订编号致电或发送邮件与酒店联系，前台将为您处理。',
      'bk.pay.depositAck': '我了解房卡押金（可全额退还）将于入住时收取。',
      'bk.pay.err.depositAck': '请勾选此框以确认您已了解押金说明。',
      'bk.pay.howToPay': '您希望如何付款？',
      'bk.pay.payAtCheckin': '入住时到店付款',
      'bk.pay.payOnlineCard': '在线信用卡/借记卡支付',
      'bk.pay.payOnlinePromptpay': '在线PromptPay支付',
      'bk.pay.cardName': '持卡人姓名', 'bk.pay.cardNumber': '卡号',
      'bk.pay.cardExpiry': '有效期（MM/YY）', 'bk.pay.cardCvc': '安全码',
      'bk.pay.payAmount': '支付 {amount}',
      'bk.pay.qrTitle': '扫码使用PromptPay付款',
      'bk.pay.qrInstructions': '请打开您的银行应用程序扫描此二维码以完成付款。',
      'bk.pay.qrWaiting': '正在等待付款确认…',
      'bk.pay.redirectTitle': '正在与您的银行确认',
      'bk.pay.redirectNote': '正在跳转至银行安全页面以完成付款验证。您的预订已确认，请记下上方的确认号。',
      'bk.pay.confirmingTitle': '正在核实您的付款…',
      'bk.pay.confirmingNote': '我们正在向银行核实这笔付款。无论结果如何，您的预订均已确认；如付款未成功，您可在入住时付款。',
      'bk.pay.qrCloseNote': '无论付款结果如何，您的预订均已确认。您可以关闭此窗口稍后通过二维码完成付款，或改为入住时付款——PromptPay付款确认后我们将通过邮件通知您。',
      'bk.pay.paidOnlineNote': '您已在线支付 {amount}，感谢您！',
      'bk.pay.onlinePayNote': '您正在进行在线支付。付款完成后我们将立即发送确认邮件。',
      'bk.pay.err.cardDeclined': '您的卡被拒绝。请尝试其他银行卡，或选择入住时付款。',
      'bk.pay.err.cardIncomplete': '请填写完整的银行卡信息。',
      'bk.pay.err.paymentUnavailable': '目前无法使用在线支付，请选择入住时付款。',
      'bk.pay.total': '总计',
      'bk.pay.extraBedLine': '加床（第3位客人）', 'bk.pay.extraBreakfastLine': '额外早餐',
      'bk.pay.extraBedLabel': '加床', 'bk.pay.extraBedAdd': '加一张床',
      'bk.pay.processingText': '处理中…',
      'bk.pay.cancel': '取消', 'bk.pay.close': '关闭',
      'bk.pay.successTitle': '预订成功！', 'bk.pay.confirmationLabel': '确认号',
      'bk.pay.emailSentNote': '包含上述押金说明的确认邮件已发送至您的邮箱。',
      'bk.pay.spamNote': '几分钟内没有收到邮件？请检查您的垃圾邮件文件夹。',
      'bk.pay.checkinTimeNote': '入住时间为14:00（泰国时间）起，退房时间为12:00（泰国时间）前',
      'bk.pay.done': '完成',
      'bk.pay.reserveTitle': '立即预订 — 入住时付款',
      'bk.pay.checkinNote': '您无需在线支付。我们会立即发送预订确认邮件，您可在入住时于前台以现金、信用卡/借记卡或PromptPay二维码支付余款。',
      'bk.pay.prepayRequiredNote': '旺季期间需全额预付——所选日期不提供到店支付，且如未入住（No-show）或取消恕不退款。',
      'bk.pay.testModeTitle': '测试模式 — 不会收取任何款项。',
      'bk.pay.testModeNote': '此预订页面已连接至支付网关的测试模式。您可以填写表单，但不会扣款，也不会发生任何资金转移。请联系酒店确认您的预订。',
      'bk.pay.noRefundTitle': '在线支付恕不退款。',
      'bk.pay.noRefundNote': '如您现在付款，之后取消、变更日期、延迟抵达或未入住，款项恕不退还。如您希望保留灵活性，请改选“到店支付”，在您抵达前不会产生任何扣款。200 泰铢房卡押金为另计，且必定退还。',
      'bk.pay.confirmReservation': '确认预订',
      'bk.pay.err.required': '请填写您的名字、电子邮箱和电话号码。',
      'bk.pay.err.generic': '出现了一些问题，请重试。',
      'bk.pay.err.network': '网络错误，请检查连接后重试。',
      'bk.pay.err.offline': '目前无法连接预订系统，请致电预订 —— +66 086 326 0664 或 +66 038 448 111 —— 我们很乐意为您服务。',
      'bk.pay.err.soldOut': '抱歉，该房型在所选日期已订满。',
      'bk.pay.childAgesLabel': '儿童年龄',
      'bk.pay.childAgeN': '第{n}位儿童年龄',
      'bk.pay.err.childAges': '请填写每位儿童的年龄（0–17岁），以便我们计算正确的早餐费用。',
      'bk.pay.addRoom': '再加一间房',
      'bk.pay.addToBooking': '加入预订',
      'bk.pay.reviewBook': '查看并预订',
      'bk.pay.cartTitle': '您的预订',
      'bk.pay.roomWord': '间房', 'bk.pay.roomsWord': '间房',
      'bk.pay.grandTotal': '总计（全部房间）',
      'bk.pay.remove': '移除', 'bk.pay.clearCart': '清空',
      'bk.pay.confirmBooking': '确认预订',
      'bk.pay.roomsInBooking': '此预订的房间',
      'bk.pay.datesMismatch': '同一预订中的所有房间必须使用相同的入住和退房日期。请先查看当前预订，或将日期改回以继续添加房间。',
      'bk.pay.depositNoteMulti': '房卡押金{amount}泰铢（200泰铢 × {n}间），仅收现金，于入住时收取，退房时全额退还。',
      'bk.pay.cartEmpty': '您的预订为空，请至少添加一间房。',
    },
    'zh-Hant': {
      'bk.pay.roomType': '房型', 'bk.pay.guestDetails': '入住人資訊',
      'bk.pay.roomPref': '房間偏好', 'bk.pay.nonSmoking': '無菸房', 'bk.pay.smoking': '吸菸房',
      'bk.pay.firstName': '名字', 'bk.pay.lastName': '姓氏（可選）',
      'bk.pay.email': '電子郵箱', 'bk.pay.phone': '電話',
      'bk.pay.note': '特殊要求（可選）', 'bk.pay.notePlaceholder': '晚到、高樓層、過敏資訊等…',
      'bk.pay.depositTitle': '請注意',
      'bk.pay.depositNote': '房卡押金200泰銖，於入住時以現金收取（泰國籍貴賓亦可以國民身分證或駕駛執照代替現金作為押金），退房時全額退還（或歸還證件）。',
      'bk.pay.cancelTitle': '變更與取消',
      'bk.pay.cancelNote': '現在不收取任何費用，您於入住時當面付款。如需變更或取消訂房，請攜訂房編號致電或發送電子郵件與飯店聯絡，櫃檯將為您處理。',
      'bk.pay.depositAck': '我了解房卡押金（可全額退還）將於入住時收取。',
      'bk.pay.err.depositAck': '請勾選此框以確認您已了解押金說明。',
      'bk.pay.howToPay': '您希望如何付款？',
      'bk.pay.payAtCheckin': '入住時到店付款',
      'bk.pay.payOnlineCard': '線上信用卡/簽帳卡付款',
      'bk.pay.payOnlinePromptpay': '線上PromptPay付款',
      'bk.pay.cardName': '持卡人姓名', 'bk.pay.cardNumber': '卡號',
      'bk.pay.cardExpiry': '有效期限（MM/YY）', 'bk.pay.cardCvc': '安全碼',
      'bk.pay.payAmount': '支付 {amount}',
      'bk.pay.qrTitle': '掃碼使用PromptPay付款',
      'bk.pay.qrInstructions': '請開啟您的銀行應用程式掃描此二維碼以完成付款。',
      'bk.pay.qrWaiting': '正在等待付款確認…',
      'bk.pay.redirectTitle': '正在與您的銀行確認',
      'bk.pay.redirectNote': '正在跳轉至銀行安全頁面以完成付款驗證。您的預訂已確認，請記下上方的確認號碼。',
      'bk.pay.confirmingTitle': '正在核實您的付款…',
      'bk.pay.confirmingNote': '我們正在向銀行核實這筆付款。無論結果如何，您的預訂均已確認；如付款未成功，您可在入住時付款。',
      'bk.pay.qrCloseNote': '無論付款結果如何，您的預訂均已確認。您可以關閉此視窗稍後透過二維碼完成付款，或改為入住時付款——PromptPay付款確認後我們將透過郵件通知您。',
      'bk.pay.paidOnlineNote': '您已線上支付 {amount}，感謝您！',
      'bk.pay.onlinePayNote': '您正在進行線上支付。付款完成後我們將立即傳送確認郵件。',
      'bk.pay.err.cardDeclined': '您的卡被拒絕。請嘗試其他銀行卡，或選擇入住時付款。',
      'bk.pay.err.cardIncomplete': '請填寫完整的銀行卡資訊。',
      'bk.pay.err.paymentUnavailable': '目前無法使用線上支付，請選擇入住時付款。',
      'bk.pay.total': '總計',
      'bk.pay.extraBedLine': '加床（第3位客人）', 'bk.pay.extraBreakfastLine': '額外早餐',
      'bk.pay.extraBedLabel': '加床', 'bk.pay.extraBedAdd': '加一張床',
      'bk.pay.processingText': '處理中…',
      'bk.pay.cancel': '取消', 'bk.pay.close': '關閉',
      'bk.pay.successTitle': '預訂成功！', 'bk.pay.confirmationLabel': '確認號',
      'bk.pay.emailSentNote': '包含上述押金說明的確認郵件已發送至您的郵箱。',
      'bk.pay.spamNote': '幾分鐘內沒有收到郵件？請檢查您的垃圾郵件資料夾。',
      'bk.pay.checkinTimeNote': '入住時間為14:00（泰國時間）起，退房時間為12:00（泰國時間）前',
      'bk.pay.done': '完成',
      'bk.pay.reserveTitle': '立即預訂 — 入住時付款',
      'bk.pay.checkinNote': '您無需線上支付。我們會立即發送預訂確認郵件，您可在入住時於前台以現金、信用卡/簽帳卡或PromptPay二維碼支付餘款。',
      'bk.pay.prepayRequiredNote': '旺季期間需全額預付——所選日期不提供到店支付，且如未入住（No-show）或取消恕不退款。',
      'bk.pay.testModeTitle': '測試模式 — 不會收取任何款項。',
      'bk.pay.testModeNote': '此訂房頁面已連接至支付閘道的測試模式。您可以填寫表單，但不會扣款，也不會發生任何資金轉移。請聯繫酒店確認您的訂房。',
      'bk.pay.noRefundTitle': '線上付款恕不退款。',
      'bk.pay.noRefundNote': '如您現在付款，之後取消、變更日期、延遲抵達或未入住，款項恕不退還。如您希望保留彈性，請改選「到店付款」，在您抵達前不會產生任何扣款。200 泰銖房卡押金為另計，且必定退還。',
      'bk.pay.confirmReservation': '確認預訂',
      'bk.pay.err.required': '請填寫您的名字、電子郵箱和電話號碼。',
      'bk.pay.err.generic': '出現了一些問題，請重試。',
      'bk.pay.err.network': '網路錯誤，請檢查連線後重試。',
      'bk.pay.err.offline': '目前無法連接預訂系統，請致電預訂 —— +66 086 326 0664 或 +66 038 448 111 —— 我們很樂意為您服務。',
      'bk.pay.err.soldOut': '抱歉，該房型在所選日期已訂滿。',
      'bk.pay.childAgesLabel': '兒童年齡',
      'bk.pay.childAgeN': '第{n}位兒童年齡',
      'bk.pay.err.childAges': '請填寫每位兒童的年齡（0–17歲），以便我們計算正確的早餐費用。',
      'bk.pay.addRoom': '再加一間房',
      'bk.pay.addToBooking': '加入預訂',
      'bk.pay.reviewBook': '查看並預訂',
      'bk.pay.cartTitle': '您的預訂',
      'bk.pay.roomWord': '間房', 'bk.pay.roomsWord': '間房',
      'bk.pay.grandTotal': '總計（全部房間）',
      'bk.pay.remove': '移除', 'bk.pay.clearCart': '清空',
      'bk.pay.confirmBooking': '確認預訂',
      'bk.pay.roomsInBooking': '此預訂的房間',
      'bk.pay.datesMismatch': '同一預訂中的所有房間必須使用相同的入住和退房日期。請先查看目前預訂，或將日期改回以繼續新增房間。',
      'bk.pay.depositNoteMulti': '房卡押金{amount}泰銖（200泰銖 × {n}間），僅收現金，於入住時收取，退房時全額退還。',
      'bk.pay.cartEmpty': '您的預訂為空，請至少新增一間房。',
    },
  };
  if (I) I.registerI18n(STR);

  // ============================================================
  //  Online payment config — GET /api/v1/payments/config, fetched once at
  //  load. Reports WHICH gateway is live (GB Prime Pay today, Omise if that
  //  application is ever approved), its browser-safe public key, and which
  //  methods that merchant account can actually take. Until the hotel's
  //  merchant account is approved and its keys are set server-side,
  //  paymentEnabled stays false and the payment-method choice below never
  //  renders — the guest sees exactly today's pay-at-checkin-only flow.
  //  Fetched eagerly (not lazily on modal open) so it's already resolved by
  //  the time a guest reaches the guest-details step.
  // ============================================================
  var paymentConfig = { provider: null, publicKey: null, paymentEnabled: false, methods: [], tokenizeUrl: null };
  if (window.JPark.api) {
    window.JPark.api.get('/api/v1/payments/config').then(function (r) {
      if (r && !r.error) paymentConfig = r;
    }).catch(function () {});
  }

  // Does the live gateway offer this method? An account can have cards
  // activated while its QR product is still pending approval, so the two are
  // asked about separately rather than assumed to arrive together.
  function methodAvailable(m) {
    var list = paymentConfig.methods;
    // An older backend that predates the per-method list reported only a
    // single paymentEnabled flag; treat that as "both", so a stale API and a
    // fresh booking page never disagree about what to show.
    if (!list || !list.length) return !!paymentConfig.paymentEnabled;
    return list.indexOf(m) !== -1;
  }

  // Lazy-loads Omise.js (card tokenization) only the first time a guest
  // actually picks "pay by card" — never unconditionally, since most guests
  // will never touch it. Resolves once, cached for subsequent opens.
  // Only used when Omise is the live provider; GB Prime Pay tokenizes with a
  // plain fetch and needs no third-party script at all.
  var omiseScriptPromise = null;
  function loadOmiseScript() {
    if (window.Omise) return Promise.resolve();
    if (omiseScriptPromise) return omiseScriptPromise;
    omiseScriptPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.omise.co/omise.js';
      s.onload = resolve;
      s.onerror = function () { omiseScriptPromise = null; reject(new Error('omise.js failed to load')); };
      document.head.appendChild(s);
    });
    return omiseScriptPromise;
  }

  // Reads and sanity-checks the card fields currently in the DOM. Returns
  // { error } for anything incomplete, else the normalized parts each
  // gateway's tokenizer wants. Kept separate from the tokenizers below so
  // both providers validate identically.
  function readCardFields() {
    var name = val('bkpCardName');
    var number = val('bkpCardNumber');
    var expiry = val('bkpCardExpiry');
    var cvc = val('bkpCardCvc');
    var m = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(expiry || '');
    if (!name || !number || !m || !cvc) {
      return { error: TR('bk.pay.err.cardIncomplete') };
    }
    return {
      name: name,
      number: number.replace(/\s+/g, ''),
      cvc: cvc,
      month: parseInt(m[1], 10),
      year: m[2].length === 2 ? (2000 + parseInt(m[2], 10)) : parseInt(m[2], 10),
    };
  }

  // GB Prime Pay tokenization — the browser posts the raw card straight to
  // GB Prime Pay's own API using the PUBLIC key, and only the resulting token
  // is sent to our server. That is the whole point: the card number never
  // touches jparkhotel's backend, which is what keeps this integration out of
  // PCI-DSS scope. Month/year are zero-padded 2-digit STRINGS ("05", "28") —
  // GB Prime Pay rejects integers and 4-digit years.
  function tokenizeGbPrimePay(c) {
    var url = paymentConfig.tokenizeUrl;
    if (!url || !paymentConfig.publicKey) return Promise.resolve({ error: TR('bk.pay.err.generic') });
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + btoa(paymentConfig.publicKey + ':'),
      },
      body: JSON.stringify({
        rememberCard: false,
        card: {
          name: c.name,
          number: c.number,
          expirationMonth: ('0' + c.month).slice(-2),
          expirationYear: String(c.year).slice(-2),
          securityCode: c.cvc,
        },
      }),
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      if (data && String(data.resultCode) === '00' && data.card && data.card.token) {
        return { token: data.card.token };
      }
      // A tokenization failure is a bad card NUMBER (Luhn, expiry, format) —
      // never a decline, which can only happen later at charge time. Same
      // guest-facing wording either way, since the distinction is meaningless
      // to them and the raw gateway code would only confuse.
      return { error: TR('bk.pay.err.cardDeclined') };
    }).catch(function () {
      return { error: TR('bk.pay.err.generic') };
    });
  }

  function tokenizeOmise(c) {
    return loadOmiseScript().then(function () {
      return new Promise(function (resolve) {
        Omise.setPublicKey(paymentConfig.publicKey);
        Omise.createToken('card', {
          name: c.name,
          number: c.number,
          expiration_month: c.month,
          expiration_year: c.year,
          security_code: c.cvc,
        }, function (statusCode, response) {
          if (response && response.object === 'error') {
            resolve({ error: response.message || TR('bk.pay.err.cardDeclined') });
          } else {
            resolve({ token: response.id });
          }
        });
      });
    }).catch(function () {
      return { error: TR('bk.pay.err.generic') };
    });
  }

  // Tokenizes the card fields currently in the DOM with whichever gateway is
  // live, so the raw card number never reaches our own server — only the
  // resulting token does. Resolves { token } or { error }.
  function tokenizeCard() {
    var c = readCardFields();
    if (c.error) return Promise.resolve({ error: c.error });
    return paymentConfig.provider === 'omise' ? tokenizeOmise(c) : tokenizeGbPrimePay(c);
  }

  // ============================================================
  //  Modal DOM (built once, reused across opens)
  // ============================================================
  var overlay = null;
  var box = null;
  var state = null; // current booking context while the modal is open

  // ============================================================
  //  Multi-room "cart": a single booking can hold several rooms, each priced
  //  independently (per-room) and submitted together to POST
  //  /api/v1/reservations/group, which creates one guest_bookings row per room
  //  sharing a group_ref (the guest-facing confirmation number). All rooms in
  //  one booking share the same dates (from the search) — different dates means
  //  a separate booking. The cart lives in sessionStorage so a page refresh or
  //  language switch doesn't lose it. The displayed prices are estimates; the
  //  server always recomputes the authoritative per-room charge on submit.
  // ============================================================
  var CART_KEY = 'jpark.bookingCart';
  var cart = loadCart();
  var pendingGuest = null; // guest details typed before switching to cart mode

  function loadCart() {
    try { var a = JSON.parse(sessionStorage.getItem(CART_KEY)); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function saveCart() {
    try { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
  }
  function cartGrandTotal() {
    return cart.reduce(function (s, it) { return s + Number(it.estTotal || 0); }, 0);
  }
  function roomsWord(n) {
    return n + NB + TR(n === 1 ? 'bk.pay.roomWord' : 'bk.pay.roomsWord');
  }

  // Snapshot the room the modal is currently configuring into a cart line item.
  // Carries only the fields the group endpoint needs to re-price server-side
  // (room, variantLabel, breakfast, smoking, occupancy, childAges) plus a
  // display estimate + labels.
  function currentRoomCartItem() {
    var v = currentVariant();
    return {
      room: state.room,
      roomDisplayName: state.roomDisplayName,
      variantLabel: v.label,
      breakfast: state.breakfast,
      smoking: state.smoking,
      adults: state.adults,
      children: state.children,
      childAges: state.children ? (state.childAges || []).slice() : [],
      extraBed: !!state.extraBed,
      checkIn: state.checkIn,
      checkOut: state.checkOut,
      nights: state.nights,
      estTotal: currentTotal(),
    };
  }

  // Add the room currently in the modal to the cart, enforcing the shared-dates
  // rule (all rooms in one booking share one date range), then return to the
  // room list (close the modal) with the cart bar updated so the guest can pick
  // another room or review & book.
  function addCurrentRoomToCart() {
    clearFormError();
    if (!validateChildAges()) { showFormError(TR('bk.pay.err.childAges')); return; }
    if (cart.length && (cart[0].checkIn !== state.checkIn || cart[0].checkOut !== state.checkOut)) {
      showFormError(TR('bk.pay.datesMismatch'));
      return;
    }
    capturePendingGuest();
    cart.push(currentRoomCartItem());
    saveCart();
    renderCartBar();
    close();
  }

  function capturePendingGuest() {
    if (!document.getElementById('bkpFirstName')) return; // guest fields not shown
    var g = {
      firstName: val('bkpFirstName'),
      lastName: val('bkpLastName'),
      email: val('bkpEmail'),
      phone: val('bkpPhone'),
      note: val('bkpNote'),
    };
    if (g.firstName || g.email || g.phone || g.note) pendingGuest = g;
  }

  function setInput(id, v) { var el = document.getElementById(id); if (el && v != null) el.value = v; }

  // ---- Cart bar (fixed at the bottom of the booking page) ----
  var cartBar = null;
  function buildCartBar() {
    if (cartBar) return;
    cartBar = document.createElement('div');
    cartBar.className = 'bkp-cart-bar';
    cartBar.hidden = true;
    document.body.appendChild(cartBar);
  }
  function renderCartBar() {
    buildCartBar();
    if (!cart.length) { cartBar.hidden = true; return; }
    cartBar.hidden = false;
    cartBar.innerHTML =
      '<div class="bkp-cart-bar-inner">' +
        '<span class="bkp-cart-bar-info">🛎️ ' + roomsWord(cart.length) + ' · ' + money(cartGrandTotal()) + '</span>' +
        '<span class="bkp-cart-bar-actions">' +
          '<button type="button" class="bkp-cart-clear" id="bkpCartClear">' + TR('bk.pay.clearCart') + '</button>' +
          '<button type="button" class="btn btn-solid bkp-cart-review" id="bkpCartReview">' + TR('bk.pay.reviewBook') + '</button>' +
        '</span>' +
      '</div>';
    cartBar.querySelector('#bkpCartReview').addEventListener('click', openCartReview);
    cartBar.querySelector('#bkpCartClear').addEventListener('click', function () {
      cart = [];
      saveCart();
      renderCartBar();
    });
  }

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

  // `overflow:hidden` on body alone doesn't stop background rubber-band
  // scroll on iOS Safari while a modal is open, so the page is pinned with
  // position:fixed instead and the scroll position is restored on close.
  var savedScrollY = 0;
  function lockBodyScroll() {
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = '-' + savedScrollY + 'px';
    document.body.classList.add('bk-pay-open');
  }
  function unlockBodyScroll() {
    document.body.classList.remove('bk-pay-open');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollY);
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    unlockBodyScroll();
    state = null;
    stopQrPoll();
  }

  // ---- Views -------------------------------------------------
  function currentVariant() { return state.variants[state.variantIndex]; }
  // An opted-in extra bed is a flat per-night physical add-on
  // (surcharges.extraBed), NOT another counted guest — so it never changes the
  // adults/children the room is priced/validated for, and it works even when a
  // young child already fills the party to maxGuests (the exact case the
  // room-only guest-count math deliberately never charges a bed for: children
  // under 9 sleep free — see computeGuestSurcharge()). The server mirrors this
  // as a flat add in computeTotal(); the guest-count surcharge formula is left
  // untouched.
  function extraBedRate() {
    var P = window.JPark && window.JPark.pricing;
    return (P && state.extraBed) ? P.getSurcharges().extraBed : 0;
  }
  // How many extra beds the guest-count math is ALREADY charging for (a 3rd+
  // adult, or a child aged 9+ — both billed a bed by computeGuestSurcharge for
  // an extraBedAvailable room). The opt-in toggle is only offered when this is
  // zero, so a bed is never billed twice for the same guest.
  function autoBedCount() {
    var childAges = state.childAges || [];
    var older = childAges.filter(function (a) { return Number(a) >= 9; }).length;
    return Math.max(0, (state.adults || 0) - 2) + older;
  }
  // Offer the extra-bed toggle for a room that allows one, whenever the
  // guest-count math isn't already billing a bed and the party is at least 2
  // (a lone guest already has the room's standard bedding). This covers the
  // key case a plain guest stepper can't: a 3rd guest who is a young child
  // (billed no bed automatically) still getting a real, chargeable extra bed.
  function extraBedEligible() {
    return !!state.extraBedAvailable &&
      autoBedCount() === 0 &&
      ((state.adults || 0) + (state.children || 0)) >= 2;
  }
  // For an occupancy-tier room (all variants share the same room-only
  // rate — Single/Twin/Double is a bed-style preference, not a different
  // product), the breakfast price depends on how many guests are actually
  // staying, not which bed style is picked — see isOccupancyTier() in
  // booking-page.js. Keeps this modal's price in lockstep with the room
  // list's rr-rate rows and with the server's computeTotal(), regardless
  // of which variant the guest ends up selecting below.
  function breakfastRate(v) {
    var P = window.JPark && window.JPark.pricing;
    // Adults only. Children are priced once, by age, in currentSurcharge();
    // adding them here as well billed a lone parent the 2-breakfast tier on
    // top of the child's own age price.
    if (P && P.isOccupancyTier({ variants: state.variants })) {
      return P.occupancyBreakfastPrice({ variants: state.variants }, state.adults || 0);
    }
    return v.bf;
  }
  function currentRate() { var v = currentVariant(); return state.breakfast ? breakfastRate(v) : v.room; }
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
    return P.computeGuestSurcharge({ extraBedAvailable: state.extraBedAvailable }, totalGuests, state.breakfast, state.childAges);
  }
  function currentTotal() { return (currentRate() + currentSurcharge() + extraBedRate()) * state.nights; }

  // 0-3 lines describing the per-night surcharges currently in effect.
  // Children are priced independently of adult count (age 0-4 free, 5-8 a
  // flat childBreakfast5to8, 9+ treated as an adult) — mirrors
  // window.JPark.pricing.computeGuestSurcharge()'s policy so this display
  // estimate never disagrees with what currentSurcharge() actually totals.
  function surchargeNotesHTML() {
    var P = window.JPark && window.JPark.pricing;
    if (!P) return '';
    var surcharges = P.getSurcharges();
    var childAges = state.childAges || [];
    var adults = state.adults || 0;
    var olderChildren = childAges.filter(function (a) { return Number(a) >= 9; }).length;
    var youngerChildren = childAges.filter(function (a) { var n = Number(a); return n >= 5 && n < 9; }).length;
    var extraAdults = Math.max(0, adults - 2) + olderChildren;
    var lines = [];
    if (extraAdults > 0) {
      if (state.breakfast) {
        lines.push('<div class="bkp-surcharge-line">+ ' + TR('bk.pay.extraBreakfastLine') + ': ' + money(surcharges.extraBreakfastGuest) + '</div>');
      }
      if (state.extraBedAvailable) {
        lines.push('<div class="bkp-surcharge-line">+ ' + TR('bk.pay.extraBedLine') + ': ' + money(surcharges.extraBed) + '</div>');
      }
    }
    if (youngerChildren > 0 && state.breakfast) {
      lines.push('<div class="bkp-surcharge-line">+ ' + TR('bk.pay.childAgesLabel') + ' (5–8): ' + money(surcharges.childBreakfast5to8) + '</div>');
    }
    // The opt-in extra bed — a flat add-on independent of the guest-count lines
    // above (it's only ever offered when those aren't already billing a bed).
    if (state.extraBed) {
      lines.push('<div class="bkp-surcharge-line">+ ' + TR('bk.pay.extraBedLine') + ': ' + money(surcharges.extraBed) + '</div>');
    }
    return lines.join('');
  }

  // One required age input per child (0-17), so computeGuestSurcharge() can
  // apply the advertised age-tiered breakfast/extra-guest pricing instead of
  // guessing — left blank on purpose (no default age) so a guest can never
  // silently under- or over-pay by an unset field defaulting to "free" or
  // "adult rate". Values are read/written directly on state.childAges by the
  // input listener wired in wireReservationForm().
  // Opt-in extra-bed checkbox — only rendered for a room that allows one and
  // whose searched party leaves room for a 3rd guest (extraBedEligible()).
  // Priced as one more adult; the per-night surcharge is shown on the pill and
  // itemised in surchargeNotesHTML() once ticked.
  function extraBedFieldHTML() {
    if (!extraBedEligible()) return '';
    var P = window.JPark && window.JPark.pricing;
    var bed = P ? P.getSurcharges().extraBed : 0;
    return '<div class="bkp-field" id="bkpExtraBedField">' +
      '<label class="bkp-label">' + TR('bk.pay.extraBedLabel') + '</label>' +
      '<label class="bkp-radio bkp-checkbox">' +
        '<input type="checkbox" id="bkpExtraBed"' + (state.extraBed ? ' checked' : '') + '> ' +
        esc(TR('bk.pay.extraBedAdd')) + ' · +' + money(bed) +
      '</label>' +
    '</div>';
  }

  // When prepayment is forced, the guest must start on a method the gateway
  // can actually take — PromptPay if that product is live, otherwise card.
  // Picking a method the account doesn't have would dead-end the booking at
  // the final step with no way forward.
  function firstOnlineMethod() {
    return methodAvailable('promptpay') ? 'promptpay' : 'card';
  }

  // Pay-at-check-in normally, but when the hotel is forcing prepayment
  // (busy/holiday — paymentConfig.prepayRequired, which the server only reports
  // true while a gateway is actually live) that option is gone, so start the
  // guest on a valid online method instead.
  function defaultPaymentMethod() {
    return paymentConfig.prepayRequired ? firstOnlineMethod() : 'pay_at_checkin';
  }
  function currentPaymentMethod() {
    var m = (state && state.paymentMethod) || defaultPaymentMethod();
    // Guard: if prepay is required, never resolve to pay-at-check-in (e.g. a
    // stale state set before the config finished loading).
    if (paymentConfig.prepayRequired && m === 'pay_at_checkin') return firstOnlineMethod();
    // Guard: never resolve to an online method this account can't take.
    if (m !== 'pay_at_checkin' && !methodAvailable(m)) {
      return paymentConfig.prepayRequired ? firstOnlineMethod() : 'pay_at_checkin';
    }
    return m;
  }

  // Shared payment-method choice — rendered in both the solo checkout
  // (renderReservationForm) and the cart review (renderCartReview), only
  // when the backend actually has a gateway configured (paymentConfig.
  // paymentEnabled). Defaults to pay-at-checkin either way, so nothing here
  // changes the deposit note/ack below it, which stays required regardless
  // of payment method — a guest paying online in full still owes the
  // separate, in-person key-card deposit.
  function paymentMethodFieldHTML() {
    if (!paymentConfig.paymentEnabled) return '';
    var m = currentPaymentMethod();
    var prepay = !!paymentConfig.prepayRequired;
    // Busy/holiday policy: no pay-at-check-in option, plus an upfront
    // non-refundable notice so the guest agrees to the terms before paying.
    var payAtCheckinRadio = prepay ? '' :
      '<label class="bkp-radio"><input type="radio" name="bkpPaymentMethod" value="pay_at_checkin"' + (m === 'pay_at_checkin' ? ' checked' : '') + '> ' + TR('bk.pay.payAtCheckin') + '</label>';
    var prepayNotice = prepay ?
      '<p class="bkp-prepay-note" style="background:#fdecea;border:1px solid #f0b7b1;border-radius:8px;padding:9px 12px;margin:0 0 8px;color:#8a2a1a;font-size:0.82rem;line-height:1.45">' +
        esc(TR('bk.pay.prepayRequiredNote')) + '</p>' : '';
    // The gateway is running on TEST keys. Everything below behaves exactly
    // as it does live — the card form, the QR, the "paid" banner, the
    // confirmation email — while no money moves at all. Left unsaid, a real
    // guest would finish this form believing they had paid. Said out loud, a
    // deployment still on test keys is obvious to the first person who opens
    // the booking page.
    var testNotice = paymentConfig.testMode ?
      '<p class="bkp-test-note" style="background:#fff4e5;border:1px solid #f0c07a;border-radius:8px;padding:9px 12px;margin:0 0 8px;color:#8a5a00;font-size:0.82rem;line-height:1.45">' +
        '<strong>' + esc(TR('bk.pay.testModeTitle')) + '</strong> ' + esc(TR('bk.pay.testModeNote')) + '</p>' : '';
    return '<div class="bkp-field bkp-payment-method">' +
      '<label class="bkp-label">' + TR('bk.pay.howToPay') + '</label>' +
      testNotice +
      prepayNotice +
      '<div class="bkp-radio-row" id="bkpPaymentMethodRow">' +
        payAtCheckinRadio +
        (methodAvailable('card')
          ? '<label class="bkp-radio"><input type="radio" name="bkpPaymentMethod" value="card"' + (m === 'card' ? ' checked' : '') + '> ' + TR('bk.pay.payOnlineCard') + '</label>'
          : '') +
        (methodAvailable('promptpay')
          ? '<label class="bkp-radio"><input type="radio" name="bkpPaymentMethod" value="promptpay"' + (m === 'promptpay' ? ' checked' : '') + '> ' + TR('bk.pay.payOnlinePromptpay') + '</label>'
          : '') +
      '</div>' +
      // Online payments are non-refundable, so the guest is told here — at the
      // moment of choosing — rather than only in policies.html, which they may
      // never open. It names the flexible alternative in the same breath, so
      // the choice is informed rather than a term discovered afterwards.
      '<p class="bkp-norefund-note">' +
        '<strong>' + esc(TR('bk.pay.noRefundTitle')) + '</strong> ' + esc(TR('bk.pay.noRefundNote')) +
        ' <a href="policies.html#booking-policy" target="_blank" rel="noopener">' + esc(TR('footer.policies')) + '</a>' +
      '</p>' +
      '<div class="bkp-card-fields" id="bkpCardFields"' + (m === 'card' ? '' : ' hidden') + '>' +
        '<div class="bkp-field"><label>' + TR('bk.pay.cardName') + '</label><input id="bkpCardName" autocomplete="cc-name"></div>' +
        '<div class="bkp-field"><label>' + TR('bk.pay.cardNumber') + '</label><input id="bkpCardNumber" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242"></div>' +
        '<div class="bkp-grid-2">' +
          '<div class="bkp-field"><label>' + TR('bk.pay.cardExpiry') + '</label><input id="bkpCardExpiry" autocomplete="cc-exp" placeholder="MM/YY"></div>' +
          '<div class="bkp-field"><label>' + TR('bk.pay.cardCvc') + '</label><input id="bkpCardCvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // Wires the payment-method radio: toggles the card-fields sub-panel and
  // hands control back to the caller (which swaps the pay-note paragraph
  // and the submit button's label — different between the solo and cart
  // views, so left to each).
  function wirePaymentMethodField(onChange) {
    var row = qs('#bkpPaymentMethodRow');
    if (!row) return;
    row.addEventListener('change', function (e) {
      if (e.target.name !== 'bkpPaymentMethod') return;
      state.paymentMethod = e.target.value;
      var cardFields = qs('#bkpCardFields');
      if (cardFields) cardFields.hidden = (state.paymentMethod !== 'card');
      if (onChange) onChange();
    });
  }

  // The pay-at-checkin note ("nothing charged now…") only applies to that
  // choice; paying online swaps in a distinct note rather than showing
  // stale/contradictory copy.
  function paymentNoteText() {
    return currentPaymentMethod() === 'pay_at_checkin' ? TR('bk.pay.checkinNote') : TR('bk.pay.onlinePayNote');
  }

  // Submit button label: the normal action label for pay-at-checkin, or
  // "Pay {amount}" once an online method is chosen — so a guest about to be
  // charged always sees the amount on the button they're about to press.
  function submitButtonLabel(defaultLabel, amount) {
    return currentPaymentMethod() === 'pay_at_checkin' ? defaultLabel : TR('bk.pay.payAmount').replace('{amount}', money(amount));
  }

  // Required deposit acknowledgement — the guest must actively tick this to
  // confirm they've understood the (refundable, cash-at-check-in) key-card
  // deposit spelled out in the note directly above before we take the booking.
  // Reuses the .bkp-radio/.bkp-checkbox pill look so it highlights when ticked.
  function depositAckHTML() {
    return '<label class="bkp-radio bkp-checkbox bkp-deposit-ack" id="bkpDepositAckRow">' +
      '<input type="checkbox" id="bkpDepositAck"' + (state && state.depositAck ? ' checked' : '') + '> ' +
      esc(TR('bk.pay.depositAck')) +
    '</label>';
  }

  function childAgesHTML() {
    if (!state.children) return '';
    var inputs = '';
    for (var i = 0; i < state.children; i++) {
      var val = (state.childAges && state.childAges[i] != null) ? state.childAges[i] : '';
      var label = TR('bk.pay.childAgeN').replace('{n}', String(i + 1));
      inputs += '<input type="number" class="bkp-child-age-input" min="0" max="17" step="1" ' +
        'data-child-index="' + i + '" value="' + esc(String(val)) + '" ' +
        'placeholder="' + esc(label) + '" aria-label="' + esc(label) + '">';
    }
    return '<div class="bkp-field" id="bkpChildAgesField">' +
      '<label class="bkp-label">' + TR('bk.pay.childAgesLabel') + '</label>' +
      '<div class="bkp-child-ages-row">' + inputs + '</div>' +
    '</div>';
  }

  // The only reservation view: no online payment step exists anywhere in
  // this modal. Submitting posts straight to POST /api/v1/reservations,
  // which creates an immediately CONFIRMED booking (holding the room-type
  // inventory) and emails the guest a confirmation showing the balance due
  // — see backend/routes/payments.js.
  function renderReservationForm() {
    var v = currentVariant();
    // In cart mode (a multi-room booking already in progress) this modal is
    // purely "configure THIS room" — guest details + the single-room "Confirm
    // reservation" are hidden; the guest adds the room and finishes via the
    // cart bar's "Review & book". In solo mode it stays the familiar
    // single-room form, with an extra "Add another room" to start a group.
    var inCart = cart.length > 0;
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
          '<div class="bkp-summary-row bkp-summary-time">' + TR('bk.pay.checkinTimeNote') + '</div>' +
        '</div>' +

        '<h3 class="bkp-unavail-title">' + TR('bk.pay.reserveTitle') + '</h3>' +

        variantHTML +

        childAgesHTML() +

        '<div class="bkp-field"><div class="bkp-radio-row" id="bkpBreakfastRow">' +
          '<label class="bkp-radio"><input type="radio" name="bkpBreakfast" value="0"' + (!state.breakfast ? ' checked' : '') + '> ' + TR('bk.roomOnly') + ' — ' + money(v.room) + '</label>' +
          '<label class="bkp-radio"><input type="radio" name="bkpBreakfast" value="1"' + (state.breakfast ? ' checked' : '') + '> ' + TR('bk.withBreakfast') + ' — ' + money(breakfastRate(v)) + '</label>' +
        '</div></div>' +

        '<div class="bkp-field"><label class="bkp-label">' + TR('bk.pay.roomPref') + '</label>' +
          '<div class="bkp-radio-row" id="bkpSmokingRow">' +
          '<label class="bkp-radio"><input type="radio" name="bkpSmoking" value="non_smoking"' + (state.smoking !== 'smoking' ? ' checked' : '') + '> ' + TR('bk.pay.nonSmoking') + '</label>' +
          '<label class="bkp-radio"><input type="radio" name="bkpSmoking" value="smoking"' + (state.smoking === 'smoking' ? ' checked' : '') + '> ' + TR('bk.pay.smoking') + '</label>' +
        '</div></div>' +

        extraBedFieldHTML() +

        '<div id="bkpSurchargeNotes">' + surchargeNotesHTML() + '</div>' +
        '<div class="bkp-total-row"><span>' + TR('bk.pay.total') + '</span><strong id="bkpTotal">' + money(currentTotal()) + '</strong></div>' +

        // Solo mode: an "Add another room" link (above guest details, since
        // adding doesn't need them) turns this into a multi-room booking.
        (inCart ? '' :
          '<button type="button" class="btn btn-outline bkp-add-room-btn" id="bkpAddRoomBtn">＋ ' + TR('bk.pay.addRoom') + '</button>') +

        // Guest details + deposit + pay-note + single-room confirm only exist
        // in solo mode; in cart mode they're collected once at Review & book.
        (inCart ? '' :
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
          paymentMethodFieldHTML() +
          '<div class="bkp-deposit-note"><strong>' + TR('bk.pay.depositTitle') + ':</strong> ' + TR('bk.pay.depositNote') + '</div>' +
          // A guest must know how to change or cancel BEFORE they commit, not
          // only afterwards in the email. This states exactly how to reach us
          // — the deposit note above it stays true regardless of whether the
          // stay total itself was paid online or will be paid at check-in.
          '<div class="bkp-deposit-note bkp-cancel-note"><strong>' + TR('bk.pay.cancelTitle') + ':</strong> ' + TR('bk.pay.cancelNote') + '</div>' +
          depositAckHTML() +
          '<p class="bkp-pp-note" id="bkpPayNote">' + paymentNoteText() + '</p>'
        ) +

        '<p class="bkp-form-error" id="bkpFormError" hidden></p>' +

        (inCart
          ? '<button type="button" class="btn btn-solid bkp-submit-btn" id="bkpAddRoomBtn">' + TR('bk.pay.addToBooking') + '</button>'
          : '<button type="button" class="btn btn-solid bkp-submit-btn" id="bkpSubmitBtn">' + submitButtonLabel(TR('bk.pay.confirmReservation'), currentTotal()) + '</button>') +
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
      if (labels[1]) labels[1].lastChild.textContent = ' ' + TR('bk.withBreakfast') + ' — ' + money(breakfastRate(v));
    }
    // Keep the "Pay {amount}" submit label in step with the total whenever
    // an online payment method is selected (breakfast/extra-bed/variant
    // changes all affect what's about to be charged). No-ops harmlessly in
    // cart-adding mode, where there is no #bkpSubmitBtn.
    setReservationSubmitting(false);
  }

  function wireReservationForm() {
    qs('.bkp-close').addEventListener('click', close);
    var variantRow = qs('#bkpVariantRow');
    if (variantRow) {
      variantRow.addEventListener('change', function (e) {
        if (e.target.name === 'bkpVariant') {
          state.variantIndex = parseInt(e.target.value, 10);
          // Keep state.room pointed at whichever underlying room the newly
          // selected variant actually books under — see open()'s comment.
          state.room = state.variants[state.variantIndex].roomKey || state.room;
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
    qs('#bkpSmokingRow').addEventListener('change', function (e) {
      if (e.target.name === 'bkpSmoking') state.smoking = e.target.value;
    });
    var extraBed = qs('#bkpExtraBed');
    if (extraBed) {
      extraBed.addEventListener('change', function (e) {
        state.extraBed = !!e.target.checked;
        updateReservationTotals();
      });
    }
    var childAgesField = qs('#bkpChildAgesField');
    if (childAgesField) {
      childAgesField.addEventListener('input', function (e) {
        if (!e.target.classList.contains('bkp-child-age-input')) return;
        var idx = parseInt(e.target.dataset.childIndex, 10);
        var raw = e.target.value;
        state.childAges[idx] = raw === '' ? null : parseInt(raw, 10);
        updateReservationTotals();
      });
    }
    // In cart mode the (single) solid button is "Add to booking" and carries
    // id bkpAddRoomBtn; in solo mode the outline "Add another room" carries it
    // and a separate bkpSubmitBtn confirms the single-room booking.
    var addRoomBtn = qs('#bkpAddRoomBtn');
    if (addRoomBtn) addRoomBtn.addEventListener('click', addCurrentRoomToCart);
    var submitBtn = qs('#bkpSubmitBtn');
    if (submitBtn) submitBtn.addEventListener('click', onReservationSubmit);
    wireDepositAck();
    wirePaymentMethodField(function () {
      var noteEl = qs('#bkpPayNote');
      if (noteEl) noteEl.textContent = paymentNoteText();
      setReservationSubmitting(false);
    });
  }

  function setReservationSubmitting(isSubmitting) {
    var btn = qs('#bkpSubmitBtn');
    if (btn) {
      btn.disabled = isSubmitting;
      btn.textContent = isSubmitting ? TR('bk.pay.processingText') : submitButtonLabel(TR('bk.pay.confirmReservation'), currentTotal());
    }
  }

  // Every child age must be an explicit whole number 0-17 before checkout —
  // no default, so a blank field can never silently resolve to the free
  // 0-4 tier or the full adult rate.
  function validateChildAges() {
    if (!state.children) return true;
    var ages = state.childAges || [];
    if (ages.length !== state.children) return false;
    return ages.every(function (a) {
      return typeof a === 'number' && isFinite(a) && a === Math.floor(a) && a >= 0 && a <= 17;
    });
  }

  // The deposit acknowledgement is a hard gate on both submit paths: no
  // booking is sent until the guest has actively ticked it. On a miss we flag
  // the box and surface the same inline error used for the other required
  // fields; ticking it (see wireDepositAck) clears the flag.
  function validateDepositAck() {
    var cb = qs('#bkpDepositAck');
    if (cb && !cb.checked) {
      showFormError(TR('bk.pay.err.depositAck'));
      var row = qs('#bkpDepositAckRow');
      if (row) row.classList.add('bkp-ack-error');
      if (cb.focus) cb.focus();
      return false;
    }
    return true;
  }
  function wireDepositAck() {
    var cb = qs('#bkpDepositAck');
    if (!cb) return;
    cb.addEventListener('change', function (e) {
      state.depositAck = !!e.target.checked;
      if (e.target.checked) {
        var row = qs('#bkpDepositAckRow');
        if (row) row.classList.remove('bkp-ack-error');
        clearFormError();
      }
    });
  }

  function onReservationSubmit() {
    clearFormError();
    if (!validateGuestFields()) return;
    if (!validateChildAges()) {
      showFormError(TR('bk.pay.err.childAges'));
      return;
    }
    if (!validateDepositAck()) return;
    var v = currentVariant();
    var method = currentPaymentMethod();
    var body = {
      room: state.room,
      variantLabel: v.label,
      breakfast: state.breakfast,
      smoking: state.smoking,
      checkIn: state.checkIn,
      checkOut: state.checkOut,
      adults: state.adults,
      children: state.children,
      childAges: state.children ? state.childAges : [],
      extraBed: !!state.extraBed,
      guest: guestPayload(),
      lang: I ? I.getLang() : 'en',
      paymentMethod: method,
    };
    setReservationSubmitting(true);

    // Card must be tokenized client-side BEFORE the request — the server
    // never sees a raw card number, only the resulting token id.
    var ready = method === 'card' ? tokenizeCard() : Promise.resolve({});
    ready.then(function (tok) {
      if (tok.error) {
        setReservationSubmitting(false);
        showFormError(tok.error);
        return null;
      }
      if (tok.token) body.cardToken = tok.token;
      return window.JPark.api.post('/api/v1/reservations', body);
    }).then(function (r) {
      if (!r) return; // tokenize failed, already handled above
      if (!r || r.error) {
        setReservationSubmitting(false);
        // Backend unreachable (network/CORS) or down (5xx): never dead-end the
        // guest on a raw "Network error" — give them the number to call.
        if (!r || r.offline || (r.status && r.status >= 500)) {
          showFormError(TR('bk.pay.err.offline'));
        } else if (r.status === 409) {
          showFormError(TR('bk.pay.err.soldOut'));
        } else if (r.status === 402) {
          showFormError(r.error || TR('bk.pay.err.cardDeclined'));
        } else {
          showFormError(r.error || TR('bk.pay.err.generic'));
        }
        return;
      }
      var payment = r.payment ? Object.assign({}, r.payment, { bookingId: r.booking.id }) : null;
      showSuccess(r.booking.ref, { payment: payment }, r.booking.total);
    }).catch(function () {
      setReservationSubmitting(false);
      showFormError(TR('bk.pay.err.offline'));
    });
  }

  // Shared by the reservation form and the day-use form — showSuccess()'s
  // outcome renders into this view. #bkpPaymentOutcome sits right next to
  // the confirmation number and directly ABOVE the deposit note — a guest
  // who just paid online is exactly the person most likely to skim past a
  // policy line that isn't right next to the "you're paid up" message (see
  // renderPaymentOutcome()).
  function resultViewsHTML() {
    return (
      '<div class="bkp-view" id="bkpViewSuccess" hidden>' +
        '<div class="bkp-success-icon" aria-hidden="true">&#10003;</div>' +
        '<h3>' + TR('bk.pay.successTitle') + '</h3>' +
        '<p>' + TR('bk.pay.confirmationLabel') + ': <strong id="bkpRefText"></strong></p>' +
        '<div class="bkp-payment-outcome" id="bkpPaymentOutcome" hidden></div>' +
        '<div class="bkp-deposit-note"><strong>' + TR('bk.pay.depositTitle') + ':</strong> ' + TR('bk.pay.depositNote') + '</div>' +
        '<div class="bkp-deposit-note bkp-cancel-note"><strong>' + TR('bk.pay.cancelTitle') + ':</strong> ' + TR('bk.pay.cancelNote') + '</div>' +
        '<p class="bkp-success-note bkp-checkin-time-note">' + TR('bk.pay.checkinTimeNote') + '</p>' +
        '<p class="bkp-success-note bkp-email-sent-note">' + TR('bk.pay.emailSentNote') + '</p>' +
        '<p class="bkp-success-note bkp-spam-note">' + TR('bk.pay.spamNote') + '</p>' +
        '<button type="button" class="btn btn-solid" id="bkpDoneBtn">' + TR('bk.pay.done') + '</button>' +
      '</div>'
    );
  }

  // ── PromptPay polling (shared by the solo and group success views) ──────
  var qrPollTimer = null;
  function stopQrPoll() {
    if (qrPollTimer) { clearTimeout(qrPollTimer); qrPollTimer = null; }
  }
  // The booking itself is already confirmed regardless of payment outcome
  // (see this file's header comment), so a poll that never resolves isn't a
  // failure state — it just stops quietly once the modal closes or after a
  // generous cap, without ever telling the guest their RESERVATION failed.
  function pollPaymentStatus(bookingId, onPaid) {
    stopQrPoll();
    var attempts = 0;
    var MAX_ATTEMPTS = 100; // ~8 minutes at 5s intervals
    function tick() {
      if (!overlay || overlay.hidden) return; // guest closed the modal
      attempts++;
      window.JPark.api.get('/api/v1/payments/status/' + bookingId).then(function (r) {
        if (r && !r.error && r.paymentStatus === 'paid') { onPaid(); return; }
        if (attempts < MAX_ATTEMPTS) qrPollTimer = setTimeout(tick, 5000);
      }).catch(function () {
        if (attempts < MAX_ATTEMPTS) qrPollTimer = setTimeout(tick, 5000);
      });
    }
    qrPollTimer = setTimeout(tick, 5000);
  }

  // ── 3-D Secure round trip ───────────────────────────────────────────────
  // A card payment that needs the guest's bank to authenticate them cannot
  // stay inside this modal — the guest genuinely leaves the site and comes
  // back. Two things have to survive that: the confirmation number (so the
  // return page can show it again) and the amount (so the "you paid X"
  // banner is right). sessionStorage is the correct store — it is per-tab
  // and cleared when the tab closes, so a shared/kiosk browser never leaks a
  // previous guest's booking reference into the next guest's session.
  var PENDING_KEY = 'jparkPendingPayment';

  // bookingId is stashed alongside them because it is the ONLY identifier
  // guaranteed to work for every gateway on return. GB Prime Pay's return URL
  // carries a charge reference; Omise's cannot, because Omise mints its charge
  // id during the charge call — after the return URL has already been built.
  // The booking id is known here, client-side, either way.
  function stashPendingPayment(ref, amount, bookingId) {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({
        ref: ref || '', amount: amount || 0, bookingId: bookingId || null,
      }));
    } catch (e) { /* private mode / storage disabled — the return page degrades gracefully */ }
  }
  function readPendingPayment() {
    try {
      var raw = sessionStorage.getItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // Sends the browser to the gateway's authentication page. GB Prime Pay's
  // 3-D Secure endpoint only accepts a FORM POST (a plain link 404s), so this
  // builds and submits a real form rather than assigning location.href. Omise
  // hands back an ordinary GET url, which is handled by the same helper.
  function submitRedirect(redirect) {
    if (!redirect || !redirect.url) return;
    if (String(redirect.method || 'POST').toUpperCase() === 'GET') {
      window.location.href = redirect.url;
      return;
    }
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = redirect.url;
    Object.keys(redirect.fields || {}).forEach(function (k) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = k;
      input.value = redirect.fields[k];
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  // Populates #bkpPaymentOutcome for whichever payment outcome the booking
  // actually has: nothing for pay-at-checkin (payment is null/undefined),
  // a paid-online banner for a synchronously-approved card charge, or a
  // PromptPay QR + live poll that flips to the same paid banner once the
  // guest scans — without ever implying the RESERVATION itself is at risk
  // while payment is still pending.
  function renderPaymentOutcome(el, payment, amount) {
    stopQrPoll();
    if (!el) return;
    if (!payment) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    if (payment.paid) {
      el.className = 'bkp-payment-outcome bkp-payment-paid';
      el.innerHTML = '<strong>' + TR('bk.pay.paidOnlineNote').replace('{amount}', money(amount)) + '</strong>';
      return;
    }
    // 3-D Secure: the guest's bank wants to authenticate them before the card
    // is charged, so they leave this site entirely. The RESERVATION is already
    // confirmed and stored at this point — this is only the payment leg — so
    // the confirmation number and amount are stashed first and shown again on
    // return, and a guest who abandons the challenge still has a valid
    // booking to pay for at check-in.
    if (payment.redirect && payment.redirect.url) {
      el.className = 'bkp-payment-outcome bkp-payment-pending';
      el.innerHTML =
        '<h4>' + TR('bk.pay.redirectTitle') + '</h4>' +
        '<p class="bkp-qr-instructions">' + TR('bk.pay.redirectNote') + '</p>';
      stashPendingPayment(
        qs('#bkpRefText') ? qs('#bkpRefText').textContent : '',
        amount,
        payment.bookingId
      );
      // A tick of delay so the confirmation number above is actually painted
      // before the browser navigates away — otherwise a guest whose bank page
      // errors out never saw their booking reference at all.
      setTimeout(function () { submitRedirect(payment.redirect); }, 900);
      return;
    }
    el.className = 'bkp-payment-outcome bkp-payment-pending';
    el.innerHTML =
      '<h4>' + TR('bk.pay.qrTitle') + '</h4>' +
      (payment.qrImage ? '<img class="bkp-qr-img" src="' + esc(payment.qrImage) + '" alt="' + esc(TR('bk.pay.qrTitle')) + '">' : '') +
      '<p class="bkp-qr-instructions">' + TR('bk.pay.qrInstructions') + '</p>' +
      '<p class="bkp-qr-waiting">' + TR('bk.pay.qrWaiting') + '</p>' +
      '<p class="bkp-qr-close-note">' + TR('bk.pay.qrCloseNote') + '</p>';
    if (payment.bookingId) {
      pollPaymentStatus(payment.bookingId, function () {
        el.className = 'bkp-payment-outcome bkp-payment-paid';
        el.innerHTML = '<strong>' + TR('bk.pay.paidOnlineNote').replace('{amount}', money(amount)) + '</strong>';
      });
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

  function showView(id) {
    Array.prototype.forEach.call(box.querySelectorAll('.bkp-view'), function (v) {
      v.hidden = (v.id !== id);
    });
  }

  function validateGuestFields() {
    var firstName = val('bkpFirstName');
    var email = val('bkpEmail');
    var phone = val('bkpPhone');
    if (!firstName || !email || email.indexOf('@') === -1 || !phone) {
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
  // uses the default "Booking confirmed!" copy. `opts.payment` (overnight
  // flow only) is the `payment` object POST /reservations returns —
  // {method, paid, qrImage, bookingId} — or null/undefined for pay-at-checkin.
  function showSuccess(ref, opts, amount) {
    showView('bkpViewSuccess');
    var refEl = qs('#bkpRefText');
    if (refEl) refEl.textContent = ref;
    // The 14:00/12:00 ICT note only applies to a standard overnight
    // check-in/check-out — the day-use flow books a preferred TIME instead,
    // so it hides this note rather than showing a contradictory one.
    var checkinNoteEl = qs('#bkpViewSuccess .bkp-checkin-time-note');
    if (checkinNoteEl) checkinNoteEl.hidden = !!(opts && opts.pending);
    if (opts && opts.pending) {
      var titleEl = qs('#bkpViewSuccess h3');
      var noteEl = qs('#bkpViewSuccess .bkp-email-sent-note');
      if (titleEl) titleEl.textContent = TR(opts.titleKey);
      if (noteEl) noteEl.textContent = TR(opts.noteKey);
    }
    renderPaymentOutcome(qs('#bkpPaymentOutcome'), opts && opts.payment, amount);
    var doneBtn = qs('#bkpDoneBtn');
    if (doneBtn) doneBtn.addEventListener('click', close);
  }

  // ============================================================
  //  Cart review — the one place a multi-room booking is finalised: shows
  //  every room + its per-room price, the grand total, the per-room deposit,
  //  and the single guest-details form, then posts the whole group.
  // ============================================================
  function openCartReview() {
    if (!cart.length) return;
    build();
    state = { review: true, paymentMethod: defaultPaymentMethod() };
    overlay.hidden = false;
    lockBodyScroll();
    renderCartReview();
  }

  function cartItemHTML(it, i, removable) {
    var guestsStr = countWord(it.adults, 'bk.gAdult1', 'bk.gAdultN') +
      (it.children > 0 ? ' · ' + countWord(it.children, 'bk.gChild1', 'bk.gChildN') : '');
    var bfStr = it.breakfast ? TR('bk.withBreakfast') : TR('bk.roomOnly');
    if (it.extraBed) bfStr += ' · ' + TR('bk.pay.extraBedLabel');
    var name = esc(it.roomDisplayName || it.room) + (it.variantLabel ? ' · ' + esc(it.variantLabel) : '');
    return '<div class="bkp-cart-item">' +
      '<div class="bkp-cart-item-main">' +
        '<div class="bkp-cart-item-name">' + name + '</div>' +
        '<div class="bkp-cart-item-meta">' + guestsStr + ' · ' + bfStr + '</div>' +
      '</div>' +
      '<div class="bkp-cart-item-side">' +
        '<span class="bkp-cart-item-price">' + money(it.estTotal) + '</span>' +
        (removable ? '<button type="button" class="bkp-cart-remove" data-cart-index="' + i + '" aria-label="' + esc(TR('bk.pay.remove')) + '">&times;</button>' : '') +
      '</div>' +
    '</div>';
  }

  function renderCartReview() {
    var ci = cart[0].checkIn, co = cart[0].checkOut, nights = cart[0].nights;
    var depositAmount = 200 * cart.length;
    var roomsHTML = cart.map(function (it, i) { return cartItemHTML(it, i, true); }).join('');

    box.innerHTML =
      '<div class="bkp-head"><span class="bkp-title">' + TR('bk.pay.cartTitle') + ' · ' + roomsWord(cart.length) + '</span>' +
        '<button type="button" class="bkp-close" aria-label="' + TR('bk.pay.close') + '">&times;</button></div>' +
      '<div class="bkp-body">' +
      '<div class="bkp-view" id="bkpViewForm">' +

        '<div class="bkp-summary">' +
          '<div class="bkp-summary-row"><span>' + fmtDate(ci) + ' &rarr; ' + fmtDate(co) + '</span><span>' + nightsWord(nights) + '</span></div>' +
          '<div class="bkp-summary-row bkp-summary-time">' + TR('bk.pay.checkinTimeNote') + '</div>' +
        '</div>' +

        '<p class="bkp-section-label">' + TR('bk.pay.roomsInBooking') + '</p>' +
        '<div class="bkp-cart-list" id="bkpCartList">' + roomsHTML + '</div>' +

        '<div class="bkp-total-row bkp-grand-total"><span>' + TR('bk.pay.grandTotal') + '</span><strong id="bkpGrandTotal">' + money(cartGrandTotal()) + '</strong></div>' +

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

        paymentMethodFieldHTML() +

        '<div class="bkp-deposit-note"><strong>' + TR('bk.pay.depositTitle') + ':</strong> ' +
          (cart.length === 1
            ? TR('bk.pay.depositNote')
            : TR('bk.pay.depositNoteMulti').replace('{amount}', String(depositAmount)).replace('{n}', String(cart.length))) + '</div>' +

        depositAckHTML() +

        '<p class="bkp-pp-note" id="bkpPayNote">' + paymentNoteText() + '</p>' +

        '<p class="bkp-form-error" id="bkpFormError" hidden></p>' +

        '<button type="button" class="btn btn-solid bkp-submit-btn" id="bkpSubmitBtn">' + submitButtonLabel(TR('bk.pay.confirmBooking') + ' · ' + roomsWord(cart.length), cartGrandTotal()) + '</button>' +
      '</div>' +
      groupResultViewHTML() +
      '</div>';

    if (pendingGuest) {
      setInput('bkpFirstName', pendingGuest.firstName);
      setInput('bkpLastName', pendingGuest.lastName);
      setInput('bkpEmail', pendingGuest.email);
      setInput('bkpPhone', pendingGuest.phone);
      setInput('bkpNote', pendingGuest.note);
    }

    qs('.bkp-close').addEventListener('click', close);
    qs('#bkpCartList').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.bkp-cart-remove') : null;
      if (!btn) return;
      cart.splice(parseInt(btn.getAttribute('data-cart-index'), 10), 1);
      saveCart();
      renderCartBar();
      if (!cart.length) { close(); return; }
      renderCartReview();
    });
    qs('#bkpSubmitBtn').addEventListener('click', onGroupSubmit);
    wireDepositAck();
    wirePaymentMethodField(function () {
      var noteEl = qs('#bkpPayNote');
      if (noteEl) noteEl.textContent = paymentNoteText();
      setGroupSubmitting(false);
    });
  }

  function groupResultViewHTML() {
    return (
      '<div class="bkp-view" id="bkpViewSuccess" hidden>' +
        '<div class="bkp-success-icon" aria-hidden="true">&#10003;</div>' +
        '<h3>' + TR('bk.pay.successTitle') + '</h3>' +
        '<p>' + TR('bk.pay.confirmationLabel') + ': <strong id="bkpRefText"></strong></p>' +
        '<div class="bkp-payment-outcome" id="bkpPaymentOutcome" hidden></div>' +
        '<p class="bkp-section-label">' + TR('bk.pay.roomsInBooking') + '</p>' +
        '<div class="bkp-cart-list" id="bkpSuccessRooms"></div>' +
        '<div class="bkp-total-row bkp-grand-total"><span>' + TR('bk.pay.grandTotal') + '</span><strong id="bkpSuccessTotal"></strong></div>' +
        '<div class="bkp-deposit-note" id="bkpSuccessDeposit"></div>' +
        '<p class="bkp-success-note bkp-checkin-time-note">' + TR('bk.pay.checkinTimeNote') + '</p>' +
        '<p class="bkp-success-note bkp-email-sent-note">' + TR('bk.pay.emailSentNote') + '</p>' +
        '<p class="bkp-success-note bkp-spam-note">' + TR('bk.pay.spamNote') + '</p>' +
        '<button type="button" class="btn btn-solid" id="bkpDoneBtn">' + TR('bk.pay.done') + '</button>' +
      '</div>'
    );
  }

  function setGroupSubmitting(isSubmitting) {
    var btn = qs('#bkpSubmitBtn');
    if (btn) {
      btn.disabled = isSubmitting;
      btn.textContent = isSubmitting ? TR('bk.pay.processingText') : submitButtonLabel(TR('bk.pay.confirmBooking') + ' · ' + roomsWord(cart.length), cartGrandTotal());
    }
  }

  function onGroupSubmit() {
    clearFormError();
    if (!cart.length) { showFormError(TR('bk.pay.cartEmpty')); return; }
    if (!validateGuestFields()) return;
    if (!validateDepositAck()) return;
    var method = currentPaymentMethod();

    var handle = function (r, single) {
      if (!r || r.error) {
        setGroupSubmitting(false);
        if (!r || r.offline || (r.status && r.status >= 500)) showFormError(TR('bk.pay.err.offline'));
        else if (r.status === 409) showFormError(r.error || TR('bk.pay.err.soldOut'));
        else if (r.status === 402) showFormError(r.error || TR('bk.pay.err.cardDeclined'));
        else showFormError(r.error || TR('bk.pay.err.generic'));
        return;
      }
      // Normalise the single-room response into the group success shape so
      // one success view handles both.
      var payment = single
        ? (r.payment ? Object.assign({}, r.payment, { bookingId: r.booking.id }) : null)
        : (r.payment ? Object.assign({}, r.payment, { bookingId: r.bookings[0].id }) : null);
      showGroupSuccess(single
        ? { groupRef: r.booking.ref, grandTotal: r.booking.total, rooms: [{ room: r.booking.room, total: r.booking.total }] }
        : r, payment);
    };

    setGroupSubmitting(true);

    var ready = method === 'card' ? tokenizeCard() : Promise.resolve({});
    ready.then(function (tok) {
      if (tok.error) {
        setGroupSubmitting(false);
        showFormError(tok.error);
        return null;
      }
      var cardToken = tok.token;

      // A one-room "booking" is just a normal single reservation — the group
      // endpoint requires 2+ rooms, so route it through /reservations instead.
      if (cart.length === 1) {
        var it = cart[0];
        var singleBody = {
          room: it.room, variantLabel: it.variantLabel,
          breakfast: it.breakfast, smoking: it.smoking,
          checkIn: it.checkIn, checkOut: it.checkOut,
          adults: it.adults, children: it.children,
          childAges: it.children ? it.childAges : [],
          extraBed: !!it.extraBed,
          guest: guestPayload(), lang: I ? I.getLang() : 'en',
          paymentMethod: method,
        };
        if (cardToken) singleBody.cardToken = cardToken;
        return window.JPark.api.post('/api/v1/reservations', singleBody)
          .then(function (r) { handle(r, true); });
      }

      var body = {
        rooms: cart.map(function (it) {
          return {
            room: it.room,
            variantLabel: it.variantLabel,
            breakfast: it.breakfast,
            smoking: it.smoking,
            adults: it.adults,
            children: it.children,
            childAges: it.children ? it.childAges : [],
            extraBed: !!it.extraBed,
          };
        }),
        checkIn: cart[0].checkIn,
        checkOut: cart[0].checkOut,
        guest: guestPayload(),
        lang: I ? I.getLang() : 'en',
        paymentMethod: method,
      };
      if (cardToken) body.cardToken = cardToken;
      return window.JPark.api.post('/api/v1/reservations/group', body)
        .then(function (r) { handle(r, false); });
    }).catch(function () {
      setGroupSubmitting(false);
      showFormError(TR('bk.pay.err.offline'));
    });
  }

  function showGroupSuccess(resp, payment) {
    var n = (resp.rooms && resp.rooms.length) || cart.length;
    showView('bkpViewSuccess');
    var refEl = qs('#bkpRefText');
    if (refEl) refEl.textContent = resp.groupRef || '';
    var roomsEl = qs('#bkpSuccessRooms');
    if (roomsEl && resp.rooms) {
      roomsEl.innerHTML = resp.rooms.map(function (rm) {
        return '<div class="bkp-cart-item"><div class="bkp-cart-item-main">' +
          '<div class="bkp-cart-item-name">' + esc(rm.room) + '</div></div>' +
          '<div class="bkp-cart-item-side"><span class="bkp-cart-item-price">' + money(rm.total) + '</span></div></div>';
      }).join('');
    }
    var grandTotal = resp.grandTotal != null ? resp.grandTotal : cartGrandTotal();
    var totalEl = qs('#bkpSuccessTotal');
    if (totalEl) totalEl.textContent = money(grandTotal);
    var depEl = qs('#bkpSuccessDeposit');
    if (depEl) {
      depEl.innerHTML = '<strong>' + TR('bk.pay.depositTitle') + ':</strong> ' +
        (n === 1
          ? TR('bk.pay.depositNote')
          : TR('bk.pay.depositNoteMulti').replace('{amount}', String(200 * n)).replace('{n}', String(n)));
    }
    renderPaymentOutcome(qs('#bkpPaymentOutcome'), payment, grandTotal);
    // Booking succeeded — empty the cart now so a refresh can't resubmit it
    // (the success view already renders from the server response, not the cart).
    cart = [];
    saveCart();
    pendingGuest = null;
    renderCartBar();
    var doneBtn = qs('#bkpDoneBtn');
    if (doneBtn) doneBtn.addEventListener('click', close);
  }

  // ============================================================
  //  Public entry point, called by booking-page.js's "Book Now" button.
  // ============================================================
  // For a room whose variants are the same physical room priced separately
  // for 1 vs 2 guests (every variant shares the same room-only rate — e.g.
  // Deluxe Single/Double both room:1110, only bf differs), default the
  // selected variant to match the stated party size instead of always
  // defaulting to index 0 (the 1-guest rate) — that mismatch was the root
  // cause of a 2-guest booking silently getting charged the 1-guest
  // breakfast price. Rooms whose variants are genuinely different-sized
  // units (Executive Suite / Grand Suite — room-only price differs between
  // variants too, since "2 Bedrooms" is a bigger physical suite, not just
  // an occupancy tier of the same room) are left at index 0, unchanged —
  // a solo guest may still want the bigger suite, so guest count shouldn't
  // force that choice. Either way the guest can still freely reselect via
  // the variant radio in renderReservationForm() — this only changes the
  // default, never removes the choice.
  function defaultVariantIndex(variants, totalGuests) {
    if (!variants || variants.length < 2) return 0;
    var isOccupancyTier = variants.every(function (v) { return v.room === variants[0].room; });
    if (!isOccupancyTier) return 0;
    return totalGuests >= 2 ? 1 : 0;
  }

  function open(ctx) {
    build();
    var variantIndex = defaultVariantIndex(ctx.variants, (ctx.adults || 0) + (ctx.children || 0));
    state = {
      // A merged Single+Twin display room (booking-page.js's DISPLAY_ROOMS)
      // tags each variant with its own `roomKey` — the real underlying room
      // name/inventory those two bed configs actually book under, since
      // they're two distinct backend rooms shown together as one card. Plain
      // (non-merged) rooms' variants have no roomKey, so this just falls
      // back to ctx.room as before. Kept in sync with variantIndex by the
      // variant radio's change handler in wireReservationForm() below.
      room: ctx.variants[variantIndex].roomKey || ctx.room,
      roomDisplayName: ctx.roomDisplayName,
      maxGuests: ctx.maxGuests,
      extraBedAvailable: ctx.extraBedAvailable,
      variants: ctx.variants,
      checkIn: ctx.checkIn,
      checkOut: ctx.checkOut,
      nights: ctx.nights,
      adults: ctx.adults,
      children: ctx.children,
      childAges: new Array(ctx.children || 0).fill(null),
      variantIndex: variantIndex,
      breakfast: false,
      smoking: 'non_smoking',
      extraBed: false,
      paymentMethod: defaultPaymentMethod(),
    };
    overlay.hidden = false;
    lockBodyScroll();
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
    lockBodyScroll();
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
        if (!r || r.offline || (r.status && r.status >= 500)) {
          showFormError(TR('bk.pay.err.offline'));
        } else {
          showFormError(r.error || TR('bk.pay.err.generic'));
        }
        return;
      }
      showSuccess(r.booking.ref, { pending: true, titleKey: 'bk.dayuse.successTitle', noteKey: 'bk.dayuse.successNote' });
    }).catch(function () {
      setDayUseSubmitting(false);
      showFormError(TR('bk.pay.err.offline'));
    });
  }

  // ── Returning from a 3-D Secure challenge ───────────────────────────────
  // The gateway sends the guest back to booking.html?jpPay=<chargeReference>.
  // By this point the reservation already exists and is confirmed — the only
  // open question is whether the payment leg succeeded, and that answer comes
  // from the gateway's own server-to-server notification, not from anything
  // in this URL. So the confirmation view is reopened and the same poll the
  // PromptPay QR uses runs until payment_status flips to 'paid'.
  //
  // A guest who abandoned the bank page, or whose payment failed, simply
  // never sees it flip — and that is a correct, non-alarming outcome: they
  // keep a valid reservation and pay at check-in.
  function resumeRedirectPayment() {
    var m = /[?&]jpPay=([^&]*)/.exec(window.location.search || '');
    if (!m) return;
    var chargeRef = decodeURIComponent(m[1] || '');
    var stashed = readPendingPayment() || { ref: '', amount: 0 };

    // Scrub the marker from the address bar so a refresh — or a link the
    // guest copies and shares — never reopens someone else's confirmation.
    try {
      var search = window.location.search.replace(/([?&])jpPay=[^&]*/, '$1').replace(/[?&]$/, '').replace(/\?&/, '?');
      window.history.replaceState({}, '', window.location.pathname + search + window.location.hash);
    } catch (e) { /* older browser — the marker just stays in the URL */ }

    // What to poll on. The stashed booking id is preferred because it is exact
    // and gateway-independent; the reference from the URL is the fallback for
    // when sessionStorage is unavailable (private mode) or the guest finished
    // the bank challenge in a different tab.
    var pollKey = stashed.bookingId || chargeRef;
    if (!pollKey) return;

    build();
    overlay.hidden = false;
    lockBodyScroll();
    showSuccess(stashed.ref, {}, stashed.amount);

    var el = qs('#bkpPaymentOutcome');
    if (!el) return;
    el.hidden = false;
    el.className = 'bkp-payment-outcome bkp-payment-pending';
    el.innerHTML =
      '<h4>' + TR('bk.pay.confirmingTitle') + '</h4>' +
      '<p class="bkp-qr-instructions">' + TR('bk.pay.confirmingNote') + '</p>' +
      '<p class="bkp-qr-waiting">' + TR('bk.pay.qrWaiting') + '</p>';
    // The status endpoint accepts a booking id OR any of the reference
    // columns, precisely so this can poll on whichever one survived the round
    // trip — see its comment in backend/routes/payments.js.
    pollPaymentStatus(pollKey, function () {
      el.className = 'bkp-payment-outcome bkp-payment-paid';
      el.innerHTML = '<strong>' + TR('bk.pay.paidOnlineNote').replace('{amount}', money(stashed.amount)) + '</strong>';
    });
  }
  resumeRedirectPayment();

  // Restore the cart bar on load (a sessionStorage cart survives a refresh)
  // and keep its labels — and an open review modal — in sync with the site
  // language.
  renderCartBar();
  document.addEventListener('jpark:langchange', function () {
    renderCartBar();
    if (overlay && !overlay.hidden && state && state.review) renderCartReview();
  });

  window.JPark.bookingFlow = { open: open, openDayUse: openDayUse, review: openCartReview };
})();
