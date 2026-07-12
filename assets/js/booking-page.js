(function () {
  'use strict';

  // Room types and 2026 General rates (per room / night, THB), in display order.
  // Each variant: { label, room: Room-only, bf: Room + American Breakfast }.
  // `folder` matches the media registry set id (room:<folder>) and captions key.
  //
  // These are FALLBACK/BASE numbers, live-overridden at load time by
  // applyRateOverrides() below (fetched from GET /api/rates — the same admin
  // edits saved via the Site Editor's Rates tab that backend/lib/rateOverrides.js
  // uses as the real, authoritative price). Adding a brand-new room/variant
  // still means editing this array AND the matching ROOMS object in
  // backend/lib/roomRates.js by hand — overrides only ever adjust numbers for
  // a room+variant key that already exists in both files.
  var ROOMS = [
    {
      // guestTier: 1 — this and its paired Twin room below are the SAME
      // physical room, priced separately for 1 vs 2 guests (identical
      // room-only rate, breakfast rate differs). Kept as two distinct ROOMS
      // entries (never merge these two — see backend/lib/hotelAdsIds.js's
      // comment on why room keys must never be renamed/removed once a key
      // exists: it would break the live Google Hotel Ads room-type IDs).
      // DISPLAY_ROOMS below folds this pair into one search-result card
      // showing both as rate-row variants; `baseNameKey` is that merged
      // card's title (no "Single"/"Twin" suffix).
      name: 'Studio Single', folder: 'Studio Single', guestTier: 1,
      baseNameKey: 'rooms.studioName',
      nameKey: 'rooms.studioSingleName', descKey: 'rooms.studioDesc',
      size: '37 m²', maxGuests: 3, extraBedAvailable: true,
      amenities: ['Single Bed', 'Work Desk', 'Rainfall Shower', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 990, bf: 1110 }],
    },
    {
      // folder aliases 'Studio Single' — same physical room, no dedicated photo set.
      name: 'Studio Twin', folder: 'Studio Single', guestTier: 2,
      nameKey: 'rooms.studioTwinName', descKey: 'rooms.studioDesc',
      size: '37 m²', maxGuests: 3, extraBedAvailable: true,
      amenities: ['Twin Beds', 'Work Desk', 'Rainfall Shower', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Twin', room: 990, bf: 1300 }],
    },
    {
      // guestTier pair with 'Prestige Twin' below — see the comment on
      // 'Studio Single' above for why these stay separate ROOMS entries.
      name: 'Prestige Single', folder: 'Prestige Single', guestTier: 1,
      baseNameKey: 'rooms.prestigeName',
      nameKey: 'rooms.prestigeSingleName', descKey: 'rooms.prestigeSingleDesc',
      size: '45 m²', maxGuests: 3, extraBedAvailable: false,
      amenities: ['Single Bed', 'Premium Bedding', 'Generous Work Area', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1040, bf: 1160 }],
    },
    {
      name: 'Prestige Twin', folder: 'Prestige Twin', guestTier: 2,
      nameKey: 'rooms.prestigeTwinName', descKey: 'rooms.prestigeTwinDesc',
      size: '45 m²', maxGuests: 3, extraBedAvailable: false,
      amenities: ['Twin Beds', 'Premium Bedding', 'Generous Work Area', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Twin', room: 1040, bf: 1350 }],
    },
    {
      name: 'Studio B4', folder: 'Studio B4',
      nameKey: 'rooms.studioB4Name', descKey: 'rooms.studioB4Desc',
      size: '37 m²', maxGuests: 3, extraBedAvailable: true,
      amenities: ['Single or Twin', 'Full Kitchenette', 'Living Corner', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1070, bf: 1190 }, { label: 'Twin', room: 1070, bf: 1380 }],
    },
    {
      name: 'Deluxe', folder: 'Deluxe',
      nameKey: 'rooms.deluxeName', descKey: 'rooms.deluxeDesc',
      size: '44 m²', maxGuests: 3, extraBedAvailable: true,
      amenities: ['Single Bed', 'Lounge Seating', 'Sleek Bathroom', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1110, bf: 1230 }],
    },
    {
      // guestTier pair with 'Premium Twin' below — see the comment on
      // 'Studio Single' above for why these stay separate ROOMS entries.
      name: 'Premium Single', folder: 'Premium Single', guestTier: 1,
      baseNameKey: 'rooms.premiumName',
      nameKey: 'rooms.premiumSingleName', descKey: 'rooms.premiereDesc',
      size: '49 m²', maxGuests: 3, extraBedAvailable: true,
      amenities: ['Single Bed', 'Premium Linens', 'Spacious Work Area', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1160, bf: 1280 }],
    },
    {
      name: 'Premium Twin', folder: 'Premium Twin', guestTier: 2,
      nameKey: 'rooms.premiumTwinName', descKey: 'rooms.premiereDesc',
      size: '49 m²', maxGuests: 3, extraBedAvailable: true,
      amenities: ['Twin Beds', 'Premium Linens', 'Spacious Work Area', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Twin', room: 1160, bf: 1470 }],
    },
    {
      name: 'Grand Premium', folder: 'Grand Premium',
      nameKey: 'rooms.grandPremiumName', descKey: 'rooms.grandPremiereDesc',
      size: '49 m²', maxGuests: 3, extraBedAvailable: false,
      amenities: ['Single Bed', 'Wide Lounge Area', 'Upgraded Amenities', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1260, bf: 1380 }],
    },
    {
      name: 'Corner Suite', folder: 'Corner Suite',
      nameKey: 'rooms.cornerName', descKey: 'rooms.cornerDesc',
      size: '55 m²', maxGuests: 3, extraBedAvailable: false,
      amenities: ['Single or Twin', 'Dual-Aspect Views', 'Marble Bathroom', 'Separate Living Room', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1260, bf: 1380 }, { label: 'Twin', room: 1260, bf: 1570 }],
    },
    {
      name: 'Grand Deluxe', folder: 'Grand Deluxe',
      nameKey: 'rooms.grandDeluxeName', descKey: 'rooms.grandDeluxeDesc',
      size: '54 m²', maxGuests: 3, extraBedAvailable: false,
      amenities: ['Single Bed', 'Plush Furnishings', 'Premium Finishes', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1340, bf: 1460 }],
    },
    {
      name: 'Executive Suite 1 Bedroom', folder: 'Executive Suite 1 Bedroom',
      nameKey: 'rooms.execSuite1brName', descKey: 'rooms.execSuiteDesc',
      size: '75 m²', maxGuests: 4, extraBedAvailable: false,
      amenities: ['1 Bedroom', 'Living & Dining Room', 'Kitchen', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: '1 Bedroom', room: 1850, bf: 1970 }, { label: '2 Bedrooms', room: 2100, bf: 2410 }],
    },
    {
      name: 'Premium Suite', folder: 'Premium Suite',
      nameKey: 'rooms.premiumSuiteName', descKey: 'rooms.premiereSuiteDesc',
      size: '73 m²', maxGuests: 3, extraBedAvailable: false,
      amenities: ['1 Bedroom', 'Living & Dining Area', 'Premium Finishes', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: '1 Bedroom', room: 2100, bf: 2220 }],
    },
    {
      name: 'Grand Suite', folder: 'Grand Suite 1 Bedroom',
      nameKey: 'rooms.grandSuiteName', descKey: 'rooms.grandSuiteDesc',
      size: '75 m²', maxGuests: 4, extraBedAvailable: false,
      amenities: ['1 or 2 Bedrooms', 'Full Kitchen', 'Living & Dining Room', 'Onsen Access', 'Smart TV', 'Free Wi-Fi'],
      variants: [{ label: '1 Bedroom', room: 2700, bf: 2820 }, { label: '2 Bedrooms', room: 3000, bf: 3310 }],
    },
  ];

  // The booking page's search results render DISPLAY_ROOMS, not ROOMS
  // directly. Each guestTier: 1 room above (Single) is folded together with
  // its guestTier: 2 sibling (Twin) into ONE display card offering both bed
  // configs as rate-row variants — the same presentation Studio B4/Deluxe/
  // Grand Premium already use for their own Single-vs-Twin/Double choice.
  // ROOMS itself keeps the pair as two separate entries (never merge those
  // — see the comment on 'Studio Single' above: their room-type IDs must
  // stay permanent for the Google Hotel Ads feed), so each merged variant
  // carries its own `roomKey` back to the real underlying room name/
  // inventory/rate-plan; non-tier rooms' variants have no roomKey and just
  // fall back to the card's own room.name (see booking-payment.js's open()).
  // Variant objects themselves are reused by reference (not copied), so a
  // live rate override (applyRateOverrides() below, which mutates ROOMS'
  // variant objects in place) is automatically reflected here too.
  var DISPLAY_ROOMS = (function () {
    var twinOf = {}; // guestTier:1 room name -> its guestTier:2 sibling
    ROOMS.forEach(function (r) {
      if (r.guestTier !== 1) return;
      var base = r.name.replace(/ Single$/, '');
      var twin = ROOMS.filter(function (o) { return o.guestTier === 2 && o.name === base + ' Twin'; })[0];
      if (twin) twinOf[r.name] = twin;
    });
    var out = [];
    ROOMS.forEach(function (r) {
      if (r.guestTier === 2) return; // folded into its Single sibling below
      var twin = twinOf[r.name];
      if (!twin) { out.push(r); return; }
      r.variants[0].roomKey = r.name;
      twin.variants[0].roomKey = twin.name;
      out.push({
        name: r.name,
        folders: [r.folder, twin.folder],
        nameKey: r.baseNameKey,
        descKey: r.descKey,
        size: r.size,
        maxGuests: r.maxGuests,
        extraBedAvailable: r.extraBedAvailable,
        amenities: ['Single or Twin'].concat(r.amenities.slice(1)),
        variants: [r.variants[0], twin.variants[0]],
      });
    });
    return out;
  })();

  // Laundry Package (2026) — pieces : price (THB).
  var LAUNDRY = [
    { pieces: 3, price: 55 }, { pieces: 4, price: 70 }, { pieces: 5, price: 85 },
    { pieces: 6, price: 100 }, { pieces: 7, price: 110 },
    { pieces: 60, price: 900 }, { pieces: 120, price: 1500 },
  ];

  // Day-use rates (2026) — short 3-hour stays, priced per BUILDING (every
  // room in a building shares one flat day-use price), not per room type.
  // `room` matches a real key in backend/lib/roomRates.js's DAYUSE mirror, so
  // a day-use request can be validated/priced authoritatively server-side
  // (see POST /api/v1/payments/dayuse-booking) the same way overnight
  // bookings are — never trust the client's price.
  var DAYUSE = [
    { room: 'B1', nameKey: 'dayuse.b1', price: 800 },
    { room: 'B2', nameKey: 'dayuse.b2', price: 700 },
    { room: 'B3', nameKey: 'dayuse.b3', price: 700 },
    { room: 'B4', nameKey: 'dayuse.b4', price: 800 },
    { room: 'B5', nameKey: 'dayuse.b5', price: 900 },
  ];

  // ============================================================
  //  Internationalisation
  //  The booking page shares the site-wide i18n layer (i18n.js).
  //  Static markup carries data-i18n attributes; the dynamic room
  //  cards, day-use and laundry lists are re-rendered here whenever
  //  the language changes. Room names/sizes/descriptions reuse the
  //  existing rooms.* keys from the main dictionary.
  // ============================================================
  var I = (window.JPark && window.JPark.i18n) || null;
  function TR(key) { return I ? I.t(key) : key; }
  function curLang() { return I ? I.getLang() : 'en'; }

  // Room name/description come straight from each room's i18n keys.
  function roomName(room) { return TR(room.nameKey); }
  function roomDesc(room) { return TR(room.descKey); }

  // Media registry (loaded on this page) + per-photo captions.
  var M = window.JPark && window.JPark.media;
  var CAPS = (window.JPark && window.JPark.captions) || {};
  var enc = window.encodeURI;
  // A merged Single+Twin display room (see DISPLAY_ROOMS below) sets
  // `folders` to BOTH underlying rooms' photo folders, so combining a
  // guestTier pair into one card never hides one side's own photos (Studio's
  // Twin aliases Single's folder with no photos of its own, but Prestige and
  // Premium's Single/Twin are genuinely different rooms with distinct sets).
  // Plain (non-merged) rooms just have the one `folder`, unchanged.
  function roomFolders(room) { return room.folders || [room.folder]; }
  function roomSetIds(room) { return roomFolders(room).map(function (f) { return 'room:' + f; }); }
  function roomCover(room) {
    var ids = roomSetIds(room);
    for (var i = 0; i < ids.length; i++) {
      var c = M ? M.cover(ids[i]) : null;
      if (c) return c;
    }
    return 'images/' + roomFolders(room)[0] + '/room_01.jpg';
  }
  function roomPhotoCount(room) {
    return roomSetIds(room).reduce(function (sum, id) {
      return sum + (M ? M.items(id).filter(function (it) { return !it.video; }).length : 0);
    }, 0);
  }
  // Captioned, swipeable entries for a room: { src, cap:"Room · Area" }.
  function roomGalleryEntries(room) {
    var nm = roomName(room);
    var out = [];
    roomSetIds(room).forEach(function (id) {
      var list = M ? M.items(id) : [];
      var caps = CAPS[id] || [];
      list.filter(function (it) { return !it.video; }).forEach(function (it, i) {
        out.push({ src: it.src, cap: caps[i] ? (nm + ' · ' + TR('cap.' + caps[i])) : nm });
      });
    });
    return out.length ? out : [{ src: roomCover(room), cap: nm }];
  }

  // ---- Immersive, swipeable room gallery (self-contained overlay) ----
  var GAL = (function () {
    var el = null, imgEl, capEl, counterEl, prevBtn, nextBtn, items = [], idx = 0;
    function build() {
      if (el) return;
      el = document.createElement('div');
      el.className = 'rg-overlay';
      el.innerHTML =
        '<button class="rg-close" aria-label="Close">&times;</button>' +
        '<button class="rg-nav rg-prev" aria-label="Previous photo">&#8249;</button>' +
        '<div class="rg-stage"><img alt="" /></div>' +
        '<button class="rg-nav rg-next" aria-label="Next photo">&#8250;</button>' +
        '<div class="rg-cap" aria-live="polite"></div>' +
        '<div class="rg-counter" aria-hidden="true"></div>';
      document.body.appendChild(el);
      imgEl = el.querySelector('img');
      capEl = el.querySelector('.rg-cap');
      counterEl = el.querySelector('.rg-counter');
      prevBtn = el.querySelector('.rg-prev');
      nextBtn = el.querySelector('.rg-next');
      prevBtn.addEventListener('click', function (e) { e.stopPropagation(); go(-1); });
      nextBtn.addEventListener('click', function (e) { e.stopPropagation(); go(1); });
      el.querySelector('.rg-close').addEventListener('click', close);
      el.addEventListener('click', function (e) {
        if (e.target === el || e.target.classList.contains('rg-stage')) close();
      });
      document.addEventListener('keydown', function (e) {
        if (!el.classList.contains('open')) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowRight') go(1);
        else if (e.key === 'ArrowLeft') go(-1);
      });
      var sx = null, sy = null;
      el.addEventListener('touchstart', function (e) {
        sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      }, { passive: true });
      el.addEventListener('touchend', function (e) {
        if (sx == null) return;
        var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
        sx = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
        else if (dy > 70 && Math.abs(dy) > Math.abs(dx)) close();
      }, { passive: true });
    }
    function preload(i) { var it = items[i]; if (it) { var im = new Image(); im.src = enc(it.src); } }
    function show(dir) {
      var it = items[idx];
      imgEl.classList.remove('rg-anim-l', 'rg-anim-r');
      void imgEl.offsetWidth;
      imgEl.src = enc(it.src);
      imgEl.alt = it.cap || '';
      if (dir > 0) imgEl.classList.add('rg-anim-r');
      else if (dir < 0) imgEl.classList.add('rg-anim-l');
      capEl.textContent = it.cap || '';
      capEl.hidden = !it.cap;
      var multi = items.length > 1;
      prevBtn.hidden = nextBtn.hidden = !multi;
      counterEl.hidden = !multi;
      counterEl.textContent = multi ? (idx + 1) + ' / ' + items.length : '';
      preload((idx + 1) % items.length);
      preload((idx - 1 + items.length) % items.length);
    }
    function go(d) { if (items.length < 2) return; idx = (idx + d + items.length) % items.length; show(d); }
    function close() { el.classList.remove('open'); document.body.classList.remove('rg-open'); }
    return {
      open: function (list, start) {
        build();
        items = (list || []).slice();
        if (!items.length) return;
        idx = Math.min(Math.max(start || 0, 0), items.length - 1);
        for (var i = 0; i < Math.min(5, items.length); i++) preload((idx + i) % items.length);
        el.classList.add('open');
        document.body.classList.add('rg-open');
        show(0);
      },
      close: close
    };
  })();

  // English amenity phrase -> translation key
  var AMENITY_KEY = {
    'Single Bed': 'bk.am.singleBed', 'Twin Beds': 'bk.am.twinBeds', '1 Bedroom': 'bk.am.bedroom1',
    'Single or Twin': 'bk.am.singleOrTwin', 'Work Desk': 'bk.am.workDesk',
    'Rainfall Shower': 'bk.am.rainfallShower', 'Smart TV': 'bk.am.smartTv',
    'Air Conditioning': 'bk.am.airCon', 'Free Wi-Fi': 'bk.am.wifi',
    'Full Kitchenette': 'bk.am.fullKitchenette', 'Living Corner': 'bk.am.livingCorner',
    'Single or Double': 'bk.am.singleOrDouble', 'Lounge Seating': 'bk.am.loungeSeating',
    'Sleek Bathroom': 'bk.am.sleekBathroom', 'Plush Furnishings': 'bk.am.plushFurnishings',
    'Premium Finishes': 'bk.am.premiumFinishes', 'Premium Linens': 'bk.am.premiumLinens',
    'Spacious Work Area': 'bk.am.spaciousWorkArea', 'Wide Lounge Area': 'bk.am.wideLoungeArea',
    'Upgraded Amenities': 'bk.am.upgradedAmenities', '1 or 2 Bedrooms': 'bk.am.bedrooms1or2',
    'Living & Dining Area': 'bk.am.livingDiningArea', 'Living & Dining Room': 'bk.am.livingDiningRoom',
    'Kitchen': 'bk.am.kitchen', 'Full Kitchen': 'bk.am.fullKitchen', 'Onsen Access': 'bk.am.onsenAccess',
    'Premium Bedding': 'bk.am.premiumBedding', 'Generous Work Area': 'bk.am.generousWorkArea',
    'Dual-Aspect Views': 'bk.am.dualAspectViews', 'Marble Bathroom': 'bk.am.marbleBathroom',
    'Separate Living Room': 'bk.am.separateLivingRoom',
  };
  function amenityText(a) { var k = AMENITY_KEY[a]; return k ? TR(k) : a; }

  // Variant label -> translation key
  var VARIANT_KEY = {
    'Single': 'bk.var.single', 'Twin': 'bk.var.twin', 'Double': 'bk.var.double',
    '1 Bedroom': 'bk.var.bed1', '2 Bedrooms': 'bk.var.bed2',
  };
  function variantLabel(l) { var k = VARIANT_KEY[l]; return k ? TR(k) : l; }

  var BK_I18N = {
    en: {
      'bk.docTitle': 'Book Your Stay · J Park Hotel · Chonburi',
      'bk.back': '← Back to Hotel',
      'bk.heroEyebrow': 'Reserve Your Stay',
      'bk.heroTitle': 'Find Your Perfect Room',
      'bk.heroLede': 'Our full collection of rooms and suites — from a smart studio to a two-bedroom grand suite.',
      'bk.checkin': 'Check-in', 'bk.checkout': 'Check-out', 'bk.adults': 'Adults', 'bk.children': 'Children',
      'bk.fewerAdults': 'Fewer adults', 'bk.moreAdults': 'More adults',
      'bk.fewerChildren': 'Fewer children', 'bk.moreChildren': 'More children',
      'bk.checkAvail': 'Check Availability', 'bk.changeDates': 'Change dates',
      'bk.hint': 'Select your dates and guests above, then tap Check Availability to filter rooms for your group.',
      'bk.childNote': 'Children under 9 stay free of any extra-guest charge. Breakfast is free for ages 0–4, and ฿100 per child for ages 5–8.',
      'bk.noRooms1': 'No rooms match your current guest count. Please try a smaller group, or ',
      'bk.contactUs': 'contact us',
      'bk.noRooms2': ' — we can arrange connecting rooms for larger parties.',
      'bk.dayuseEyebrow': 'Short stays', 'bk.dayuseTitle': 'Day Use Rates',
      'bk.dayuseLede': 'Need a room for just a few hours? Our day-use rate covers a 3-hour stay — perfect for a midday rest, a refresh between journeys or a quiet, private space to work.',
      'bk.dayuseNote': 'Prices in Thai Baht (THB) per 3-hour day-use session, subject to availability.',
      'bk.dayuseBook': 'Book', 'bk.dayuseBannerText': 'Only need a few hours? Short (day-use) stays are also available.',
      'bk.dayuseBannerLink': 'See day-use rates ↓',
      'bk.dayuse.title': 'Day-use booking', 'bk.dayuse.dateLabel': 'Preferred date',
      'bk.dayuse.timeLabel': 'Preferred time (we will confirm availability)',
      'bk.dayuse.timePlaceholder': 'e.g. 1:00 PM – 4:00 PM',
      'bk.dayuse.submit': 'Send day-use request',
      'bk.dayuse.successTitle': 'Day-use request received — pending confirmation',
      'bk.dayuse.successNote': 'We will confirm your day-use time slot by phone or email. Payment (cash, card, or PromptPay) is collected in person at the front desk once your stay is confirmed.',
      'bk.laundryEyebrow': 'While you stay', 'bk.laundryTitle': 'Laundry Package',
      'bk.laundryLede': 'Fresh, neatly pressed garments delivered to your room. Choose a package by the number of pieces.',
      'bk.laundryNote': 'Prices in Thai Baht (THB) per package. Larger 60- and 120-piece packages are ideal for long stays.',
      'bk.priceNote1': 'Rates shown are our 2026 general rates per room, per night. To confirm a reservation, please ',
      'bk.priceCall1': 'call +66 086 326 0664', 'bk.priceCall2': '+66 038 448 111', 'bk.priceNote2': ' or ',
      'bk.priceEmail': 'email jparkhotel1@gmail.com', 'bk.priceNote3': ' — we are happy to assist.',
      'bk.offlineBanner': "We're having trouble connecting right now — please call us directly to book:",
      'bk.upTo': 'Up to', 'bk.guest': 'guest', 'bk.guests': 'guests',
      'bk.fromTpl': 'From {price} per room / night', 'bk.night': 'night', 'bk.nights': 'nights',
      'bk.roomOnly': 'room only', 'bk.withBreakfast': 'with breakfast',
      'bk.rateIncl': '2026 general rate · taxes & service included', 'bk.enquire': 'Enquire to Book',
      'bk.extraGuestBed': '3rd guest: +{bed} extra bed, +{bf} breakfast if selected. Extra bed placement is subject to the specific room assigned at check-in.',
      'bk.extraGuestNoBed': 'No extra bed available for a 3rd guest, but breakfast can be added for +{bf}',
      'bk.piece': 'piece', 'bk.pieces': 'pieces',
      'bk.gAdult1': 'adult', 'bk.gAdultN': 'adults', 'bk.gChild1': 'child', 'bk.gChildN': 'children',
      'bk.var.single': 'Single', 'bk.var.twin': 'Twin', 'bk.var.double': 'Double',
      'bk.var.bed1': '1 Bedroom', 'bk.var.bed2': '2 Bedrooms',
      'bk.errDates': 'Please select both a check-in and check-out date.',
      'bk.errOrder': 'Check-out must be after check-in.',
      'bk.am.singleOrTwin': 'Single or Twin', 'bk.am.workDesk': 'Work Desk',
      'bk.am.rainfallShower': 'Rainfall Shower', 'bk.am.smartTv': 'Smart TV',
      'bk.am.airCon': 'Air Conditioning', 'bk.am.wifi': 'Free Wi-Fi',
      'bk.am.fullKitchenette': 'Full Kitchenette', 'bk.am.livingCorner': 'Living Corner',
      'bk.am.singleOrDouble': 'Single or Double', 'bk.am.loungeSeating': 'Lounge Seating',
      'bk.am.sleekBathroom': 'Sleek Bathroom', 'bk.am.plushFurnishings': 'Plush Furnishings',
      'bk.am.premiumFinishes': 'Premium Finishes', 'bk.am.premiumLinens': 'Premium Linens',
      'bk.am.spaciousWorkArea': 'Spacious Work Area', 'bk.am.wideLoungeArea': 'Wide Lounge Area',
      'bk.am.upgradedAmenities': 'Upgraded Amenities', 'bk.am.bedrooms1or2': '1 or 2 Bedrooms',
      'bk.am.livingDiningArea': 'Living & Dining Area', 'bk.am.livingDiningRoom': 'Living & Dining Room',
      'bk.am.kitchen': 'Kitchen', 'bk.am.fullKitchen': 'Full Kitchen', 'bk.am.onsenAccess': 'Onsen Access',
      'bk.am.premiumBedding': 'Premium Bedding', 'bk.am.generousWorkArea': 'Generous Work Area',
      'bk.am.dualAspectViews': 'Dual-Aspect Views', 'bk.am.marbleBathroom': 'Marble Bathroom',
      'bk.am.separateLivingRoom': 'Separate Living Room',
    },
    th: {
      'bk.docTitle': 'จองที่พัก · J Park Hotel · ชลบุรี',
      'bk.back': '← กลับสู่หน้าโรงแรม',
      'bk.heroEyebrow': 'สำรองที่พักของคุณ',
      'bk.heroTitle': 'ค้นหาห้องพักที่ใช่สำหรับคุณ',
      'bk.heroLede': 'ห้องพักและห้องสวีทหลากสไตล์ — ตั้งแต่ห้องสตูดิโอกะทัดรัดไปจนถึงแกรนด์สวีทสองห้องนอน',
      'bk.checkin': 'เช็คอิน', 'bk.checkout': 'เช็คเอาท์', 'bk.adults': 'ผู้ใหญ่', 'bk.children': 'เด็ก',
      'bk.fewerAdults': 'ลดจำนวนผู้ใหญ่', 'bk.moreAdults': 'เพิ่มจำนวนผู้ใหญ่',
      'bk.fewerChildren': 'ลดจำนวนเด็ก', 'bk.moreChildren': 'เพิ่มจำนวนเด็ก',
      'bk.checkAvail': 'ตรวจสอบห้องว่าง', 'bk.changeDates': 'เปลี่ยนวันที่',
      'bk.hint': 'เลือกวันที่และจำนวนผู้เข้าพักด้านบน แล้วแตะ ตรวจสอบห้องว่าง เพื่อกรองห้องพักสำหรับกลุ่มของคุณ',
      'bk.childNote': 'เด็กอายุต่ำกว่า 9 ปี ไม่มีค่าใช้จ่ายเพิ่มเติมสำหรับผู้เข้าพัก อาหารเช้าฟรีสำหรับเด็กอายุ 0–4 ปี และ 100 บาทสำหรับเด็กอายุ 5–8 ปี',
      'bk.noRooms1': 'ไม่มีห้องที่ตรงกับจำนวนผู้เข้าพักของคุณ กรุณาลองลดจำนวนผู้เข้าพัก หรือ',
      'bk.contactUs': 'ติดต่อเรา',
      'bk.noRooms2': ' — เราสามารถจัดห้องที่เชื่อมต่อกันสำหรับคณะใหญ่ได้',
      'bk.dayuseEyebrow': 'เข้าพักระยะสั้น', 'bk.dayuseTitle': 'อัตราค่าเข้าพักรายชั่วโมง',
      'bk.dayuseLede': 'ต้องการห้องพักเพียงไม่กี่ชั่วโมง? อัตราเดย์ยูสของเราครอบคลุมการเข้าพัก 3 ชั่วโมง — เหมาะสำหรับพักผ่อนช่วงกลางวัน เติมความสดชื่นระหว่างการเดินทาง หรือพื้นที่ส่วนตัวเงียบสงบสำหรับทำงาน',
      'bk.dayuseNote': 'ราคาเป็นเงินบาท (THB) ต่อการเข้าพักแบบเดย์ยูส 3 ชั่วโมง ขึ้นอยู่กับห้องว่าง',
      'bk.dayuseBook': 'จอง', 'bk.dayuseBannerText': 'ต้องการห้องพักเพียงไม่กี่ชั่วโมง? เรามีบริการเข้าพักระยะสั้น (เดย์ยูส) ด้วย',
      'bk.dayuseBannerLink': 'ดูอัตราเดย์ยูส ↓',
      'bk.dayuse.title': 'จองแบบเดย์ยูส', 'bk.dayuse.dateLabel': 'วันที่ต้องการ',
      'bk.dayuse.timeLabel': 'ช่วงเวลาที่ต้องการ (เราจะยืนยันห้องว่าง)',
      'bk.dayuse.timePlaceholder': 'เช่น 13:00 – 16:00 น.',
      'bk.dayuse.submit': 'ส่งคำขอเดย์ยูส',
      'bk.dayuse.successTitle': 'ได้รับคำขอเดย์ยูสแล้ว — รอการยืนยัน',
      'bk.dayuse.successNote': 'เราจะยืนยันช่วงเวลาเดย์ยูสของท่านทางโทรศัพท์หรืออีเมล ชำระเงิน (เงินสด บัตร หรือพร้อมเพย์) ได้ที่หน้าเคาน์เตอร์เมื่อยืนยันการเข้าพักแล้ว',
      'bk.laundryEyebrow': 'ระหว่างการเข้าพัก', 'bk.laundryTitle': 'แพ็กเกจซักรีด',
      'bk.laundryLede': 'เสื้อผ้าสะอาดรีดเรียบ ส่งถึงห้องพักของคุณ เลือกแพ็กเกจตามจำนวนชิ้น',
      'bk.laundryNote': 'ราคาเป็นเงินบาท (THB) ต่อแพ็กเกจ แพ็กเกจ 60 และ 120 ชิ้นเหมาะสำหรับการเข้าพักระยะยาว',
      'bk.priceNote1': 'ราคาที่แสดงเป็นอัตราทั่วไปปี 2026 ต่อห้อง ต่อคืน หากต้องการยืนยันการจอง กรุณา',
      'bk.priceCall1': 'โทร +66 086 326 0664', 'bk.priceCall2': '+66 038 448 111', 'bk.priceNote2': ' หรือ ',
      'bk.priceEmail': 'อีเมล jparkhotel1@gmail.com', 'bk.priceNote3': ' — เรายินดีให้บริการ',
      'bk.offlineBanner': 'ขณะนี้เรากำลังมีปัญหาในการเชื่อมต่อ กรุณาโทรจองโดยตรงที่:',
      'bk.upTo': 'รองรับสูงสุด', 'bk.guest': 'ท่าน', 'bk.guests': 'ท่าน',
      'bk.fromTpl': 'เริ่มต้น {price} ต่อห้อง / คืน', 'bk.night': 'คืน', 'bk.nights': 'คืน',
      'bk.roomOnly': 'เฉพาะห้องพัก', 'bk.withBreakfast': 'รวมอาหารเช้า',
      'bk.rateIncl': 'อัตราทั่วไปปี 2026 · รวมภาษีและค่าบริการ', 'bk.enquire': 'สอบถามเพื่อจอง',
      'bk.extraGuestBed': 'ผู้เข้าพักคนที่ 3: เตียงเสริม +{bed} และอาหารเช้า +{bf} หากเลือก',
      'bk.extraGuestNoBed': 'ห้องนี้ไม่มีเตียงเสริมสำหรับผู้เข้าพักคนที่ 3 แต่สามารถเพิ่มอาหารเช้าได้ +{bf}',
      'bk.piece': 'ชิ้น', 'bk.pieces': 'ชิ้น',
      'bk.gAdult1': 'ผู้ใหญ่', 'bk.gAdultN': 'ผู้ใหญ่', 'bk.gChild1': 'เด็ก', 'bk.gChildN': 'เด็ก',
      'bk.var.single': 'เตียงเดี่ยว', 'bk.var.twin': 'เตียงคู่แฝด', 'bk.var.double': 'เตียงคู่',
      'bk.var.bed1': '1 ห้องนอน', 'bk.var.bed2': '2 ห้องนอน',
      'bk.errDates': 'กรุณาเลือกทั้งวันเช็คอินและเช็คเอาท์',
      'bk.errOrder': 'วันเช็คเอาท์ต้องอยู่หลังวันเช็คอิน',
      'bk.am.singleOrTwin': 'เตียงเดี่ยวหรือเตียงคู่แฝด', 'bk.am.workDesk': 'โต๊ะทำงาน',
      'bk.am.rainfallShower': 'ฝักบัวเรนชาวเวอร์', 'bk.am.smartTv': 'สมาร์ททีวี',
      'bk.am.airCon': 'เครื่องปรับอากาศ', 'bk.am.wifi': 'Wi-Fi ฟรี',
      'bk.am.fullKitchenette': 'ครัวเล็กครบครัน', 'bk.am.livingCorner': 'มุมนั่งเล่น',
      'bk.am.singleOrDouble': 'เตียงเดี่ยวหรือเตียงคู่', 'bk.am.loungeSeating': 'มุมโซฟานั่งเล่น',
      'bk.am.sleekBathroom': 'ห้องน้ำดีไซน์เรียบหรู', 'bk.am.plushFurnishings': 'เฟอร์นิเจอร์นุ่มหรู',
      'bk.am.premiumFinishes': 'วัสดุระดับพรีเมียม', 'bk.am.premiumLinens': 'ผ้าปูพรีเมียม',
      'bk.am.spaciousWorkArea': 'พื้นที่ทำงานกว้างขวาง', 'bk.am.wideLoungeArea': 'มุมนั่งเล่นกว้าง',
      'bk.am.upgradedAmenities': 'สิ่งอำนวยความสะดวกอัปเกรด', 'bk.am.bedrooms1or2': '1 หรือ 2 ห้องนอน',
      'bk.am.livingDiningArea': 'พื้นที่นั่งเล่นและรับประทานอาหาร', 'bk.am.livingDiningRoom': 'ห้องนั่งเล่นและรับประทานอาหาร',
      'bk.am.kitchen': 'ครัว', 'bk.am.fullKitchen': 'ครัวครบครัน', 'bk.am.onsenAccess': 'เข้าใช้ออนเซ็นได้',
      'bk.am.premiumBedding': 'เครื่องนอนพรีเมียม', 'bk.am.generousWorkArea': 'พื้นที่ทำงานกว้างขวาง',
      'bk.am.dualAspectViews': 'วิวสองด้าน', 'bk.am.marbleBathroom': 'ห้องน้ำหินอ่อน',
      'bk.am.separateLivingRoom': 'ห้องนั่งเล่นแยกส่วน',
    },
    ja: {
      'bk.docTitle': 'ご予約 · J Park Hotel · チョンブリー',
      'bk.back': '← ホテルへ戻る',
      'bk.heroEyebrow': 'ご予約',
      'bk.heroTitle': 'ぴったりの客室を見つける',
      'bk.heroLede': '多彩な客室・スイート — コンパクトなスタジオから2ベッドルームのグランドスイートまで。',
      'bk.checkin': 'チェックイン', 'bk.checkout': 'チェックアウト', 'bk.adults': '大人', 'bk.children': '子供',
      'bk.fewerAdults': '大人を減らす', 'bk.moreAdults': '大人を増やす',
      'bk.fewerChildren': '子供を減らす', 'bk.moreChildren': '子供を増やす',
      'bk.checkAvail': '空室を確認', 'bk.changeDates': '日付を変更',
      'bk.hint': '上で日付と人数を選び、「空室を確認」をタップしてご利用人数に合う客室を絞り込んでください。',
      'bk.childNote': '9歳未満のお子様は追加料金なしでご宿泊いただけます。朝食は0〜4歳無料、5〜8歳は1名につき100THBです。',
      'bk.noRooms1': '現在のご利用人数に合う客室がありません。人数を減らすか、',
      'bk.contactUs': 'お問い合わせ',
      'bk.noRooms2': 'ください — 大人数のお客様にはコネクティングルームをご用意できます。',
      'bk.dayuseEyebrow': '短時間のご利用', 'bk.dayuseTitle': 'デイユース料金',
      'bk.dayuseLede': '数時間だけ客室が必要ですか？デイユース料金は3時間のご利用に対応 — 日中の休息、移動の合間のリフレッシュ、静かなワークスペースに最適です。',
      'bk.dayuseNote': '料金は3時間のデイユース1回あたりのタイバーツ（THB）表示で、空室状況によります。',
      'bk.dayuseBook': '予約', 'bk.dayuseBannerText': '数時間だけご利用ですか？デイユース（短時間利用）もご用意しております。',
      'bk.dayuseBannerLink': 'デイユース料金を見る ↓',
      'bk.dayuse.title': 'デイユースのご予約', 'bk.dayuse.dateLabel': 'ご希望日',
      'bk.dayuse.timeLabel': 'ご希望時間帯（空室状況を確認のうえご連絡します）',
      'bk.dayuse.timePlaceholder': '例：13:00〜16:00',
      'bk.dayuse.submit': 'デイユースのリクエストを送信',
      'bk.dayuse.successTitle': 'デイユースのリクエストを受け付けました — 確認待ち',
      'bk.dayuse.successNote': 'デイユースのお時間はお電話またはメールにて確認いたします。ご滞在が確定した後、現金・カード・プロンプトペイのいずれかでフロントにてお支払いいただけます。',
      'bk.laundryEyebrow': 'ご滞在中に', 'bk.laundryTitle': 'ランドリーパッケージ',
      'bk.laundryLede': '清潔にプレスした衣類をお部屋までお届けします。点数に応じてパッケージをお選びください。',
      'bk.laundryNote': '料金は1パッケージあたりのタイバーツ（THB）表示です。60点・120点の大型パッケージは長期滞在に最適です。',
      'bk.priceNote1': '表示料金は2026年の一般料金（1室1泊あたり）です。ご予約の確定は、',
      'bk.priceCall1': 'お電話 +66 086 326 0664', 'bk.priceCall2': '+66 038 448 111', 'bk.priceNote2': ' または ',
      'bk.priceEmail': 'メール jparkhotel1@gmail.com', 'bk.priceNote3': ' までお気軽にどうぞ。',
      'bk.offlineBanner': 'ただいま接続に問題が発生しております。お電話にて直接ご予約ください：',
      'bk.upTo': '最大', 'bk.guest': '名', 'bk.guests': '名',
      'bk.fromTpl': '{price}〜 / 1室1泊', 'bk.night': '泊', 'bk.nights': '泊',
      'bk.roomOnly': '室料のみ', 'bk.withBreakfast': '朝食付き',
      'bk.rateIncl': '2026年一般料金 · 税・サービス料込み', 'bk.enquire': '予約を問い合わせる',
      'bk.extraGuestBed': '3人目のご宿泊者: エキストラベッド +{bed}、朝食を選択の場合は +{bf}',
      'bk.extraGuestNoBed': 'この客室は3人目用のエキストラベッドはご用意できませんが、朝食は +{bf} で追加可能です',
      'bk.piece': '点', 'bk.pieces': '点',
      'bk.gAdult1': '大人', 'bk.gAdultN': '大人', 'bk.gChild1': '子供', 'bk.gChildN': '子供',
      'bk.var.single': 'シングル', 'bk.var.twin': 'ツイン', 'bk.var.double': 'ダブル',
      'bk.var.bed1': '1ベッドルーム', 'bk.var.bed2': '2ベッドルーム',
      'bk.errDates': 'チェックインとチェックアウトの日付を両方選択してください。',
      'bk.errOrder': 'チェックアウトはチェックインより後の日付にしてください。',
      'bk.am.singleOrTwin': 'シングル／ツイン', 'bk.am.workDesk': 'ワークデスク',
      'bk.am.rainfallShower': 'レインシャワー', 'bk.am.smartTv': 'スマートTV',
      'bk.am.airCon': 'エアコン', 'bk.am.wifi': '無料Wi-Fi',
      'bk.am.fullKitchenette': 'ミニキッチン完備', 'bk.am.livingCorner': 'リビングコーナー',
      'bk.am.singleOrDouble': 'シングル／ダブル', 'bk.am.loungeSeating': 'ラウンジソファ',
      'bk.am.sleekBathroom': '洗練されたバスルーム', 'bk.am.plushFurnishings': '上質な家具',
      'bk.am.premiumFinishes': 'プレミアムな設え', 'bk.am.premiumLinens': '上質なリネン',
      'bk.am.spaciousWorkArea': '広々ワークエリア', 'bk.am.wideLoungeArea': '広いラウンジエリア',
      'bk.am.upgradedAmenities': '充実のアメニティ', 'bk.am.bedrooms1or2': '1〜2ベッドルーム',
      'bk.am.livingDiningArea': 'リビング・ダイニング', 'bk.am.livingDiningRoom': 'リビング・ダイニングルーム',
      'bk.am.kitchen': 'キッチン', 'bk.am.fullKitchen': 'フルキッチン', 'bk.am.onsenAccess': '温泉利用可',
      'bk.am.premiumBedding': '上質な寝具', 'bk.am.generousWorkArea': '広々ワークエリア',
      'bk.am.dualAspectViews': '二面の眺望', 'bk.am.marbleBathroom': '大理石バスルーム',
      'bk.am.separateLivingRoom': '独立したリビングルーム',
    },
    'zh-Hans': {
      'bk.docTitle': '预订住宿 · J Park Hotel · 春武里',
      'bk.back': '← 返回酒店',
      'bk.heroEyebrow': '预订您的住宿',
      'bk.heroTitle': '找到您的理想客房',
      'bk.heroLede': '多种客房与套房风格——从精巧开间到两卧豪华套房。',
      'bk.checkin': '入住', 'bk.checkout': '退房', 'bk.adults': '成人', 'bk.children': '儿童',
      'bk.fewerAdults': '减少成人', 'bk.moreAdults': '增加成人',
      'bk.fewerChildren': '减少儿童', 'bk.moreChildren': '增加儿童',
      'bk.checkAvail': '查询空房', 'bk.changeDates': '更改日期',
      'bk.hint': '在上方选择日期和入住人数，然后点击 查询空房 以筛选适合您团队的客房。',
      'bk.childNote': '9岁以下儿童入住不收取额外费用。早餐：0-4岁儿童免费，5-8岁儿童每位100泰铢。',
      'bk.noRooms1': '没有符合当前入住人数的客房。请尝试减少人数，或',
      'bk.contactUs': '联系我们',
      'bk.noRooms2': ' — 我们可为大型团队安排连通客房。',
      'bk.dayuseEyebrow': '短时入住', 'bk.dayuseTitle': '钟点房价格',
      'bk.dayuseLede': '只需几个小时的客房？我们的钟点房价格涵盖 3 小时入住——非常适合午间小憩、旅途中的放松，或安静私密的办公空间。',
      'bk.dayuseNote': '价格以泰铢（THB）计，每次 3 小时钟点房，视空房情况而定。',
      'bk.dayuseBook': '预订', 'bk.dayuseBannerText': '只需几个小时？我们也提供钟点房（短时）住宿。',
      'bk.dayuseBannerLink': '查看钟点房价格 ↓',
      'bk.dayuse.title': '预订钟点房', 'bk.dayuse.dateLabel': '希望日期',
      'bk.dayuse.timeLabel': '希望时间段（我们将确认空房情况）',
      'bk.dayuse.timePlaceholder': '例如 13:00–16:00',
      'bk.dayuse.submit': '发送钟点房请求',
      'bk.dayuse.successTitle': '已收到钟点房请求 — 待确认',
      'bk.dayuse.successNote': '我们将通过电话或邮件确认您的钟点房时段。行程确认后，您可在前台以现金、银行卡或PromptPay支付。',
      'bk.laundryEyebrow': '入住期间', 'bk.laundryTitle': '洗衣套餐',
      'bk.laundryLede': '清新熨烫平整的衣物送至您的房间。按件数选择套餐。',
      'bk.laundryNote': '价格以泰铢（THB）计，每套餐计。60 件和 120 件的大套餐非常适合长期入住。',
      'bk.priceNote1': '所示价格为我们 2026 年每间每晚的一般房价。如需确认预订，请',
      'bk.priceCall1': '致电 +66 086 326 0664', 'bk.priceCall2': '+66 038 448 111', 'bk.priceNote2': ' 或 ',
      'bk.priceEmail': '发送邮件至 jparkhotel1@gmail.com', 'bk.priceNote3': ' — 我们很乐意为您服务。',
      'bk.offlineBanner': '目前连接出现问题，请直接致电预订：',
      'bk.upTo': '最多', 'bk.guest': '位', 'bk.guests': '位',
      'bk.fromTpl': '{price} 起 / 每间每晚', 'bk.night': '晚', 'bk.nights': '晚',
      'bk.roomOnly': '仅房费', 'bk.withBreakfast': '含早餐',
      'bk.rateIncl': '2026 年一般房价 · 含税及服务费', 'bk.enquire': '咨询预订',
      'bk.extraGuestBed': '第3位客人：加床 +{bed}，如选早餐则 +{bf}',
      'bk.extraGuestNoBed': '此房型无法为第3位客人加床，但可加购早餐 +{bf}',
      'bk.piece': '件', 'bk.pieces': '件',
      'bk.gAdult1': '成人', 'bk.gAdultN': '成人', 'bk.gChild1': '儿童', 'bk.gChildN': '儿童',
      'bk.var.single': '单人床', 'bk.var.twin': '双床', 'bk.var.double': '大床',
      'bk.var.bed1': '1 卧室', 'bk.var.bed2': '2 卧室',
      'bk.errDates': '请同时选择入住和退房日期。',
      'bk.errOrder': '退房日期必须晚于入住日期。',
      'bk.am.singleOrTwin': '单人床或双床', 'bk.am.workDesk': '办公书桌',
      'bk.am.rainfallShower': '雨林花洒', 'bk.am.smartTv': '智能电视',
      'bk.am.airCon': '空调', 'bk.am.wifi': '免费 Wi-Fi',
      'bk.am.fullKitchenette': '齐全小厨房', 'bk.am.livingCorner': '起居一隅',
      'bk.am.singleOrDouble': '单人床或大床', 'bk.am.loungeSeating': '休闲座椅',
      'bk.am.sleekBathroom': '雅致浴室', 'bk.am.plushFurnishings': '精致家具',
      'bk.am.premiumFinishes': '高级装饰', 'bk.am.premiumLinens': '高级床品',
      'bk.am.spaciousWorkArea': '宽敞办公区', 'bk.am.wideLoungeArea': '宽阔休憩区',
      'bk.am.upgradedAmenities': '升级设施', 'bk.am.bedrooms1or2': '1 或 2 间卧室',
      'bk.am.livingDiningArea': '起居与用餐区', 'bk.am.livingDiningRoom': '起居与用餐室',
      'bk.am.kitchen': '厨房', 'bk.am.fullKitchen': '全套厨房', 'bk.am.onsenAccess': '温泉使用',
      'bk.am.premiumBedding': '高级寝具', 'bk.am.generousWorkArea': '宽敞办公区',
      'bk.am.dualAspectViews': '双面景观', 'bk.am.marbleBathroom': '大理石浴室',
      'bk.am.separateLivingRoom': '独立起居室',
    },
    'zh-Hant': {
      'bk.docTitle': '預訂住宿 · J Park Hotel · 春武里',
      'bk.back': '← 返回酒店',
      'bk.heroEyebrow': '預訂您的住宿',
      'bk.heroTitle': '找到您的理想客房',
      'bk.heroLede': '多種客房與套房風格——從精巧開間到兩臥豪華套房。',
      'bk.checkin': '入住', 'bk.checkout': '退房', 'bk.adults': '成人', 'bk.children': '兒童',
      'bk.fewerAdults': '減少成人', 'bk.moreAdults': '增加成人',
      'bk.fewerChildren': '減少兒童', 'bk.moreChildren': '增加兒童',
      'bk.checkAvail': '查詢空房', 'bk.changeDates': '更改日期',
      'bk.hint': '在上方選擇日期和入住人數，然後點按 查詢空房 以篩選適合您團隊的客房。',
      'bk.childNote': '9歲以下兒童入住不收取額外費用。早餐：0-4歲兒童免費，5-8歲兒童每位100泰銖。',
      'bk.noRooms1': '沒有符合目前入住人數的客房。請嘗試減少人數，或',
      'bk.contactUs': '聯絡我們',
      'bk.noRooms2': ' — 我們可為大型團隊安排連通客房。',
      'bk.dayuseEyebrow': '短時入住', 'bk.dayuseTitle': '鐘點房價格',
      'bk.dayuseLede': '只需幾個小時的客房？我們的鐘點房價格涵蓋 3 小時入住——非常適合午間小憩、旅途中的放鬆，或安靜私密的辦公空間。',
      'bk.dayuseNote': '價格以泰銖（THB）計，每次 3 小時鐘點房，視空房情況而定。',
      'bk.dayuseBook': '預訂', 'bk.dayuseBannerText': '只需幾個小時？我們也提供鐘點房（短時）住宿。',
      'bk.dayuseBannerLink': '查看鐘點房價格 ↓',
      'bk.dayuse.title': '預訂鐘點房', 'bk.dayuse.dateLabel': '希望日期',
      'bk.dayuse.timeLabel': '希望時段（我們將確認空房情況）',
      'bk.dayuse.timePlaceholder': '例如 13:00–16:00',
      'bk.dayuse.submit': '傳送鐘點房請求',
      'bk.dayuse.successTitle': '已收到鐘點房請求 — 待確認',
      'bk.dayuse.successNote': '我們將透過電話或郵件確認您的鐘點房時段。行程確認後，您可在前台以現金、銀行卡或PromptPay支付。',
      'bk.laundryEyebrow': '入住期間', 'bk.laundryTitle': '洗衣套餐',
      'bk.laundryLede': '清新熨燙平整的衣物送至您的房間。按件數選擇套餐。',
      'bk.laundryNote': '價格以泰銖（THB）計，每套餐計。60 件和 120 件的大套餐非常適合長期入住。',
      'bk.priceNote1': '所示價格為我們 2026 年每間每晚的一般房價。如需確認預訂，請',
      'bk.priceCall1': '致電 +66 086 326 0664', 'bk.priceCall2': '+66 038 448 111', 'bk.priceNote2': ' 或 ',
      'bk.priceEmail': '發送郵件至 jparkhotel1@gmail.com', 'bk.priceNote3': ' — 我們很樂意為您服務。',
      'bk.offlineBanner': '目前連線出現問題，請直接致電預訂：',
      'bk.upTo': '最多', 'bk.guest': '位', 'bk.guests': '位',
      'bk.fromTpl': '{price} 起 / 每間每晚', 'bk.night': '晚', 'bk.nights': '晚',
      'bk.roomOnly': '僅房費', 'bk.withBreakfast': '含早餐',
      'bk.rateIncl': '2026 年一般房價 · 含稅及服務費', 'bk.enquire': '諮詢預訂',
      'bk.extraGuestBed': '第3位客人：加床 +{bed}，如選早餐則 +{bf}',
      'bk.extraGuestNoBed': '此房型無法為第3位客人加床，但可加購早餐 +{bf}',
      'bk.piece': '件', 'bk.pieces': '件',
      'bk.gAdult1': '成人', 'bk.gAdultN': '成人', 'bk.gChild1': '兒童', 'bk.gChildN': '兒童',
      'bk.var.single': '單人床', 'bk.var.twin': '雙床', 'bk.var.double': '大床',
      'bk.var.bed1': '1 臥室', 'bk.var.bed2': '2 臥室',
      'bk.errDates': '請同時選擇入住和退房日期。',
      'bk.errOrder': '退房日期必須晚於入住日期。',
      'bk.am.singleOrTwin': '單人床或雙床', 'bk.am.workDesk': '辦公書桌',
      'bk.am.rainfallShower': '雨林花灑', 'bk.am.smartTv': '智慧電視',
      'bk.am.airCon': '空調', 'bk.am.wifi': '免費 Wi-Fi',
      'bk.am.fullKitchenette': '齊全小廚房', 'bk.am.livingCorner': '起居一隅',
      'bk.am.singleOrDouble': '單人床或大床', 'bk.am.loungeSeating': '休閒座椅',
      'bk.am.sleekBathroom': '雅致浴室', 'bk.am.plushFurnishings': '精緻家具',
      'bk.am.premiumFinishes': '高級裝飾', 'bk.am.premiumLinens': '高級床品',
      'bk.am.spaciousWorkArea': '寬敞辦公區', 'bk.am.wideLoungeArea': '寬闊休憩區',
      'bk.am.upgradedAmenities': '升級設施', 'bk.am.bedrooms1or2': '1 或 2 間臥室',
      'bk.am.livingDiningArea': '起居與用餐區', 'bk.am.livingDiningRoom': '起居與用餐室',
      'bk.am.kitchen': '廚房', 'bk.am.fullKitchen': '全套廚房', 'bk.am.onsenAccess': '溫泉使用',
      'bk.am.premiumBedding': '高級寢具', 'bk.am.generousWorkArea': '寬敞辦公區',
      'bk.am.dualAspectViews': '雙面景觀', 'bk.am.marbleBathroom': '大理石浴室',
      'bk.am.separateLivingRoom': '獨立起居室',
    },
  };
  if (I) I.registerI18n(BK_I18N);

  // Booking-flow strings used directly by this file's room cards. The larger
  // guest-details/payment-modal vocabulary is registered by
  // assets/js/booking-payment.js instead, keeping each file responsible for
  // its own copy — both merge into the same shared i18n dictionary.
  var BK_PAY_I18N = {
    en:      { 'bk.pay.bookNow': 'Book Now', 'bk.pay.preferCall': 'Prefer to call?', 'bk.pay.soldOut': 'Sold out for these dates' },
    th:      { 'bk.pay.bookNow': 'จองเลย', 'bk.pay.preferCall': 'ต้องการโทรจองหรือไม่?', 'bk.pay.soldOut': 'เต็มสำหรับวันที่เลือก' },
    ja:      { 'bk.pay.bookNow': '今すぐ予約', 'bk.pay.preferCall': 'お電話でのご予約をご希望ですか？', 'bk.pay.soldOut': 'この日程は満室です' },
    'zh-Hans': { 'bk.pay.bookNow': '立即预订', 'bk.pay.preferCall': '想电话预订？', 'bk.pay.soldOut': '所选日期已订满' },
    'zh-Hant': { 'bk.pay.bookNow': '立即預訂', 'bk.pay.preferCall': '想電話預訂？', 'bk.pay.soldOut': '所選日期已訂滿' },
  };
  if (I) I.registerI18n(BK_PAY_I18N);

  // --- DOM ---
  var checkinEl     = document.getElementById('bkCheckin');
  var checkoutEl    = document.getElementById('bkCheckout');
  var adultsValEl   = document.getElementById('adultsVal');
  var childrenValEl = document.getElementById('childrenVal');
  var searchBtn     = document.getElementById('bkSearchBtn');
  var errorEl       = document.getElementById('bkError');
  var statusEl      = document.getElementById('bkStatus');
  var statusTextEl  = document.getElementById('bkStatusText');
  var clearBtn      = document.getElementById('bkClearBtn');
  var hintEl        = document.getElementById('bkHint');
  var gridEl        = document.getElementById('bkRoomsGrid');
  var noRoomsEl     = document.getElementById('bkNoRooms');
  var noRoomsTextEl = document.getElementById('bkNoRoomsText');
  var priceNoteEl   = document.getElementById('bkPriceNoteText');

  var adults   = 2;
  var children = 0;

  // Last rendered room set + nights, so we can repaint on language change.
  var lastRooms  = DISPLAY_ROOMS;
  var lastNights = null;

  // --- Date helpers ---
  function todayISO() {
    var d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function shiftDate(iso, days) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function nightCount(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  function fmtDate(iso) {
    return window.JPark.util.formatDate(iso);
  }

  // Non-breaking space keeps a number and its word on the same line.
  var NB = ' ';
  // Count + translated word, choosing the singular/plural form by count.
  function countWord(n, singleKey, pluralKey) {
    return n + NB + TR(n === 1 ? singleKey : pluralKey);
  }
  function nightsWord(n) { return countWord(n, 'bk.night', 'bk.nights'); }
  function guestsWord(n) { return countWord(n, 'bk.guest', 'bk.guests'); }

  // --- Init date constraints ---
  var todayStr = todayISO();
  checkinEl.min  = todayStr;
  checkoutEl.min = shiftDate(todayStr, 1);

  // Make the whole date field open the calendar on desktop (not just the tiny
  // picker icon). showPicker() works on click and keyboard activation.
  function openPicker(inp) {
    if (typeof inp.showPicker === 'function') {
      try { inp.showPicker(); } catch (e) { /* needs gesture / unsupported */ }
    }
  }
  [checkinEl, checkoutEl].forEach(function (inp) {
    inp.addEventListener('click', function () { openPicker(inp); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openPicker(inp);
      }
    });
  });

  checkinEl.addEventListener('change', function () {
    var ci = checkinEl.value;
    if (!ci) return;
    var minCo = shiftDate(ci, 1);
    checkoutEl.min = minCo;
    if (checkoutEl.value && checkoutEl.value <= ci) {
      checkoutEl.value = minCo;
    }
  });

  // --- Steppers ---
  function wire(downId, upId, displayEl, getVal, setVal, min, max) {
    document.getElementById(downId).addEventListener('click', function () {
      var v = getVal();
      if (v > min) setVal(v - 1);
    });
    document.getElementById(upId).addEventListener('click', function () {
      var v = getVal();
      if (v < max) setVal(v + 1);
    });
  }

  wire('adultsDown', 'adultsUp', adultsValEl,
    function () { return adults; },
    function (v) { adults = v; adultsValEl.textContent = v; syncGuestsToStatusState(); },
    1, 8
  );
  wire('childrenDown', 'childrenUp', childrenValEl,
    function () { return children; },
    function (v) { children = v; childrenValEl.textContent = v; syncGuestsToStatusState(); },
    0, 6
  );

  function baht(n) {
    return '฿' + n.toLocaleString('en-US');
  }

  // --- Build a room card ---
  function buildCard(room, nights) {
    var article = document.createElement('article');
    article.className = 'rr-card';
    article.dataset.room = room.name;

    var amenityHTML = room.amenities
      .map(function (a) { return '<li>' + amenityText(a) + '</li>'; })
      .join('');

    var nightNote = nights ? ' · ' + nightsWord(nights) : '';

    var fromRoom = Math.min.apply(null, room.variants.map(function (v) { return v.room; }));
    var occTier = isOccupancyTier(room);
    var totalGuestsNow = adults + children;
    var ratesHTML = room.variants.map(function (v) {
      var bfShown = occTier ? occupancyBreakfastPrice(room, totalGuestsNow) : v.bf;
      return '<div class="rr-rate">' +
               '<span class="rr-rate-label">' + variantLabel(v.label) + '</span>' +
               '<span class="rr-rate-val">' +
                 '<strong>' + baht(v.room) + '</strong> ' + TR('bk.roomOnly') +
                 ' · ' + baht(bfShown) + ' ' + TR('bk.withBreakfast') +
               '</span>' +
             '</div>';
    }).join('');

    var priceLabel = TR('bk.fromTpl').replace('{price}',
      '<strong class="rr-price-from">' + baht(fromRoom) + '</strong>') + nightNote;

    var extraGuestNote = room.maxGuests > 2
      ? '<p class="rr-extra-guest-note">' +
          (room.extraBedAvailable
            ? TR('bk.extraGuestBed').replace('{bed}', baht(SURCHARGES.extraBed)).replace('{bf}', baht(SURCHARGES.extraBreakfastGuest))
            : TR('bk.extraGuestNoBed').replace('{bf}', baht(SURCHARGES.extraBreakfastGuest))) +
        '</p>'
      : '';

    var name = roomName(room);
    var photoCount = roomPhotoCount(room);
    var photoBadge = photoCount > 1
      ? '<span class="rr-photos" aria-hidden="true">&#128247; ' + photoCount + '</span>' +
        '<span class="rr-view">' + TR('bk.viewGallery') + '</span>'
      : '';

    article.innerHTML =
      '<div class="rr-img" role="button" tabindex="0" aria-label="' + name + ' — ' + TR('bk.viewGallery') + '">' +
        '<img src="' + enc(roomCover(room)) + '" alt="' + name + '" loading="lazy" />' +
        photoBadge +
        '<div class="rr-badges">' +
          '<span class="rr-badge">' + room.size + '</span>' +
          '<span class="rr-badge gold">' + TR('bk.upTo') + ' ' + guestsWord(room.maxGuests) + '</span>' +
        '</div>' +
        '<span class="rr-soldout-badge" hidden>' + TR('bk.pay.soldOut') + '</span>' +
      '</div>' +
      '<div class="rr-body">' +
        '<h2 class="rr-name">' + name + '</h2>' +
        '<p class="rr-desc">' + roomDesc(room) + '</p>' +
        '<ul class="rr-amenities">' + amenityHTML + '</ul>' +
        '<div class="rr-price-block">' +
          '<p class="rr-price-label">' + priceLabel + '</p>' +
          '<div class="rr-rates">' + ratesHTML + '</div>' +
          extraGuestNote +
        '</div>' +
        '<div class="rr-price-row">' +
          '<span class="rr-price-note">' + TR('bk.rateIncl') + '</span>' +
          '<div class="rr-cta-group">' +
            '<button type="button" class="btn btn-solid rr-book-btn">' + TR('bk.pay.bookNow') + '</button>' +
            '<a href="tel:+66863260664" class="rr-call-link">' + TR('bk.pay.preferCall') + '</a>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Tap the photo to open the immersive, swipeable room gallery.
    var imgWrap = article.querySelector('.rr-img');
    function openGal() { GAL.open(roomGalleryEntries(room), 0); }
    imgWrap.addEventListener('click', openGal);
    imgWrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGal(); }
    });

    // "Book Now" hands off to the payment flow (assets/js/booking-payment.js),
    // which is loaded after this file — looked up at click time, not here, so
    // load order between the two files doesn't matter.
    var bookBtn = article.querySelector('.rr-book-btn');
    bookBtn.addEventListener('click', function () {
      if (!statusState) {
        errorEl.textContent = TR('bk.errDates');
        errorEl.hidden = false;
        checkinEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        checkinEl.focus();
        return;
      }
      var flow = window.JPark && window.JPark.bookingFlow;
      if (!flow) return;
      flow.open({
        room: room.name,
        roomDisplayName: name,
        size: room.size,
        maxGuests: room.maxGuests,
        extraBedAvailable: room.extraBedAvailable,
        variants: room.variants,
        checkIn: statusState.ci,
        checkOut: statusState.co,
        nights: statusState.nights,
        adults: statusState.adults,
        children: statusState.children,
      });
    });

    return article;
  }

  // --- Render rooms ---
  function renderRooms(rooms, nights) {
    lastRooms  = rooms;
    lastNights = nights;
    gridEl.innerHTML = '';
    if (rooms.length === 0) {
      gridEl.hidden  = true;
      renderNoRooms();
      noRoomsEl.hidden = false;
      return;
    }
    noRoomsEl.hidden = true;
    rooms.forEach(function (r) {
      gridEl.appendChild(buildCard(r, nights));
    });
    gridEl.hidden = false;
  }

  // Rich text (with a "contact us" link) for the no-match message.
  function renderNoRooms() {
    if (!noRoomsTextEl) return;
    noRoomsTextEl.innerHTML =
      TR('bk.noRooms1') +
      '<a href="index.html#contact">' + TR('bk.contactUs') + '</a>' +
      TR('bk.noRooms2');
  }

  // Rich text (with tel/mailto links) for the footer pricing note.
  function renderPriceNote() {
    if (!priceNoteEl) return;
    priceNoteEl.innerHTML =
      TR('bk.priceNote1') +
      '<a href="tel:+66863260664">' + TR('bk.priceCall1') + '</a>' +
      ' / ' +
      '<a href="tel:+6638448111">' + TR('bk.priceCall2') + '</a>' +
      TR('bk.priceNote2') +
      '<a href="mailto:jparkhotel1@gmail.com">' + TR('bk.priceEmail') + '</a>' +
      TR('bk.priceNote3');
  }

  // --- Render the laundry package price list ---
  function renderLaundry() {
    var host = document.getElementById('bkLaundryGrid');
    if (!host) return;
    var laundryIcon = '<span class="bk-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5 12 5.5 16 3.5 19.5 8 16.5 10 16.5 20.5 7.5 20.5 7.5 10 4.5 8Z"/></svg></span>';
    host.innerHTML = LAUNDRY.map(function (l) {
      return '<div class="bk-laundry-item">' +
               laundryIcon +
               '<span class="bk-laundry-pcs">' + countWord(l.pieces, 'bk.piece', 'bk.pieces') + '</span>' +
               '<span class="bk-laundry-price">' + baht(l.price) + '</span>' +
             '</div>';
    }).join('');
  }

  // --- Render the day-use (3-hour) rate list ---
  function renderDayUse() {
    var host = document.getElementById('bkDayUseGrid');
    if (!host) return;
    var dayuseIcon = '<span class="bk-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg></span>';
    host.innerHTML = DAYUSE.map(function (d, i) {
      return '<div class="bk-dayuse-item">' +
               dayuseIcon +
               '<span class="bk-dayuse-room">' + TR(d.nameKey) + '</span>' +
               '<span class="bk-dayuse-price">' + baht(d.price) + '</span>' +
               '<button type="button" class="btn btn-solid bk-dayuse-book-btn" data-dayuse-index="' + i + '">' + TR('bk.dayuseBook') + '</button>' +
             '</div>';
    }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('.bk-dayuse-book-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var d = DAYUSE[parseInt(btn.dataset.dayuseIndex, 10)];
        var flow = window.JPark && window.JPark.bookingFlow;
        if (!flow || !flow.openDayUse) return;
        flow.openDayUse({ room: d.room, roomDisplayName: TR(d.nameKey), price: d.price });
      });
    });
  }

  // Two flat, room-wide surcharges (THB/night) added on top of a variant's
  // room/bf rate based on guest count beyond the base 2 a variant already
  // covers — mirrors backend/lib/roomRates.js's DEFAULT_SURCHARGES exactly,
  // live-overridden below by the same GET /api/rates fetch that overrides
  // room prices. Exposed via window.JPark.pricing so booking-payment.js
  // computes the exact same display total the server will charge, without
  // duplicating the formula.
  //
  // Must be defined before the initial renderAll() call below: buildCard()
  // (called via renderRooms -> renderAll) reads SURCHARGES.extraBed for any
  // room with maxGuests > 2 — nearly every room in ROOMS — so if this ran
  // after that first paint, it threw ReferenceError/TypeError on page load,
  // which aborted the rest of this script's top-level execution before it
  // ever reached the searchBtn/bookBtn click-handler registrations further
  // down. That silently broke the entire booking flow (Check Availability
  // and Book Now both appeared to do nothing) on every single page load.
  var SURCHARGES = { extraBed: 500, extraBreakfastGuest: 190 };

  function computeGuestSurcharge(room, totalGuests, breakfast) {
    var extraGuests = Math.max(0, (Number(totalGuests) || 0) - 2);
    if (extraGuests <= 0) return 0;
    var total = 0;
    if (breakfast) total += extraGuests * SURCHARGES.extraBreakfastGuest;
    if (room.extraBedAvailable) total += extraGuests * SURCHARGES.extraBed;
    return total;
  }

  // A room whose variants all share the same room-only rate isn't really
  // offering differently priced products — each variant is the SAME
  // physical room, and the label (Single/Twin/Double) is just a bed-style
  // preference. Per the 2026 rate card, room-only price is flat regardless
  // of guest count for these rooms — only the "with breakfast" price
  // differs, by a flat SURCHARGES.extraBreakfastGuest (190 THB) between the
  // 1- and 2-guest row. This does NOT require a second variant to exist: a
  // single-variant room trivially satisfies "every variant shares the same
  // room-only rate" (comparing variants[0] to itself) and must still get
  // guest-count-aware breakfast pricing — variants[0].bf is always the
  // 1-guest rate; the 2-guest rate is derived (base + 190), never read off
  // a second variant that may or may not exist. A prior `length >= 2` guard
  // here silently broke Deluxe/Grand Premium/Grand Deluxe/Premium Suite's
  // breakfast pricing after their fictional 2nd bed-style variant (they're
  // single-bed-only rooms) was removed in commit 331eb07 — that variant's
  // `.bf` had been the only place the 2-guest rate was stored. Guests
  // beyond 2 add the normal computeGuestSurcharge() on top of whichever
  // base this returns.
  function isOccupancyTier(room) {
    return room.variants.every(function (v) { return v.room === room.variants[0].room; });
  }
  function occupancyBreakfastPrice(room, totalGuests) {
    return (Number(totalGuests) || 0) <= 1
      ? room.variants[0].bf
      : room.variants[0].bf + SURCHARGES.extraBreakfastGuest;
  }

  window.JPark = window.JPark || {};
  window.JPark.pricing = {
    computeGuestSurcharge: computeGuestSurcharge,
    isOccupancyTier: isOccupancyTier,
    occupancyBreakfastPrice: occupancyBreakfastPrice,
    getSurcharges: function () { return SURCHARGES; },
  };

  // Paint everything in the current language (initial load + on switch).
  function renderAll() {
    renderRooms(lastRooms, lastNights);
    renderLaundry();
    renderDayUse();
    renderPriceNote();
    refreshStatus();
    if (I) document.title = TR('bk.docTitle');
  }

  // Re-render dynamic content whenever the language changes.
  document.addEventListener('jpark:langchange', renderAll);

  // Initial paint
  renderAll();

  // Merge live admin rate overrides (backend/routes/rates.js, edited via the
  // Site Editor's Rates tab) into the static ROOMS mirror. Mutates variant
  // objects in place so booking-payment.js's state (captured from these same
  // objects at "Book Now" click time) automatically reflects the merge too.
  // Purely a display convenience — the real charge is always recomputed
  // server-side from the same source (backend/lib/rateOverrides.js),
  // independent of what this fetch returns.
  function applyRateOverrides(rooms) {
    if (!rooms || typeof rooms !== 'object') return;
    ROOMS.forEach(function (room) {
      var effective = rooms[room.name];
      if (!effective || !effective.variants) return;
      room.variants.forEach(function (v) {
        var ov = effective.variants.filter(function (ev) { return ev.label === v.label; })[0];
        if (!ov) return;
        if (typeof ov.room === 'number' && isFinite(ov.room) && ov.room > 0 && ov.room <= 100000) v.room = ov.room;
        if (typeof ov.bf === 'number' && isFinite(ov.bf) && ov.bf > 0 && ov.bf <= 100000) v.bf = ov.bf;
      });
    });
  }

  function applySurcharges(surcharges) {
    if (!surcharges || typeof surcharges !== 'object') return;
    ['extraBed', 'extraBreakfastGuest'].forEach(function (key) {
      var val = surcharges[key];
      if (typeof val === 'number' && isFinite(val) && val > 0 && val <= 100000) SURCHARGES[key] = val;
    });
  }

  // Same live-override merge as applyRateOverrides(), but for the flat
  // DAYUSE array (room -> single price, no room/breakfast variants).
  function applyDayUseOverrides(dayUse) {
    if (!dayUse || typeof dayUse !== 'object') return;
    DAYUSE.forEach(function (d) {
      var val = dayUse[d.room];
      if (typeof val === 'number' && isFinite(val) && val > 0 && val <= 100000) d.price = val;
    });
  }

  // Injects/updates a Hotel + AggregateOffer JSON-LD block reflecting the
  // current room-only price range across ROOMS (static fallback on first
  // call, live-override-corrected after loadRates() below resolves) — a
  // free, additive SEO signal; booking.html previously had no structured
  // data at all. Independent of, and not required by, the Google Hotel Ads
  // feed (backend/routes/hotelAds.js) — this is for general search/rich
  // results, not the price-comparison module specifically.
  function injectPricingSchema() {
    var prices = [];
    ROOMS.forEach(function (room) {
      room.variants.forEach(function (v) { if (typeof v.room === 'number') prices.push(v.room); });
    });
    if (!prices.length) return;
    var data = {
      '@context': 'https://schema.org',
      '@type': 'Hotel',
      name: 'J Park Hotel',
      url: 'https://jparkhotel.com/booking.html',
      telephone: '+66-86-326-0664',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '88/88 Thanon Sukprayun, Na Pa',
        addressLocality: 'Mueang Chonburi District',
        addressRegion: 'Chon Buri',
        postalCode: '20000',
        addressCountry: 'TH',
      },
      makesOffer: {
        '@type': 'AggregateOffer',
        priceCurrency: 'THB',
        lowPrice: Math.min.apply(null, prices),
        highPrice: Math.max.apply(null, prices),
        offerCount: prices.length,
      },
    };
    var el = document.getElementById('bkPricingSchema');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = 'bkPricingSchema';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
  }
  injectPricingSchema();

  (function loadRates() {
    var API = window.JPark && window.JPark.api;
    if (!API) return;
    API.get('/api/rates').then(function (res) {
      if (!res || res.error) return; // fail closed to the static defaults already in ROOMS
      applyRateOverrides(res.rooms);
      applySurcharges(res.surcharges);
      applyDayUseOverrides(res.dayUse);
      renderAll(); // repaint any already-drawn cards with corrected prices
      injectPricingSchema(); // refresh with live-override-corrected prices
    }).catch(function () {});
  })();

  // Delisted room types (Site Editor "Room availability" toggle,
  // backend/routes/availability.js) must be excluded from search results
  // entirely, not just visually hidden — a guest must not be able to find
  // or book a delisted room via the default listing, a search, or the
  // ?room= deep link. For a merged Single+Twin card (see DISPLAY_ROOMS
  // above), drop only the unavailable side's variant row if just one of
  // the pair is off; drop the whole card if both are off.
  function filterUnavailableRooms(rooms, unavailable) {
    var out = [];
    rooms.forEach(function (r) {
      if (Array.isArray(r.folders)) {
        var kept = r.variants.filter(function (v) { return unavailable.indexOf(v.roomKey) === -1; });
        if (!kept.length) return; // both sides delisted — drop the card
        if (kept.length === r.variants.length) { out.push(r); return; } // nothing delisted
        var idx = r.variants.indexOf(kept[0]);
        out.push(Object.assign({}, r, { folders: [r.folders[idx]], variants: kept }));
        return;
      }
      if (unavailable.indexOf(r.name) === -1) out.push(r);
    });
    return out;
  }

  (function loadRoomAvailability() {
    var API = window.JPark && window.JPark.api;
    if (!API) return;
    API.get('/api/availability').then(function (res) {
      if (!res || res.error || !res.unavailable || !res.unavailable.length) return;
      var filtered = filterUnavailableRooms(DISPLAY_ROOMS, res.unavailable);
      if (lastRooms === DISPLAY_ROOMS) lastRooms = filtered; // still showing the default listing
      DISPLAY_ROOMS = filtered;
      renderAll();
    }).catch(function () {});
  })();

  // Surfaces a dismissible banner if the backend is unreachable, instead of
  // leaving the booking flow silently dead until a guest tries to submit.
  (function checkBackendHealth() {
    var API = window.JPark && window.JPark.api;
    if (!API) return;
    API.get('/api/maintenance').catch(function () { return { error: true }; }).then(function (res) {
      if (res && !res.error) return; // backend reachable
      var bar = document.createElement('div');
      bar.className = 'bk-offline-banner';
      bar.innerHTML =
        '<span>' + TR('bk.offlineBanner') + '</span>' +
        '<a href="tel:+66863260664">+66 086 326 0664</a>' +
        ' / ' +
        '<a href="tel:+6638448111">+66 038 448 111</a>' +
        '<button type="button" class="bk-offline-dismiss" aria-label="Dismiss">&times;</button>';
      bar.querySelector('.bk-offline-dismiss').addEventListener('click', function () { bar.remove(); });
      document.body.prepend(bar);
    });
  })();

  // --- Search status bar ---
  // Remembered so the summary text can be repainted on a language switch.
  var statusState = null; // { ci, co, nights, adults, children }

  // Read-only accessor so assets/js/booking-payment.js can pick up the
  // guest's chosen dates/guests without duplicating this page's date logic.
  window.JPark = window.JPark || {};
  window.JPark.bookingSearchState = function () { return statusState; };

  // Mark any room sold out for the searched dates (capacity filtering above
  // only rules out rooms too small for the party — this closes the gap for
  // rooms that fit but have zero physical units left for those nights).
  function applyAvailability(checkIn, checkOut) {
    var API = window.JPark && window.JPark.api;
    if (!API) return;
    API.get('/api/v1/booking-availability?checkIn=' + encodeURIComponent(checkIn) + '&checkOut=' + encodeURIComponent(checkOut))
      .then(function (result) {
        if (!result || result.error) return; // fail open: don't block booking on a network hiccup
        Array.prototype.forEach.call(gridEl.querySelectorAll('.rr-card'), function (card) {
          var room = card.dataset.room;
          var remaining = result[room];
          var soldOut = remaining != null && remaining <= 0;
          card.classList.toggle('rr-soldout', soldOut);
          var badge = card.querySelector('.rr-soldout-badge');
          if (badge) badge.hidden = !soldOut;
          var bookBtn = card.querySelector('.rr-book-btn');
          if (bookBtn) bookBtn.disabled = soldOut;
        });
      })
      .catch(function () {});
  }

  function refreshStatus() {
    if (!statusState || statusEl.hidden) return;
    var s = statusState;
    var guestStr = countWord(s.adults, 'bk.gAdult1', 'bk.gAdultN') +
      (s.children > 0 ? ' · ' + countWord(s.children, 'bk.gChild1', 'bk.gChildN') : '');
    statusTextEl.textContent =
      fmtDate(s.ci) + ' → ' + fmtDate(s.co) +
      ' · ' + nightsWord(s.nights) +
      ' · ' + guestStr;
  }

  // Keep the frozen search-time snapshot in statusState live: both the
  // status-bar summary text (refreshStatus()) and the "Book Now" flow
  // (bookBtn's click handler, below) read statusState.adults/children
  // directly, never the module-level adults/children vars the steppers
  // actually mutate. Without this, bumping a stepper after "Check
  // Availability" silently fed a stale guest count into the pricing
  // engine. No-op before the first search (statusState is still null then
  // — nothing to keep in sync yet).
  function syncGuestsToStatusState() {
    if (!statusState) return;
    statusState.adults = adults;
    statusState.children = children;
    refreshStatus();
  }

  // --- Search ---
  searchBtn.addEventListener('click', function () {
    var ci = checkinEl.value;
    var co = checkoutEl.value;

    if (!ci || !co) {
      errorEl.textContent = TR('bk.errDates');
      errorEl.hidden = false;
      checkinEl.focus();
      return;
    }
    if (co <= ci) {
      errorEl.textContent = TR('bk.errOrder');
      errorEl.hidden = false;
      checkoutEl.focus();
      return;
    }
    errorEl.hidden = true;

    var nights = nightCount(ci, co);
    var totalGuests = adults + children;
    var filtered = DISPLAY_ROOMS.filter(function (r) { return r.maxGuests >= totalGuests; });

    statusState = { ci: ci, co: co, nights: nights, adults: adults, children: children };
    statusEl.hidden = false;
    hintEl.hidden   = true;
    refreshStatus();

    renderRooms(filtered, nights);
    applyAvailability(ci, co);

    setTimeout(function () {
      gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  });

  // Also trigger search on Enter in date fields
  [checkinEl, checkoutEl].forEach(function (el) {
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') searchBtn.click();
    });
  });

  // --- Clear / reset ---
  clearBtn.addEventListener('click', function () {
    checkinEl.value  = '';
    checkoutEl.value = '';
    adults   = 2;
    children = 0;
    adultsValEl.textContent   = '2';
    childrenValEl.textContent = '0';

    statusState      = null;
    statusEl.hidden  = true;
    hintEl.hidden    = false;
    errorEl.hidden   = true;
    noRoomsEl.hidden = true;

    renderRooms(DISPLAY_ROOMS, null);

    checkinEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    checkinEl.focus();
  });

  // Same slugify() as backend/lib/hotelAdsIds.js — intentionally duplicated
  // here rather than shared, since this static frontend has no build step
  // to pull a Node module into. Keep the two in sync if either changes.
  function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  // --- Pre-fill from URL params (when arriving from hero booking bar, or
  // from a Google Hotel Ads deep link naming a specific room via ?room=) ---
  (function () {
    var p = new URLSearchParams(window.location.search);
    var ci = p.get('checkin');
    var co = p.get('checkout');
    var g  = parseInt(p.get('guests'), 10);
    var c  = parseInt(p.get('children'), 10);
    var roomSlug = p.get('room');

    if (ci) {
      checkinEl.value = ci;
      checkoutEl.min  = shiftDate(ci, 1);
    }
    if (co) checkoutEl.value = co;
    if (!isNaN(g) && g >= 1 && g <= 8) {
      adults = g;
      adultsValEl.textContent = g;
    }
    if (!isNaN(c) && c >= 0 && c <= 6) {
      children = c;
      childrenValEl.textContent = c;
    }

    if (ci && co && co > ci) {
      searchBtn.click(); // renders room cards synchronously before returning

      if (roomSlug) {
        var match = DISPLAY_ROOMS.filter(function (r) { return slugify(r.name) === roomSlug; })[0];
        if (!match) {
          // roomSlug may reference a guestTier: 2 (Twin) room name that's
          // now folded into its Single sibling's merged display card —
          // resolve via the merged variant's own roomKey.
          match = DISPLAY_ROOMS.filter(function (r) {
            return r.variants.some(function (v) { return v.roomKey && slugify(v.roomKey) === roomSlug; });
          })[0];
        }
        var card = match && gridEl.querySelector('[data-room="' + CSS.escape(match.name) + '"]');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          var bookBtn = card.querySelector('.rr-book-btn');
          if (bookBtn) bookBtn.click();
        }
        // No match, or filtered out by guest count: no-op — the plain
        // date/guest search above has already run.
      }
    }
  }());

})();
