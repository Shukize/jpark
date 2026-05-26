(function () {
  'use strict';

  var ROOMS = [
    {
      name: 'Standard Single',
      size: '24 m²',
      maxGuests: 1,
      img: 'images/Standard%20Single/room_01.jpg',
      desc: 'A smart, light-filled single with a cosy bed, work desk and rainfall shower — ideal for the solo business traveller.',
      amenities: ['Work Desk', 'Rainfall Shower', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi', 'In-Room Safe'],
    },
    {
      name: 'Superior Room',
      size: '32 m²',
      maxGuests: 2,
      img: 'images/Superior%20Room/room_01.jpg',
      desc: 'A refined room with a plush queen bed, lounge seating and a sleek bathroom, dressed in a warm, contemporary palette.',
      amenities: ['Queen Bed', 'Lounge Seating', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi', 'In-Room Safe'],
    },
    {
      name: 'Prestige Twin Room',
      size: '36 m²',
      maxGuests: 2,
      img: 'images/Prestige%20Twin%20Room/room_01.jpg',
      desc: 'An elevated twin with premium bedding, a spacious work area and upgraded amenities for a longer, easier stay.',
      amenities: ['Twin Beds', 'Premium Bedding', 'Work Desk', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
    },
    {
      name: 'Studio Room',
      size: '38 m²',
      maxGuests: 2,
      img: 'images/Studio%20Room/room_01.jpg',
      desc: 'A bright apartment-style studio with a king bed, kitchenette and living nook — designed for comfortable extended stays.',
      amenities: ['King Bed', 'Kitchenette', 'Living Nook', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
    },
    {
      name: 'Studio Double Room',
      size: '42 m²',
      maxGuests: 3,
      img: 'images/Studio%20Double%20Room/room_01.jpg',
      desc: 'A generous studio with a king bed and a separate double daybed, a full kitchenette and ample room to spread out.',
      amenities: ['King Bed + Daybed', 'Full Kitchenette', 'Living Area', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
    },
    {
      name: 'Corner Suite',
      size: '52 m²',
      maxGuests: 2,
      img: 'images/Corner%20Suite/room_01.jpg',
      desc: 'A wraparound corner retreat with a separate living room, dual-aspect windows and a deep-soaking marble bathroom.',
      amenities: ['Dual-Aspect Views', 'Marble Bathroom', 'Separate Living Room', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
    },
    {
      name: 'Grand Suite',
      size: '75 m²',
      maxGuests: 3,
      img: 'images/Grand%20Suite%20Room/room_01.jpg',
      desc: 'An expansive one-bedroom residence with full living and dining areas, a kitchen and premium finishes throughout.',
      amenities: ['King Bed', 'Full Kitchen', 'Living & Dining Room', 'Onsen Access', 'Smart TV', 'Free Wi-Fi'],
    },
    {
      name: 'Grand Suite · Two Bedrooms',
      size: '95 m²',
      maxGuests: 4,
      img: 'images/Grand%20Suite%20Two%20Bedrooms/room_01.jpg',
      desc: 'Our flagship two-bedroom residence — two bedrooms, a large living and dining space and twin bathrooms, made for families and long stays.',
      amenities: ['2 Bedrooms', 'Twin Bathrooms', 'Full Kitchen', 'Living & Dining Room', 'Onsen Access', 'Free Wi-Fi'],
    },
  ];

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

  var adults   = 2;
  var children = 0;

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
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  // --- Init date constraints ---
  var todayStr = todayISO();
  checkinEl.min  = todayStr;
  checkoutEl.min = shiftDate(todayStr, 1);

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
    function (v) { adults = v; adultsValEl.textContent = v; },
    1, 8
  );
  wire('childrenDown', 'childrenUp', childrenValEl,
    function () { return children; },
    function (v) { children = v; childrenValEl.textContent = v; },
    0, 6
  );

  // --- Build a room card ---
  function buildCard(room, nights) {
    var article = document.createElement('article');
    article.className = 'rr-card';

    var amenityHTML = room.amenities
      .map(function (a) { return '<li>' + a + '</li>'; })
      .join('');

    var nightNote = nights ? ' · ' + plural(nights, 'night') : '';

    article.innerHTML =
      '<div class="rr-img">' +
        '<img src="' + room.img + '" alt="' + room.name + '" loading="lazy" />' +
        '<div class="rr-badges">' +
          '<span class="rr-badge">' + room.size + '</span>' +
          '<span class="rr-badge gold">Up to ' + plural(room.maxGuests, 'guest') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="rr-body">' +
        '<h2 class="rr-name">' + room.name + '</h2>' +
        '<p class="rr-desc">' + room.desc + '</p>' +
        '<ul class="rr-amenities">' + amenityHTML + '</ul>' +
        '<div class="rr-price-row">' +
          '<div>' +
            '<p class="rr-price-label">Price per night' + nightNote + '</p>' +
            '<p class="rr-price-val">Pricing available soon</p>' +
          '</div>' +
          '<a href="index.html#contact" class="btn btn-solid rr-enquire-btn">Enquire to Book</a>' +
        '</div>' +
      '</div>';

    return article;
  }

  // --- Render rooms ---
  function renderRooms(rooms, nights) {
    gridEl.innerHTML = '';
    if (rooms.length === 0) {
      gridEl.hidden  = true;
      noRoomsEl.hidden = false;
      return;
    }
    noRoomsEl.hidden = true;
    rooms.forEach(function (r) {
      gridEl.appendChild(buildCard(r, nights));
    });
    gridEl.hidden = false;
  }

  // Show all rooms on initial load
  renderRooms(ROOMS, null);

  // --- Search ---
  searchBtn.addEventListener('click', function () {
    var ci = checkinEl.value;
    var co = checkoutEl.value;

    if (!ci || !co) {
      errorEl.textContent = 'Please select both a check-in and check-out date.';
      errorEl.hidden = false;
      checkinEl.focus();
      return;
    }
    if (co <= ci) {
      errorEl.textContent = 'Check-out must be after check-in.';
      errorEl.hidden = false;
      checkoutEl.focus();
      return;
    }
    errorEl.hidden = true;

    var nights = nightCount(ci, co);
    var totalGuests = adults + children;
    var filtered = ROOMS.filter(function (r) { return r.maxGuests >= totalGuests; });

    var guestStr = plural(adults, 'adult') +
      (children > 0 ? ' · ' + plural(children, 'child') : '');
    statusTextEl.textContent =
      fmtDate(ci) + ' → ' + fmtDate(co) +
      ' · ' + plural(nights, 'night') +
      ' · ' + guestStr;

    statusEl.hidden = false;
    hintEl.hidden   = true;

    renderRooms(filtered, nights);

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

    statusEl.hidden  = true;
    hintEl.hidden    = false;
    errorEl.hidden   = true;
    noRoomsEl.hidden = true;

    renderRooms(ROOMS, null);

    checkinEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    checkinEl.focus();
  });

  // --- Pre-fill from URL params (when arriving from hero booking bar) ---
  (function () {
    var p = new URLSearchParams(window.location.search);
    var ci = p.get('checkin');
    var co = p.get('checkout');
    var g  = parseInt(p.get('guests'), 10);

    if (ci) {
      checkinEl.value = ci;
      checkoutEl.min  = shiftDate(ci, 1);
    }
    if (co) checkoutEl.value = co;
    if (!isNaN(g) && g >= 1 && g <= 8) {
      adults = g;
      adultsValEl.textContent = g;
    }

    if (ci && co && co > ci) {
      searchBtn.click();
    }
  }());

})();
