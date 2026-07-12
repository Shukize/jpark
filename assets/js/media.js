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
     cover first). Only rooms still on the sequential-numbering scheme are
     listed here — the 9 rooms re-photographed 2026-07-12 (real, UUID-named
     files) use hardcoded ROOM_*_ITEMS arrays below instead (see comment near
     PREVIEW_ITEMS), since seq() can't control cover-photo order. */
  const ROOM_COUNTS = {
    "Grand Suite 1 Bedroom": 11,
    "Corner Suite": 13, "Studio Single": 13, "Studio B4": 11
  };
  function seq(folder, prefix, n) {
    const out = [];
    for (let i = 1; i <= n; i++) {
      out.push({ src: "images/" + folder + "/" + prefix + "_" + (i < 10 ? "0" + i : i) + ".jpg", video: false });
    }
    return out;
  }
  function roomItems(folder) {
    const n = ROOM_COUNTS[folder];
    return seq(folder, "room", n === undefined ? 1 : n);
  }

  /* Building 5 (J Park Hall) — Agoda ballroom/banquet/exterior photos, 4K
     AI-upscaled, files b5_01.jpg … b5_14.jpg. */
  const BUILDING5_ITEMS = seq("B5", "b5", 14);

  /* ---- the canonical sets, in the order the Gallery shows them ---- */
  const COFFEE_ITEMS = [
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

  /* Main Lobby — Agoda lobby/reception/entrance photos, 4K AI-upscaled. */
  const LOBBY_ITEMS = imgs([
    "images/Main Lobby/lobby_01.jpg",
    "images/Main Lobby/lobby_02.jpg",
    "images/Main Lobby/lobby_03.jpg",
    "images/Main Lobby/lobby_04.jpg",
    "images/Main Lobby/lobby_05.jpg",
    "images/Main Lobby/lobby_06.jpg",
    "images/Main Lobby/lobby_07.jpg",
    "images/Main Lobby/lobby_08.jpg"
  ]);

  /* Japanese Onsen (Futamata Onsen) — split men's / women's baths. Curated,
     bright finishing pass; people-free. The single ONSEN_ITEMS cover drives the
     Facilities "Japanese Onsen" card. */
  /* Onsen — Agoda hot-spring / sauna / steam-room photos, 4K AI-upscaled.
     OTA photos aren't tagged by gender, so all sit in the single Onsen Men set;
     the women's set has no OTA source and stays empty until photos are added. */
  const ONSEN_MEN_ITEMS = imgs([
    "images/Onsen Men/7103cb46-b226-4d99-90a1-c47c4fc425f5.jpg",
    "images/Onsen Men/3ce4c1f1-f0a6-4278-a1b4-a37b5638588e.jpg",
    "images/Onsen Men/4460b5ee-d428-4e64-9085-211723b517db.jpg",
    "images/Onsen Men/9799a3a7-9ddc-4cbd-873e-cc1b361587a7.jpg",
    "images/Onsen Men/caeee241-c37e-4ad3-a7e4-2f05c8d08efa.jpg",
    "images/Onsen Men/d043a556-c486-43c1-b656-31aac285cd9b.jpg",
    "images/Onsen Men/dfd0e2bd-d1af-4d76-b660-b1d86a550b31.jpg"
  ]);
  const ONSEN_WOMEN_ITEMS = imgs([]);
  const ONSEN_ITEMS = imgs(["images/Onsen Men/7103cb46-b226-4d99-90a1-c47c4fc425f5.jpg"]);

  /* Studio Single, Studio B4 and Corner Suite are Agoda OTA photos (4K
     AI-upscaled), stored as room_NN.jpg and driven by ROOM_COUNTS above. */

  /* Room photos — 2026-07-12 refresh. Real guest-room photography supplied
     directly by the owner (UUID filenames, not yet run through the AI
     upscale/renumber pass the OTA-sourced sets got). Hardcoded rather than
     ROOM_COUNTS-driven so the cover (first item) is a deliberate choice, not
     just whichever file sorts first. Deluxe/Grand Premium/Premium Suite had
     no photos before this refresh (previously "coming soon" placeholders on
     the room card); the other 6 replace a prior OTA-sourced set. */
  const DELUXE_ITEMS = imgs([
    "images/Deluxe/a3160c8e-69ce-44ff-8476-8a161345f6f0.jpg",
    "images/Deluxe/78a65474-816a-4765-9176-e2e634d16379.jpg",
    "images/Deluxe/204c3cc9-0ae1-4e70-9057-bfd93ec6224f.jpg",
    "images/Deluxe/41e208c6-fa20-4324-b407-995feced2ee3.jpg",
    "images/Deluxe/0c6ff738-1ae5-425d-969d-f140fed4850b.jpg",
    "images/Deluxe/ac7f00bb-2a06-4028-9629-ea86c4cdb49f.jpg",
    "images/Deluxe/4d01cf3d-a1ee-423b-a045-fa85b5ad8a56.jpg"
  ]);

  const PRESTIGE_SINGLE_ITEMS = imgs([
    "images/Prestige Single/5a9806cf-e0a8-4a1f-bdc8-229d23133920.jpg",
    "images/Prestige Single/0b8a9c45-7a6b-4a08-ad07-cd84f4938b8b.jpg",
    "images/Prestige Single/d1a8c592-b039-4220-b211-780bc5e08759.jpg"
  ]);

  const PRESTIGE_TWIN_ITEMS = imgs([
    "images/Prestige Twin/ddc88e21-e799-4ae8-b57d-160941f784ed.jpg",
    "images/Prestige Twin/895d01a4-d5ef-48b3-b1d8-9ab741e431f8.jpg",
    "images/Prestige Twin/2d577255-0ae1-4138-97ac-6315a2cee065.jpg"
  ]);

  const GRAND_DELUXE_ITEMS = imgs([
    "images/Grand Deluxe/6db9cfbb-15f3-4e40-b145-363e30a832ff.jpg",
    "images/Grand Deluxe/2aa62ec1-84ee-4047-910c-e6be7f69fd85.jpg",
    "images/Grand Deluxe/02477355-65c6-4b8e-a6be-55fa43d7a563.jpg",
    "images/Grand Deluxe/1b4bf117-991c-4b98-abde-e81f6ba6c07d.jpg",
    "images/Grand Deluxe/38435d64-78b1-4815-a4a4-ce1ea5f83d4a.jpg"
  ]);

  const EXEC_SUITE_ITEMS = imgs([
    "images/Executive Suite 1 Bedroom/a0bd708d-6bc9-4555-8c45-e3423002c4ba.jpg",
    "images/Executive Suite 1 Bedroom/c84f4bfd-f4d8-4d65-8397-ef73a652400e.jpg",
    "images/Executive Suite 1 Bedroom/0ea8231b-6775-449c-9f7b-b8caa2a5cdee.jpg",
    "images/Executive Suite 1 Bedroom/43c2172c-b53a-429c-a458-88e36804c36c.jpg",
    "images/Executive Suite 1 Bedroom/0f37fac2-48e3-4caf-b9b0-829b32429d96.jpg",
    "images/Executive Suite 1 Bedroom/d5840daa-96af-48e3-a59c-76a45fac6418.jpg",
    "images/Executive Suite 1 Bedroom/fe8801e6-26ce-4308-9cbb-5f431e4a7365.jpg",
    "images/Executive Suite 1 Bedroom/ed6df185-20e3-4e69-899d-5602b8d5826f.jpg",
    "images/Executive Suite 1 Bedroom/7f53f059-2b7a-49bc-8033-0cf90bea8169.jpg"
  ]);

  /* Room name stays "Premium ..." internally (folder path, set id, Google
     Hotel Ads roomTypeId source) — only guest-facing text reads "Premier". */
  const PREMIUM_SINGLE_ITEMS = imgs([
    "images/Premium Single/a953d63b-5396-49ac-b2e4-f81d7bd6d08b.jpg",
    "images/Premium Single/baeb29ed-2c9e-44ec-89f3-2dc520c69569.jpg",
    "images/Premium Single/b79beb91-5935-4374-ba5e-b2f53dea2aa7.jpg",
    "images/Premium Single/b2dfbd58-5979-4293-989d-8e062f7477df.jpg",
    "images/Premium Single/99f6bda7-b887-468d-bc03-60c51abf913b.jpg",
    "images/Premium Single/74c1e92a-e77a-4274-8b55-5ce584d622cc.jpg",
    "images/Premium Single/68a2263b-31c0-4abe-9a1f-6e05b918ad5c.jpg",
    "images/Premium Single/df142822-f9cc-441e-8726-8c2c74bd693a.jpg",
    "images/Premium Single/9c0a8b67-be04-4416-8c29-e05b0f82f87f.jpg",
    "images/Premium Single/92dc15c8-9a95-4b7a-b644-94b7b8d46c88.jpg",
    "images/Premium Single/a756a4db-9e88-46bd-a0da-c4aeeaa7a8cd.jpg",
    "images/Premium Single/bcec671d-9a5b-4e00-92d3-ea2b4e0de6f7.jpg",
    "images/Premium Single/376a09ea-ec63-41ab-8855-7971a7fe880d.jpg"
  ]);

  const PREMIUM_TWIN_ITEMS = imgs([
    "images/Premium Twin/d5deecf8-a8bc-459e-b278-178ff33f9c02.jpg",
    "images/Premium Twin/3e2ca324-c173-4425-9d30-528e60510b8a.jpg",
    "images/Premium Twin/47e924f3-7d16-4af0-a9c3-f9a4e5236038.jpg",
    "images/Premium Twin/3af540d9-4ba6-4abe-baee-abfda03aff41.jpg"
  ]);

  const PREMIUM_SUITE_ITEMS = imgs([
    "images/Premium Suite/29387af7-b51f-4a01-85a1-be9a3133886d.jpg",
    "images/Premium Suite/06b8e743-6a8f-40f3-a005-026ce5f22bad.jpg",
    "images/Premium Suite/ac4fa6d2-1d6a-4336-a83d-943d7e34cd5d.jpg",
    "images/Premium Suite/ed152643-506c-4056-8e1c-2b828d3eb20d.jpg",
    "images/Premium Suite/21fa8a12-1a95-4d27-8f1a-e2d66228338b.jpg"
  ]);

  const GRAND_PREMIUM_ITEMS = imgs([
    "images/Grand Premium/8f701fe4-d51b-43d6-b4f9-4569445b546d.jpg",
    "images/Grand Premium/d366d846-40c7-41c1-80be-446ee1c9797b.jpg",
    "images/Grand Premium/9c739d41-1d44-4f7f-a693-9e282e8e37aa.jpg",
    "images/Grand Premium/7b05ec66-9cc4-4621-9693-be2a3860646d.jpg",
    "images/Grand Premium/7dbdc80f-beff-45ec-9995-7363342c1b63.jpg"
  ]);

  const HERO_ITEMS = imgs(["images/Tropical Pool/ffcc842a-2003-4239-ae74-0e6c0b10f883.jpg"]);
  const ABOUT_MAIN_ITEMS = imgs(["images/Tropical Pool/ce70057e-42f0-4b44-9f67-18598f22ff3a.jpg"]);
  const ABOUT_SUB_ITEMS = imgs(["images/Tropical Pool/c3ac1733-933b-49de-aa10-7185a21dbe5f.jpg"]);

  const PREVIEW_ITEMS = imgs([
    "images/Tropical Pool/c917232b-159a-4fdc-bc20-12e806f5304b.jpg",
    "images/45c09cb7-8ba5-4ba0-bc3c-42837ef10bf2.jpg",
    "images/Grand Suite 1 Bedroom/room_01.jpg",
    "images/ea770736-fe38-4c3e-b072-4928f8a2fad9.jpg",
    "images/Corner Suite/room_01.jpg",
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
    { id: "room:Studio Single",   labelKey: "rooms.studioSingleName",  section: "rooms", gallery: true, items: roomItems("Studio Single") },
    { id: "room:Prestige Single", labelKey: "rooms.prestigeSingleName", section: "rooms", gallery: true, items: PRESTIGE_SINGLE_ITEMS },
    { id: "room:Prestige Twin",   labelKey: "rooms.prestigeTwinName",  section: "rooms", gallery: true, items: PRESTIGE_TWIN_ITEMS },
    { id: "room:Studio B4",       labelKey: "rooms.studioB4Name",      section: "rooms", gallery: true, items: roomItems("Studio B4") },
    { id: "room:Deluxe",          labelKey: "rooms.deluxeName",        section: "rooms", gallery: true, items: DELUXE_ITEMS },
    { id: "room:Premium Single",  labelKey: "rooms.premiumSingleName", section: "rooms", gallery: true, items: PREMIUM_SINGLE_ITEMS },
    { id: "room:Premium Twin",    labelKey: "rooms.premiumTwinName",   section: "rooms", gallery: true, items: PREMIUM_TWIN_ITEMS },
    { id: "room:Grand Premium",   labelKey: "rooms.grandPremiumName",  section: "rooms", gallery: true, items: GRAND_PREMIUM_ITEMS },
    { id: "room:Corner Suite",    labelKey: "rooms.cornerName",        section: "rooms", gallery: true, items: roomItems("Corner Suite") },
    { id: "room:Grand Deluxe",    labelKey: "rooms.grandDeluxeName",   section: "rooms", gallery: true, items: GRAND_DELUXE_ITEMS },
    { id: "room:Executive Suite 1 Bedroom", labelKey: "rooms.execSuite1brName", section: "rooms", gallery: true, items: EXEC_SUITE_ITEMS },
    { id: "room:Premium Suite",   labelKey: "rooms.premiumSuiteName",  section: "rooms", gallery: true, items: PREMIUM_SUITE_ITEMS },
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
