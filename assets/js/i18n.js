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
    "nav.book": "จองเลย",
    "hero.eyebrow": "โรงแรมสไตล์ญี่ปุ่นกลางสวน · ชลบุรี",
    "hero.title": "สวนอันเงียบสงบ การต้อนรับอันอบอุ่น",
    "hero.lede": "ความผ่อนคลายแบบเขตร้อนผสานการบริการสไตล์ญี่ปุ่น — ออนเซ็น ห้องอาหารชั้นเลิศ และห้องพักอันสงบ ใกล้นิคมอมตะนคร",
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
    "about.eyebrow": "ยินดีต้อนรับสู่ J Park",
    "about.title": "ที่ซึ่งญี่ปุ่นพบกับเขตร้อนของไทย",
    "about.p1": "ท่ามกลางสวนดอกไม้และลานร่มรื่นในตำบลนาป่า ชลบุรี โรงแรม J Park ผสานความสงบของเรียวกังญี่ปุ่นเข้ากับการต้อนรับอันอบอุ่นแบบไทย ห้องสวีทกว้างขวางสไตล์อพาร์ตเมนต์ สะดวกสบายทั้งการค้างคืนเดียวและพักระยะยาว",
    "about.p2": "แช่ออนเซ็นแบบดั้งเดิม ลิ้มรสอาหารญี่ปุ่นแท้ที่ห้องอาหารทสึบากิ ว่ายน้ำใต้แมกไม้ แล้วผ่อนคลายที่มิดไนท์ คอฟฟี่ คลับที่เพิ่งเปิดใหม่ ห่างจากนิคมอมตะนครเพียงไม่กี่นาที และเดินทางสะดวกสู่หาดบางแสนและกรุงเทพฯ",
    "about.stat1n": "5",
    "about.stat1l": "อาคารกลางสวน",
    "about.stat2n": "24 ชม.",
    "about.stat2l": "เคาน์เตอร์ต้อนรับ",
    "about.stat3n": "5 กม.",
    "about.stat3l": "ถึงอมตะนคร",
    "rooms.eyebrow": "เข้าพักกับเรา",
    "rooms.title": "ห้องพักและห้องสวีท",
    "rooms.lede": "ห้องพักสามสไตล์ พร้อมวิวสวนหรือวิวเมืองอันเงียบสงบ เครื่องนอนนุ่มสบาย และโทนสีมินิมอลที่ช่วยให้ผ่อนคลาย",
    "rooms.studioSize": "37 ตร.ม.",
    "rooms.studioName": "ห้องสตูดิโอ",
    "rooms.studioDesc": "ห้องพักสว่างสไตล์มินิมอล พร้อมเตียงคิงไซส์ มุมทำงาน และวิวสวน เหมาะสำหรับนักเดินทางคนเดียวหรือพักระยะสั้น",
    "rooms.deluxeSize": "54 ตร.ม.",
    "rooms.deluxeName": "แกรนด์ ดีลักซ์",
    "rooms.deluxeDesc": "ห้องสวีทสไตล์อพาร์ตเมนต์กว้างขวาง พร้อมพื้นที่นั่งเล่นแยกส่วน ครัวเล็ก และห้องน้ำหินอ่อนพร้อมอ่างแช่",
    "rooms.suiteSize": "75–78 ตร.ม.",
    "rooms.suiteName": "แกรนด์ สวีท",
    "rooms.suiteDesc": "ห้องพักที่ใหญ่ที่สุดของเรา พื้นที่นั่งเล่นและรับประทานอาหารครบครัน วัสดุระดับพรีเมียม และอ่างล้างหน้าคู่ เหมาะสำหรับครอบครัวและการพักระยะยาว",
    "fac.eyebrow": "ถึงเวลาผ่อนคลาย",
    "fac.title": "สิ่งอำนวยความสะดวกและสุขภาพ",
    "fac.poolName": "สระว่ายน้ำเขตร้อน",
    "fac.poolDesc": "สระว่ายน้ำกลางแจ้งรายล้อมด้วยต้นปาล์มและสวนดอกไม้ พร้อมลานอาบแดด",
    "fac.onsenName": "ออนเซ็นญี่ปุ่น",
    "fac.onsenDesc": "ผ่อนคลายความเหนื่อยล้าในบ่อน้ำพุร้อนแบบดั้งเดิม",
    "fac.gymName": "ฟิตเนสเซ็นเตอร์",
    "fac.gymDesc": "ห้องออกกำลังกายครบครัน ทั้งคาร์ดิโอ ฟรีเวท และเครื่องเล่น",
    "fac.gardenName": "สวนและห้องจัดเลี้ยง",
    "fac.gardenDesc": "สวนเดินเล่นเขียวขจี J Park Hall และพื้นที่จัดงานสำหรับทุกโอกาส",
    "dining.eyebrow": "กินและดื่ม",
    "dining.title": "ร้านอาหารที่ J Park",
    "dining.tsubakiName": "ทสึบากิ · ห้องอาหารญี่ปุ่น",
    "dining.tsubakiDesc": "อาหารญี่ปุ่นแท้ ทั้งซูชิ ซาชิมิ และดงบุริร้อน ๆ ในบรรยากาศเงียบสงบ",
    "dining.allDayName": "ห้องอาหารออลเดย์",
    "dining.allDayDesc": "ลานสวนโปร่งสบายสำหรับบุฟเฟต์อาหารเช้าและเมนูไทย-นานาชาติตลอดวัน",
    "dining.coffeeName": "มิดไนท์ คอฟฟี่ คลับ",
    "dining.coffeeDesc": "กาแฟพิเศษและขนมอบยามกลางวัน ค็อกเทลซิกเนเจอร์ยามค่ำคืน เปิดให้บริการแล้ว",
    "gallery.eyebrow": "มองใกล้ ๆ",
    "gallery.title": "แกลเลอรี",
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
    "footer.tag": "การต้อนรับกลางสวน · ชลบุรี ประเทศไทย",
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
    "nav.book": "Book Now",
    "hero.eyebrow": "Japanese-inspired garden hotel · Chonburi",
    "hero.title": "A quiet garden, a warm welcome",
    "hero.lede": "Tropical calm meets Japanese hospitality — onsen, fine dining, and serene suites a short drive from Amata Nakorn.",
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
    "about.eyebrow": "Welcome to J Park",
    "about.title": "Where Japan meets the Thai tropics",
    "about.p1": "Set among flowering gardens and shaded courtyards in Na Pa, Chonburi, J Park Hotel blends the calm of a Japanese ryokan with the warmth of Thai hospitality. Spacious, apartment-style suites make it as comfortable for a single night as for a long stay.",
    "about.p2": "Soak in our traditional onsen, dine on authentic Japanese cuisine at Tsubaki, swim beneath the palms, then unwind at the brand-new Midnight Coffee Club. Just minutes from Amata Nakorn and within easy reach of Bangsaen Beach and Bangkok.",
    "about.stat1n": "5",
    "about.stat1l": "Garden buildings",
    "about.stat2n": "24h",
    "about.stat2l": "Front desk",
    "about.stat3n": "5 km",
    "about.stat3l": "to Amata Nakorn",
    "rooms.eyebrow": "Stay with us",
    "rooms.title": "Rooms & Suites",
    "rooms.lede": "Three room styles, each with quiet garden or city views, plush bedding and a calming, minimalist palette.",
    "rooms.studioSize": "37 m²",
    "rooms.studioName": "Studio Room",
    "rooms.studioDesc": "A bright, minimalist retreat with a king bed, work nook and garden views — perfect for the solo traveller or short stay.",
    "rooms.deluxeSize": "54 m²",
    "rooms.deluxeName": "Grand Deluxe",
    "rooms.deluxeDesc": "A spacious apartment-style suite with a separate living area, kitchenette and a marble bathroom with deep soaking tub.",
    "rooms.suiteSize": "75–78 m²",
    "rooms.suiteName": "Grand Suite",
    "rooms.suiteDesc": "Our largest residence — full living and dining space, premium finishes and twin vanities, made for families and long stays.",
    "fac.eyebrow": "Time to unwind",
    "fac.title": "Facilities & Wellness",
    "fac.poolName": "Tropical Pool",
    "fac.poolDesc": "A palm-fringed outdoor pool and sun terrace, framed by blossoming gardens.",
    "fac.onsenName": "Japanese Onsen",
    "fac.onsenDesc": "Soak away the day in our traditional hot-spring bath.",
    "fac.gymName": "Fitness Centre",
    "fac.gymDesc": "A fully-equipped gym with cardio, free weights and machines.",
    "fac.gardenName": "Gardens & Halls",
    "fac.gardenDesc": "Lush walking gardens, J Park Hall and event spaces for every occasion.",
    "dining.eyebrow": "Eat & drink",
    "dining.title": "Dining at J Park",
    "dining.tsubakiName": "Tsubaki · Japanese Restaurant",
    "dining.tsubakiDesc": "Authentic Japanese cuisine — sushi, sashimi and warming donburi — in a serene setting.",
    "dining.allDayName": "All-Day Dining",
    "dining.allDayDesc": "A light-filled garden courtyard for breakfast buffets and all-day Thai and international favourites.",
    "dining.coffeeName": "Midnight Coffee Club",
    "dining.coffeeDesc": "Specialty coffee and pastries by day, signature cocktails by night. Now open.",
    "gallery.eyebrow": "A closer look",
    "gallery.title": "Gallery",
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
    "footer.tag": "Garden hospitality · Chonburi, Thailand",
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
    "nav.book": "予約する",
    "hero.eyebrow": "日本の趣を映すガーデンホテル · チョンブリー",
    "hero.title": "静かな庭、あたたかなおもてなし",
    "hero.lede": "トロピカルな安らぎと日本のおもてなし — 温泉、上質なダイニング、静謐な客室。アマタナコンからほど近く。",
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
    "about.eyebrow": "J Park へようこそ",
    "about.title": "日本とタイのトロピカルが出会う場所",
    "about.p1": "チョンブリー・ナパーの花咲く庭と木陰の中庭に佇む J Park ホテルは、日本の旅館の静けさとタイのあたたかなおもてなしを融合。広々としたアパートメント仕様のスイートは、一泊から長期滞在まで快適です。",
    "about.p2": "伝統的な温泉に浸かり、ツバキで本格的な日本料理を味わい、椰子の木の下で泳ぎ、新しいミッドナイト・コーヒー・クラブでくつろぐ。アマタナコンから数分、バンセーンビーチやバンコクへも好アクセス。",
    "about.stat1n": "5",
    "about.stat1l": "ガーデン棟",
    "about.stat2n": "24h",
    "about.stat2l": "フロント",
    "about.stat3n": "5 km",
    "about.stat3l": "アマタナコンまで",
    "rooms.eyebrow": "ご滞在",
    "rooms.title": "客室・スイート",
    "rooms.lede": "3つの客室タイプ。静かな庭園または街の眺め、上質な寝具、心落ち着くミニマルな空間。",
    "rooms.studioSize": "37 m²",
    "rooms.studioName": "スタジオルーム",
    "rooms.studioDesc": "キングベッド、ワークスペース、庭の眺めを備えた明るくミニマルな空間。一人旅や短期滞在に最適。",
    "rooms.deluxeSize": "54 m²",
    "rooms.deluxeName": "グランドデラックス",
    "rooms.deluxeDesc": "リビング、ミニキッチン、深い浴槽付き大理石バスルームを備えた広々としたアパートメント仕様のスイート。",
    "rooms.suiteSize": "75–78 m²",
    "rooms.suiteName": "グランドスイート",
    "rooms.suiteDesc": "当ホテル最大の客室。充実したリビング・ダイニング、上質な設え、ツインの洗面台。ご家族や長期滞在に。",
    "fac.eyebrow": "くつろぎのひととき",
    "fac.title": "施設・ウェルネス",
    "fac.poolName": "トロピカルプール",
    "fac.poolDesc": "椰子の木と花咲く庭に囲まれた屋外プールとサンテラス。",
    "fac.onsenName": "日本式温泉",
    "fac.onsenDesc": "伝統的な温泉で一日の疲れを癒して。",
    "fac.gymName": "フィットネスセンター",
    "fac.gymDesc": "カーディオ、フリーウェイト、マシンを備えた充実のジム。",
    "fac.gardenName": "庭園・ホール",
    "fac.gardenDesc": "緑あふれる庭園、J Park ホール、あらゆる催しに対応するイベントスペース。",
    "dining.eyebrow": "食と飲",
    "dining.title": "J Park のダイニング",
    "dining.tsubakiName": "ツバキ · 日本料理",
    "dining.tsubakiDesc": "寿司、刺身、温かい丼物まで。静かな空間で味わう本格日本料理。",
    "dining.allDayName": "オールデイダイニング",
    "dining.allDayDesc": "朝食ビュッフェやタイ・各国料理を一日中楽しめる、光あふれるガーデンコート。",
    "dining.coffeeName": "ミッドナイト・コーヒー・クラブ",
    "dining.coffeeDesc": "昼はスペシャルティコーヒーとペストリー、夜はシグネチャーカクテル。オープンしました。",
    "gallery.eyebrow": "もっと近くで",
    "gallery.title": "ギャラリー",
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
    "footer.tag": "ガーデンホスピタリティ · タイ・チョンブリー",
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
    "nav.book": "立即预订",
    "hero.eyebrow": "日式花园酒店 · 春武里",
    "hero.title": "静谧花园，温暖款待",
    "hero.lede": "热带的宁静邂逅日式款待——温泉、精致餐饮与静谧客房，距阿马塔纳空仅数分钟车程。",
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
    "about.eyebrow": "欢迎来到 J Park",
    "about.title": "日本与泰式热带的交汇",
    "about.p1": "坐落于春武里那帕的繁花庭园与林荫庭院之间，J Park 酒店将日式旅馆的静谧与泰式款待的温暖融为一体。宽敞的公寓式套房，无论一晚小住还是长期停留都同样舒适。",
    "about.p2": "浸泡传统温泉，在椿日本料理品尝地道日式美馔，于棕榈树下畅泳，再到全新的午夜咖啡俱乐部放松身心。距阿马塔纳空仅数分钟，前往邦盛海滩与曼谷亦十分便捷。",
    "about.stat1n": "5",
    "about.stat1l": "花园楼栋",
    "about.stat2n": "24h",
    "about.stat2l": "前台服务",
    "about.stat3n": "5 公里",
    "about.stat3l": "至阿马塔纳空",
    "rooms.eyebrow": "入住体验",
    "rooms.title": "客房与套房",
    "rooms.lede": "三种客房风格，皆享静谧花园或城市景观、柔软寝具与令人放松的极简色调。",
    "rooms.studioSize": "37 m²",
    "rooms.studioName": "开间客房",
    "rooms.studioDesc": "明亮极简的休憩空间，配特大号床、办公一隅与花园景致，是独自旅行或短期入住的理想之选。",
    "rooms.deluxeSize": "54 m²",
    "rooms.deluxeName": "豪华客房",
    "rooms.deluxeDesc": "宽敞的公寓式套房，设独立起居区、小厨房，以及配深泡浴缸的大理石浴室。",
    "rooms.suiteSize": "75–78 m²",
    "rooms.suiteName": "尊贵套房",
    "rooms.suiteDesc": "我们最宽敞的居所——完整的起居与用餐空间、高级装饰与双台盆，专为家庭与长期入住而设。",
    "fac.eyebrow": "尽情放松",
    "fac.title": "设施与养生",
    "fac.poolName": "热带泳池",
    "fac.poolDesc": "棕榈环绕的户外泳池与日光露台，四周繁花掩映。",
    "fac.onsenName": "日式温泉",
    "fac.onsenDesc": "在传统温泉中泡去一日的疲惫。",
    "fac.gymName": "健身中心",
    "fac.gymDesc": "设备齐全的健身房，配有有氧器械、自由重量与训练器材。",
    "fac.gardenName": "花园与宴会厅",
    "fac.gardenDesc": "葱郁的散步花园、J Park 大厅及适合各类活动的空间。",
    "dining.eyebrow": "美食与畅饮",
    "dining.title": "J Park 餐饮",
    "dining.tsubakiName": "椿 · 日本料理",
    "dining.tsubakiDesc": "地道日式料理——寿司、刺身与暖心丼饭，尽在静谧雅致的空间。",
    "dining.allDayName": "全日餐厅",
    "dining.allDayDesc": "光线充沛的花园庭院，供应早餐自助及全日泰式与各国佳肴。",
    "dining.coffeeName": "午夜咖啡俱乐部",
    "dining.coffeeDesc": "白天精品咖啡与糕点，夜晚招牌鸡尾酒。现已开业。",
    "gallery.eyebrow": "细细品味",
    "gallery.title": "图库",
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
    "footer.tag": "花园款待 · 泰国春武里",
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
    "nav.book": "立即預訂",
    "hero.eyebrow": "日式花園酒店 · 春武里",
    "hero.title": "靜謐花園，溫暖款待",
    "hero.lede": "熱帶的寧靜邂逅日式款待——溫泉、精緻餐飲與靜謐客房，距阿瑪塔納空僅數分鐘車程。",
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
    "about.eyebrow": "歡迎來到 J Park",
    "about.title": "日本與泰式熱帶的交匯",
    "about.p1": "坐落於春武里那帕的繁花庭園與林蔭庭院之間，J Park 酒店將日式旅館的靜謐與泰式款待的溫暖融為一體。寬敞的公寓式套房，無論一晚小住或長期停留都同樣舒適。",
    "about.p2": "浸泡傳統溫泉，在椿日本料理品嚐道地日式佳餚，於棕櫚樹下暢泳，再到全新的午夜咖啡俱樂部放鬆身心。距阿瑪塔納空僅數分鐘，前往邦盛海灘與曼谷亦十分便捷。",
    "about.stat1n": "5",
    "about.stat1l": "花園樓棟",
    "about.stat2n": "24h",
    "about.stat2l": "櫃檯服務",
    "about.stat3n": "5 公里",
    "about.stat3l": "至阿瑪塔納空",
    "rooms.eyebrow": "入住體驗",
    "rooms.title": "客房與套房",
    "rooms.lede": "三種客房風格，皆享靜謐花園或城市景觀、柔軟寢具與令人放鬆的極簡色調。",
    "rooms.studioSize": "37 m²",
    "rooms.studioName": "開間客房",
    "rooms.studioDesc": "明亮極簡的休憩空間，配特大號床、辦公一隅與花園景緻，是獨自旅行或短期入住的理想之選。",
    "rooms.deluxeSize": "54 m²",
    "rooms.deluxeName": "豪華客房",
    "rooms.deluxeDesc": "寬敞的公寓式套房，設獨立起居區、小廚房，以及配深泡浴缸的大理石浴室。",
    "rooms.suiteSize": "75–78 m²",
    "rooms.suiteName": "尊貴套房",
    "rooms.suiteDesc": "我們最寬敞的居所——完整的起居與用餐空間、高級裝飾與雙台盆，專為家庭與長期入住而設。",
    "fac.eyebrow": "盡情放鬆",
    "fac.title": "設施與養生",
    "fac.poolName": "熱帶泳池",
    "fac.poolDesc": "棕櫚環繞的戶外泳池與日光露台，四周繁花掩映。",
    "fac.onsenName": "日式溫泉",
    "fac.onsenDesc": "在傳統溫泉中泡去一日的疲憊。",
    "fac.gymName": "健身中心",
    "fac.gymDesc": "設備齊全的健身房，配有有氧器械、自由重量與訓練器材。",
    "fac.gardenName": "花園與宴會廳",
    "fac.gardenDesc": "蔥鬱的散步花園、J Park 大廳及適合各類活動的空間。",
    "dining.eyebrow": "美食與暢飲",
    "dining.title": "J Park 餐飲",
    "dining.tsubakiName": "椿 · 日本料理",
    "dining.tsubakiDesc": "道地日式料理——壽司、刺身與暖心丼飯，盡在靜謐雅致的空間。",
    "dining.allDayName": "全日餐廳",
    "dining.allDayDesc": "光線充沛的花園庭院，供應早餐自助及全日泰式與各國佳餚。",
    "dining.coffeeName": "午夜咖啡俱樂部",
    "dining.coffeeDesc": "白天精品咖啡與糕點，夜晚招牌雞尾酒。現已開幕。",
    "gallery.eyebrow": "細細品味",
    "gallery.title": "圖庫",
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
    "footer.tag": "花園款待 · 泰國春武里",
    "footer.rights": "版權所有。"
  }
};

/* ----------------- detection & application ----------------- */

const SUPPORTED = ["th", "en", "ja", "zh-Hans", "zh-Hant"];

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
  const dict = I18N[lang];

  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("data-lang", lang);

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key] !== undefined) el.textContent = dict[key];
  });

  const current = document.getElementById("langCurrent");
  if (current) current.textContent = LANG_NAMES[lang];

  document.querySelectorAll("#langMenu button").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-lang") === lang);
  });

  localStorage.setItem("jpark.lang", lang);
}

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
