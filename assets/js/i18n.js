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
    "coffee.tagline": "กาแฟยามกลางวัน · ค็อกเทลยามเที่ยงคืน",
    "coffee.lede": "คาเฟ่ที่อาบแสงแดด ตกแต่งด้วยไม้ไผ่ ไม้สัก และโทนสีน้ำเงินยูง — กาแฟซิงเกิลออริจินและขนมอบสดใหม่ตลอดวัน ก่อนเปลี่ยนเป็นบาร์ค็อกเทลซิกเนเจอร์ในยามค่ำคืน",
    "coffee.day": "คาเฟ่ · กลางวัน",
    "coffee.dayHours": "07:00 – 17:00",
    "coffee.night": "บาร์ · เย็นถึงดึก",
    "coffee.nightHours": "17:00 – 00:00",
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
    "rooms.lede": "ห้องพักและห้องสวีทเก้าสไตล์ ตั้งแต่ห้องเดี่ยวกะทัดรัดไปจนถึงห้องสวีทสองห้องนอน แต่ละห้องมาพร้อมเครื่องนอนนุ่มสบาย โทนร่วมสมัยที่ผ่อนคลาย และวิวเมืองอันเงียบสงบ",
    "rooms.singleSize": "24 ตร.ม.",
    "rooms.singleName": "ห้องเดี่ยวมาตรฐาน",
    "rooms.singleDesc": "ห้องเดี่ยวสว่างสบาย พร้อมเตียงอบอุ่น โต๊ะทำงาน และฝักบัวเรนชาวเวอร์ เหมาะสำหรับนักธุรกิจที่เดินทางคนเดียว",
    "rooms.superiorSize": "32 ตร.ม.",
    "rooms.superiorName": "ห้องซูพีเรียร์",
    "rooms.superiorDesc": "ห้องพักหรูพร้อมเตียงควีนนุ่มสบาย มุมนั่งเล่น และห้องน้ำดีไซน์เรียบหรู ในโทนสีอบอุ่นร่วมสมัย",
    "rooms.deluxeTwinSize": "34 ตร.ม.",
    "rooms.deluxeTwinName": "ห้องดีลักซ์ ทวิน",
    "rooms.deluxeTwinDesc": "เตียงเดี่ยวสบายสองเตียง มุมนั่งเล่นผ่อนคลาย และวิวเมือง เหมาะสำหรับเพื่อนหรือเพื่อนร่วมงานที่เดินทางด้วยกัน",
    "rooms.prestigeSize": "36 ตร.ม.",
    "rooms.prestigeName": "ห้องเพรสทีจ ทวิน",
    "rooms.prestigeDesc": "ห้องทวินระดับอัปเกรด พร้อมเครื่องนอนพรีเมียม พื้นที่ทำงานกว้างขวาง และสิ่งอำนวยความสะดวกที่เหนือกว่าเพื่อการพักที่ยาวนานและสบายยิ่งขึ้น",
    "rooms.studioSize": "38 ตร.ม.",
    "rooms.studioName": "ห้องสตูดิโอ",
    "rooms.studioDesc": "ห้องสตูดิโอสไตล์อพาร์ตเมนต์ที่สว่างสบาย พร้อมเตียงคิงไซส์ ครัวเล็ก และมุมนั่งเล่น ออกแบบมาเพื่อการพักระยะยาวอย่างสบาย",
    "rooms.studioDoubleSize": "42 ตร.ม.",
    "rooms.studioDoubleName": "ห้องสตูดิโอ ดับเบิล",
    "rooms.studioDoubleDesc": "ห้องสตูดิโอกว้างขวาง พร้อมเตียงคิงไซส์และเดย์เบดสำหรับสองท่าน ครัวครบครัน และพื้นที่กว้างขวางสบาย",
    "rooms.cornerSize": "52 ตร.ม.",
    "rooms.cornerName": "คอร์เนอร์ สวีท",
    "rooms.cornerDesc": "ห้องสวีทหัวมุมที่โอบล้อมด้วยหน้าต่างสองด้าน พร้อมห้องนั่งเล่นแยกส่วน และห้องน้ำหินอ่อนพร้อมอ่างแช่",
    "rooms.grandDeluxeSize": "48 ตร.ม.",
    "rooms.grandDeluxeName": "แกรนด์ ดีลักซ์",
    "rooms.grandDeluxeDesc": "ห้องดีลักซ์กว้างขวางพร้อมเตียงคิงไซส์ เฟอร์นิเจอร์คัดสรร และวัสดุระดับพรีเมียม เหมาะสำหรับผู้ที่ต้องการความสะดวกสบายระดับสูง",
    "rooms.grandSuiteSize": "75 ตร.ม.",
    "rooms.grandSuiteName": "แกรนด์ สวีท · ห้องนอนเดี่ยว",
    "rooms.grandSuiteDesc": "ห้องสวีทหนึ่งห้องนอนกว้างขวาง พร้อมพื้นที่นั่งเล่นและรับประทานอาหารครบครัน ครัว และวัสดุระดับพรีเมียมตลอดทั้งห้อง",
    "rooms.grandTwoSize": "95 ตร.ม.",
    "rooms.grandTwoName": "แกรนด์ สวีท · สองห้องนอน",
    "rooms.grandTwoDesc": "ห้องสวีทเรือธงสองห้องนอนของเรา พร้อมสองห้องนอน พื้นที่นั่งเล่นและรับประทานอาหารขนาดใหญ่ และห้องน้ำสองห้อง เหมาะสำหรับครอบครัวและการพักระยะยาว",
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
    "dining.coffeeDesc": "กาแฟพิเศษและขนมอบยามกลางวัน ค็อกเทลซิกเนเจอร์ยามค่ำคืน เปิดให้บริการแล้ว",
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
    "contact.addrValue": "88 ถนนสุขประยูร ตำบลนาป่า อำเภอเมืองชลบุรี จังหวัดชลบุรี 20000",
    "contact.phoneLabel": "โทรศัพท์",
    "contact.emailLabel": "อีเมล",
    "contact.hoursLabel": "เคาน์เตอร์ต้อนรับ",
    "contact.hoursValue": "เปิด 24 ชั่วโมง",
    "contact.callBtn": "โทรเพื่อจอง",
    "contact.mapBtn": "เปิดในแผนที่",
    "contact.fbBtn": "Facebook",
    "footer.tag": "การต้อนรับสไตล์ญี่ปุ่น · ชลบุรี ประเทศไทย",
    "footer.rights": "สงวนลิขสิทธิ์"
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
    "coffee.tagline": "Coffee by daylight · Cocktails by midnight",
    "coffee.lede": "A sun-drenched café of bamboo, teak and peacock blue — single-origin brews and fresh pastries through the day, easing into signature cocktails and low light after dark.",
    "coffee.day": "Café · Daytime",
    "coffee.dayHours": "07:00 – 17:00",
    "coffee.night": "Bar · Evening & Late Night",
    "coffee.nightHours": "17:00 – 00:00",
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
    "rooms.lede": "Nine room and suite styles — from a smart single to a two-bedroom residence — each with plush bedding, contemporary calm and quiet city views.",
    "rooms.singleSize": "24 m²",
    "rooms.singleName": "Standard Single",
    "rooms.singleDesc": "A smart, light-filled single with a cosy bed, work desk and rainfall shower — ideal for the solo business traveller.",
    "rooms.superiorSize": "32 m²",
    "rooms.superiorName": "Superior Room",
    "rooms.superiorDesc": "A refined room with a plush queen bed, lounge seating and a sleek bathroom, dressed in a warm, contemporary palette.",
    "rooms.deluxeTwinSize": "34 m²",
    "rooms.deluxeTwinName": "Deluxe Twin Room",
    "rooms.deluxeTwinDesc": "Two comfortable single beds, a relaxed sitting corner and city views — perfect for friends or colleagues travelling together.",
    "rooms.prestigeSize": "36 m²",
    "rooms.prestigeName": "Prestige Twin Room",
    "rooms.prestigeDesc": "An elevated twin with premium bedding, a spacious work area and upgraded amenities for a longer, easier stay.",
    "rooms.studioSize": "38 m²",
    "rooms.studioName": "Studio Room",
    "rooms.studioDesc": "A bright apartment-style studio with a king bed, kitchenette and living nook — designed for comfortable extended stays.",
    "rooms.studioDoubleSize": "42 m²",
    "rooms.studioDoubleName": "Studio Double Room",
    "rooms.studioDoubleDesc": "A generous studio with a king bed and a separate double daybed, a full kitchenette and ample room to spread out.",
    "rooms.cornerSize": "52 m²",
    "rooms.cornerName": "Corner Suite",
    "rooms.cornerDesc": "A wraparound corner retreat with a separate living room, dual-aspect windows and a deep-soaking marble bathroom.",
    "rooms.grandDeluxeSize": "48 m²",
    "rooms.grandDeluxeName": "Grand Deluxe",
    "rooms.grandDeluxeDesc": "A generously sized deluxe room with a king bed, plush furnishings and premium finishes — perfect for guests seeking elevated comfort.",
    "rooms.grandSuiteSize": "75 m²",
    "rooms.grandSuiteName": "Grand Suite · Single Bedroom",
    "rooms.grandSuiteDesc": "An expansive one-bedroom residence with full living and dining areas, a kitchen and premium finishes throughout.",
    "rooms.grandTwoSize": "95 m²",
    "rooms.grandTwoName": "Grand Suite · Two Bedrooms",
    "rooms.grandTwoDesc": "Our flagship two-bedroom residence — two bedrooms, a large living and dining space and twin bathrooms, made for families and long stays.",
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
    "dining.coffeeDesc": "Specialty coffee and pastries by day, signature cocktails by night. Now open.",
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
    "contact.addrValue": "88 Thanon Sukprayun, Na Pa, Mueang Chonburi District, Chon Buri 20000, Thailand",
    "contact.phoneLabel": "Phone",
    "contact.emailLabel": "Email",
    "contact.hoursLabel": "Reception",
    "contact.hoursValue": "Open 24 hours",
    "contact.callBtn": "Call to Book",
    "contact.mapBtn": "Open in Maps",
    "contact.fbBtn": "Facebook",
    "footer.tag": "Japanese-inspired hospitality · Chonburi, Thailand",
    "footer.rights": "All rights reserved."
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
    "coffee.tagline": "昼はコーヒー · 真夜中はカクテル",
    "coffee.lede": "竹とチーク、孔雀色のブルーに包まれた陽光あふれるカフェ。日中はシングルオリジンのコーヒーと焼きたてのペストリー、夜はシグネチャーカクテルと灯りを落とした空間へ。",
    "coffee.day": "カフェ · 昼",
    "coffee.dayHours": "07:00 – 17:00",
    "coffee.night": "バー · 夜〜深夜",
    "coffee.nightHours": "17:00 – 00:00",
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
    "rooms.lede": "9つの客室・スイートタイプ。コンパクトなシングルから2ベッドルームのレジデンスまで、いずれも上質な寝具、落ち着いた現代的な設え、静かな街の眺めを備えています。",
    "rooms.singleSize": "24 m²",
    "rooms.singleName": "スタンダードシングル",
    "rooms.singleDesc": "心地よいベッド、ワークデスク、レインシャワーを備えた明るいシングルルーム。一人のビジネス旅行に最適。",
    "rooms.superiorSize": "32 m²",
    "rooms.superiorName": "スーペリアルーム",
    "rooms.superiorDesc": "ふかふかのクイーンベッド、くつろぎのソファ、洗練されたバスルームを備えた上質な客室。温かみのある現代的な配色。",
    "rooms.deluxeTwinSize": "34 m²",
    "rooms.deluxeTwinName": "デラックスツイン",
    "rooms.deluxeTwinDesc": "快適なシングルベッド2台、ゆったりとした座りスペース、街の眺め。ご友人や同僚との旅に最適。",
    "rooms.prestigeSize": "36 m²",
    "rooms.prestigeName": "プレステージツイン",
    "rooms.prestigeDesc": "上質な寝具、広々としたワークエリア、充実したアメニティを備えたワンランク上のツイン。長めのご滞在も快適に。",
    "rooms.studioSize": "38 m²",
    "rooms.studioName": "スタジオルーム",
    "rooms.studioDesc": "キングベッド、ミニキッチン、リビングコーナーを備えた明るいアパートメント仕様のスタジオ。長期滞在に快適。",
    "rooms.studioDoubleSize": "42 m²",
    "rooms.studioDoubleName": "スタジオダブル",
    "rooms.studioDoubleDesc": "キングベッドと独立したデイベッド、フル装備のミニキッチンを備えたゆとりのスタジオ。ゆったりとお過ごしいただけます。",
    "rooms.cornerSize": "52 m²",
    "rooms.cornerName": "コーナースイート",
    "rooms.cornerDesc": "二面採光に包まれた角部屋のスイート。独立したリビングルームと、深い浴槽付き大理石バスルームを備えています。",
    "rooms.grandDeluxeSize": "48 m²",
    "rooms.grandDeluxeName": "グランドデラックス",
    "rooms.grandDeluxeDesc": "キングベッドと上質な家具、プレミアムな設えを備えた広々としたデラックスルーム。格上げされた快適さをお求めのお客様に。",
    "rooms.grandSuiteSize": "75 m²",
    "rooms.grandSuiteName": "グランドスイート · シングルベッドルーム",
    "rooms.grandSuiteDesc": "充実したリビング・ダイニング、キッチン、上質な設えを備えた広々とした1ベッドルームのレジデンス。",
    "rooms.grandTwoSize": "95 m²",
    "rooms.grandTwoName": "グランドスイート · 2ベッドルーム",
    "rooms.grandTwoDesc": "当ホテル旗艦の2ベッドルームレジデンス。2つのベッドルーム、広いリビング・ダイニング、2つのバスルーム。ご家族や長期滞在に。",
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
    "dining.coffeeDesc": "昼はスペシャルティコーヒーとペストリー、夜はシグネチャーカクテル。オープンしました。",
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
    "contact.addrValue": "88 Thanon Sukprayun, Na Pa, Mueang Chonburi, Chon Buri 20000, Thailand",
    "contact.phoneLabel": "電話",
    "contact.emailLabel": "メール",
    "contact.hoursLabel": "フロント",
    "contact.hoursValue": "24時間営業",
    "contact.callBtn": "電話で予約",
    "contact.mapBtn": "地図を開く",
    "contact.fbBtn": "Facebook",
    "footer.tag": "日本の趣のおもてなし · タイ・チョンブリー",
    "footer.rights": "All rights reserved."
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
    "coffee.tagline": "白日咖啡 · 午夜鸡尾酒",
    "coffee.lede": "阳光洒落的咖啡馆，以竹、柚木与孔雀蓝为调——白天供应单一产地咖啡与新鲜糕点，入夜则化身招牌鸡尾酒吧。",
    "coffee.day": "咖啡馆 · 日间",
    "coffee.dayHours": "07:00 – 17:00",
    "coffee.night": "酒吧 · 傍晚至深夜",
    "coffee.nightHours": "17:00 – 00:00",
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
    "rooms.lede": "九种客房与套房风格——从精巧的单人房到两卧居所——皆配柔软寝具、沉静的当代格调与静谧的城市景观。",
    "rooms.singleSize": "24 m²",
    "rooms.singleName": "标准单人房",
    "rooms.singleDesc": "明亮舒适的单人房，配温馨睡床、办公书桌与雨林花洒，是独自出行商旅人士的理想之选。",
    "rooms.superiorSize": "32 m²",
    "rooms.superiorName": "高级客房",
    "rooms.superiorDesc": "精致客房，配松软大床、休闲座椅与雅致浴室，以温暖的当代色调装点。",
    "rooms.deluxeTwinSize": "34 m²",
    "rooms.deluxeTwinName": "豪华双床房",
    "rooms.deluxeTwinDesc": "两张舒适单人床、轻松的休憩一角与城市景观——是结伴出行的好友或同事的理想之选。",
    "rooms.prestigeSize": "36 m²",
    "rooms.prestigeName": "尊享双床房",
    "rooms.prestigeDesc": "升级版双床房，配高级寝具、宽敞办公区与升级设施，让较长停留更加从容惬意。",
    "rooms.studioSize": "38 m²",
    "rooms.studioName": "开间客房",
    "rooms.studioDesc": "明亮的公寓式开间，配特大号床、小厨房与起居一隅，专为舒适长住而设计。",
    "rooms.studioDoubleSize": "42 m²",
    "rooms.studioDoubleName": "开间双人房",
    "rooms.studioDoubleDesc": "宽敞的开间，配特大号床与独立双人榻、全套小厨房，空间充裕舒展。",
    "rooms.cornerSize": "52 m²",
    "rooms.cornerName": "转角套房",
    "rooms.cornerDesc": "环抱式转角居所，配独立起居室、双面采光窗与配深泡浴缸的大理石浴室。",
    "rooms.grandDeluxeSize": "48 m²",
    "rooms.grandDeluxeName": "豪华大床房",
    "rooms.grandDeluxeDesc": "宽敞的豪华客房，配特大号床、精致家具与高级装饰，专为追求卓越舒适的宾客而设。",
    "rooms.grandSuiteSize": "75 m²",
    "rooms.grandSuiteName": "豪华套房 · 单卧",
    "rooms.grandSuiteDesc": "宽敞的一卧居所，配完整起居与用餐区、厨房及全室高级装饰。",
    "rooms.grandTwoSize": "95 m²",
    "rooms.grandTwoName": "豪华套房 · 两卧",
    "rooms.grandTwoDesc": "我们的旗舰两卧居所——两间卧室、宽大的起居与用餐空间及双浴室，专为家庭与长期入住而设。",
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
    "dining.coffeeDesc": "白天精品咖啡与糕点，夜晚招牌鸡尾酒。现已开业。",
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
    "contact.addrValue": "88 Thanon Sukprayun, Na Pa, Mueang Chonburi, Chon Buri 20000, 泰国",
    "contact.phoneLabel": "电话",
    "contact.emailLabel": "邮箱",
    "contact.hoursLabel": "前台",
    "contact.hoursValue": "24 小时开放",
    "contact.callBtn": "致电预订",
    "contact.mapBtn": "在地图中打开",
    "contact.fbBtn": "Facebook",
    "footer.tag": "日式款待 · 泰国春武里",
    "footer.rights": "版权所有。"
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
    "coffee.tagline": "白日咖啡 · 午夜雞尾酒",
    "coffee.lede": "陽光灑落的咖啡館，以竹、柚木與孔雀藍為調——白天供應單一產地咖啡與新鮮糕點，入夜則化身招牌雞尾酒吧。",
    "coffee.day": "咖啡館 · 日間",
    "coffee.dayHours": "07:00 – 17:00",
    "coffee.night": "酒吧 · 傍晚至深夜",
    "coffee.nightHours": "17:00 – 00:00",
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
    "rooms.lede": "九種客房與套房風格——從精巧的單人房到兩臥居所——皆配柔軟寢具、沉靜的當代格調與靜謐的城市景觀。",
    "rooms.singleSize": "24 m²",
    "rooms.singleName": "標準單人房",
    "rooms.singleDesc": "明亮舒適的單人房，配溫馨睡床、辦公書桌與雨林花灑，是獨自出行商旅人士的理想之選。",
    "rooms.superiorSize": "32 m²",
    "rooms.superiorName": "高級客房",
    "rooms.superiorDesc": "精緻客房，配鬆軟大床、休閒座椅與雅致浴室，以溫暖的當代色調裝點。",
    "rooms.deluxeTwinSize": "34 m²",
    "rooms.deluxeTwinName": "豪華雙床房",
    "rooms.deluxeTwinDesc": "兩張舒適單人床、輕鬆的休憩一角與城市景觀——是結伴出行的好友或同事的理想之選。",
    "rooms.prestigeSize": "36 m²",
    "rooms.prestigeName": "尊享雙床房",
    "rooms.prestigeDesc": "升級版雙床房，配高級寢具、寬敞辦公區與升級設施，讓較長停留更加從容愜意。",
    "rooms.studioSize": "38 m²",
    "rooms.studioName": "開間客房",
    "rooms.studioDesc": "明亮的公寓式開間，配特大號床、小廚房與起居一隅，專為舒適長住而設計。",
    "rooms.studioDoubleSize": "42 m²",
    "rooms.studioDoubleName": "開間雙人房",
    "rooms.studioDoubleDesc": "寬敞的開間，配特大號床與獨立雙人榻、全套小廚房，空間充裕舒展。",
    "rooms.cornerSize": "52 m²",
    "rooms.cornerName": "轉角套房",
    "rooms.cornerDesc": "環抱式轉角居所，配獨立起居室、雙面採光窗與配深泡浴缸的大理石浴室。",
    "rooms.grandDeluxeSize": "48 m²",
    "rooms.grandDeluxeName": "豪華大床房",
    "rooms.grandDeluxeDesc": "寬敞的豪華客房，配特大號床、精緻家具與高級裝飾，專為追求卓越舒適的賓客而設。",
    "rooms.grandSuiteSize": "75 m²",
    "rooms.grandSuiteName": "豪華套房 · 單臥",
    "rooms.grandSuiteDesc": "寬敞的一臥居所，配完整起居與用餐區、廚房及全室高級裝飾。",
    "rooms.grandTwoSize": "95 m²",
    "rooms.grandTwoName": "豪華套房 · 兩臥",
    "rooms.grandTwoDesc": "我們的旗艦兩臥居所——兩間臥室、寬大的起居與用餐空間及雙浴室，專為家庭與長期入住而設。",
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
    "dining.coffeeDesc": "白天精品咖啡與糕點，夜晚招牌雞尾酒。現已開幕。",
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
    "contact.addrValue": "88 Thanon Sukprayun, Na Pa, Mueang Chonburi, Chon Buri 20000, 泰國",
    "contact.phoneLabel": "電話",
    "contact.emailLabel": "電郵",
    "contact.hoursLabel": "櫃檯",
    "contact.hoursValue": "24 小時開放",
    "contact.callBtn": "致電預訂",
    "contact.mapBtn": "在地圖中開啟",
    "contact.fbBtn": "Facebook",
    "footer.tag": "日式款待 · 泰國春武里",
    "footer.rights": "版權所有。"
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
