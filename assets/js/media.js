/* ============================================================
   J Park Hotel — media registry (single source of truth)
   Every photo/video set shown on the public site lives here, in
   one ordered list per "section". main.js reads these sets to
   build the carousel, room/facility/dining galleries, the full
   Gallery and every lightbox — so editing a set here (via the
   admin Site Editor) changes the set everywhere it appears.

   Admin edits are stored in the shared store under
   content.media[setId] as a full ordered array of items; when
   present it REPLACES the default list for that set. Each item is
   { src, video } where video:true marks an mp4. Reordering,
   removing, replacing and adding photos all work by rewriting
   that array.
   ============================================================ */
(function () {
  "use strict";
  const J = (window.JPark = window.JPark || {});
  const S = J.store;

  /* ---- helpers to build item lists ---- */
  function imgs(list) { return list.map((s) => ({ src: s, video: false })); }

  /* Room folders -> photo counts (files are room_01.jpg … room_NN.jpg, best
     cover first). One folder per room type currently let, in display order. */
  /* room_NN.jpg folders. Studio Single, Studio B4 and Deluxe were refreshed with
     a new 2026-06-09 batch and are defined as explicit item lists below. */
  const ROOM_COUNTS = {
    "Prestige Single": 4, "Prestige Twin": 2,
    "Premium Single": 2, "Premium Twin": 2, "Grand Premium": 5,
    "Grand Deluxe": 5,
    "Premium Suite": 7, "Grand Suite 1 Bedroom": 8
  };
  function seq(folder, prefix, n) {
    const out = [];
    for (let i = 1; i <= n; i++) {
      out.push({ src: "images/" + folder + "/" + prefix + "_" + (i < 10 ? "0" + i : i) + ".jpg", video: false });
    }
    return out;
  }
  function roomItems(folder) { return seq(folder, "room", ROOM_COUNTS[folder] || 1); }

  /* Building 5 (J Park Hall) — common areas, files b5_01.jpg … b5_07.jpg. */
  const BUILDING5_ITEMS = seq("B5", "b5", 7);

  /* ---- the canonical sets, in the order the Gallery shows them ---- */
  const COFFEE_ITEMS = [
    { src: "images/New Midnight Coffee Club/20260609_212910.jpg", video: false },
    { src: "images/New Midnight Coffee Club/20260609_213409.jpg", video: false },
    { src: "images/New Midnight Coffee Club/20260609_213016.jpg", video: false },
    { src: "images/New Midnight Coffee Club/20260609_214121.jpg", video: false },
    { src: "images/New Midnight Coffee Club/20260607_175632.jpg", video: false },
    { src: "images/New Midnight Coffee Club/20260607_175751.jpg", video: false },
    { src: "images/New Midnight Coffee Club/20260607_175843.jpg", video: false },
    { src: "images/New Midnight Coffee Club/20260607_175904.jpg", video: false },
    { src: "images/New Midnight Coffee Club/20260607_175914.jpg", video: false },
    { src: "images/New Midnight Coffee Club/20260607_175931.jpg", video: false },
    { src: "images/New Midnight Coffee Club/20260607_180002.jpg", video: false },
    { src: "images/New Midnight Coffee Club/20260607_180049.jpg", video: false },
    { src: "images/New Midnight Coffee Club/20260607_180138.jpg", video: false },
    { src: "images/New Midnight Coffee Club/20260607_180533.jpg", video: false },
    { src: "images/New Midnight Coffee Club/unnamed.jpg", video: false },
    { src: "images/New Midnight Coffee Club/unnamed5.jpg", video: false },
    { src: "images/New Midnight Coffee Club/unnamed4.jpg", video: false },
    { src: "images/New Midnight Coffee Club/unnamed1.jpg", video: false },
    { src: "images/New Midnight Coffee Club/587f2a86-cbf1-4cac-9e69-9279d2478323.jpg", video: false },
    { src: "images/New Midnight Coffee Club/533e41e3-da93-4733-b004-9d2ea6f73b93.jpg", video: false },
    { src: "images/New Midnight Coffee Club/e46b8210-aa80-4e70-9752-ebc89b40d507.jpg", video: false },
    { src: "images/New Midnight Coffee Club/71ef2776-f865-424b-9c49-8b8d6408996a.jpg", video: false },
    { src: "images/New Midnight Coffee Club/9fc27bb2-ce97-4825-84b4-e3c2152c5628.jpg", video: false },
    { src: "images/New Midnight Coffee Club/f930c440-b85d-46c2-a6d5-fea5ee506ac9.jpg", video: false },
    { src: "images/New Midnight Coffee Club/3f2b3f47-b2ab-42ef-aae2-03638f1d26da.jpg", video: false },
    { src: "images/New Midnight Coffee Club/b85f1406-83f2-4969-84c6-11299dfdb391.jpg", video: false },
    { src: "images/New Midnight Coffee Club/unnamed2.jpg", video: false },
    { src: "images/New Midnight Coffee Club/unnamed3.jpg", video: false },
    { src: "images/New Midnight Coffee Club/1f9bc02c-f503-4ff5-a257-6257bad9dbb4.jpg", video: false },
    { src: "images/New Midnight Coffee Club/509915eb-4ebd-4367-9df2-ca4a1920edb1.jpg", video: false },
    { src: "images/New Midnight Coffee Club/7e5103f1-38cf-450e-b738-a600fe093b33.jpg", video: false },
    { src: "images/New Midnight Coffee Club/c8bd675b-dd6b-43d6-bd81-6ea00f044752.jpg", video: false },
    { src: "images/New Midnight Coffee Club/fa048e34-5d56-40df-b74b-09ddae38e76c.jpg", video: false },
    { src: "images/New Midnight Coffee Club/fb6f70a5-a689-40b7-941f-acd406adebe4.jpg", video: false }
  ];

  const TSUBAKI_ITEMS = [
    { src: "images/Tsubaki/20260607_173703.jpg", video: false },
    { src: "images/Tsubaki/20260607_173656.jpg", video: false },
    { src: "images/Tsubaki/20260607_173715.jpg", video: false },
    { src: "images/Tsubaki/20260607_173814.jpg", video: false },
    { src: "images/Tsubaki/20260607_173752.jpg", video: false },
    { src: "images/Tsubaki/20260607_173848.jpg", video: false },
    { src: "images/Tsubaki/20260607_174006.jpg", video: false },
    { src: "images/Tsubaki/20260607_174019.jpg", video: false },
    { src: "images/Tsubaki/119059522_2737564009811833_3276458423237956706_n.jpg", video: false },
    { src: "images/Tsubaki/AQMhQMC9GvtxGLkJruddhOPLcKjXwYl7OIbbeUJhZGiN5H1azDdwdOjoAlyV2MX6YqBrAVxDVWfbsNvSfpNaWCPuK_vgs1lCbBNoQ2XhOEv9PQ.mp4", video: true },
    { src: "images/Tsubaki/AQNtQ5IQUAHLuYDynRq2hKj2FmFhnuOu6_9HEP86BzYGE1Fm-DNsUBPCMZsQ5ShYm0w4HTCHHrlFiD_hPKL2J2wKqIOWXXE1_FiCPyUJuM0Fmw.mp4", video: true },
    { src: "images/Tsubaki/117385327_2711501392418095_8728421740233265724_n.jpg", video: false },
    { src: "images/Tsubaki/117386868_2711502825751285_9161539639978836256_n.jpg", video: false },
    { src: "images/Tsubaki/117387011_2711503202417914_380251397258247239_n.jpg", video: false },
    { src: "images/Tsubaki/474009097_3944623992439156_4303400434849394464_n.jpg", video: false },
    { src: "images/Tsubaki/474396351_3944624419105780_8200374909327224756_n.jpg", video: false },
    { src: "images/Tsubaki/474516662_3944623989105823_4104952711972794462_n.jpg", video: false },
    { src: "images/Tsubaki/474531404_3944623995772489_4119735839816638569_n.jpg", video: false },
    { src: "images/Tsubaki/474875709_3944624242439131_7646765052338007727_n.jpg", video: false },
    { src: "images/Tsubaki/117258496_2709810149253886_8027019671270987151_n.jpg", video: false },
    { src: "images/Tsubaki/117371075_2705814069653494_5640072069303815512_n.jpg", video: false },
    { src: "images/Tsubaki/106992077_2676782952556606_2640880278216559474_n.jpg", video: false },
    { src: "images/Tsubaki/103570097_2664535077114727_5747496982573431034_n.jpg", video: false },
    { src: "images/Tsubaki/95917625_2628220944079474_1578098892971442176_n.jpg", video: false },
    { src: "images/Tsubaki/92602742_2609165685985000_8319485625266864128_n.jpg", video: false },
    { src: "images/Tsubaki/188685185_2932342887000610_2901834436215404498_n.jpg", video: false },
    { src: "images/Tsubaki/492972572_1857102361657010_8878999124752931017_n.jpg", video: false },
    { src: "images/Tsubaki/494157941_1857101954990384_2463307427033703183_n.jpg", video: false },
    { src: "images/Tsubaki/299142779_1061028674597720_627657094659192438_n.jpg", video: false }
  ];

  const ALLDAY_ITEMS = [
    { src: "images/All-Day Dining/AQNCEA_f6EzQkXbwrB13jzd_QMJ4uE_ArgwVV0jb8eP8HtklQMgoYlGzdnKJONHWmf9VZnG8YqM8Ns1E1XjFRgw8BJaQMTIGqPYFLdzVf06rzQ.mp4", video: true },
    { src: "images/All-Day Dining/AQPkivRrWjvIibm-ObjYFA89UdoAliPhHGYELTbwWeI8TebF7soa_9BjgijiFFEoJG4YESEMEz468duj0wSBv77oBeIvhd42N9lzCGFFaIK8tQ.mp4", video: true }
  ];

  const BANQUET_ITEMS = [
    { src: "images/Meeting and Banquet Rooms/AQM1GlMUG1VPn2W3_GoLJgXiKyz-GI7UgQOK_LlqgTjo1DDIoMkFYNqgC1lAFEUf0ysj7JGbiP_T-PB84vS-qiCCPTrRNOQeeZ0d2-jDjn1bIQ.mp4", video: true },
    { src: "images/Meeting and Banquet Rooms/494571715_1234993728633902_7937100202759146009_n.jpg", video: false },
    { src: "images/Meeting and Banquet Rooms/494917326_1234993825300559_3003474501674880900_n.jpg", video: false },
    { src: "images/Meeting and Banquet Rooms/494918097_1244121301054478_8305459958581942758_n.jpg", video: false },
    { src: "images/Meeting and Banquet Rooms/495059787_1234993685300573_808848194837634403_n.jpg", video: false },
    { src: "images/Meeting and Banquet Rooms/495071384_1244122731054335_7597308853160764089_n.jpg", video: false },
    { src: "images/Meeting and Banquet Rooms/496253973_1244252684374673_7569938748860271089_n.jpg", video: false },
    { src: "images/Meeting and Banquet Rooms/497496305_1244252934374648_7353825412616371042_n.jpg", video: false },
    { src: "images/Meeting and Banquet Rooms/588040708_1422177456582194_470984224392519007_n.jpg", video: false },
    { src: "images/Meeting and Banquet Rooms/683901474_1558444972955441_2309987664278666191_n.jpg", video: false },
    { src: "images/Meeting and Banquet Rooms/687469820_1558444129622192_160825424360902258_n.jpg", video: false },
    { src: "images/Meeting and Banquet Rooms/687999904_1558427726290499_7320805987719867448_n.jpg", video: false }
  ];

  const HOTEL_ITEMS = imgs([
    "images/383fb6a3-fc47-4029-bfe5-2bd90e2f9345.jpg",
    "images/3d6be05f-7084-4d60-915c-e76e587675b3.jpg",
    "images/45c09cb7-8ba5-4ba0-bc3c-42837ef10bf2.jpg",
    "images/843e2617-637f-4337-8f46-69ff1e5b6979.jpg",
    "images/99bc74a1-d4e8-452e-ae2c-e8988164daff.jpg",
    "images/9f43d60e-e1b0-4ea0-b8b2-82792fbd44eb.jpg",
    "images/a5606bc9-316e-4fde-b5d6-7fb06163a540.jpg",
    "images/ea770736-fe38-4c3e-b072-4928f8a2fad9.jpg",
    "images/ef6ec731-7bc6-4d8c-a10d-dcb7131d7470.jpg"
  ]);

  const POOL_ITEMS = imgs([
    "images/Tropical Pool/20260601_081436.jpg",
    "images/Tropical Pool/20260601_074038.jpg",
    "images/Tropical Pool/20260601_074024.jpg",
    "images/Tropical Pool/20260601_074044.jpg",
    "images/Tropical Pool/20260601_074057.jpg",
    "images/Tropical Pool/1b23ab2d-a3d1-474c-8944-4c7159f6d91b.jpg",
    "images/Tropical Pool/48cd9718-cece-4c80-adcd-dd637ed35d00.jpg",
    "images/Tropical Pool/c3ac1733-933b-49de-aa10-7185a21dbe5f.jpg",
    "images/Tropical Pool/c917232b-159a-4fdc-bc20-12e806f5304b.jpg",
    "images/Tropical Pool/ce70057e-42f0-4b44-9f67-18598f22ff3a.jpg",
    "images/Tropical Pool/ffcc842a-2003-4239-ae74-0e6c0b10f883.jpg"
  ]);

  const GYM_ITEMS = imgs([
    "images/Gym/0c3d1ad4-6fd3-4082-8cbd-a08f1a11dc0e.jpg",
    "images/Gym/43e19389-7794-4262-a062-ef37f608b52a.jpg",
    "images/Gym/b111922d-8527-4860-b485-2ab4cee5f3a9.jpg",
    "images/Gym/e2bb66fc-6cac-45ec-8316-ae1e71d90a0a.jpg"
  ]);

  const LOBBY_ITEMS = imgs([
    "images/Main Lobby/20260609_170721.jpg",
    "images/Main Lobby/20260609_170741.jpg",
    "images/Main Lobby/20260609_170704.jpg",
    "images/Main Lobby/20260609_170649.jpg",
    "images/Main Lobby/20260609_170543.jpg",
    "images/Main Lobby/20260607_174349.jpg",
    "images/Main Lobby/20260607_174418.jpg",
    "images/Main Lobby/20260601_073624.jpg",
    "images/Main Lobby/20260601_073634.jpg",
    "images/Main Lobby/20260601_073650.jpg",
    "images/Main Lobby/20260601_073813.jpg",
    "images/Main Lobby/20260601_073905.jpg",
    "images/Main Lobby/20260601_073928.jpg"
  ]);

  /* Japanese Onsen (Futamata Onsen) — split men's / women's baths. Curated,
     bright finishing pass; people-free. The single ONSEN_ITEMS cover drives the
     Facilities "Japanese Onsen" card. */
  const ONSEN_MEN_ITEMS = imgs([
    "images/Onsen Men/20260609_165646.jpg",
    "images/Onsen Men/20260609_165913.jpg",
    "images/Onsen Men/20260609_165856.jpg",
    "images/Onsen Men/20260609_165731.jpg",
    "images/Onsen Men/20260609_165810.jpg",
    "images/Onsen Men/20260609_165718.jpg",
    "images/Onsen Men/20260609_165950.jpg",
    "images/Onsen Men/20260609_170017.jpg"
  ]);
  const ONSEN_WOMEN_ITEMS = imgs([
    "images/Onsen Lady/20260609_165120.jpg",
    "images/Onsen Lady/20260609_165427.jpg",
    "images/Onsen Lady/20260609_165054.jpg",
    "images/Onsen Lady/20260609_165133.jpg",
    "images/Onsen Lady/20260609_165201.jpg",
    "images/Onsen Lady/20260609_165522.jpg"
  ]);
  const ONSEN_ITEMS = imgs(["images/Onsen Men/20260609_165646.jpg"]);

  /* Refreshed 2026-06-09 room photo batch (bright/white finishing). Videos
     last so the still cover (first image) drives card thumbnails. */
  const DELUXE_ITEMS = [
    { src: "images/Deluxe/20260609_173341.jpg", video: false },
    { src: "images/Deluxe/20260609_173310.jpg", video: false },
    { src: "images/Deluxe/20260609_173427.jpg", video: false },
    { src: "images/Deluxe/20260609_173203.jpg", video: false },
    { src: "images/Deluxe/Deluxe.mp4", video: true }
  ];
  const STUDIO_SINGLE_ITEMS = [
    { src: "images/Studio Single/20260609_171513.jpg", video: false },
    { src: "images/Studio Single/20260609_171322.jpg", video: false },
    { src: "images/Studio Single/20260609_171244.jpg", video: false },
    { src: "images/Studio Single/20260609_171256.jpg", video: false },
    { src: "images/Studio Single/20260609_171355.jpg", video: false },
    { src: "images/Studio Single/20260609_171617.jpg", video: false },
    { src: "images/Studio Single/Studio Single.mp4", video: true }
  ];
  const STUDIO_B4_ITEMS = imgs([
    "images/Studio B4/20260609_174356.jpg",
    "images/Studio B4/room_01.jpg",
    "images/Studio B4/room_04.jpg",
    "images/Studio B4/room_07.jpg",
    "images/Studio B4/room_08.jpg",
    "images/Studio B4/room_09.jpg",
    "images/Studio B4/20260609_174153.jpg",
    "images/Studio B4/room_06.jpg"
  ]);

  /* Corner Suite & Executive Suite — curated subsets. A few unflattering
     shots (old fridge, worn sofa, cramped utility corners) were removed
     2026-06-09, so these are explicit lists rather than full room_NN
     sequences. Keep parallel with captions.js. */
  const CORNER_SUITE_ITEMS = imgs([
    "images/Corner Suite/room_01.jpg",
    "images/Corner Suite/room_03.jpg",
    "images/Corner Suite/room_04.jpg",
    "images/Corner Suite/room_05.jpg"
  ]);
  const EXEC_SUITE_ITEMS = imgs([
    "images/Executive Suite 1 Bedroom/room_01.jpg",
    "images/Executive Suite 1 Bedroom/room_02.jpg",
    "images/Executive Suite 1 Bedroom/room_04.jpg",
    "images/Executive Suite 1 Bedroom/room_05.jpg",
    "images/Executive Suite 1 Bedroom/room_07.jpg"
  ]);

  const HERO_ITEMS = imgs(["images/Tropical Pool/ffcc842a-2003-4239-ae74-0e6c0b10f883.jpg"]);
  const ABOUT_MAIN_ITEMS = imgs(["images/Tropical Pool/ce70057e-42f0-4b44-9f67-18598f22ff3a.jpg"]);
  const ABOUT_SUB_ITEMS = imgs(["images/Tropical Pool/c3ac1733-933b-49de-aa10-7185a21dbe5f.jpg"]);

  const PREVIEW_ITEMS = imgs([
    "images/Tropical Pool/c917232b-159a-4fdc-bc20-12e806f5304b.jpg",
    "images/45c09cb7-8ba5-4ba0-bc3c-42837ef10bf2.jpg",
    "images/Premium Suite/room_01.jpg",
    "images/ea770736-fe38-4c3e-b072-4928f8a2fad9.jpg",
    "images/B5/b5_01.jpg",
    "images/Tropical Pool/ce70057e-42f0-4b44-9f67-18598f22ff3a.jpg"
  ]);

  /* Set metadata. `gallery:true` means the set is a category in the full
     Gallery (in this order). `cover` names where the public page shows a
     representative image that the editor can also drive. `section` is the
     public anchor used by "View on site". `single:true` marks one-image
     slots (hero/about). */
  const DEFAULT_SETS = [
    { id: "hero",        labelKey: "media.set.hero",      section: "home",       single: true,  items: HERO_ITEMS },
    { id: "aboutMain",   labelKey: "media.set.aboutMain", section: "about",      single: true,  items: ABOUT_MAIN_ITEMS },
    { id: "aboutSub",    labelKey: "media.set.aboutSub",  section: "about",      single: true,  items: ABOUT_SUB_ITEMS },
    { id: "hotel",       labelKey: "gallery.cat.hotel",   section: "gallery",    gallery: true, items: HOTEL_ITEMS },
    { id: "pool",        labelKey: "fac.poolName",        section: "facilities", gallery: true, items: POOL_ITEMS },
    { id: "onsen",       labelKey: "fac.onsenName",       section: "facilities", items: ONSEN_ITEMS },
    { id: "onsenMen",    labelKey: "onsen.menTitle",      section: "onsen", gallery: true, galleryKey: "onsen.menTitle",   items: ONSEN_MEN_ITEMS },
    { id: "onsenWomen",  labelKey: "onsen.womenTitle",    section: "onsen", gallery: true, galleryKey: "onsen.womenTitle", items: ONSEN_WOMEN_ITEMS },
    { id: "coffee",      labelKey: "dining.coffeeName",   section: "coffee",     gallery: true, galleryKey: "gallery.cat.coffee", items: COFFEE_ITEMS },
    { id: "tsubaki",     labelKey: "dining.tsubakiName",  section: "dining",     gallery: true, galleryKey: "gallery.cat.tsubaki", items: TSUBAKI_ITEMS },
    { id: "allday",      labelKey: "dining.allDayName",   section: "dining",     gallery: true, galleryKey: "gallery.cat.allday", items: ALLDAY_ITEMS },
    { id: "banquet",     labelKey: "fac.gardenName",      section: "facilities", gallery: true, galleryKey: "gallery.cat.banquet", items: BANQUET_ITEMS },
    { id: "gym",         labelKey: "fac.gymName",         section: "facilities", gallery: true, galleryKey: "gallery.cat.gym", items: GYM_ITEMS },
    { id: "room:Studio Single",   labelKey: "rooms.studioSingleName",  section: "rooms", gallery: true, items: STUDIO_SINGLE_ITEMS },
    { id: "room:Prestige Single", labelKey: "rooms.prestigeSingleName", section: "rooms", gallery: true, items: roomItems("Prestige Single") },
    { id: "room:Prestige Twin",   labelKey: "rooms.prestigeTwinName",  section: "rooms", gallery: true, items: roomItems("Prestige Twin") },
    { id: "room:Studio B4",       labelKey: "rooms.studioB4Name",      section: "rooms", gallery: true, items: STUDIO_B4_ITEMS },
    { id: "room:Deluxe",          labelKey: "rooms.deluxeName",        section: "rooms", gallery: true, items: DELUXE_ITEMS },
    { id: "room:Premium Single",  labelKey: "rooms.premiumSingleName", section: "rooms", gallery: true, items: roomItems("Premium Single") },
    { id: "room:Premium Twin",    labelKey: "rooms.premiumTwinName",   section: "rooms", gallery: true, items: roomItems("Premium Twin") },
    { id: "room:Grand Premium",   labelKey: "rooms.grandPremiumName",  section: "rooms", gallery: true, items: roomItems("Grand Premium") },
    { id: "room:Corner Suite",    labelKey: "rooms.cornerName",        section: "rooms", gallery: true, items: CORNER_SUITE_ITEMS },
    { id: "room:Grand Deluxe",    labelKey: "rooms.grandDeluxeName",   section: "rooms", gallery: true, items: roomItems("Grand Deluxe") },
    { id: "room:Executive Suite 1 Bedroom", labelKey: "rooms.execSuite1brName", section: "rooms", gallery: true, items: EXEC_SUITE_ITEMS },
    { id: "room:Premium Suite",   labelKey: "rooms.premiumSuiteName",  section: "rooms", gallery: true, items: roomItems("Premium Suite") },
    { id: "room:Grand Suite 1 Bedroom", labelKey: "rooms.grandSuiteName", section: "rooms", gallery: true, items: roomItems("Grand Suite 1 Bedroom") },
    { id: "building5",    labelKey: "building.galTitle",      section: "building",   gallery: true, galleryKey: "building.galTitle", items: BUILDING5_ITEMS },
    { id: "lobby",        labelKey: "gallery.cat.lobby",      section: "gallery", gallery: true, items: LOBBY_ITEMS },
    { id: "galleryPreview", labelKey: "media.set.preview", section: "gallery", items: PREVIEW_ITEMS }
  ];

  const SETS_BY_ID = {};
  DEFAULT_SETS.forEach((s) => { SETS_BY_ID[s.id] = s; });

  function content() { return (S && S.read("content", {})) || {}; }

  function clone(items) { return (items || []).map((it) => ({ src: it.src, video: !!it.video })); }

  /* Effective (override-or-default) items for a set, as a fresh array. */
  function items(id) {
    const c = content();
    const ov = c.media && c.media[id];
    if (Array.isArray(ov)) return clone(ov);
    const def = SETS_BY_ID[id];
    return def ? clone(def.items) : [];
  }

  function defItems(id) {
    const def = SETS_BY_ID[id];
    return def ? clone(def.items) : [];
  }

  function isOverridden(id) {
    const c = content();
    return !!(c.media && Array.isArray(c.media[id]));
  }

  /* Image src strings only (drops videos) — used by the carousel. */
  function srcs(id) { return items(id).filter((it) => !it.video).map((it) => it.src); }

  /* Lightbox entries: image -> "src" string, video -> { localVideo: src }. */
  function entries(id) {
    return items(id).map((it) => (it.video ? { localVideo: it.src } : it.src));
  }

  function cover(id) {
    const list = items(id);
    return list.length ? list[0].src : null;
  }

  /* ---- write helpers (used by the Site Editor) ---- */
  function setItems(id, list) {
    if (!S) return;
    const c = S.read("content", {}) || {};
    c.media = c.media || {};
    const def = SETS_BY_ID[id];
    const sameAsDefault = def && JSON.stringify(clone(list)) === JSON.stringify(clone(def.items));
    if (!list || !list.length || sameAsDefault) delete c.media[id];
    else c.media[id] = clone(list);
    if (c.media && !Object.keys(c.media).length) delete c.media;
    S.write("content", c);
  }
  function reset(id) {
    if (!S) return;
    const c = S.read("content", {}) || {};
    if (c.media) { delete c.media[id]; if (!Object.keys(c.media).length) delete c.media; }
    S.write("content", c);
  }
  function resetAll() {
    if (!S) return;
    const c = S.read("content", {}) || {};
    delete c.media;
    S.write("content", c);
  }

  J.media = {
    sets: function () { return DEFAULT_SETS.map((s) => ({ id: s.id, labelKey: s.labelKey, section: s.section, single: !!s.single, gallery: !!s.gallery, galleryKey: s.galleryKey || s.labelKey })); },
    get: function (id) { return SETS_BY_ID[id] || null; },
    items: items, defItems: defItems, srcs: srcs, entries: entries, cover: cover,
    isOverridden: isOverridden, setItems: setItems, reset: reset, resetAll: resetAll,
    ROOM_COUNTS: ROOM_COUNTS
  };
})();
