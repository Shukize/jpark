/* ============================================================
   J Park Hotel — Google Hotel Ads direct-connect feed.
     GET /api/v1/hotel-ads/hotel-list.xml            -> property/Hotel List feed
     GET /api/v1/hotel-ads/ari.xml?start=&end=        -> rates + availability feed (Pull mode)

   Background: this exists so the hotel's own price appears in Google's
   hotel price-comparison box next to OTAs, at zero recurring cost (no
   channel-manager subscription) — see backend/lib/hotelAdsFeed.js for the
   pricing/availability data layer this serializes, and backend/lib/
   hotelAdsIds.js for the stable roomTypeId/ratePlanId scheme.

   Delivery mode: Pull — Google periodically requests this URL and we
   respond with current data, rather than us pushing updates to Google.
   This is the simplest of Google's three supported modes for a small
   backend with no message-queue infrastructure (see the plan doc for the
   other two: ARI-push, Changed-Pricing).

   XML approach: hand-rolled template literals + lib/xml.js's escapeXml(),
   no XML-builder dependency — consistent with this repo's existing
   dependency-light, hand-rolled utility style (roomRates.js, rateOverrides.js,
   middleware/auth.js's hand-rolled JWT). Every interpolated value here is
   server-controlled numeric/string data, never raw user input.

   KNOWN UNCERTAINTY (flagged in the implementation plan, not a bug): the
   exact required tag names/namespaces/envelope for Google's Pull-mode
   response can only be fully confirmed once the hotel is approved for
   direct integration and Google's own feed validator (Hotel Center's Price
   Accuracy Score / sandbox) is available to test against. The <ARIFeed>
   wrapper root below is a placeholder envelope; the OTA-style inner
   elements (HotelRateAmountMessages / AvailStatusMessages, matching
   Google's documented OTA_HotelRateAmountNotifRQ / OTA_HotelAvailNotifRQ
   message families) follow Google's published field names as closely as
   possible from their public docs. Expect to adjust this file — not the
   data layer in hotelAdsFeed.js — after the first real submission.

   Public GET, no auth (mirrors GET /api/rates's "no auth required" pattern
   in routes/rates.js — Google's crawler infra needs to reach this without
   a login flow, and it's the same pricing already public on /api/rates and
   the booking page). Optional shared-secret ?key= via crypto.timingSafeEqual
   (same pattern as payments.js's Omise-webhook key check), open by default
   if HOTEL_ADS_FEED_SECRET is unset.
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const hotelAdsFeed = require('../lib/hotelAdsFeed');
const { escapeXml } = require('../lib/xml');

const router = express.Router();

function feedKeyOk(provided) {
  const expected = process.env.HOTEL_ADS_FEED_SECRET || '';
  if (!expected) return true;
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireFeedKey(req, res, next) {
  if (!feedKeyOk(req.query.key)) {
    return res.status(401).type('text/plain').send('Invalid key');
  }
  next();
}

/* GET /hotel-list.xml */
router.get('/hotel-list.xml', requireFeedKey, async (_req, res) => {
  let hotel;
  try {
    hotel = await hotelAdsFeed.getHotelListData();
  } catch (e) {
    console.error('[hotelAds] hotel-list', e);
    return res.status(500).type('text/plain').send('Feed temporarily unavailable');
  }

  const latLng = (hotel.latitude && hotel.longitude)
    ? `<latitude>${escapeXml(hotel.latitude)}</latitude><longitude>${escapeXml(hotel.longitude)}</longitude>`
    : '';

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<hotel_list>\n' +
    '  <hotel>\n' +
    `    <id>${escapeXml(hotel.id)}</id>\n` +
    `    <name>${escapeXml(hotel.name)}</name>\n` +
    `    <address>${escapeXml(hotel.address)}</address>\n` +
    `    <country>${escapeXml(hotel.country)}</country>\n` +
    `    <phone type="main">${escapeXml(hotel.phone)}</phone>\n` +
    `    ${latLng}\n` +
    '  </hotel>\n' +
    '</hotel_list>\n';

  res.type('application/xml; charset=UTF-8').send(xml);
});

function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/* GET /ari.xml?start=YYYY-MM-DD&end=YYYY-MM-DD (end exclusive) */
router.get('/ari.xml', requireFeedKey, async (req, res) => {
  const start = isValidDateStr(req.query.start) ? req.query.start : undefined;
  const end = isValidDateStr(req.query.end) ? req.query.end : undefined;

  let data;
  try {
    data = await hotelAdsFeed.getAriData({ startDate: start, endDateExclusive: end });
  } catch (e) {
    console.error('[hotelAds] ari', e);
    // Fail open with an empty-but-well-formed feed rather than a 500, so a
    // transient DB blip never reads to Google as a broken feed.
    data = { hotelId: process.env.HOTEL_ADS_PROPERTY_ID || 'jparkhotel-chonburi', startDate: start || '', endDateExclusive: end || '', plans: [] };
  }

  const timestamp = new Date().toISOString();
  const hotelCode = escapeXml(data.hotelId);

  const rateMessages = data.plans.map((plan) => {
    const rates = plan.nightly.map((n) =>
      `        <Rate Start="${n.date}" End="${n.date}">\n` +
      `          <BaseByGuestAmount AmountBeforeTax="${n.amount}" CurrencyCode="${escapeXml(n.currency)}" NumberOfGuests="${plan.maxOccupancyBase}"/>\n` +
      '        </Rate>\n'
    ).join('');
    return (
      '    <HotelRateAmountMessage>\n' +
      `      <StatusApplicationControl Start="${data.startDate}" End="${data.endDateExclusive}" InvTypeCode="${escapeXml(plan.roomTypeId)}" RatePlanCode="${escapeXml(plan.ratePlanId)}"/>\n` +
      '      <Rates>\n' + rates + '      </Rates>\n' +
      '    </HotelRateAmountMessage>\n'
    );
  }).join('');

  const availMessages = data.plans.map((plan) => {
    const statuses = plan.nightly.map((n) =>
      `        <StatusApplicationControl Start="${n.date}" End="${n.date}" InvTypeCode="${escapeXml(plan.roomTypeId)}" RatePlanCode="${escapeXml(plan.ratePlanId)}"/>\n` +
      `        <RestrictionStatus Status="${n.available ? 'Open' : 'Close'}" Restriction="Master" Count="${n.count}"/>\n`
    ).join('');
    return `    <AvailStatusMessage>\n${statuses}    </AvailStatusMessage>\n`;
  }).join('');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<ARIFeed>\n' +
    `  <OTA_HotelRateAmountNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" TimeStamp="${timestamp}" Version="1.0">\n` +
    `    <HotelRateAmountMessages HotelCode="${hotelCode}">\n` + rateMessages + '    </HotelRateAmountMessages>\n' +
    '  </OTA_HotelRateAmountNotifRQ>\n' +
    `  <OTA_HotelAvailNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" TimeStamp="${timestamp}" Version="1.0">\n` +
    `    <AvailStatusMessages HotelCode="${hotelCode}">\n` + availMessages + '    </AvailStatusMessages>\n' +
    '  </OTA_HotelAvailNotifRQ>\n' +
    '</ARIFeed>\n';

  res.type('application/xml; charset=UTF-8').send(xml);
});

module.exports = router;
