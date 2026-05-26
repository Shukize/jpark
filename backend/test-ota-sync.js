// Manual smoke test for the OTA sync webhook.
// Start the API first (npm start), then run: node test-ota-sync.js
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}/api/v1/ota-sync`;
const KEY = process.env.OTA_WEBHOOK_SECRET || '';

const sample = {
  event: 'booking_created',
  hotel_room_type: 'Deluxe',
  check_in: '2026-06-10',
  check_out: '2026-06-12',
  ota_channel: 'Agoda',
  reservation_id: 'AGD-TEST-001',
  guest_name: 'Daniel Robinson',
};

async function call(label, { key = KEY, body } = {}) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    body: JSON.stringify(body ?? sample),
  });
  let payload;
  try { payload = await res.json(); } catch { payload = await res.text(); }
  console.log(`\n# ${label}\n  -> HTTP ${res.status}`);
  console.log('  ', JSON.stringify(payload));
  return { status: res.status, payload };
}

(async () => {
  if (!KEY) {
    console.error('OTA_WEBHOOK_SECRET is not set in your .env — set it to match the server.');
    process.exit(1);
  }

  // ── booking_created ────────────────────────────────────────────────────────
  await call('Valid booking (expect 201 created)');
  await call('Same booking again — retry (expect 200 duplicate)');

  // ── booking_cancelled ──────────────────────────────────────────────────────
  await call('Cancel that booking (expect 200 cancelled)', {
    body: { event: 'booking_cancelled', ota_channel: 'Agoda', reservation_id: 'AGD-TEST-001' },
  });
  await call('Cancel same booking again (expect 200 already_cancelled)', {
    body: { event: 'booking_cancelled', ota_channel: 'Agoda', reservation_id: 'AGD-TEST-001' },
  });
  await call('Cancel unknown ref (expect 200 not_found)', {
    body: { event: 'booking_cancelled', ota_channel: 'Agoda', reservation_id: 'AGD-DOES-NOT-EXIST' },
  });

  // ── edge / error cases ─────────────────────────────────────────────────────
  await call('Bad API key (expect 401)', { key: 'wrong-key' });
  await call('Unknown event (expect 202 ignored)', {
    body: { ...sample, event: 'rate_updated', reservation_id: 'AGD-OTHER' },
  });
  await call('Missing fields (expect 400)', {
    body: { event: 'booking_created', ota_channel: 'Agoda' },
  });
  await call('Check-out before check-in (expect 400)', {
    body: { ...sample, reservation_id: 'AGD-BADDATE', check_in: '2026-06-05', check_out: '2026-06-04' },
  });
  await call('Cancel without a ref (expect 400)', {
    body: { event: 'booking_cancelled', ota_channel: 'Agoda' },
  });

  console.log('\nDone.');
})().catch((err) => {
  console.error('\nTest run failed — is the server running on port ' + PORT + '?');
  console.error(err.message);
  process.exit(1);
});
