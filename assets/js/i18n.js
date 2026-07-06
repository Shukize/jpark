/* ============================================================
   J Park Hotel — internationalisation
   Languages: Thai (default/main), English, Japanese,
   Simplified Chinese, Traditional Chinese.
   Auto-detects the browser/device language on first visit.
   ============================================================ */

const LANG_NAMES = {
  "th": "ไทย",
  "en": "English",
  "ja": "日本語",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文"
};

const I18N = {
  /* ---------------------- ไทย (default) ---------------------- */
  "th": {
    "brand.sub": "โรงแรม · ชลบุรี",
    "nav.coffee": "มิดไนท์ คอฟฟี่ คลับ",
    "nav.about": "เกี่ยวกับเรา",
    "nav.rooms": "ห้องพัก",
    "nav.facilities": "สิ่งอำนวยความสะดวก",
    "nav.dining": "ร้านอาหาร",
    "nav.gallery": "แกลเลอรี",
    "nav.contact": "ติดต่อ",
    "nav.staff": "พนักงาน",
    "nav.admin": "ผู้ดูแลระบบ",
    "nav.book": "จองเลย",
    "hero.eyebrow": "โรงแรมสไตล์ญี่ปุ่น · ชลบุรี",
    "hero.title": "ที่พักผ่อนอันเงียบสงบ การต้อนรับอันอบอุ่น",
    "hero.lede": "ความผ่อนคลายแบบเขตร้อนผสานการบริการสไตล์ญี่ปุ่น — ออนเซ็น ห้องอาหารชั้นเลิศ และห้องพักอันสงบ ใกล้นิคมอมตะนครและหาดบางแสนอันคึกคัก",
    "hero.ctaRooms": "ดูห้องพัก",
    "hero.ctaCoffee": "มิดไนท์ คอฟฟี่ คลับ",
    "coffee.badge": "แกรนด์ โอเพนนิ่ง",
    "coffee.eyebrow": "เปิดใหม่ที่ J Park",
    "coffee.title1": "Midnight",
    "coffee.title2": "Coffee Club",
    "coffee.tagline": "กาแฟพิเศษ ขนมอบสด ตลอดวัน",
    "coffee.lede": "คาเฟ่ที่อาบแสงแดด ตกแต่งด้วยไม้ไผ่ ไม้สัก และโทนสีน้ำเงินยูง — กาแฟซิงเกิลออริจินและขนมอบสดใหม่ เปิดให้บริการทุกวันตั้งแต่เช้าถึงเย็น",
    "coffee.day": "เวลาทำการ",
    "coffee.dayHours": "07:00 – 19:00",
    "coffee.cta": "แวะมาที่คลับ",
    "about.eyebrow": "ยินดีต้อนรับสู่ J PARK",
    "about.title": "ความสงบในแบบญี่ปุ่น ใจกลางชลบุรี",
    "about.p1": "ท่ามกลางบรรยากาศร่มรื่น J Park Hotel Chonburi ถ่ายทอดความเรียบง่ายแบบญี่ปุ่น ผสานความสะดวกสบายร่วมสมัยอย่างลงตัว",
    "about.p2": "ห้องพักและห้องสวีทกว้างขวาง พร้อมสิ่งอำนวยความสะดวกครบครัน เหมาะทั้งสำหรับการพักผ่อนระยะสั้นและการเข้าพักระยะยาว ผ่อนคลายในออนเซ็น ลิ้มรสอาหารญี่ปุ่นต้นตำรับที่ Tsubaki Restaurant หรือใช้เวลาสบาย ๆ ที่ Midnight Coffee Club",
    "about.stat1n": "5",
    "about.stat1l": "อาคารที่พัก",
    "about.stat2n": "24 ชม.",
    "about.stat2l": "เคาน์เตอร์ต้อนรับ",
    "about.stat3n": "5 กม.",
    "about.stat3l": "ถึงอมตะนคร",
    "about.stat4n": "13 กม.",
    "about.stat4l": "ถึงหาดบางแสน",
    "rooms.eyebrow": "เข้าพักกับเรา",
    "rooms.title": "ห้องพักและห้องสวีท",
    "rooms.lede": "ห้องพักและห้องสวีทสิบเอ็ดสไตล์ ตั้งแต่ห้องสตูดิโอกะทัดรัดไปจนถึงแกรนด์สวีทสองห้องนอน แต่ละห้องมาพร้อมเครื่องนอนนุ่มสบาย โทนร่วมสมัยที่ผ่อนคลาย และวิวเมืองอันเงียบสงบ",
    "rooms.swipeHint": "ปัดเพื่อชมห้องพักทั้งหมด",
    "rooms.book": "จองห้องพัก",
    "rooms.studioSize": "37 ตร.ม.",
    "rooms.studioDesc": "ห้องสตูดิโอสไตล์อพาร์ตเมนต์ที่สว่างสบาย เลือกได้ทั้งเตียงเดี่ยวหรือเตียงคู่แฝด พร้อมโต๊ะทำงาน มุมนั่งเล่น และฝักบัวเรนชาวเวอร์ เพื่อการพักที่สบาย",
    "rooms.studioB4Size": "37 ตร.ม.",
    "rooms.studioB4Name": "สตูดิโอ บี4",
    "rooms.studioB4Desc": "ห้องสตูดิโอโฉมใหม่ในอาคารบี4 เลือกเตียงเดี่ยวหรือเตียงคู่แฝด พร้อมครัวเล็กครบครันและมุมนั่งเล่นผ่อนคลาย เหมาะกับการพักระยะยาว",
    "rooms.deluxeSize": "44 ตร.ม.",
    "rooms.deluxeName": "ดีลักซ์",
    "rooms.deluxeDesc": "ห้องดีลักซ์กว้างขวาง พร้อมเตียงนุ่มสบาย มุมนั่งเล่น และห้องน้ำดีไซน์เรียบหรู ในโทนสีอบอุ่นร่วมสมัย",
    "rooms.grandDeluxeSize": "54 ตร.ม.",
    "rooms.grandDeluxeName": "แกรนด์ ดีลักซ์",
    "rooms.grandDeluxeDesc": "ห้องดีลักซ์กว้างขวางพร้อมเตียงคิงไซส์ เฟอร์นิเจอร์คัดสรร และวัสดุระดับพรีเมียม เหมาะสำหรับผู้ที่ต้องการความสะดวกสบายระดับสูง",
    "rooms.premiereSize": "49 ตร.ม.",
    "rooms.premiereDesc": "ห้องระดับอัปเกรด เลือกเตียงเดี่ยวหรือเตียงคู่แฝด พร้อมผ้าปูพรีเมียม พื้นที่ทำงานกว้างขวาง และบรรยากาศเรียบหรูผ่อนคลายตลอดทั้งห้อง",
    "rooms.grandPremiereSize": "49 ตร.ม.",
    "rooms.grandPremiereDesc": "ห้องพรีเมียมที่กว้างขวางที่สุดของเรา เลือกเตียงเดี่ยวหรือเตียงคู่แฝด พร้อมสิ่งอำนวยความสะดวกที่เหนือกว่าและมุมนั่งเล่นกว้างพร้อมวิวเมืองอันเงียบสงบ",
    "rooms.premiereSuiteSize": "73 ตร.ม.",
    "rooms.premiereSuiteDesc": "ห้องสวีทหนึ่งหรือสองห้องนอน พร้อมพื้นที่นั่งเล่นและรับประทานอาหารครบครัน ห้องนอนแยกส่วน และวัสดุระดับพรีเมียม เหมาะสำหรับการพักผ่อนที่ยาวนาน",
    "rooms.execSuiteSize": "75 ตร.ม.",
    "rooms.execSuiteName": "เอ็กเซกคิวทีฟ สวีท",
    "rooms.execSuiteDesc": "ห้องสวีทหนึ่งหรือสองห้องนอนสุดหรู พร้อมพื้นที่นั่งเล่นและรับประทานอาหารกว้างขวาง ครัว และวัสดุตกแต่งอันสง่างามตลอดทั้งห้อง",
    "rooms.grandSuiteSize": "75 ตร.ม.",
    "rooms.grandSuiteName": "แกรนด์ สวีท",
    "rooms.grandSuiteDesc": "ห้องสวีทเรือธงของเรา เลือกได้ทั้งแบบหนึ่งหรือสองห้องนอน พร้อมพื้นที่นั่งเล่นและรับประทานอาหารครบครัน ครัว และวัสดุระดับสูงสุด เหมาะสำหรับครอบครัวและการพักระยะยาว",
    "rooms.availBadge": "มีห้องว่าง",
    "rooms.prestigeSize": "45 ตร.ม.",
    "rooms.prestigeDesc": "ห้องพักหรู เลือกเตียงเดี่ยวหรือเตียงคู่แฝด พร้อมเครื่องนอนพรีเมียม พื้นที่ทำงานกว้างขวาง และสิ่งอำนวยความสะดวกที่เหนือกว่า เพื่อการพักที่สบายและผ่อนคลาย",
    "rooms.cornerSize": "55 ตร.ม.",
    "rooms.cornerName": "คอร์เนอร์ สวีท",
    "rooms.cornerDesc": "ห้องสวีทหัวมุมที่โอบล้อมด้วยหน้าต่างสองด้าน เลือกเตียงเดี่ยวหรือเตียงคู่แฝด พร้อมห้องนั่งเล่นแยกส่วน และห้องน้ำหินอ่อนพร้อมอ่างแช่",
    "fac.eyebrow": "ถึงเวลาผ่อนคลาย",
    "fac.title": "สิ่งอำนวยความสะดวกและสุขภาพ",
    "fac.poolName": "สระว่ายน้ำเขตร้อน",
    "fac.poolDesc": "สระว่ายน้ำกลางแจ้งรายล้อมด้วยต้นปาล์ม พร้อมลานอาบแดด สำหรับยามบ่ายอันผ่อนคลาย",
    "fac.onsenName": "ออนเซ็นญี่ปุ่น",
    "fac.onsenDesc": "ผ่อนคลายความเหนื่อยล้าในบ่อน้ำพุร้อนแบบดั้งเดิม",
    "fac.gymName": "ฟิตเนสเซ็นเตอร์",
    "fac.gymDesc": "ห้องออกกำลังกายครบครัน ทั้งคาร์ดิโอ ฟรีเวท และเครื่องเล่น",
    "fac.gardenName": "ห้องประชุมและห้องจัดเลี้ยง",
    "fac.gardenDesc": "J Park Hall และพื้นที่จัดงานอเนกประสงค์สำหรับงานเฉลิมฉลอง การประชุม และการพบปะสังสรรค์",
    "dining.eyebrow": "กินและดื่ม",
    "dining.title": "ร้านอาหารที่ J Park",
    "dining.tsubakiName": "ทสึบากิ · ห้องอาหารญี่ปุ่น",
    "dining.tsubakiDesc": "อาหารญี่ปุ่นแท้ ทั้งซูชิ ซาชิมิ และดงบุริร้อน ๆ ในบรรยากาศเงียบสงบ",
    "dining.allDayName": "ห้องอาหารออลเดย์",
    "dining.allDayDesc": "ลานโปร่งสบายสำหรับบุฟเฟต์อาหารเช้าและเมนูไทย-นานาชาติตลอดวัน",
    "dining.coffeeName": "มิดไนท์ คอฟฟี่ คลับ",
    "dining.coffeeDesc": "กาแฟพิเศษและขนมอบสด เปิดให้บริการทุกวัน 07:00–19:00 น. เปิดให้บริการแล้ว",
    "gallery.eyebrow": "มองใกล้ ๆ",
    "gallery.title": "แกลเลอรี",
    "gallery.more": "ภาพและวิดีโอเพิ่มเติม…",
    "gallery.jump": "ไปยังหมวด",
    "gallery.collapse": "ย่อกลับ",
    "gallery.cat.hotel": "โรงแรม",
    "gallery.cat.pool": "สระว่ายน้ำเขตร้อน",
    "gallery.cat.coffee": "มิดไนท์ คอฟฟี่ คลับ",
    "gallery.cat.tsubaki": "ทสึบากิ · ห้องอาหารญี่ปุ่น",
    "gallery.cat.allday": "ห้องอาหารตลอดวัน",
    "gallery.cat.banquet": "ห้องประชุมและจัดเลี้ยง",
    "gallery.cat.gym": "ฟิตเนสเซ็นเตอร์",
    "gallery.cat.lobby": "ล็อบบี้หลัก",
    "gallery.cat.grandDeluxe": "แกรนด์ ดีลักซ์",
    "gallery.cat.studioFlat": "สตูดิโอ",
    "gallery.cat.deluxeTwin": "ห้องดีลักซ์ ทวิน",
    "contact.eyebrow": "เยี่ยมชมและการจอง",
    "contact.title": "พบเราที่ชลบุรี",
    "contact.lede": "เรายินดีต้อนรับคุณ ติดต่อเราเพื่อจองห้องพัก โต๊ะอาหาร หรือที่นั่งที่มิดไนท์ คอฟฟี่ คลับ",
    "contact.addrLabel": "ที่อยู่",
    "contact.addrValue": "88/88 ถนน ศุขประยูร ตำบล นาป่า อำเภอเมืองชลบุรี ชลบุรี 20000 ไทย",
    "contact.phoneLabel": "โทรศัพท์",
    "contact.emailLabel": "อีเมล",
    "contact.hoursLabel": "เคาน์เตอร์ต้อนรับ",
    "contact.hoursValue": "เปิด 24 ชั่วโมง",
    "contact.callBtn": "โทรเพื่อจอง",
    "contact.mapBtn": "เปิดในแผนที่",
    "contact.fbBtn": "Facebook",
    "footer.tag": "การต้อนรับสไตล์ญี่ปุ่น · ชลบุรี ประเทศไทย",
    "footer.rights": "สงวนลิขสิทธิ์",
    "hb.arrival": "เช็คอิน",
    "hb.departure": "เช็คเอาต์",
    "hb.guests": "จำนวนผู้เข้าพัก",
    "hb.selectDate": "เลือกวันที่",
    "hb.guest": "คน",
    "hb.guestPl": "คน"
  },

  /* ---------------------- English ---------------------- */
  "en": {
    "brand.sub": "HOTEL · CHONBURI",
    "nav.coffee": "Midnight Coffee Club",
    "nav.about": "About",
    "nav.rooms": "Rooms",
    "nav.facilities": "Facilities",
    "nav.dining": "Dining",
    "nav.gallery": "Gallery",
    "nav.contact": "Contact",
    "nav.staff": "Staff",
    "nav.admin": "Admin",
    "nav.book": "Book Now",
    "hero.eyebrow": "Japanese-inspired hotel · Chonburi",
    "hero.title": "A serene retreat, a warm welcome",
    "hero.lede": "Tropical calm meets Japanese hospitality — onsen, fine dining, and serene suites a short drive from Amata Nakorn and the lively Bangsaen beach.",
    "hero.ctaRooms": "Explore Rooms",
    "hero.ctaCoffee": "Midnight Coffee Club",
    "coffee.badge": "Grand Opening",
    "coffee.eyebrow": "Now open at J Park",
    "coffee.title1": "Midnight",
    "coffee.title2": "Coffee Club",
    "coffee.tagline": "Specialty coffee, fresh pastries, all day",
    "coffee.lede": "A sun-drenched café of bamboo, teak and peacock blue — single-origin brews and fresh pastries, open every day from morning to evening.",
    "coffee.day": "Opening Hours",
    "coffee.dayHours": "07:00 – 19:00",
    "coffee.cta": "Visit the Club",
    "about.eyebrow": "Welcome to J PARK",
    "about.title": "Japanese serenity, in the heart of Chonburi",
    "about.p1": "Set amid lush surroundings, J Park Hotel Chonburi captures the understated elegance of Japan, blended seamlessly with contemporary comfort.",
    "about.p2": "Spacious rooms and suites with full amenities — suited equally for a short getaway or an extended stay. Unwind in the onsen, savour authentic Japanese cuisine at Tsubaki Restaurant, or take it easy at Midnight Coffee Club.",
    "about.stat1n": "5",
    "about.stat1l": "Guest buildings",
    "about.stat2n": "24h",
    "about.stat2l": "Front desk",
    "about.stat3n": "5 km",
    "about.stat3l": "to Amata Nakorn",
    "about.stat4n": "13 km",
    "about.stat4l": "to Bangsaen Beach",
    "rooms.eyebrow": "Stay with us",
    "rooms.title": "Rooms & Suites",
    "rooms.lede": "Eleven room and suite styles — from a smart studio to a two-bedroom grand suite — each with plush bedding, contemporary calm and quiet city views.",
    "rooms.swipeHint": "Swipe to explore all rooms",
    "rooms.book": "Book Now",
    "rooms.availBadge": "Rooms available",
    "rooms.studioSize": "37 m²",
    "rooms.studioDesc": "A bright, apartment-style studio in single or twin bedding — with a work desk, smart living nook and rainfall shower for an easy stay.",
    "rooms.studioB4Size": "37 m²",
    "rooms.studioB4Name": "Studio B4",
    "rooms.studioB4Desc": "A refreshed Studio in our B4 wing — single or twin bedding, a full kitchenette and a relaxed living corner for comfortable longer stays.",
    "rooms.deluxeSize": "44 m²",
    "rooms.deluxeName": "Deluxe",
    "rooms.deluxeDesc": "A spacious deluxe room with a plush bed, lounge seating and a sleek bathroom, dressed in a warm, contemporary palette.",
    "rooms.grandDeluxeSize": "54 m²",
    "rooms.grandDeluxeName": "Grand Deluxe",
    "rooms.grandDeluxeDesc": "A generously sized deluxe room with a king bed, plush furnishings and premium finishes — perfect for guests seeking elevated comfort.",
    "rooms.premiereSize": "49 m²",
    "rooms.premiereDesc": "An elevated room in single or twin bedding, with premium linens, a spacious work area and a calm, refined ambience throughout.",
    "rooms.grandPremiereSize": "49 m²",
    "rooms.grandPremiereDesc": "Our most generous Premium — single or twin bedding, upgraded amenities and a wide lounge area framed by quiet city views.",
    "rooms.premiereSuiteSize": "73 m²",
    "rooms.premiereSuiteDesc": "A one- or two-bedroom suite with a full living and dining area, a separate bedroom and premium finishes — made for relaxed, longer stays.",
    "rooms.execSuiteSize": "75 m²",
    "rooms.execSuiteName": "Executive Suite",
    "rooms.execSuiteDesc": "A refined one- or two-bedroom residence with expansive living and dining spaces, a kitchen and elegant finishes throughout.",
    "rooms.grandSuiteSize": "75 m²",
    "rooms.grandSuiteName": "Grand Suite",
    "rooms.grandSuiteDesc": "Our flagship residence in one- or two-bedroom layouts — full living and dining areas, a kitchen and the finest finishes, made for families and long stays.",
    "rooms.prestigeSize": "45 m²",
    "rooms.prestigeDesc": "A polished room in single or twin bedding, with premium bedding, a generous work area and upgraded amenities for an easy, restful stay.",
    "rooms.cornerSize": "55 m²",
    "rooms.cornerName": "Corner Suite",
    "rooms.cornerDesc": "A wraparound corner retreat in single or twin bedding, with a separate living room, dual-aspect windows and a deep-soaking marble bathroom.",
    "fac.eyebrow": "Time to unwind",
    "fac.title": "Facilities & Wellness",
    "fac.poolName": "Tropical Pool",
    "fac.poolDesc": "A palm-fringed outdoor pool and sun terrace for sun-soaked afternoons.",
    "fac.onsenName": "Japanese Onsen",
    "fac.onsenDesc": "Soak away the day in our traditional hot-spring bath.",
    "fac.gymName": "Fitness Centre",
    "fac.gymDesc": "A fully-equipped gym with cardio, free weights and machines.",
    "fac.gardenName": "Meeting and Banquet Rooms",
    "fac.gardenDesc": "J Park Hall and versatile event spaces for celebrations, meetings and gatherings.",
    "dining.eyebrow": "Eat & drink",
    "dining.title": "Dining at J Park",
    "dining.tsubakiName": "Tsubaki · Japanese Restaurant",
    "dining.tsubakiDesc": "Authentic Japanese cuisine — sushi, sashimi and warming donburi — in a serene setting.",
    "dining.allDayName": "All-Day Dining",
    "dining.allDayDesc": "A light-filled courtyard for breakfast buffets and all-day Thai and international favourites.",
    "dining.coffeeName": "Midnight Coffee Club",
    "dining.coffeeDesc": "Specialty coffee and fresh pastries, open daily 07:00–19:00. Now open.",
    "gallery.eyebrow": "A closer look",
    "gallery.title": "Gallery",
    "gallery.more": "More pictures and videos…",
    "gallery.jump": "Jump to section",
    "gallery.collapse": "Compact view",
    "gallery.cat.hotel": "The Hotel",
    "gallery.cat.pool": "Tropical Pool",
    "gallery.cat.coffee": "Midnight Coffee Club",
    "gallery.cat.tsubaki": "Tsubaki · Japanese Restaurant",
    "gallery.cat.allday": "All-Day Dining",
    "gallery.cat.banquet": "Meeting & Banquet Rooms",
    "gallery.cat.gym": "Fitness Centre",
    "gallery.cat.lobby": "Main Lobby",
    "gallery.cat.grandDeluxe": "Grand Deluxe",
    "gallery.cat.studioFlat": "Studio",
    "gallery.cat.deluxeTwin": "Deluxe Twin Room",
    "contact.eyebrow": "Visit & reservations",
    "contact.title": "Find us in Chonburi",
    "contact.lede": "We would be delighted to welcome you. Reach out to reserve a room, a table, or your spot at the Midnight Coffee Club.",
    "contact.addrLabel": "Address",
    "contact.addrValue": "88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi District, Chon Buri 20000, Thailand",
    "contact.phoneLabel": "Phone",
    "contact.emailLabel": "Email",
    "contact.hoursLabel": "Reception",
    "contact.hoursValue": "Open 24 hours",
    "contact.callBtn": "Call to Book",
    "contact.mapBtn": "Open in Maps",
    "contact.fbBtn": "Facebook",
    "footer.tag": "Japanese-inspired hospitality · Chonburi, Thailand",
    "footer.rights": "All rights reserved.",
    "hb.arrival": "Arrival",
    "hb.departure": "Departure",
    "hb.guests": "Guests",
    "hb.selectDate": "Select date",
    "hb.guest": "guest",
    "hb.guestPl": "guests"
  },

  /* ---------------------- 日本語 ---------------------- */
  "ja": {
    "brand.sub": "ホテル · チョンブリー",
    "nav.coffee": "ミッドナイト・コーヒー・クラブ",
    "nav.about": "私たちについて",
    "nav.rooms": "客室",
    "nav.facilities": "施設",
    "nav.dining": "ダイニング",
    "nav.gallery": "ギャラリー",
    "nav.contact": "お問い合わせ",
    "nav.staff": "スタッフ",
    "nav.admin": "管理者",
    "nav.book": "予約する",
    "hero.eyebrow": "日本の趣を映すホテル · チョンブリー",
    "hero.title": "静かな安らぎ、あたたかなおもてなし",
    "hero.lede": "トロピカルな安らぎと日本のおもてなし — 温泉、上質なダイニング、静謐な客室。アマタナコンと活気あるバンセーンビーチからほど近く。",
    "hero.ctaRooms": "客室を見る",
    "hero.ctaCoffee": "ミッドナイト・コーヒー・クラブ",
    "coffee.badge": "グランドオープン",
    "coffee.eyebrow": "J Park に新登場",
    "coffee.title1": "Midnight",
    "coffee.title2": "Coffee Club",
    "coffee.tagline": "スペシャルティコーヒーと焼きたてペストリーを一日中",
    "coffee.lede": "竹とチーク、孔雀色のブルーに包まれた陽光あふれるカフェ。シングルオリジンのコーヒーと焼きたてのペストリーを、朝から夕方まで毎日お楽しみいただけます。",
    "coffee.day": "営業時間",
    "coffee.dayHours": "07:00 – 19:00",
    "coffee.cta": "クラブを訪れる",
    "about.eyebrow": "J PARK へようこそ",
    "about.title": "日本の静けさ、チョンブリーの中心に",
    "about.p1": "緑豊かな環境に佇む J Park Hotel Chonburi は、日本らしい洗練された簡素さと現代的な快適さを自然に融合しています。",
    "about.p2": "広々とした客室とスイートルームは設備が充実し、短期滞在にも長期滞在にも最適です。温泉でくつろぎ、Tsubaki Restaurant で本格日本料理を堪能するか、Midnight Coffee Club でゆったりとした時間をお過ごしください。",
    "about.stat1n": "5",
    "about.stat1l": "宿泊棟",
    "about.stat2n": "24h",
    "about.stat2l": "フロント",
    "about.stat3n": "5 km",
    "about.stat3l": "アマタナコンまで",
    "about.stat4n": "13 km",
    "about.stat4l": "バンセーンビーチまで",
    "rooms.eyebrow": "ご滞在",
    "rooms.title": "客室・スイート",
    "rooms.lede": "11タイプの客室・スイート。コンパクトなスタジオから2ベッドルームのグランドスイートまで、いずれも上質な寝具、落ち着いた現代的な設え、静かな街の眺めを備えています。",
    "rooms.swipeHint": "スワイプしてすべての客室をご覧ください",
    "rooms.book": "今すぐ予約",
    "rooms.availBadge": "空室あり",
    "rooms.studioSize": "37 m²",
    "rooms.studioDesc": "明るいアパートメント仕様のスタジオ。シングルまたはツインをお選びいただけます。ワークデスク、リビングコーナー、レインシャワーを備え、快適なご滞在を。",
    "rooms.studioB4Size": "37 m²",
    "rooms.studioB4Name": "スタジオ B4",
    "rooms.studioB4Desc": "B4ウィングにリニューアルしたスタジオ。シングルまたはツイン、フル装備のミニキッチンとくつろぎのリビングコーナーを備え、長期滞在にも快適。",
    "rooms.deluxeSize": "44 m²",
    "rooms.deluxeName": "デラックス",
    "rooms.deluxeDesc": "ゆったりとしたデラックスルーム。ふかふかのベッド、くつろぎのソファ、洗練されたバスルームを温かみのある現代的な配色で。",
    "rooms.grandDeluxeSize": "54 m²",
    "rooms.grandDeluxeName": "グランドデラックス",
    "rooms.grandDeluxeDesc": "キングベッドと上質な家具、プレミアムな設えを備えた広々としたデラックスルーム。格上げされた快適さをお求めのお客様に。",
    "rooms.premiereSize": "49 m²",
    "rooms.premiereDesc": "ワンランク上の客室。シングルまたはツイン、上質なリネン、広々としたワークエリアと落ち着いた洗練の雰囲気を備えています。",
    "rooms.grandPremiereSize": "49 m²",
    "rooms.grandPremiereDesc": "最も広々としたプレミアム。シングルまたはツイン、充実したアメニティと、静かな街の眺めに包まれた広いラウンジエリアを備えています。",
    "rooms.premiereSuiteSize": "73 m²",
    "rooms.premiereSuiteDesc": "1または2ベッドルームのスイート。充実したリビング・ダイニング、独立したベッドルーム、上質な設えを備え、ゆったりとした長めのご滞在に。",
    "rooms.execSuiteSize": "75 m²",
    "rooms.execSuiteName": "エグゼクティブスイート",
    "rooms.execSuiteDesc": "1または2ベッドルームの洗練されたレジデンス。広々としたリビング・ダイニング、キッチン、優雅な設えを全室に。",
    "rooms.grandSuiteSize": "75 m²",
    "rooms.grandSuiteName": "グランドスイート",
    "rooms.grandSuiteDesc": "当ホテル旗艦のレジデンス。1または2ベッドルームをお選びいただけます。充実したリビング・ダイニング、キッチン、最上級の設えを備え、ご家族や長期滞在に。",
    "rooms.prestigeSize": "45 m²",
    "rooms.prestigeDesc": "洗練された客室。シングルまたはツイン、上質な寝具、広めのワークエリア、充実したアメニティを備え、快適でやすらかなご滞在を。",
    "rooms.cornerSize": "55 m²",
    "rooms.cornerName": "コーナースイート",
    "rooms.cornerDesc": "二面採光に包まれた角部屋のスイート。シングルまたはツイン、独立したリビングルームと深い浴槽付き大理石バスルームを備えています。",
    "fac.eyebrow": "くつろぎのひととき",
    "fac.title": "施設・ウェルネス",
    "fac.poolName": "トロピカルプール",
    "fac.poolDesc": "椰子の木に囲まれた屋外プールとサンテラスで、陽光あふれる午後を。",
    "fac.onsenName": "日本式温泉",
    "fac.onsenDesc": "伝統的な温泉で一日の疲れを癒して。",
    "fac.gymName": "フィットネスセンター",
    "fac.gymDesc": "カーディオ、フリーウェイト、マシンを備えた充実のジム。",
    "fac.gardenName": "会議・宴会場",
    "fac.gardenDesc": "J Park ホールと、祝宴・会議・集いに対応する多目的イベントスペース。",
    "dining.eyebrow": "食と飲",
    "dining.title": "J Park のダイニング",
    "dining.tsubakiName": "ツバキ · 日本料理",
    "dining.tsubakiDesc": "寿司、刺身、温かい丼物まで。静かな空間で味わう本格日本料理。",
    "dining.allDayName": "オールデイダイニング",
    "dining.allDayDesc": "朝食ビュッフェやタイ・各国料理を一日中楽しめる、光あふれるコート。",
    "dining.coffeeName": "ミッドナイト・コーヒー・クラブ",
    "dining.coffeeDesc": "スペシャルティコーヒーと焼きたてペストリー、毎日07:00〜19:00営業。オープンしました。",
    "gallery.eyebrow": "もっと近くで",
    "gallery.title": "ギャラリー",
    "gallery.more": "もっと写真と動画を見る…",
    "gallery.jump": "セクションへ移動",
    "gallery.collapse": "コンパクト表示",
    "gallery.cat.hotel": "ホテル",
    "gallery.cat.pool": "トロピカルプール",
    "gallery.cat.coffee": "ミッドナイト・コーヒー・クラブ",
    "gallery.cat.tsubaki": "ツバキ · 日本料理",
    "gallery.cat.allday": "オールデイダイニング",
    "gallery.cat.banquet": "会議・宴会場",
    "gallery.cat.gym": "フィットネスセンター",
    "gallery.cat.lobby": "メインロビー",
    "gallery.cat.grandDeluxe": "グランドデラックス",
    "gallery.cat.studioFlat": "スタジオ",
    "gallery.cat.deluxeTwin": "デラックスツイン",
    "contact.eyebrow": "アクセス・ご予約",
    "contact.title": "チョンブリーにて",
    "contact.lede": "皆さまのお越しを心よりお待ちしております。客室、お食事、ミッドナイト・コーヒー・クラブのご予約はお気軽に。",
    "contact.addrLabel": "住所",
    "contact.addrValue": "88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi, Chon Buri 20000, Thailand",
    "contact.phoneLabel": "電話",
    "contact.emailLabel": "メール",
    "contact.hoursLabel": "フロント",
    "contact.hoursValue": "24時間営業",
    "contact.callBtn": "電話で予約",
    "contact.mapBtn": "地図を開く",
    "contact.fbBtn": "Facebook",
    "footer.tag": "日本の趣のおもてなし · タイ・チョンブリー",
    "footer.rights": "All rights reserved.",
    "hb.arrival": "チェックイン",
    "hb.departure": "チェックアウト",
    "hb.guests": "人数",
    "hb.selectDate": "日付を選択",
    "hb.guest": "名",
    "hb.guestPl": "名"
  },

  /* ---------------------- 简体中文 ---------------------- */
  "zh-Hans": {
    "brand.sub": "酒店 · 春武里",
    "nav.coffee": "午夜咖啡俱乐部",
    "nav.about": "关于我们",
    "nav.rooms": "客房",
    "nav.facilities": "设施",
    "nav.dining": "餐饮",
    "nav.gallery": "图库",
    "nav.contact": "联系我们",
    "nav.staff": "员工",
    "nav.admin": "管理员",
    "nav.book": "立即预订",
    "hero.eyebrow": "日式酒店 · 春武里",
    "hero.title": "静谧之所，温暖款待",
    "hero.lede": "热带的宁静邂逅日式款待——温泉、精致餐饮与静谧客房，距阿马塔纳空与热闹的邦盛海滩仅数分钟车程。",
    "hero.ctaRooms": "查看客房",
    "hero.ctaCoffee": "午夜咖啡俱乐部",
    "coffee.badge": "盛大开业",
    "coffee.eyebrow": "J Park 全新登场",
    "coffee.title1": "Midnight",
    "coffee.title2": "Coffee Club",
    "coffee.tagline": "精品咖啡与新鲜糕点，全天供应",
    "coffee.lede": "阳光洒落的咖啡馆，以竹、柚木与孔雀蓝为调——供应单一产地咖啡与新鲜糕点，每日从早到晚营业。",
    "coffee.day": "营业时间",
    "coffee.dayHours": "07:00 – 19:00",
    "coffee.cta": "前往俱乐部",
    "about.eyebrow": "欢迎来到 J PARK",
    "about.title": "日式静谧，春武里腹地",
    "about.p1": "J Park Hotel Chonburi 掩映于葱郁环境之中，传递日本极简之美，与现代舒适完美融合。",
    "about.p2": "宽敞的客房与套房设施齐备，无论短暂小住还是长期居住皆宜。在温泉中放松身心，于 Tsubaki Restaurant 品味正宗日本料理，或在 Midnight Coffee Club 悠然享受闲适时光。",
    "about.stat1n": "5",
    "about.stat1l": "住宿楼栋",
    "about.stat2n": "24h",
    "about.stat2l": "前台服务",
    "about.stat3n": "5 公里",
    "about.stat3l": "至阿马塔纳空",
    "about.stat4n": "13 公里",
    "about.stat4l": "至邦盛海滩",
    "rooms.eyebrow": "入住体验",
    "rooms.title": "客房与套房",
    "rooms.lede": "十一种客房与套房风格——从精巧的开间到两卧豪华套房——皆配柔软寝具、沉静的当代格调与静谧的城市景观。",
    "rooms.swipeHint": "滑动查看全部房型",
    "rooms.book": "立即预订",
    "rooms.availBadge": "有空房",
    "rooms.studioSize": "37 m²",
    "rooms.studioDesc": "明亮的公寓式开间，可选单人床或双床，配办公书桌、起居一隅与雨林花洒，入住舒适惬意。",
    "rooms.studioB4Size": "37 m²",
    "rooms.studioB4Name": "开间客房 B4",
    "rooms.studioB4Desc": "B4 翼焕新开间，可选单人床或双床，配齐全小厨房与轻松起居角落，长住亦舒适。",
    "rooms.deluxeSize": "44 m²",
    "rooms.deluxeName": "豪华房",
    "rooms.deluxeDesc": "宽敞的豪华客房，配松软睡床、休闲座椅与雅致浴室，以温暖的当代色调装点。",
    "rooms.grandDeluxeSize": "54 m²",
    "rooms.grandDeluxeName": "豪华大床房",
    "rooms.grandDeluxeDesc": "宽敞的豪华客房，配特大号床、精致家具与高级装饰，专为追求卓越舒适的宾客而设。",
    "rooms.premiereSize": "49 m²",
    "rooms.premiereDesc": "升级客房，可选单人床或双床，配高级床品、宽敞办公区，全室格调沉静而精致。",
    "rooms.grandPremiereSize": "49 m²",
    "rooms.grandPremiereDesc": "我们最为宽敞的高级房，可选单人床或双床，配升级设施与宽阔休憩区，静享城市景观。",
    "rooms.premiereSuiteSize": "73 m²",
    "rooms.premiereSuiteDesc": "一卧或两卧套房，配完整起居与用餐区、独立卧室及高级装饰，专为从容长住而设。",
    "rooms.execSuiteSize": "75 m²",
    "rooms.execSuiteName": "行政套房",
    "rooms.execSuiteDesc": "精致的一卧或两卧居所，配宽敞起居与用餐空间、厨房及全室雅致装饰。",
    "rooms.grandSuiteSize": "75 m²",
    "rooms.grandSuiteName": "豪华套房",
    "rooms.grandSuiteDesc": "我们的旗舰居所，可选一卧或两卧，配完整起居与用餐区、厨房及至臻装饰，专为家庭与长期入住而设。",
    "rooms.prestigeSize": "45 m²",
    "rooms.prestigeDesc": "雅致客房，可选单人床或双床，配高级寝具、宽敞办公区与升级设施，入住舒适安稳。",
    "rooms.cornerSize": "55 m²",
    "rooms.cornerName": "转角套房",
    "rooms.cornerDesc": "环抱式转角居所，可选单人床或双床，配独立起居室、双面采光窗与配深泡浴缸的大理石浴室。",
    "fac.eyebrow": "尽情放松",
    "fac.title": "设施与养生",
    "fac.poolName": "热带泳池",
    "fac.poolDesc": "棕榈环绕的户外泳池与日光露台，尽享阳光午后。",
    "fac.onsenName": "日式温泉",
    "fac.onsenDesc": "在传统温泉中泡去一日的疲惫。",
    "fac.gymName": "健身中心",
    "fac.gymDesc": "设备齐全的健身房，配有有氧器械、自由重量与训练器材。",
    "fac.gardenName": "会议与宴会厅",
    "fac.gardenDesc": "J Park 大厅及适合庆典、会议与聚会的多功能活动空间。",
    "dining.eyebrow": "美食与畅饮",
    "dining.title": "J Park 餐饮",
    "dining.tsubakiName": "椿 · 日本料理",
    "dining.tsubakiDesc": "地道日式料理——寿司、刺身与暖心丼饭，尽在静谧雅致的空间。",
    "dining.allDayName": "全日餐厅",
    "dining.allDayDesc": "光线充沛的庭院，供应早餐自助及全日泰式与各国佳肴。",
    "dining.coffeeName": "午夜咖啡俱乐部",
    "dining.coffeeDesc": "精品咖啡与新鲜糕点，每日07:00–19:00营业。现已开业。",
    "gallery.eyebrow": "细细品味",
    "gallery.title": "图库",
    "gallery.more": "更多图片和视频…",
    "gallery.jump": "跳转到分类",
    "gallery.collapse": "收起",
    "gallery.cat.hotel": "酒店",
    "gallery.cat.pool": "热带泳池",
    "gallery.cat.coffee": "午夜咖啡俱乐部",
    "gallery.cat.tsubaki": "椿 · 日本料理",
    "gallery.cat.allday": "全日餐厅",
    "gallery.cat.banquet": "会议与宴会厅",
    "gallery.cat.gym": "健身中心",
    "gallery.cat.lobby": "大堂",
    "gallery.cat.grandDeluxe": "豪华大床房",
    "gallery.cat.studioFlat": "工作室房",
    "gallery.cat.deluxeTwin": "豪华双床房",
    "contact.eyebrow": "到访与预订",
    "contact.title": "在春武里与我们相遇",
    "contact.lede": "我们诚挚期待您的光临。欢迎联系我们预订客房、餐位，或午夜咖啡俱乐部的座位。",
    "contact.addrLabel": "地址",
    "contact.addrValue": "88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi, Chon Buri 20000, 泰国",
    "contact.phoneLabel": "电话",
    "contact.emailLabel": "邮箱",
    "contact.hoursLabel": "前台",
    "contact.hoursValue": "24 小时开放",
    "contact.callBtn": "致电预订",
    "contact.mapBtn": "在地图中打开",
    "contact.fbBtn": "Facebook",
    "footer.tag": "日式款待 · 泰国春武里",
    "footer.rights": "版权所有。",
    "hb.arrival": "入住",
    "hb.departure": "退房",
    "hb.guests": "宾客",
    "hb.selectDate": "选择日期",
    "hb.guest": "位",
    "hb.guestPl": "位"
  },

  /* ---------------------- 繁體中文 ---------------------- */
  "zh-Hant": {
    "brand.sub": "酒店 · 春武里",
    "nav.coffee": "午夜咖啡俱樂部",
    "nav.about": "關於我們",
    "nav.rooms": "客房",
    "nav.facilities": "設施",
    "nav.dining": "餐飲",
    "nav.gallery": "圖庫",
    "nav.contact": "聯絡我們",
    "nav.staff": "員工",
    "nav.admin": "管理員",
    "nav.book": "立即預訂",
    "hero.eyebrow": "日式酒店 · 春武里",
    "hero.title": "靜謐之所，溫暖款待",
    "hero.lede": "熱帶的寧靜邂逅日式款待——溫泉、精緻餐飲與靜謐客房，距阿瑪塔納空與熱鬧的邦盛海灘僅數分鐘車程。",
    "hero.ctaRooms": "查看客房",
    "hero.ctaCoffee": "午夜咖啡俱樂部",
    "coffee.badge": "盛大開幕",
    "coffee.eyebrow": "J Park 全新登場",
    "coffee.title1": "Midnight",
    "coffee.title2": "Coffee Club",
    "coffee.tagline": "精品咖啡與新鮮糕點，全天供應",
    "coffee.lede": "陽光灑落的咖啡館，以竹、柚木與孔雀藍為調——供應單一產地咖啡與新鮮糕點，每日從早到晚營業。",
    "coffee.day": "營業時間",
    "coffee.dayHours": "07:00 – 19:00",
    "coffee.cta": "前往俱樂部",
    "about.eyebrow": "歡迎來到 J PARK",
    "about.title": "日式靜謐，春武里腹地",
    "about.p1": "J Park Hotel Chonburi 掩映於蒼翠環境之中，傳遞日本極簡之美，與現代舒適完美融合。",
    "about.p2": "寬敞的客房與套房設施齊備，無論短暫小住或長期居住皆宜。在溫泉中放鬆身心，於 Tsubaki Restaurant 品味正宗日本料理，或在 Midnight Coffee Club 悠然享受閒適時光。",
    "about.stat1n": "5",
    "about.stat1l": "住宿樓棟",
    "about.stat2n": "24h",
    "about.stat2l": "櫃檯服務",
    "about.stat3n": "5 公里",
    "about.stat3l": "至阿瑪塔納空",
    "about.stat4n": "13 公里",
    "about.stat4l": "至邦盛海灘",
    "rooms.eyebrow": "入住體驗",
    "rooms.title": "客房與套房",
    "rooms.lede": "十一種客房與套房風格——從精巧的開間到兩臥豪華套房——皆配柔軟寢具、沉靜的當代格調與靜謐的城市景觀。",
    "rooms.swipeHint": "滑動查看全部房型",
    "rooms.book": "立即預訂",
    "rooms.availBadge": "有空房",
    "rooms.studioSize": "37 m²",
    "rooms.studioDesc": "明亮的公寓式開間，可選單人床或雙床，配辦公書桌、起居一隅與雨林花灑，入住舒適愜意。",
    "rooms.studioB4Size": "37 m²",
    "rooms.studioB4Name": "開間客房 B4",
    "rooms.studioB4Desc": "B4 翼煥新開間，可選單人床或雙床，配齊全小廚房與輕鬆起居角落，長住亦舒適。",
    "rooms.deluxeSize": "44 m²",
    "rooms.deluxeName": "豪華房",
    "rooms.deluxeDesc": "寬敞的豪華客房，配鬆軟睡床、休閒座椅與雅致浴室，以溫暖的當代色調裝點。",
    "rooms.grandDeluxeSize": "54 m²",
    "rooms.grandDeluxeName": "豪華大床房",
    "rooms.grandDeluxeDesc": "寬敞的豪華客房，配特大號床、精緻家具與高級裝飾，專為追求卓越舒適的賓客而設。",
    "rooms.premiereSize": "49 m²",
    "rooms.premiereDesc": "升級客房，可選單人床或雙床，配高級床品、寬敞辦公區，全室格調沉靜而精緻。",
    "rooms.grandPremiereSize": "49 m²",
    "rooms.grandPremiereDesc": "我們最為寬敞的高級房，可選單人床或雙床，配升級設施與寬闊休憩區，靜享城市景觀。",
    "rooms.premiereSuiteSize": "73 m²",
    "rooms.premiereSuiteDesc": "一臥或兩臥套房，配完整起居與用餐區、獨立臥室及高級裝飾，專為從容長住而設。",
    "rooms.execSuiteSize": "75 m²",
    "rooms.execSuiteName": "行政套房",
    "rooms.execSuiteDesc": "精緻的一臥或兩臥居所，配寬敞起居與用餐空間、廚房及全室雅致裝飾。",
    "rooms.grandSuiteSize": "75 m²",
    "rooms.grandSuiteName": "豪華套房",
    "rooms.grandSuiteDesc": "我們的旗艦居所，可選一臥或兩臥，配完整起居與用餐區、廚房及至臻裝飾，專為家庭與長期入住而設。",
    "rooms.prestigeSize": "45 m²",
    "rooms.prestigeDesc": "雅致客房，可選單人床或雙床，配高級寢具、寬敞辦公區與升級設施，入住舒適安穩。",
    "rooms.cornerSize": "55 m²",
    "rooms.cornerName": "轉角套房",
    "rooms.cornerDesc": "環抱式轉角居所，可選單人床或雙床，配獨立起居室、雙面採光窗與配深泡浴缸的大理石浴室。",
    "fac.eyebrow": "盡情放鬆",
    "fac.title": "設施與養生",
    "fac.poolName": "熱帶泳池",
    "fac.poolDesc": "棕櫚環繞的戶外泳池與日光露台，盡享陽光午後。",
    "fac.onsenName": "日式溫泉",
    "fac.onsenDesc": "在傳統溫泉中泡去一日的疲憊。",
    "fac.gymName": "健身中心",
    "fac.gymDesc": "設備齊全的健身房，配有有氧器械、自由重量與訓練器材。",
    "fac.gardenName": "會議與宴會廳",
    "fac.gardenDesc": "J Park 大廳及適合慶典、會議與聚會的多功能活動空間。",
    "dining.eyebrow": "美食與暢飲",
    "dining.title": "J Park 餐飲",
    "dining.tsubakiName": "椿 · 日本料理",
    "dining.tsubakiDesc": "道地日式料理——壽司、刺身與暖心丼飯，盡在靜謐雅致的空間。",
    "dining.allDayName": "全日餐廳",
    "dining.allDayDesc": "光線充沛的庭院，供應早餐自助及全日泰式與各國佳餚。",
    "dining.coffeeName": "午夜咖啡俱樂部",
    "dining.coffeeDesc": "精品咖啡與新鮮糕點，每日07:00–19:00營業。現已開幕。",
    "gallery.eyebrow": "細細品味",
    "gallery.title": "圖庫",
    "gallery.more": "更多圖片和影片…",
    "gallery.jump": "跳至分類",
    "gallery.collapse": "收合",
    "gallery.cat.hotel": "酒店",
    "gallery.cat.pool": "熱帶泳池",
    "gallery.cat.coffee": "午夜咖啡俱樂部",
    "gallery.cat.tsubaki": "椿 · 日本料理",
    "gallery.cat.allday": "全日餐廳",
    "gallery.cat.banquet": "會議與宴會廳",
    "gallery.cat.gym": "健身中心",
    "gallery.cat.lobby": "大廳",
    "gallery.cat.grandDeluxe": "豪華大床房",
    "gallery.cat.studioFlat": "工作室房",
    "gallery.cat.deluxeTwin": "豪華雙床房",
    "contact.eyebrow": "到訪與預訂",
    "contact.title": "在春武里與我們相遇",
    "contact.lede": "我們誠摯期待您的光臨。歡迎聯絡我們預訂客房、餐位，或午夜咖啡俱樂部的座位。",
    "contact.addrLabel": "地址",
    "contact.addrValue": "88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi, Chon Buri 20000, 泰國",
    "contact.phoneLabel": "電話",
    "contact.emailLabel": "電郵",
    "contact.hoursLabel": "櫃檯",
    "contact.hoursValue": "24 小時開放",
    "contact.callBtn": "致電預訂",
    "contact.mapBtn": "在地圖中開啟",
    "contact.fbBtn": "Facebook",
    "footer.tag": "日式款待 · 泰國春武里",
    "footer.rights": "版權所有。",
    "hb.arrival": "入住",
    "hb.departure": "退房",
    "hb.guests": "賓客",
    "hb.selectDate": "選擇日期",
    "hb.guest": "位",
    "hb.guestPl": "位"
  }
};

/* ----------------- detection & application ----------------- */

const SUPPORTED = ["th", "en", "ja", "zh-Hans", "zh-Hant"];

let CURRENT_LANG = "th";

/* Merge additional translation strings (used by feature modules).
   Shape: { th:{...}, en:{...}, ja:{...}, "zh-Hans":{...}, "zh-Hant":{...} } */
function registerI18n(extra) {
  Object.keys(extra || {}).forEach((lang) => {
    if (!I18N[lang]) I18N[lang] = {};
    Object.assign(I18N[lang], extra[lang]);
  });
}

/* ------------------------------------------------------------------
   Admin content overrides
   The Site Editor (admin) lets an administrator rewrite any piece of
   text on the public site, per language. Those edits are stored in the
   shared store under content.overrides[lang][key]; here we read them
   straight from localStorage so the i18n layer stays dependency-free.
   ------------------------------------------------------------------ */
let OVERRIDES = {};
function loadOverrides() {
  try {
    const c = JSON.parse(localStorage.getItem("jpark.db.content") || "{}");
    OVERRIDES = (c && c.overrides) || {};
  } catch (_) {
    OVERRIDES = {};
  }
  return OVERRIDES;
}
loadOverrides();

/* The original dictionary value for a key, ignoring admin overrides,
   using the same current -> en -> th -> key fallback chain. */
function baseT(key, lang) {
  const L = lang || CURRENT_LANG;
  const order = [L, "en", "th"];
  for (const l of order) {
    if (I18N[l] && I18N[l][key] !== undefined) return I18N[l][key];
  }
  return key;
}

/* Every translation key known to the site (union across languages). */
function allKeys() {
  const set = new Set();
  SUPPORTED.forEach((l) => {
    if (I18N[l]) Object.keys(I18N[l]).forEach((k) => set.add(k));
  });
  return Array.from(set);
}

/* Translate a single key for the current language. Admin overrides win;
   otherwise sensible fallbacks (current -> en -> th -> the key itself). */
function t(key, lang) {
  const L = lang || CURRENT_LANG;
  if (OVERRIDES[L] && OVERRIDES[L][key] != null) return OVERRIDES[L][key];
  return baseT(key, L);
}

function getLang() { return CURRENT_LANG; }

function normaliseLang(raw) {
  if (!raw) return null;
  const l = raw.toLowerCase();
  if (l.startsWith("th")) return "th";
  if (l.startsWith("ja")) return "ja";
  if (l.startsWith("en")) return "en";
  if (l.startsWith("zh")) {
    // Traditional: Taiwan, Hong Kong, Macau, or explicit Hant
    if (l.includes("hant") || l.includes("tw") || l.includes("hk") || l.includes("mo")) {
      return "zh-Hant";
    }
    return "zh-Hans";
  }
  return null;
}

function detectLang() {
  const saved = localStorage.getItem("jpark.lang");
  if (saved && SUPPORTED.includes(saved)) return saved;

  const candidates = navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language];

  for (const c of candidates) {
    const matched = normaliseLang(c);
    if (matched) return matched;
  }
  // Thai is the main language → default fallback
  return "th";
}

function applyLang(lang) {
  if (!SUPPORTED.includes(lang)) lang = "th";
  CURRENT_LANG = lang;
  loadOverrides(); // pick up any admin edits before painting text

  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("data-lang", lang);

  // Element text content
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const v = t(el.getAttribute("data-i18n"), lang);
    if (v !== undefined) el.textContent = v;
  });
  // Attribute translations, e.g. data-i18n-attr="placeholder:chat.input"
  document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    el.getAttribute("data-i18n-attr").split(",").forEach((pair) => {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key, lang));
    });
  });

  const current = document.getElementById("langCurrent");
  if (current) current.textContent = LANG_NAMES[lang];

  document.querySelectorAll("#langMenu button").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-lang") === lang);
  });

  localStorage.setItem("jpark.lang", lang);

  // Let feature modules re-render their dynamic content.
  document.dispatchEvent(new CustomEvent("jpark:langchange", { detail: { lang } }));
}

window.JPark = window.JPark || {};
window.JPark.i18n = {
  t, applyLang, getLang, registerI18n,
  SUPPORTED, LANG_NAMES, detectLang,
  // used by the admin Site Editor
  base: baseT, allKeys, refreshOverrides: loadOverrides
};

document.addEventListener("DOMContentLoaded", () => {
  applyLang(detectLang());

  // language menu open/close
  const wrap = document.getElementById("langSwitch");
  const btn = document.getElementById("langBtn");
  const menu = document.getElementById("langMenu");

  if (btn && menu && wrap) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = wrap.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    menu.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        applyLang(b.getAttribute("data-lang"));
        wrap.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      });
    });
    document.addEventListener("click", () => {
      wrap.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    });
  }
});
