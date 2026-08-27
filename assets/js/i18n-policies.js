/* ============================================================
   J Park Hotel — policies.html copy, in all five site languages.

   Two published policies live here: the booking / cancellation / refund
   terms, and the privacy notice. Both are requirements of the card acquirer's
   merchant checklist (Omise asks the website to carry a "business policy
   (cancellation, refunds)" and a "privacy policy"), and neither existed
   anywhere on the site before — the only cancellation wording was a sentence
   inside the booking modal, which a guest could not find again afterwards and
   a reviewer could not find at all.

   The wording describes what this system ACTUALLY does — it was written
   against the booking flow, the emails and the database, not from a template:

     • the 200 THB key-card deposit and the Thai-ID alternative come from
       booking-payment.js's deposit note;
     • 14:00 / 12:00 ICT come from its check-in note;
     • "contact the hotel to change or cancel" is literally how cancellation
       works — there is no self-service cancel, a staff member does it from
       the console (routes/guestBookings.js);
     • the non-refundable clause describes guest_bookings.non_refundable,
       which is set only when a booking is taken while "require prepayment"
       is on, and which the confirmation email already states;
     • "we never see your card number" is true: cards are tokenised in the
       browser by Omise.js and only a token reaches this server.

   Keep it that way. If the policy and the code ever disagree, the code is
   what a guest experiences and the policy is what the hotel is held to.
   ============================================================ */
(function () {
  'use strict';

  var I = window.JPark && window.JPark.i18n;
  if (!I) return;

  I.registerI18n({
    en: {
      'pol.title': 'Policies',
      'pol.lede': 'Our booking, cancellation and refund terms, and how we handle your personal information.',
      'pol.updated': 'Last updated: 26 August 2026',
      'pol.navBooking': 'Booking, Cancellation & Refunds',
      'pol.navPrivacy': 'Privacy Policy',

      'pol.book.title': 'Booking, Cancellation & Refund Policy',
      'pol.book.pricesH': 'Prices and currency',
      'pol.book.pricesP': 'All prices on this website are shown in Thai Baht (THB), per room, per night. The rate you see during booking is the rate you pay. Room-only and with-breakfast rates are shown separately, and any extra bed or additional guest charge is added and displayed before you confirm.',
      'pol.book.payH': 'How you can pay',
      'pol.book.payP': 'You may pay in person at check-in (cash, card or PromptPay at the front desk), or pay online now by card or PromptPay QR. Both options are offered when you book; paying at check-in is the default.',
      'pol.book.payP2': 'Online card payments are processed by Opn Payments (Omise), a licensed Thai payment provider. Your card details are sent directly to them from your browser and are never seen or stored on our servers.',
      'pol.book.depositH': 'Key-card deposit',
      'pol.book.depositP': 'A 200 THB deposit for your room key card is collected at check-in, and refunded in full at check-out. Thai guests may leave a national ID card or driving licence instead of the cash deposit. This deposit is separate from your room charge and is always refundable.',
      'pol.book.timesH': 'Check-in and check-out',
      'pol.book.timesP': 'Check-in is from 14:00 (ICT) and check-out is until 12:00 (ICT). If you expect to arrive late, please tell us in the special-requests box when booking, or call the hotel.',
      'pol.book.changeH': 'Changing or cancelling a booking',
      'pol.book.changeP': 'To change or cancel a reservation, contact the hotel by phone or email with your confirmation number, and the front desk will take care of it. Cancelling releases the room; it does not return any payment already made.',
      'pol.book.changeP2': 'If you chose to pay at check-in, nothing has been charged and cancelling costs you nothing. If you have already paid online, please read the refund terms below before you cancel.',
      'pol.book.refundH': 'Refunds — please read before paying online',
      'pol.book.refundP': 'Payments made online are non-refundable. Once a payment has been taken we do not refund it — not for a cancellation, a change of dates, a shortened stay, a late arrival, or a no-show. Please be sure of your dates before choosing to pay online. If you would rather keep the flexibility, choose pay at check-in instead, where nothing is charged until you arrive.',
      'pol.book.refundP2': 'Two things are outside these terms and are always put right. The 200 THB key-card deposit is a deposit rather than a payment, and is returned in full at check-out. And a billing mistake is not a refund matter: if you were charged the wrong amount or charged twice, contact us with your confirmation number and we will correct it.',
      'pol.book.nonrefH': 'Prepayment during busy periods',
      'pol.book.nonrefP': 'During certain busy or holiday periods, pay at check-in is not offered and full prepayment is required to hold the room. When this applies it is stated clearly on the booking form before you pay, and again on your confirmation email. The no-refund terms above apply to that payment in the same way.',
      'pol.book.problemH': 'If something goes wrong',
      'pol.book.problemP': 'If you were charged incorrectly, charged twice, or your payment does not appear on your booking, contact us with your confirmation number and we will check it against our payment records and put it right.',

      'pol.priv.title': 'Privacy Policy',
      'pol.priv.whoH': 'Who we are',
      'pol.priv.whoP': 'J Park Hotel, 88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi District, Chon Buri 20000, Thailand, is responsible for the personal information described here. For any question about your data, or to exercise any of the rights below, contact us at jparkhotel1@gmail.com or +66 038 448 111.',
      'pol.priv.collectH': 'What we collect',
      'pol.priv.collectP': 'When you book, we collect your name, email address, phone number, stay dates, room and occupancy, and anything you write in the special-requests box. If you use the guest portal or live chat, we keep the messages and service requests you send us. Our servers also record technical information such as your IP address and browser, which we use to keep the site secure and to prevent abuse.',
      'pol.priv.cardH': 'Card and payment information',
      'pol.priv.cardP': 'We do not collect, see or store your card number, expiry date or security code. When you pay online, those details go from your browser directly to our payment provider, Opn Payments (Omise), which is certified to handle them. We keep only the payment status, the amount, and the provider’s reference for the transaction, so we can match your payment to your booking.',
      'pol.priv.whyH': 'Why we use it',
      'pol.priv.whyP': 'To take and manage your reservation, to send you your confirmation and any updates about your stay, to answer your requests and messages, to take payment and handle refunds, to keep guest records required of hotels under Thai law, and to protect the site against fraud and abuse.',
      'pol.priv.shareH': 'Who we share it with',
      'pol.priv.shareP': 'We share only what is necessary, and only with the services that run this hotel’s systems: our payment provider (Opn Payments / Omise), our email delivery provider, and our hosting and database providers. If your booking came through a travel site such as Agoda or Booking.com, we also exchange booking details with them. We do not sell your personal information, and we do not use it for advertising.',
      'pol.priv.keepH': 'How long we keep it',
      'pol.priv.keepP': 'We keep booking and payment records for as long as we need them for accounting and legal purposes, and guest registration records for the period Thai law requires. Chat messages and service requests are kept while they are useful for serving you and are removed when they are not.',
      'pol.priv.rightsH': 'Your rights',
      'pol.priv.rightsP': 'Under Thailand’s Personal Data Protection Act you may ask us for a copy of the personal information we hold about you, ask us to correct it, ask us to delete it, object to how we use it, or withdraw consent you previously gave. Email jparkhotel1@gmail.com and we will respond. Deleting some information may mean we can no longer hold a booking for you.',
      'pol.priv.cookiesH': 'Cookies and browser storage',
      'pol.priv.cookiesP': 'We use your browser’s local storage to remember practical things — your chosen language, your booking in progress, and whether you are signed in. We do not use advertising cookies and we do not track you across other websites.',
      'pol.priv.secH': 'Security',
      'pol.priv.secP': 'The site is served over an encrypted HTTPS connection, staff accounts are protected by individual passwords and session limits, and access to guest data is restricted to hotel staff who need it. No system is perfectly secure, but if a breach ever affected your data we would tell you and the authorities as the law requires.',
      'pol.priv.changeH': 'Changes to this policy',
      'pol.priv.changeP': 'If we change these policies we will update this page and the date at the top. Material changes will be noted here rather than made quietly.',

      'pol.contactH': 'Contact us',
      'pol.contactP': 'J Park Hotel, 88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi District, Chon Buri 20000, Thailand',
    },

    th: {
      'pol.title': 'นโยบายของโรงแรม',
      'pol.lede': 'เงื่อนไขการจอง การยกเลิก และการคืนเงิน รวมถึงวิธีที่เราดูแลข้อมูลส่วนบุคคลของท่าน',
      'pol.updated': 'ปรับปรุงล่าสุด: 26 สิงหาคม 2569',
      'pol.navBooking': 'การจอง การยกเลิก และการคืนเงิน',
      'pol.navPrivacy': 'นโยบายความเป็นส่วนตัว',

      'pol.book.title': 'นโยบายการจอง การยกเลิก และการคืนเงิน',
      'pol.book.pricesH': 'ราคาและสกุลเงิน',
      'pol.book.pricesP': 'ราคาทั้งหมดบนเว็บไซต์นี้แสดงเป็นเงินบาท (THB) ต่อห้อง ต่อคืน ราคาที่ท่านเห็นในขั้นตอนการจองคือราคาที่ท่านชำระ ราคาเฉพาะห้องพักและราคารวมอาหารเช้าจะแสดงแยกกัน และค่าเตียงเสริมหรือค่าผู้เข้าพักเพิ่มจะถูกคำนวณและแสดงให้เห็นก่อนที่ท่านจะยืนยันการจอง',
      'pol.book.payH': 'ช่องทางการชำระเงิน',
      'pol.book.payP': 'ท่านสามารถชำระเงินด้วยตนเอง ณ วันเช็คอิน (เงินสด บัตรเครดิต/เดบิต หรือพร้อมเพย์ที่แผนกต้อนรับ) หรือชำระออนไลน์ทันทีด้วยบัตรหรือคิวอาร์พร้อมเพย์ ทั้งสองทางเลือกจะแสดงในขั้นตอนการจอง โดยการชำระ ณ วันเช็คอินเป็นค่าเริ่มต้น',
      'pol.book.payP2': 'การชำระด้วยบัตรออนไลน์ดำเนินการโดย Opn Payments (Omise) ผู้ให้บริการรับชำระเงินที่ได้รับอนุญาตในประเทศไทย ข้อมูลบัตรของท่านจะถูกส่งจากเบราว์เซอร์ไปยังผู้ให้บริการโดยตรง และจะไม่ถูกมองเห็นหรือจัดเก็บบนเซิร์ฟเวอร์ของเรา',
      'pol.book.depositH': 'เงินมัดจำบัตรคีย์การ์ด',
      'pol.book.depositP': 'มีการเรียกเก็บเงินมัดจำบัตรคีย์การ์ดห้องพัก 200 บาท ณ วันเช็คอิน และคืนให้เต็มจำนวนเมื่อเช็คเอาท์ ผู้เข้าพักสัญชาติไทยสามารถฝากบัตรประจำตัวประชาชนหรือใบขับขี่แทนเงินมัดจำได้ เงินมัดจำนี้แยกต่างหากจากค่าห้องพัก และสามารถขอคืนได้เสมอ',
      'pol.book.timesH': 'เวลาเช็คอินและเช็คเอาท์',
      'pol.book.timesP': 'เช็คอินตั้งแต่เวลา 14:00 น. (เวลาประเทศไทย) และเช็คเอาท์ภายในเวลา 12:00 น. (เวลาประเทศไทย) หากท่านคาดว่าจะเดินทางมาถึงดึก กรุณาแจ้งในช่องคำขอพิเศษขณะจอง หรือโทรศัพท์แจ้งโรงแรม',
      'pol.book.changeH': 'การเปลี่ยนแปลงหรือยกเลิกการจอง',
      'pol.book.changeP': 'หากต้องการเปลี่ยนแปลงหรือยกเลิกการจอง กรุณาติดต่อโรงแรมทางโทรศัพท์หรืออีเมลพร้อมแจ้งหมายเลขการจอง แล้วแผนกต้อนรับจะดำเนินการให้ ทั้งนี้การยกเลิกเป็นเพียงการปล่อยห้องพักคืน ไม่ใช่การคืนเงินที่ชำระมาแล้ว',
      'pol.book.changeP2': 'หากท่านเลือกชำระเงิน ณ วันเช็คอิน จะยังไม่มีการเรียกเก็บเงินใด ๆ และการยกเลิกไม่มีค่าใช้จ่าย แต่หากท่านชำระเงินออนไลน์ไปแล้ว กรุณาอ่านเงื่อนไขการคืนเงินด้านล่างก่อนยกเลิก',
      'pol.book.refundH': 'การคืนเงิน — กรุณาอ่านก่อนชำระเงินออนไลน์',
      'pol.book.refundP': 'เงินที่ชำระผ่านช่องทางออนไลน์ไม่สามารถขอคืนได้ เมื่อมีการชำระเงินแล้ว เราไม่คืนเงินในทุกกรณี ไม่ว่าจะเป็นการยกเลิก การเปลี่ยนวันเข้าพัก การลดจำนวนคืน การมาถึงล่าช้า หรือการไม่เข้าพัก (No-show) กรุณาตรวจสอบวันที่ให้แน่ใจก่อนเลือกชำระเงินออนไลน์ หากท่านต้องการความยืดหยุ่น กรุณาเลือกชำระเงิน ณ วันเช็คอินแทน ซึ่งจะไม่มีการเรียกเก็บเงินจนกว่าท่านจะเดินทางมาถึง',
      'pol.book.refundP2': 'มีสองกรณีที่อยู่นอกเหนือเงื่อนไขนี้ และเราจะดำเนินการให้เสมอ ได้แก่ เงินมัดจำบัตรคีย์การ์ด 200 บาท ซึ่งเป็นเงินมัดจำ ไม่ใช่ค่าห้องพัก และจะคืนให้เต็มจำนวนเมื่อเช็คเอาท์ และกรณีเรียกเก็บเงินผิดพลาด ซึ่งไม่ใช่เรื่องของการคืนเงิน หากท่านถูกเรียกเก็บเงินผิดจำนวนหรือถูกเรียกเก็บซ้ำ กรุณาติดต่อเราพร้อมแจ้งหมายเลขการจอง แล้วเราจะแก้ไขให้ถูกต้อง',
      'pol.book.nonrefH': 'การชำระเงินล่วงหน้าในช่วงที่มีผู้เข้าพักจำนวนมาก',
      'pol.book.nonrefP': 'ในช่วงที่มีผู้เข้าพักจำนวนมากหรือช่วงวันหยุดบางช่วง จะไม่มีตัวเลือกชำระเงิน ณ วันเช็คอิน และจำเป็นต้องชำระเงินล่วงหน้าเต็มจำนวนเพื่อสำรองห้องพัก กรณีนี้จะระบุไว้อย่างชัดเจนในแบบฟอร์มการจองก่อนที่ท่านจะชำระเงิน และระบุอีกครั้งในอีเมลยืนยันการจอง โดยเงื่อนไขไม่คืนเงินข้างต้นมีผลกับการชำระเงินดังกล่าวเช่นกัน',
      'pol.book.problemH': 'หากเกิดข้อผิดพลาด',
      'pol.book.problemP': 'หากท่านถูกเรียกเก็บเงินไม่ถูกต้อง ถูกเรียกเก็บซ้ำ หรือการชำระเงินของท่านไม่ปรากฏในการจอง กรุณาติดต่อเราพร้อมแจ้งหมายเลขการจอง เราจะตรวจสอบกับบันทึกการชำระเงินและแก้ไขให้ถูกต้อง',

      'pol.priv.title': 'นโยบายความเป็นส่วนตัว',
      'pol.priv.whoH': 'เราคือใคร',
      'pol.priv.whoP': 'โรงแรมเจ พาร์ค เลขที่ 88/88 ถนนสุขประยูร ตำบลนาป่า อำเภอเมืองชลบุรี จังหวัดชลบุรี 20000 ประเทศไทย เป็นผู้รับผิดชอบข้อมูลส่วนบุคคลที่ระบุไว้ในนโยบายนี้ หากมีข้อสงสัยเกี่ยวกับข้อมูลของท่าน หรือต้องการใช้สิทธิตามที่ระบุด้านล่าง กรุณาติดต่อ jparkhotel1@gmail.com หรือ +66 038 448 111',
      'pol.priv.collectH': 'ข้อมูลที่เราเก็บรวบรวม',
      'pol.priv.collectP': 'เมื่อท่านจองห้องพัก เราเก็บชื่อ อีเมล หมายเลขโทรศัพท์ วันที่เข้าพัก ประเภทห้องและจำนวนผู้เข้าพัก รวมถึงข้อความที่ท่านกรอกในช่องคำขอพิเศษ หากท่านใช้พอร์ทัลผู้เข้าพักหรือแชทสด เราจะเก็บข้อความและคำขอบริการที่ท่านส่งถึงเรา เซิร์ฟเวอร์ของเรายังบันทึกข้อมูลทางเทคนิค เช่น หมายเลข IP และเบราว์เซอร์ของท่าน เพื่อรักษาความปลอดภัยของเว็บไซต์และป้องกันการใช้งานในทางที่ผิด',
      'pol.priv.cardH': 'ข้อมูลบัตรและการชำระเงิน',
      'pol.priv.cardP': 'เราไม่เก็บ ไม่เห็น และไม่จัดเก็บหมายเลขบัตร วันหมดอายุ หรือรหัสความปลอดภัยของท่าน เมื่อท่านชำระเงินออนไลน์ ข้อมูลดังกล่าวจะถูกส่งจากเบราว์เซอร์ไปยังผู้ให้บริการรับชำระเงินของเรา Opn Payments (Omise) ซึ่งได้รับการรับรองให้จัดการข้อมูลประเภทนี้โดยตรง เราเก็บเพียงสถานะการชำระเงิน จำนวนเงิน และหมายเลขอ้างอิงรายการจากผู้ให้บริการ เพื่อจับคู่การชำระเงินกับการจองของท่าน',
      'pol.priv.whyH': 'วัตถุประสงค์ในการใช้ข้อมูล',
      'pol.priv.whyP': 'เพื่อรับและจัดการการจองของท่าน ส่งอีเมลยืนยันและข้อมูลอัปเดตเกี่ยวกับการเข้าพัก ตอบคำขอและข้อความของท่าน รับชำระเงินและดำเนินการคืนเงิน จัดทำทะเบียนผู้เข้าพักตามที่กฎหมายไทยกำหนดสำหรับโรงแรม และปกป้องเว็บไซต์จากการฉ้อโกงและการใช้งานในทางที่ผิด',
      'pol.priv.shareH': 'การเปิดเผยข้อมูล',
      'pol.priv.shareP': 'เราเปิดเผยข้อมูลเท่าที่จำเป็น และเฉพาะกับผู้ให้บริการที่ใช้ดำเนินระบบของโรงแรมเท่านั้น ได้แก่ ผู้ให้บริการรับชำระเงิน (Opn Payments / Omise) ผู้ให้บริการจัดส่งอีเมล และผู้ให้บริการโฮสติ้งและฐานข้อมูล หากการจองของท่านมาจากเว็บไซต์ท่องเที่ยว เช่น Agoda หรือ Booking.com เราจะแลกเปลี่ยนรายละเอียดการจองกับผู้ให้บริการนั้นด้วย เราไม่ขายข้อมูลส่วนบุคคลของท่าน และไม่นำไปใช้เพื่อการโฆษณา',
      'pol.priv.keepH': 'ระยะเวลาการเก็บรักษาข้อมูล',
      'pol.priv.keepP': 'เราเก็บบันทึกการจองและการชำระเงินไว้ตามระยะเวลาที่จำเป็นสำหรับการบัญชีและตามกฎหมาย และเก็บทะเบียนผู้เข้าพักตามระยะเวลาที่กฎหมายไทยกำหนด ข้อความแชทและคำขอบริการจะถูกเก็บไว้เท่าที่ยังเป็นประโยชน์ต่อการให้บริการท่าน และจะถูกลบเมื่อไม่จำเป็นแล้ว',
      'pol.priv.rightsH': 'สิทธิของท่าน',
      'pol.priv.rightsP': 'ภายใต้พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคลของประเทศไทย ท่านมีสิทธิขอสำเนาข้อมูลส่วนบุคคลที่เรามีอยู่ ขอให้แก้ไขให้ถูกต้อง ขอให้ลบ คัดค้านการใช้ข้อมูล หรือถอนความยินยอมที่เคยให้ไว้ กรุณาส่งอีเมลถึง jparkhotel1@gmail.com แล้วเราจะดำเนินการตอบกลับ ทั้งนี้การลบข้อมูลบางส่วนอาจทำให้เราไม่สามารถรักษาการจองของท่านไว้ได้',
      'pol.priv.cookiesH': 'คุกกี้และการจัดเก็บข้อมูลในเบราว์เซอร์',
      'pol.priv.cookiesP': 'เราใช้พื้นที่จัดเก็บข้อมูลในเบราว์เซอร์ของท่านเพื่อจดจำสิ่งที่จำเป็นต่อการใช้งาน ได้แก่ ภาษาที่ท่านเลือก การจองที่กำลังดำเนินการ และสถานะการเข้าสู่ระบบ เราไม่ใช้คุกกี้เพื่อการโฆษณา และไม่ติดตามท่านไปยังเว็บไซต์อื่น',
      'pol.priv.secH': 'ความปลอดภัย',
      'pol.priv.secP': 'เว็บไซต์ให้บริการผ่านการเชื่อมต่อที่เข้ารหัส HTTPS บัญชีพนักงานได้รับการป้องกันด้วยรหัสผ่านรายบุคคลและการจำกัดจำนวนเซสชัน และการเข้าถึงข้อมูลผู้เข้าพักจำกัดเฉพาะพนักงานที่จำเป็นต้องใช้ ไม่มีระบบใดปลอดภัยอย่างสมบูรณ์ แต่หากเกิดเหตุละเมิดข้อมูลที่กระทบต่อข้อมูลของท่าน เราจะแจ้งให้ท่านและหน่วยงานที่เกี่ยวข้องทราบตามที่กฎหมายกำหนด',
      'pol.priv.changeH': 'การเปลี่ยนแปลงนโยบาย',
      'pol.priv.changeP': 'หากเรามีการเปลี่ยนแปลงนโยบายเหล่านี้ เราจะปรับปรุงหน้านี้พร้อมวันที่ด้านบน การเปลี่ยนแปลงที่มีนัยสำคัญจะระบุไว้ที่นี่ ไม่ใช่การเปลี่ยนแปลงโดยไม่แจ้งให้ทราบ',

      'pol.contactH': 'ติดต่อเรา',
      'pol.contactP': 'โรงแรมเจ พาร์ค 88/88 ถนนสุขประยูร ตำบลนาป่า อำเภอเมืองชลบุรี จังหวัดชลบุรี 20000 ประเทศไทย',
    },

    ja: {
      'pol.title': 'ご利用規約・方針',
      'pol.lede': 'ご予約・キャンセル・返金に関する規定と、お客様の個人情報の取り扱いについて。',
      'pol.updated': '最終更新日：2026年8月26日',
      'pol.navBooking': 'ご予約・キャンセル・返金',
      'pol.navPrivacy': 'プライバシーポリシー',

      'pol.book.title': 'ご予約・キャンセル・返金に関する規定',
      'pol.book.pricesH': '料金と通貨',
      'pol.book.pricesP': '当ウェブサイトの料金はすべてタイバーツ（THB）で、1室1泊あたりの表示です。ご予約時に表示された料金がお支払い金額となります。室料のみの料金と朝食付きの料金は別々に表示され、エキストラベッドや追加のご宿泊者の料金は、ご確定前に加算して表示されます。',
      'pol.book.payH': 'お支払い方法',
      'pol.book.payP': 'チェックイン時に現地でのお支払い（フロントにて現金・カード・PromptPay）、またはご予約時のオンライン決済（カードまたはPromptPay QR）をお選びいただけます。ご予約の際に両方の選択肢が表示され、既定はチェックイン時のお支払いです。',
      'pol.book.payP2': 'オンラインのカード決済は、タイの認可決済事業者である Opn Payments（Omise）が処理いたします。カード情報はお客様のブラウザから同社へ直接送信され、当ホテルのサーバーが閲覧・保存することは一切ありません。',
      'pol.book.depositH': 'ルームキーカードのデポジット',
      'pol.book.depositP': 'チェックイン時にルームキーカードのデポジットとして200THBをお預かりし、チェックアウト時に全額返金いたします。タイ国籍のお客様は、現金の代わりに国民IDカードまたは運転免許証をお預けいただけます。このデポジットは室料とは別であり、常に返金の対象です。',
      'pol.book.timesH': 'チェックイン・チェックアウト',
      'pol.book.timesP': 'チェックインは14:00（タイ時間）から、チェックアウトは12:00（タイ時間）までです。ご到着が遅くなる場合は、ご予約時のご要望欄にご記入いただくか、ホテルまでお電話ください。',
      'pol.book.changeH': 'ご予約の変更・キャンセル',
      'pol.book.changeP': 'ご予約の変更・キャンセルをご希望の場合は、予約番号をお控えのうえ、お電話またはメールにてホテルへご連絡ください。フロントにて対応いたします。なお、キャンセルはお部屋を解放する手続きであり、お支払い済みの料金の返金を伴うものではございません。',
      'pol.book.changeP2': 'チェックイン時のお支払いをお選びの場合、ご請求は発生しておらず、キャンセルに費用はかかりません。すでにオンラインでお支払い済みの場合は、キャンセルの前に下記の返金条件を必ずご確認ください。',
      'pol.book.refundH': '返金について — オンラインでお支払いの前に必ずお読みください',
      'pol.book.refundP': 'オンラインでお支払いいただいた料金は返金いたしかねます。お支払いが完了した後は、キャンセル、日程の変更、ご滞在の短縮、到着の遅れ、ご不泊（ノーショー）のいずれの場合も返金はいたしません。オンラインでのお支払いをお選びになる前に、日程を十分にご確認ください。変更の可能性がある場合は、チェックイン時のお支払いをお選びいただければ、ご到着まで請求は発生いたしません。',
      'pol.book.refundP2': '次の二点はこの条件の対象外で、必ず対応いたします。ひとつはルームキーカードのデポジット200THBで、これは料金ではなく預り金のため、チェックアウト時に全額返金いたします。もうひとつは請求の誤りで、これは返金ではなく訂正の問題です。金額の相違や二重請求があった場合は、予約番号をお知らせのうえご連絡ください。',
      'pol.book.nonrefH': '繁忙期の前払いについて',
      'pol.book.nonrefP': '繁忙期や特定の休日期間には、チェックイン時のお支払いはお選びいただけず、お部屋の確保に全額前払いが必要となります。該当する場合は、お支払い前の予約フォームおよび確定メールにて明示いたします。そのお支払いにも上記の返金不可の条件が同様に適用されます。',
      'pol.book.problemH': '不備があった場合',
      'pol.book.problemP': '請求金額の誤り、二重請求、またはお支払いがご予約に反映されていない場合は、予約番号をお知らせのうえご連絡ください。決済記録と照合し、速やかに訂正いたします。',

      'pol.priv.title': 'プライバシーポリシー',
      'pol.priv.whoH': '当ホテルについて',
      'pol.priv.whoP': 'J Park Hotel（タイ王国チョンブリー県ムアンチョンブリー郡ナーパー、タノン・スックプラユーン 88/88、20000）が、本ポリシーに記載する個人情報の管理者です。お客様のデータに関するお問い合わせ、または下記の権利の行使については、jparkhotel1@gmail.com または +66 038 448 111 までご連絡ください。',
      'pol.priv.collectH': '取得する情報',
      'pol.priv.collectP': 'ご予約の際に、お名前、メールアドレス、電話番号、ご滞在日程、お部屋タイプとご宿泊人数、およびご要望欄にご記入いただいた内容を取得します。ゲストポータルやライブチャットをご利用の場合は、送信いただいたメッセージやサービスリクエストを保存します。また当社サーバーは、サイトの安全確保と不正利用防止のため、IPアドレスやブラウザなどの技術情報を記録します。',
      'pol.priv.cardH': 'カード・決済情報',
      'pol.priv.cardP': 'カード番号、有効期限、セキュリティコードを当ホテルが取得・閲覧・保存することはありません。オンライン決済の際、これらの情報はお客様のブラウザから、取り扱い認証を受けた決済事業者 Opn Payments（Omise）へ直接送信されます。当ホテルが保持するのは、決済ステータス、金額、および取引の参照番号のみで、お支払いとご予約を照合するために使用します。',
      'pol.priv.whyH': '利用目的',
      'pol.priv.whyP': 'ご予約の受付と管理、確定メールおよびご滞在に関するご案内の送付、ご要望やメッセージへの対応、決済および返金処理、タイの法令が宿泊施設に義務付ける宿泊者名簿の作成、ならびに不正行為や不適切な利用からサイトを保護するため。',
      'pol.priv.shareH': '第三者への提供',
      'pol.priv.shareP': '必要最小限の情報を、当ホテルのシステムを運用する事業者にのみ提供します。決済事業者（Opn Payments / Omise）、メール配信事業者、ホスティングおよびデータベース事業者です。Agoda や Booking.com などの旅行サイト経由のご予約の場合は、当該サイトとも予約内容をやり取りします。個人情報の販売や広告目的での利用は一切行いません。',
      'pol.priv.keepH': '保存期間',
      'pol.priv.keepP': 'ご予約および決済の記録は、会計上・法令上必要な期間、宿泊者登録の記録はタイの法令が定める期間、保存します。チャットのメッセージやサービスリクエストは、お客様への対応に必要な間のみ保存し、不要となった時点で削除します。',
      'pol.priv.rightsH': 'お客様の権利',
      'pol.priv.rightsP': 'タイ個人情報保護法（PDPA）に基づき、当ホテルが保有するお客様の個人情報の写しのご請求、訂正、削除、利用への異議、または既にいただいた同意の撤回をご請求いただけます。jparkhotel1@gmail.com までメールにてご連絡ください。なお、一部の情報を削除した場合、ご予約をお預かりできなくなることがあります。',
      'pol.priv.cookiesH': 'クッキーとブラウザ保存',
      'pol.priv.cookiesP': 'お客様のブラウザのローカルストレージを、選択された言語、入力途中のご予約、ログイン状態といった実用的な情報の記憶にのみ使用します。広告用クッキーの使用や、他サイトを横断した追跡は行いません。',
      'pol.priv.secH': 'セキュリティ',
      'pol.priv.secP': '当サイトは暗号化されたHTTPS接続で提供され、スタッフアカウントは個別のパスワードとセッション数の制限で保護され、宿泊者データへのアクセスは業務上必要なスタッフに限定されています。完全に安全なシステムは存在しませんが、お客様のデータに影響する侵害が発生した場合は、法令に従いお客様および当局へ通知いたします。',
      'pol.priv.changeH': '本ポリシーの変更',
      'pol.priv.changeP': '本ポリシーを変更する場合は、このページと冒頭の日付を更新します。重要な変更は、告知なく行うのではなく、ここに明記いたします。',

      'pol.contactH': 'お問い合わせ',
      'pol.contactP': 'J Park Hotel, 88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi District, Chon Buri 20000, Thailand',
    },

    'zh-Hans': {
      'pol.title': '酒店政策',
      'pol.lede': '我们的预订、取消与退款条款，以及我们如何处理您的个人信息。',
      'pol.updated': '最后更新：2026年8月26日',
      'pol.navBooking': '预订、取消与退款',
      'pol.navPrivacy': '隐私政策',

      'pol.book.title': '预订、取消与退款政策',
      'pol.book.pricesH': '价格与货币',
      'pol.book.pricesP': '本网站所有价格均以泰铢（THB）显示，按每间客房每晚计算。您在预订时看到的价格即为您支付的价格。仅含房费与含早餐的价格分别显示，加床或加人费用会在您确认前计入并显示。',
      'pol.book.payH': '支付方式',
      'pol.book.payP': '您可以在入住时于前台当面支付（现金、银行卡或 PromptPay），也可以现在通过银行卡或 PromptPay 二维码在线支付。预订时会同时提供两种选择，默认为入住时支付。',
      'pol.book.payP2': '在线银行卡支付由泰国持牌支付服务商 Opn Payments（Omise）处理。您的卡片信息由浏览器直接发送至该服务商，我们的服务器不会看到或存储这些信息。',
      'pol.book.depositH': '房卡押金',
      'pol.book.depositP': '入住时收取房卡押金 200 泰铢，退房时全额退还。泰国籍客人可以国民身份证或驾驶证代替现金押金。该押金与房费分开计算，任何情况下均可退还。',
      'pol.book.timesH': '入住与退房时间',
      'pol.book.timesP': '入住时间为 14:00（泰国时间）起，退房时间为 12:00（泰国时间）前。如您预计较晚抵达，请在预订时的特殊要求栏中告知我们，或致电酒店。',
      'pol.book.changeH': '变更或取消预订',
      'pol.book.changeP': '如需变更或取消预订，请携预订编号致电或发送邮件与酒店联系，前台将为您处理。请注意，取消仅表示释放该房间，并不代表退还已支付的款项。',
      'pol.book.changeP2': '如您选择到店支付，则尚未产生任何扣款，取消不收取任何费用。如您已在线支付，请在取消前务必阅读下方的退款条款。',
      'pol.book.refundH': '退款 — 在线支付前请务必阅读',
      'pol.book.refundP': '在线支付的款项恕不退还。款项一经收取，我们不予退款——无论是取消、变更日期、缩短住宿、延迟抵达，还是未入住（No-show）。请在选择在线支付前确认您的日期。如您希望保留灵活性，请改选到店支付，届时在您抵达前不会产生任何扣款。',
      'pol.book.refundP2': '以下两种情况不受此条款限制，我们必定处理。一是 200 泰铢房卡押金，该款项为押金而非房费，退房时全额退还。二是账单错误，这属于更正而非退款：如您被收取错误金额或被重复收费，请携预订编号与我们联系，我们将予以更正。',
      'pol.book.nonrefH': '旺季预付说明',
      'pol.book.nonrefP': '在部分旺季或节假日期间，不提供到店支付选项，须全额预付以保留房间。适用时，我们会在您付款前的预订表单中明确说明，并在确认邮件中再次说明。上述不退款条款同样适用于该笔付款。',
      'pol.book.problemH': '如出现问题',
      'pol.book.problemP': '如您被错误收费、重复收费，或您的付款未显示在预订中，请携预订编号与我们联系，我们将核对支付记录并予以更正。',

      'pol.priv.title': '隐私政策',
      'pol.priv.whoH': '我们是谁',
      'pol.priv.whoP': 'J Park Hotel（泰国春武里府孟春武里县那帕，Thanon Sukprayun 88/88，邮编 20000）为本政策所述个人信息的管理者。如对您的数据有任何疑问，或希望行使下列任何权利，请联系 jparkhotel1@gmail.com 或 +66 038 448 111。',
      'pol.priv.collectH': '我们收集的信息',
      'pol.priv.collectP': '您预订时，我们会收集您的姓名、电子邮箱、电话号码、入住日期、房型与入住人数，以及您在特殊要求栏中填写的内容。若您使用宾客门户或在线客服，我们会保存您发送的消息与服务请求。我们的服务器还会记录 IP 地址、浏览器等技术信息，用于保障网站安全并防止滥用。',
      'pol.priv.cardH': '银行卡与支付信息',
      'pol.priv.cardP': '我们不收集、不查看、不存储您的卡号、有效期或安全码。在线支付时，这些信息由您的浏览器直接发送至我们的支付服务商 Opn Payments（Omise），该服务商已获认证可处理此类数据。我们仅保存支付状态、金额及服务商的交易参考编号，用于将您的付款与预订相匹配。',
      'pol.priv.whyH': '使用目的',
      'pol.priv.whyP': '用于受理和管理您的预订、向您发送确认函及入住相关通知、回应您的请求与消息、收款及办理退款、按泰国法律要求留存酒店住客登记记录，以及保护网站免受欺诈和滥用。',
      'pol.priv.shareH': '信息共享对象',
      'pol.priv.shareP': '我们仅共享必要的信息，且仅共享给运行本酒店系统的服务商：支付服务商（Opn Payments / Omise）、邮件发送服务商，以及主机与数据库服务商。若您的预订来自 Agoda、Booking.com 等旅游网站，我们还会与其交换预订信息。我们不出售您的个人信息，也不将其用于广告。',
      'pol.priv.keepH': '保存期限',
      'pol.priv.keepP': '我们会在会计与法律所需期间内保存预订和支付记录，并按泰国法律要求的期限保存住客登记记录。在线客服消息与服务请求仅在对为您服务仍有帮助时保留，不再需要时即予删除。',
      'pol.priv.rightsH': '您的权利',
      'pol.priv.rightsP': '根据泰国《个人数据保护法》，您可要求获取我们所持有的您的个人信息副本、要求更正、要求删除、反对我们的使用方式，或撤回此前作出的同意。请发送邮件至 jparkhotel1@gmail.com，我们会予以回复。请注意，删除部分信息可能导致我们无法为您保留预订。',
      'pol.priv.cookiesH': 'Cookie 与浏览器存储',
      'pol.priv.cookiesP': '我们使用您浏览器的本地存储来记住实用信息——您选择的语言、正在进行的预订，以及您是否已登录。我们不使用广告 Cookie，也不会跨其他网站追踪您。',
      'pol.priv.secH': '安全',
      'pol.priv.secP': '本网站通过加密的 HTTPS 连接提供服务，员工账户受独立密码与会话数量限制保护，宾客数据的访问权限仅限于确有需要的酒店员工。没有系统是绝对安全的，但如发生影响您数据的安全事件，我们将依法通知您及主管机关。',
      'pol.priv.changeH': '政策变更',
      'pol.priv.changeP': '如我们修改本政策，将更新本页面及页首日期。重大变更将在此明确说明，而非悄然更改。',

      'pol.contactH': '联系我们',
      'pol.contactP': 'J Park Hotel, 88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi District, Chon Buri 20000, Thailand',
    },

    'zh-Hant': {
      'pol.title': '酒店政策',
      'pol.lede': '我們的訂房、取消與退款條款，以及我們如何處理您的個人資料。',
      'pol.updated': '最後更新：2026年8月26日',
      'pol.navBooking': '訂房、取消與退款',
      'pol.navPrivacy': '隱私權政策',

      'pol.book.title': '訂房、取消與退款政策',
      'pol.book.pricesH': '價格與貨幣',
      'pol.book.pricesP': '本網站所有價格均以泰銖（THB）顯示，按每間客房每晚計算。您在訂房時看到的價格即為您支付的價格。僅含房費與含早餐的價格分別顯示，加床或加人費用會在您確認前計入並顯示。',
      'pol.book.payH': '付款方式',
      'pol.book.payP': '您可以在入住時於櫃檯當面付款（現金、信用卡或 PromptPay），也可以現在透過信用卡或 PromptPay QR 線上付款。訂房時會同時提供兩種選擇，預設為入住時付款。',
      'pol.book.payP2': '線上信用卡付款由泰國持牌支付服務商 Opn Payments（Omise）處理。您的卡片資料由瀏覽器直接傳送至該服務商，我們的伺服器不會看到或儲存這些資料。',
      'pol.book.depositH': '房卡押金',
      'pol.book.depositP': '入住時收取房卡押金 200 泰銖，退房時全額退還。泰國籍旅客可以國民身分證或駕照代替現金押金。該押金與房費分開計算，任何情況下均可退還。',
      'pol.book.timesH': '入住與退房時間',
      'pol.book.timesP': '入住時間為 14:00（泰國時間）起，退房時間為 12:00（泰國時間）前。如您預計較晚抵達，請在訂房時的特殊需求欄中告知我們，或致電酒店。',
      'pol.book.changeH': '變更或取消訂房',
      'pol.book.changeP': '如需變更或取消訂房，請攜訂房編號致電或寄送電子郵件與酒店聯繫，櫃檯將為您處理。請注意，取消僅表示釋出該房間，並不代表退還已支付的款項。',
      'pol.book.changeP2': '如您選擇到店付款，則尚未產生任何扣款，取消不收取任何費用。如您已線上付款，請在取消前務必閱讀下方的退款條款。',
      'pol.book.refundH': '退款 — 線上付款前請務必閱讀',
      'pol.book.refundP': '線上付款的款項恕不退還。款項一經收取，我們不予退款——無論是取消、變更日期、縮短住宿、延遲抵達，或未入住（No-show）。請在選擇線上付款前確認您的日期。如您希望保留彈性，請改選到店付款，屆時在您抵達前不會產生任何扣款。',
      'pol.book.refundP2': '以下兩種情況不受此條款限制，我們必定處理。一是 200 泰銖房卡押金，該款項為押金而非房費，退房時全額退還。二是帳單錯誤，這屬於更正而非退款：如您被收取錯誤金額或被重複收費，請攜訂房編號與我們聯繫，我們將予以更正。',
      'pol.book.nonrefH': '旺季預付說明',
      'pol.book.nonrefP': '在部分旺季或連假期間，不提供到店付款選項，須全額預付以保留房間。適用時，我們會在您付款前的訂房表單中明確說明，並在確認郵件中再次說明。上述不退款條款同樣適用於該筆付款。',
      'pol.book.problemH': '如發生問題',
      'pol.book.problemP': '如您被錯誤收費、重複收費，或您的付款未顯示在訂房中，請攜訂房編號與我們聯繫，我們將核對付款紀錄並予以更正。',

      'pol.priv.title': '隱私權政策',
      'pol.priv.whoH': '我們是誰',
      'pol.priv.whoP': 'J Park Hotel（泰國春武里府孟春武里縣那帕，Thanon Sukprayun 88/88，郵遞區號 20000）為本政策所述個人資料的管理者。如對您的資料有任何疑問，或希望行使下列任何權利，請聯繫 jparkhotel1@gmail.com 或 +66 038 448 111。',
      'pol.priv.collectH': '我們蒐集的資料',
      'pol.priv.collectP': '您訂房時，我們會蒐集您的姓名、電子郵件、電話號碼、入住日期、房型與入住人數，以及您在特殊需求欄中填寫的內容。若您使用旅客專區或線上客服，我們會保存您傳送的訊息與服務請求。我們的伺服器還會記錄 IP 位址、瀏覽器等技術資料，用於保障網站安全並防止濫用。',
      'pol.priv.cardH': '信用卡與付款資料',
      'pol.priv.cardP': '我們不蒐集、不查看、不儲存您的卡號、有效期限或安全碼。線上付款時，這些資料由您的瀏覽器直接傳送至我們的支付服務商 Opn Payments（Omise），該服務商已取得處理此類資料的認證。我們僅保存付款狀態、金額及服務商的交易參考編號，用於將您的付款與訂房相互對應。',
      'pol.priv.whyH': '使用目的',
      'pol.priv.whyP': '用於受理與管理您的訂房、向您寄送確認信及入住相關通知、回應您的請求與訊息、收款及辦理退款、依泰國法律要求留存旅館住客登記紀錄，以及保護網站免於詐騙與濫用。',
      'pol.priv.shareH': '資料分享對象',
      'pol.priv.shareP': '我們僅分享必要的資料，且僅提供給營運本酒店系統的服務商：支付服務商（Opn Payments / Omise）、郵件寄送服務商，以及主機與資料庫服務商。若您的訂房來自 Agoda、Booking.com 等旅遊網站，我們也會與其交換訂房資料。我們不販售您的個人資料，也不將其用於廣告。',
      'pol.priv.keepH': '保存期限',
      'pol.priv.keepP': '我們會在會計與法律所需期間內保存訂房與付款紀錄，並依泰國法律要求的期限保存住客登記紀錄。線上客服訊息與服務請求僅在對為您服務仍有幫助時保留，不再需要時即予刪除。',
      'pol.priv.rightsH': '您的權利',
      'pol.priv.rightsP': '依據泰國《個人資料保護法》，您可要求取得我們所持有的您的個人資料副本、要求更正、要求刪除、反對我們的使用方式，或撤回先前所作的同意。請寄送電子郵件至 jparkhotel1@gmail.com，我們會予以回覆。請注意，刪除部分資料可能導致我們無法為您保留訂房。',
      'pol.priv.cookiesH': 'Cookie 與瀏覽器儲存',
      'pol.priv.cookiesP': '我們使用您瀏覽器的本機儲存空間來記住實用資訊——您選擇的語言、正在進行的訂房，以及您是否已登入。我們不使用廣告 Cookie，也不會跨其他網站追蹤您。',
      'pol.priv.secH': '安全',
      'pol.priv.secP': '本網站透過加密的 HTTPS 連線提供服務，員工帳號受個別密碼與工作階段數量限制保護，旅客資料的存取權限僅限於確有需要的酒店員工。沒有系統是絕對安全的，但如發生影響您資料的安全事件，我們將依法通知您及主管機關。',
      'pol.priv.changeH': '政策變更',
      'pol.priv.changeP': '如我們修改本政策，將更新本頁面及頁首日期。重大變更將在此明確說明，而非悄然更改。',

      'pol.contactH': '聯絡我們',
      'pol.contactP': 'J Park Hotel, 88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi District, Chon Buri 20000, Thailand',
    },
  });
})();
