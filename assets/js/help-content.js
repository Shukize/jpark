/* ============================================================
   J Park Hotel — Help & Guide content
   ------------------------------------------------------------
   The words of the in-console handbook, in all five site
   languages. assets/js/help.js turns this into the Help page.

   Shape:
     JPARK_HELP[lang] = {
       ui:       { …labels for the guide's own chrome… },
       sections: [ { id, ico, admin?, title, intro,
                     steps:  [ { t: "Do this", d: "…how…" } ],
                     tips?:  [ "…" ],
                     warn?:  "…the one thing not to get wrong…" } ]
     }

   RULES FOR EDITING
   • Section ids are shared across languages — keep them identical
     or the language switch will lose the reader's place, and the
     per-panel "?" buttons will stop finding their section.
   • admin:true hides the section from non-admin accounts.
   • Write short. This is read standing at a front desk, mid-shift,
     by someone who would rather be doing the job than reading.
   ============================================================ */
window.JPARK_HELP = (function () {
  "use strict";

  /* =====================  ENGLISH  ===================== */
  const en = {
    ui: {
      nav: "Help & Guide",
      title: "Help & Guide",
      subStaff: "Everything on your dashboard, explained step by step.",
      subAdmin: "Everything on your dashboard, explained step by step — including the administrator-only tools.",
      toc: "Contents",
      searchPh: "Search the guide…",
      noMatch: "Nothing in the guide matches that. Try a shorter word.",
      listen: "Listen",
      stop: "Stop",
      print: "Print / Save as PDF",
      adminBadge: "Administrators only",
      top: "Back to contents",
      noVoice: "This device has no voice for the current language, so read-aloud isn't available here.",
      openHint: "Open the guide for this page",
      steps: "Steps",
      tipTitle: "Good to know",
      warnTitle: "Careful",
      readingTime: "About {n} min to read",
      newBadge: "New"
    },
    sections: [
      {
        id: "start", ico: "🚀", title: "Getting started",
        intro: "How to get into the console and set your account up. You only do most of this once.",
        steps: [
          { t: "Open the staff page", d: "Go to the hotel website and click Staff Login at the very bottom. Save the page to your favourites so you never have to look for it again." },
          { t: "First time? Click New Staff Account", d: "Type the username your administrator gave you and the temporary password jparkhotel. Then choose your own password (6 characters or more) and click Save & sign in." },
          { t: "After that, just sign in", d: "Type your username and password, then click Sign in." },
          { t: "Forgot your password?", d: "Click Forgot Password on the login screen. It sends a request to an administrator, who will give you a new temporary password." },
          { t: "Forgot your username?", d: "Click Forgot Username, type your full name and send. An administrator will tell you what it is." },
          { t: "Choose your language", d: "The dropdown at the bottom of the login card — and at the bottom-left of the dashboard — switches everything on screen between Thai, English, Japanese, 简体中文 and 繁體中文. Your choice is remembered on this device." },
          { t: "Add your photo, change your password", d: "On the dashboard, click your round picture at the bottom-left. You can upload a photo and change your password there at any time." },
          { t: "Sign out when you finish", d: "Click Sign out at the bottom-left. On a shared front-desk computer, always sign out at the end of your shift." }
        ],
        tips: [
          "You can stay signed in on up to 6 devices. A 7th sign-in automatically ends the oldest one.",
          "Never share your password — everything you do is recorded under your name."
        ],
        warn: "The temporary password jparkhotel works for the first sign-in only. After that, only your own password works."
      },
      {
        id: "tour", ico: "🧭", title: "Your dashboard at a glance",
        intro: "One screen with a menu down the left. Click a menu item to change page — nothing is lost when you switch.",
        steps: [
          { t: "The left menu", d: "🛎️ Requests, 💬 Live Chat, ✉️ Messages and 🪪 Team Status. Administrators also see Site Editor, Staff, Maintenance and Account Logs." },
          { t: "The gold numbers", d: "A number beside a menu item means work still open: unfinished guest requests, your unread chats, unread mail and new bookings." },
          { t: "The flashing !", d: "A blinking ! beside Requests means a guest request nobody has read yet. It stops once you open the Requests page and look at it for a few seconds." },
          { t: "The chime", d: "A short sound plays for every new request, new chat message and new booking. If nobody picks it up, it chimes again every couple of minutes." },
          { t: "The browser tab", d: "The tab shows 🔔 and a number whenever something is waiting, so you can tell even while looking at another tab." },
          { t: "It updates itself", d: "You never need to refresh the page. New requests, chats and bookings appear on their own every few seconds." }
        ],
        tips: [
          "If you hear no chime, click once anywhere on the page — browsers block sound until you do.",
          "Keep the console open in its own browser tab for your whole shift."
        ]
      },
      {
        id: "requests", ico: "🛎️", title: "Guest requests",
        intro: "This is the main job. Everything a guest asks for from their phone lands here. Work from the top down — the guest who has waited longest is always first.",
        steps: [
          { t: "Read the card", d: "Each card shows the room number, the building, the room type, what was asked for, and how long the guest has been waiting." },
          { t: "Watch the waiting time", d: "Under 10 minutes is normal. Orange means over 10 minutes. Red means over 20 minutes — do that one next." },
          { t: "Take the job", d: "Click Take so the team can see you are handling it; the card changes to “You are handling this”. Click Release if it turns out you can't." },
          { t: "Start, then Complete", d: "Click Start when you begin and Complete when it's done. The guest watches the status change on their phone." },
          { t: "Filter what you see", d: "The first row of buttons filters by status — All, Pending, In progress, Completed, Dismissed. The second row filters by department — Housekeeping, Maintenance, Dining, Front Desk." },
          { t: "Find one fast", d: "Type a room number, a guest's surname or a booking reference into the search box at the top." },
          { t: "Leave a note for the team", d: "Click Note to write something only staff can see — “towels left at the door”, for example." },
          { t: "Talk to the guest", d: "Click 💬 Remarks to write to the guest about this exact request; they see it in their chat. Full chat opens their whole conversation." },
          { t: "Not real work?", d: "Click 🧪 Mark as test for something a colleague filed while practising — it stays on record but stops counting and stops the alerts. Click Dismiss for a request that shouldn't be actioned; it moves to the Dismissed tab and can be put back." },
          { t: "Handle several at once", d: "Click Select, tick the cards you want, then use the bar at the top to complete, mark as test or dismiss them together." }
        ],
        tips: [
          "🔶 Unconfirmed beside a name means we couldn't match the guest to a booking. Still help them — just check the register first.",
          "A room number only appears once the front desk has assigned one to that booking.",
          "Only administrators see the 🗑 delete button. Staff use Dismiss instead, so nothing is ever lost."
        ]
      },
      {
        id: "guest", ico: "🔎", title: "Who is this guest?",
        intro: "Click any guest's name — on a request card or at the top of a chat — and a panel slides in from the right with everything we know about them.",
        steps: [
          { t: "Open it", d: "Click the guest's name. Click ✕, or anywhere outside the panel, to close it." },
          { t: "Read the booking", d: "Name, booking reference, room number and type, check-in and check-out dates, number of nights, and whether they booked with us directly or through Agoda / Booking.com." },
          { t: "No booking matched?", d: "Type their surname, room or reference into the search box, then click the right reservation to link it. From then on their requests show the correct room and building." },
          { t: "Set the building", d: "If we know the room but not the building, choose it here so housekeeping knows where to walk." },
          { t: "See their other jobs", d: "“Also waiting on” lists everything else this guest has asked for, so you can carry it all in one trip." }
        ],
        tips: ["Linking a booking fixes it everywhere at once — this request, their chat, and every request they send afterwards."]
      },
      {
        id: "chat", ico: "💬", title: "Live chat",
        intro: "Guests message the hotel from the website. Conversations are listed on the left, the conversation itself opens on the right.",
        steps: [
          { t: "Pick a conversation", d: "Click one on the left. A dot beside the name means unread messages for you." },
          { t: "Check who it is", d: "The mark beside the name says whether it's a confirmed guest, 🔶 Unconfirmed (they gave a name and room we couldn't match), or a website visitor who isn't staying." },
          { t: "Confirm a real guest", d: "If they truly are staying — an Agoda arrival or a walk-in — check the register, then click Confirm guest. Your name is recorded against it." },
          { t: "One person answers", d: "A chat belongs to whoever it's connected to. If it says “Connected to” someone else you can read but not type. Click Take over chat if they're on break." },
          { t: "Reply", d: "Type in the box at the bottom and press Enter. The guest sees it straight away." },
          { t: "Different languages are fine", d: "The header shows the guest's language and their messages are translated for you automatically. Just write in your own language." },
          { t: "Tidy the list", d: "📌 pins an important conversation to the top, ✎ renames it, 🗑️ deletes it — deleting cannot be undone." },
          { t: "Filter", d: "All / Guests / Visitors, so you can answer real guests first." }
        ],
        tips: ["Replying to a chat nobody owns automatically connects it to you."]
      },
      {
        id: "messages", ico: "✉️", title: "Messages (internal mail)",
        intro: "The hotel's own mailbox — like email, but inside the console. It also holds every new booking.",
        steps: [
          { t: "Inbox", d: "Messages colleagues have sent you. Click one to read it." },
          { t: "Write one", d: "Click ✏️ Compose, start typing a name in the To box, add a subject, write the message and press Send." },
          { t: "Reply, Forward, Star", d: "Reply answers the sender, Forward passes it on, and ⭐ Star keeps it in the Starred folder so you can find it again." },
          { t: "Announcements", d: "📢 Notices from administrators to the whole team. Read these at the start of every shift." },
          { t: "Guest Booking", d: "🛎️ Every new reservation lands here — see the next section." },
          { t: "Trash", d: "🗑️ Deleted messages are kept for 30 days, then removed for good. Restore puts one back." },
          { t: "Report a message", d: "If a message is inappropriate, click Report and an administrator will see it." }
        ],
        tips: ["Staff can send to up to 10 people at once; administrators can send to everybody."]
      },
      {
        id: "bookings", ico: "🧾", title: "Guest bookings",
        intro: "Messages → 🛎️ Guest Booking. Every reservation made on the website, newest first.",
        steps: [
          { t: "Open a booking", d: "Click a row to see the guest's name and contact details, dates, room, price and how they are paying." },
          { t: "Assign the room number at check-in", d: "Type the real room number (e.g. 204) and save. Do this every time — it's how the guest reaches Guest Services, and how their requests show which room to walk to." },
          { t: "Record the payment", d: "Guests who chose pay at check-in show “Awaiting payment”. When they pay at the desk, click Mark payment received." },
          { t: "Resend the confirmation", d: "Click Resend confirmation. You can correct the wording or a wrong price before it goes out." },
          { t: "Special requests", d: "Add or edit something the guest asked for, then resend the confirmation so it shows on their copy." },
          { t: "Cancel a booking", d: "Click Cancel booking and give a reason — the reason is staff-only and the guest never sees it. They get a cancellation email. Reopen puts the booking back if those dates are still free." },
          { t: "Bookings with several rooms", d: "These show “Room 1 of 3” and a grand total. Cancel whole booking cancels every room at once and sends the guest one email." },
          { t: "Find and organise", d: "Search by name, reference or room. ⭐ Star the important ones. Staff label adds a private note such as “VIP — call before arrival”." },
          { t: "Check what was emailed", d: "Sent Emails lists every message the system sent for this booking and whether it arrived." }
        ],
        tips: ["A booking marked Needs review couldn't be read automatically — open it and fill in the missing details."],
        warn: "Cancel can be undone. Delete (administrators only) cannot — if in doubt, use Cancel."
      },
      {
        id: "roster", ico: "🪪", title: "Team status",
        intro: "Who is on shift right now. Front desk: it’s 🪪 Team Status in the menu. Administrators: it’s at the top of the 👥 Staff page, above the accounts.",
        steps: [
          { t: "Read the board", d: "One card per team member with their name, role, shift times and whether they are On shift, On break or Off shift." },
          { t: "It follows the clock", d: "On shift and Off shift update themselves from the shift times. On break is set by hand." },
          { t: "Refresh", d: "Click Refresh if the board looks out of date." }
        ],
        tips: ["Only administrators see the Edit button for changing someone's role, shift or status."]
      },
      {
        id: "daily", ico: "✅", title: "Your shift, step by step",
        intro: "If you're not sure where to start, work through this in order.",
        steps: [
          { t: "1. Sign in and read Announcements", d: "Messages → 📢 Announcements. The newest notices are at the top." },
          { t: "2. Clear the Requests board", d: "Work from the top down. Take → Start → Complete." },
          { t: "3. Answer the chats", d: "Live Chat, guests before visitors." },
          { t: "4. Check the new bookings", d: "Messages → 🛎️ Guest Booking. Assign room numbers for today's arrivals." },
          { t: "5. Record payments at check-in", d: "Click Mark payment received as each guest pays." },
          { t: "6. Keep the tab open", d: "Leave the console open so you hear the chime for anything new." },
          { t: "7. Before you leave", d: "Complete or Release anything you took, then Sign out." }
        ]
      },
      {
        id: "trouble", ico: "🩺", title: "When something goes wrong",
        intro: "The usual problems, and the quickest way out of each.",
        steps: [
          { t: "I can't sign in", d: "Check for capital letters and stray spaces. Still stuck? Click Forgot Password on the login screen." },
          { t: "It says my account is suspended", d: "An administrator switched it off. Ask them to activate it again." },
          { t: "I got signed out on my own", d: "Sessions end after a while for security. Just sign in again — nothing is lost." },
          { t: "There's no sound", d: "Click once anywhere on the page, then check the computer's volume." },
          { t: "It says it can't reach the hotel system", d: "The internet or the server is down. Wait a minute and try again; anything you typed is kept." },
          { t: "A guest has no room number", d: "Nobody has assigned one yet. Messages → Guest Booking → open the booking → Assign room." },
          { t: "I can't type in a chat", d: "The chat is connected to someone else. Click Take over chat." },
          { t: "I clicked Complete by mistake", d: "Open the card and click Reopen." },
          { t: "I dismissed something by mistake", d: "Switch to the Dismissed filter and click Put back." },
          { t: "Everything is in the wrong language", d: "Use the dropdown at the bottom-left of the menu." }
        ]
      },
      {
        id: "glossary", ico: "📖", title: "Words you'll see",
        intro: "Short meanings for the words on screen.",
        steps: [
          { t: "Pending", d: "Nobody has started it yet." },
          { t: "In progress", d: "Someone is doing it right now." },
          { t: "Completed", d: "Finished." },
          { t: "Dismissed", d: "Set aside, not actioned. Can be put back." },
          { t: "Test", d: "A practice request. Kept on record, but doesn't count as work and doesn't set off alerts." },
          { t: "Unconfirmed 🔶", d: "We couldn't match this person to a booking." },
          { t: "Visitor", d: "Someone on the website who isn't staying with us." },
          { t: "Direct (Website)", d: "Booked on our own website." },
          { t: "OTA", d: "Booked through Agoda, Booking.com, Airbnb or similar." },
          { t: "Reference", d: "The booking's code, e.g. JP-1001." },
          { t: "Day-use", d: "A 3-hour stay with no overnight." },
          { t: "Prepayment", d: "Paid online before arrival, and non-refundable." },
          { t: "Pay at check-in", d: "Pays at the front desk on arrival." }
        ]
      },
      {
        id: "site", ico: "🛠️", admin: true, title: "Site Editor",
        intro: "Change the public website yourself — words, photos, colours and which sections show. Everything saves as soon as you click away, and the live site updates immediately.",
        steps: [
          { t: "Website text", d: "Choose the Editing language, then find the words with the search box or by scrolling the groups. Click a field, change it, click away — it saves and shows “Saved ✓”." },
          { t: "It translates itself", d: "Change text in one language and the other four are translated automatically, so nothing is left in the wrong language. You can still fine-tune any language by hand afterwards." },
          { t: "Photos & videos", d: "Open a section to add, replace, reorder or remove photos. Upload from the computer (under 4 MB) or paste a link. The first photo is that section's cover." },
          { t: "Colours", d: "Pick new brand colours and the whole site restyles instantly. Reset colours puts them back." },
          { t: "Sections", d: "Tick sections on or off to show or hide them, post an announcement banner across the top of the site, and switch room types or day-use buildings off while they're unavailable." },
          { t: "Previous edits", d: "Every change to the site, with who made it and when. Newest first." },
          { t: "Undo", d: "Every field has its own Reset, and Undo all my edits at the bottom of the Sections tab restores all text, photos and colours." }
        ],
        tips: ["Open the website in a second browser tab beside this one — your edits appear there as you save."],
        warn: "The Rates tab does not work like the others — read the next section before touching it."
      },
      {
        id: "rates", ico: "💰", admin: true, title: "Rates — read this first",
        intro: "Site Editor → Rates is the one place where a change costs real money. There is no draft, no preview and no undo: the moment you click Save rates, the next guest is charged the new price.",
        steps: [
          { t: "What you can change", d: "Room-only and with-breakfast prices for each room type and bed configuration, in Baht per night." },
          { t: "Extra-guest charges", d: "Extra bed per night, extra breakfast per guest per night, and the child breakfast rate for ages 5–8 (0–4 free, 9 and over pay the adult rate)." },
          { t: "Day-use rates", d: "The 3-hour stay prices, per building." },
          { t: "Save", d: "Click Save rates. Check the number twice before you do." }
        ],
        warn: "There is no “Undo all my edits” for rates. Write the old price down before you change it."
      },
      {
        id: "team", ico: "👥", admin: true, title: "Staff accounts",
        intro: "Add people, decide what they can do, and get them back in when they’re locked out. The Team Status board sits at the top of this page, so you can see who is on shift and change their account without leaving it.",
        steps: [
          { t: "Add someone", d: "Type their full name — the username is created for you (first initial + surname). Choose Staff or Administrator, then click Add staff member." },
          { t: "Tell them how to start", d: "They open the login page, click New Staff Account, use their username with the password jparkhotel, and choose their own password." },
          { t: "Staff or Administrator?", d: "Staff handle requests, chats, messages and bookings. Administrators do all of that plus the Site Editor, rates, staff accounts, maintenance and account logs." },
          { t: "Suspend or remove", d: "Suspend blocks sign-in but keeps the account; Remove deletes it. Neither happens until you click Save changes — Undo cancels them." },
          { t: "Password reset requests", d: "Messages → 🔑 Password Reset Requests. Click Reset password, then read the new temporary password out to the employee — it is shown once only." }
        ],
        tips: ["You can't lock yourself out — your own account is marked “You” and cannot be removed."]
      },
      {
        id: "maintenance", ico: "🚧", admin: true, title: "Maintenance & payment policy",
        intro: "Two switches that change what guests can do on the website. Both ask you to confirm, then take effect immediately.",
        steps: [
          { t: "Maintenance mode", d: "Switch it on and guests see a maintenance notice instead of the website. Staff can still sign in here. Use it while something is being fixed." },
          { t: "Require prepayment", d: "Switch it on for holidays and peak periods: guests can no longer choose “pay at check-in”, so every new booking pays online and becomes non-refundable. Switch it off when the hotel is quiet." },
          { t: "Check the note underneath", d: "If online card / PromptPay payment isn't switched on for the hotel yet, the page tells you — and the prepayment switch has no effect until it is." }
        ]
      },
      {
        id: "logs", ico: "🛡️", admin: true, title: "Account logs & security",
        intro: "Every staff sign-in, with the device, roughly where it was, and whether that person is online right now.",
        steps: [
          { t: "Read the list", d: "Who signed in, from what device and place, when they were last active, and Online or Offline. Your own session is marked “This is you”." },
          { t: "Sign out a device", d: "Click Sign out on a session — useful for a lost phone, or a computer someone left signed in." },
          { t: "Sign out everything from one place", d: "Sign out all (n) ends every session from that address at once." },
          { t: "Ban an address", d: "Ban IP blocks an address and signs out its sessions immediately. Unban removes the block." }
        ],
        tips: ["Everyone can be signed in on up to 6 devices; a 7th sign-in ends the oldest one automatically."],
        warn: "The hotel's Wi-Fi shares a single address, so banning it can lock out real guests and your own staff. Only ban an address you are sure about."
      }
    ]
  };

  /* =====================  ไทย  ===================== */
  const th = {
    ui: {
      nav: "คู่มือการใช้งาน",
      title: "คู่มือการใช้งาน",
      subStaff: "อธิบายทุกอย่างบนหน้าจอของคุณ ทีละขั้นตอน",
      subAdmin: "อธิบายทุกอย่างบนหน้าจอของคุณ ทีละขั้นตอน รวมถึงเครื่องมือที่มีเฉพาะผู้ดูแลระบบ",
      toc: "สารบัญ",
      searchPh: "ค้นหาในคู่มือ…",
      noMatch: "ไม่พบคำนี้ในคู่มือ ลองพิมพ์คำที่สั้นลง",
      listen: "ฟังเสียงอ่าน",
      stop: "หยุด",
      print: "พิมพ์ / บันทึกเป็น PDF",
      adminBadge: "เฉพาะผู้ดูแลระบบ",
      top: "กลับไปสารบัญ",
      noVoice: "เครื่องนี้ไม่มีเสียงอ่านสำหรับภาษาที่เลือกอยู่ จึงใช้ฟังเสียงอ่านไม่ได้",
      openHint: "เปิดคู่มือของหน้านี้",
      steps: "ขั้นตอน",
      tipTitle: "ควรรู้ไว้",
      warnTitle: "ระวัง",
      readingTime: "อ่านประมาณ {n} นาที",
      newBadge: "ใหม่"
    },
    sections: [
      {
        id: "start", ico: "🚀", title: "เริ่มต้นใช้งาน",
        intro: "วิธีเข้าระบบและตั้งค่าบัญชีของคุณ ส่วนใหญ่ทำแค่ครั้งเดียวตอนแรก",
        steps: [
          { t: "เปิดหน้าสำหรับพนักงาน", d: "เข้าเว็บไซต์โรงแรม แล้วกด “เข้าสู่ระบบพนักงาน” ที่ด้านล่างสุดของหน้า แนะนำให้บันทึกหน้านี้ไว้ในรายการโปรด จะได้ไม่ต้องหาใหม่ทุกครั้ง" },
          { t: "ใช้ครั้งแรก ให้กด “บัญชีพนักงานใหม่”", d: "พิมพ์ชื่อผู้ใช้ที่ผู้ดูแลระบบให้มา และรหัสผ่านชั่วคราว jparkhotel จากนั้นตั้งรหัสผ่านของตัวเอง (อย่างน้อย 6 ตัวอักษร) แล้วกด “บันทึกและเข้าสู่ระบบ”" },
          { t: "ครั้งต่อไปก็เข้าสู่ระบบตามปกติ", d: "พิมพ์ชื่อผู้ใช้และรหัสผ่านของคุณ แล้วกด “เข้าสู่ระบบ”" },
          { t: "ลืมรหัสผ่าน?", d: "กด “ลืมรหัสผ่าน” ที่หน้าเข้าสู่ระบบ ระบบจะส่งคำขอไปหาผู้ดูแลระบบ แล้วผู้ดูแลจะให้รหัสผ่านชั่วคราวใหม่กับคุณ" },
          { t: "ลืมชื่อผู้ใช้?", d: "กด “ลืมชื่อผู้ใช้” พิมพ์ชื่อ-นามสกุลของคุณ แล้วส่ง ผู้ดูแลระบบจะแจ้งชื่อผู้ใช้ให้ทราบ" },
          { t: "เลือกภาษา", d: "ช่องเลือกภาษาอยู่ใต้กล่องเข้าสู่ระบบ และอยู่มุมล่างซ้ายของหน้าจอหลัก เลือกได้ทั้งไทย อังกฤษ ญี่ปุ่น จีนตัวย่อ และจีนตัวเต็ม ทั้งหน้าจอจะเปลี่ยนตาม และเครื่องนี้จะจำภาษาที่คุณเลือกไว้" },
          { t: "ใส่รูปโปรไฟล์และเปลี่ยนรหัสผ่าน", d: "ที่หน้าจอหลัก กดรูปวงกลมมุมล่างซ้าย จะอัปโหลดรูปหรือเปลี่ยนรหัสผ่านเมื่อไหร่ก็ได้" },
          { t: "ออกจากระบบเมื่อเลิกงาน", d: "กด “ออกจากระบบ” มุมล่างซ้าย ถ้าเป็นเครื่องส่วนกลางที่เคาน์เตอร์ ต้องออกจากระบบทุกครั้งเมื่อหมดกะ" }
        ],
        tips: [
          "เข้าระบบค้างไว้ได้พร้อมกันไม่เกิน 6 เครื่อง ถ้าเข้าเครื่องที่ 7 ระบบจะตัดเครื่องที่เก่าที่สุดออกอัตโนมัติ",
          "อย่าบอกรหัสผ่านให้ใคร ทุกอย่างที่ทำในระบบถูกบันทึกไว้ในชื่อของคุณ"
        ],
        warn: "รหัสผ่านชั่วคราว jparkhotel ใช้ได้แค่ตอนเข้าครั้งแรกครั้งเดียว หลังจากนั้นต้องใช้รหัสผ่านของคุณเองเท่านั้น"
      },
      {
        id: "tour", ico: "🧭", title: "แนะนำหน้าจอหลัก",
        intro: "หน้าจอเดียว มีเมนูอยู่ทางซ้าย กดเมนูเพื่อสลับหน้า สลับไปมาได้เลย ข้อมูลไม่หาย",
        steps: [
          { t: "เมนูทางซ้าย", d: "🛎️ คำขอจากผู้เข้าพัก, 💬 แชทสด, ✉️ ข้อความ และ 🪪 สถานะทีมงาน ผู้ดูแลระบบจะเห็นเพิ่มอีกคือ แก้ไขเว็บไซต์ พนักงาน โหมดปิดปรับปรุง และบันทึกการเข้าใช้งาน" },
          { t: "ตัวเลขสีทอง", d: "ตัวเลขข้างเมนูคือ “งานที่ยังค้าง” เช่น คำขอที่ยังไม่เสร็จ แชทที่คุณยังไม่อ่าน จดหมายที่ยังไม่เปิด และการจองใหม่" },
          { t: "เครื่องหมาย ! ที่กะพริบ", d: "! กะพริบข้างเมนูคำขอ แปลว่ามีคำขอที่ยังไม่มีใครเปิดอ่าน จะหยุดกะพริบเมื่อคุณเปิดหน้าคำขอค้างไว้สักครู่" },
          { t: "เสียงเตือน", d: "จะมีเสียงสั้น ๆ ทุกครั้งที่มีคำขอใหม่ ข้อความแชทใหม่ หรือการจองใหม่ ถ้ายังไม่มีใครรับงาน ระบบจะเตือนซ้ำทุก ๆ สองสามนาที" },
          { t: "แท็บของเบราว์เซอร์", d: "ถ้ามีงานค้าง แท็บด้านบนจะขึ้น 🔔 พร้อมตัวเลข ทำให้รู้ได้แม้กำลังเปิดแท็บอื่นอยู่" },
          { t: "อัปเดตให้เอง", d: "ไม่ต้องกดรีเฟรช คำขอ แชท และการจองใหม่จะขึ้นมาเองทุกไม่กี่วินาที" }
        ],
        tips: [
          "ถ้าไม่ได้ยินเสียงเตือน ให้กดตรงไหนก็ได้บนหน้าจอหนึ่งครั้ง เบราว์เซอร์จะบล็อกเสียงไว้จนกว่าจะมีการกด",
          "เปิดหน้าจอนี้ค้างไว้ในแท็บของตัวเองตลอดกะ"
        ]
      },
      {
        id: "requests", ico: "🛎️", title: "คำขอจากผู้เข้าพัก",
        intro: "นี่คืองานหลัก ทุกอย่างที่ผู้เข้าพักกดขอจากมือถือจะมาโผล่ที่นี่ ทำจากบนลงล่าง คนที่รอนานที่สุดจะอยู่บนสุดเสมอ",
        steps: [
          { t: "อ่านการ์ด", d: "แต่ละใบจะบอกเลขห้อง อาคาร ประเภทห้อง สิ่งที่ขอ และรอมานานเท่าไหร่แล้ว" },
          { t: "ดูเวลาที่รอ", d: "ไม่เกิน 10 นาทีถือว่าปกติ สีส้มคือเกิน 10 นาที สีแดงคือเกิน 20 นาที ให้รีบทำใบนั้นก่อน" },
          { t: "รับงาน", d: "กด “รับงาน” เพื่อให้เพื่อนร่วมทีมเห็นว่าคุณกำลังทำอยู่ การ์ดจะเปลี่ยนเป็น “คุณกำลังดูแลงานนี้” ถ้าทำไม่ได้แล้วให้กด “ปล่อยงาน”" },
          { t: "กดเริ่ม แล้วกดเสร็จสิ้น", d: "กด “เริ่ม” ตอนลงมือทำ และกด “เสร็จสิ้น” เมื่อทำเสร็จ ผู้เข้าพักจะเห็นสถานะเปลี่ยนบนมือถือของเขาทันที" },
          { t: "กรองสิ่งที่อยากเห็น", d: "แถวปุ่มแรกกรองตามสถานะ — ทั้งหมด, รอดำเนินการ, กำลังดำเนินการ, เสร็จสิ้น, ปิดคำขอแล้ว แถวที่สองกรองตามแผนก — แม่บ้าน, ซ่อมบำรุง, อาหารและเครื่องดื่ม, แผนกต้อนรับ" },
          { t: "ค้นหาให้เจอเร็ว", d: "พิมพ์เลขห้อง นามสกุลผู้เข้าพัก หรือรหัสการจอง ลงในช่องค้นหาด้านบน" },
          { t: "ฝากบันทึกถึงทีม", d: "กด “บันทึก” เพื่อเขียนข้อความที่เห็นเฉพาะพนักงาน เช่น “วางผ้าเช็ดตัวไว้หน้าห้องแล้ว”" },
          { t: "คุยกับผู้เข้าพัก", d: "กด 💬 “ข้อความ” เพื่อคุยกับผู้เข้าพักเรื่องคำขอใบนี้โดยเฉพาะ เขาจะเห็นในแชทของเขา ส่วน “แชทเต็ม” จะเปิดบทสนทนาทั้งหมด" },
          { t: "ไม่ใช่งานจริงใช่ไหม?", d: "ถ้าเป็นรายการที่เพื่อนกดทดลองไว้ ให้กด 🧪 “ทำเครื่องหมายว่าทดสอบ” รายการจะยังอยู่ในระบบแต่ไม่นับเป็นงานและไม่ส่งเสียงเตือน ส่วน “ปิดคำขอ” ใช้กับคำขอที่ไม่ต้องทำ รายการจะย้ายไปแท็บ “ปิดคำขอแล้ว” และดึงกลับมาได้" },
          { t: "ทำหลายรายการพร้อมกัน", d: "กด “เลือก” ติ๊กการ์ดที่ต้องการ แล้วใช้แถบด้านบนสั่งเสร็จสิ้น ทำเครื่องหมายว่าทดสอบ หรือยกเลิกทีเดียวหลายใบ" }
        ],
        tips: [
          "🔶 “ยังไม่ยืนยัน” ข้างชื่อ แปลว่าระบบจับคู่กับการจองไม่ได้ ให้ช่วยเหลือตามปกติ แต่เช็กทะเบียนผู้เข้าพักก่อน",
          "เลขห้องจะขึ้นก็ต่อเมื่อแผนกต้อนรับกำหนดห้องให้การจองนั้นแล้ว",
          "ปุ่มถังขยะ 🗑 มีเฉพาะผู้ดูแลระบบ พนักงานให้ใช้ “ปิดคำขอ” แทน ข้อมูลจะไม่หายไปไหน"
        ]
      },
      {
        id: "guest", ico: "🔎", title: "ผู้เข้าพักคนนี้คือใคร",
        intro: "กดที่ชื่อผู้เข้าพัก ไม่ว่าจะบนการ์ดคำขอหรือด้านบนของแชท จะมีแผงข้อมูลเลื่อนออกมาทางขวา บอกทุกอย่างที่เรารู้เกี่ยวกับเขา",
        steps: [
          { t: "เปิดดู", d: "กดที่ชื่อผู้เข้าพัก ปิดโดยกด ✕ หรือกดนอกแผง" },
          { t: "อ่านข้อมูลการจอง", d: "ชื่อ รหัสการจอง เลขห้องและประเภทห้อง วันเช็กอิน-เช็กเอาต์ จำนวนคืน และจองตรงกับเราหรือจองผ่าน Agoda / Booking.com" },
          { t: "ถ้าไม่พบการจองที่ตรงกัน", d: "พิมพ์นามสกุล เลขห้อง หรือรหัสการจอง ลงในช่องค้นหา แล้วกดเลือกการจองที่ถูกต้องเพื่อผูกเข้าด้วยกัน จากนั้นคำขอของเขาจะแสดงห้องและอาคารที่ถูกต้อง" },
          { t: "ระบุอาคาร", d: "ถ้ารู้เลขห้องแต่ยังไม่รู้อาคาร ให้เลือกอาคารตรงนี้ แม่บ้านจะได้รู้ว่าต้องไปตึกไหน" },
          { t: "ดูงานอื่นของเขา", d: "หัวข้อ “รอดำเนินการอยู่ด้วย” จะบอกว่าผู้เข้าพักคนนี้ขออะไรไว้อีกบ้าง จะได้ถือไปให้ครบในรอบเดียว" }
        ],
        tips: ["ผูกการจองครั้งเดียว แก้ให้ถูกต้องทั้งหมดในทีเดียว ทั้งคำขอใบนี้ แชทของเขา และคำขอที่เขาจะส่งมาในครั้งต่อ ๆ ไป"]
      },
      {
        id: "chat", ico: "💬", title: "แชทสด",
        intro: "ผู้เข้าพักทักมาหาโรงแรมผ่านหน้าเว็บไซต์ รายชื่อบทสนทนาอยู่ทางซ้าย ตัวบทสนทนาจะเปิดทางขวา",
        steps: [
          { t: "เลือกบทสนทนา", d: "กดรายชื่อทางซ้าย ถ้ามีจุดข้างชื่อ แปลว่ามีข้อความที่คุณยังไม่ได้อ่าน" },
          { t: "ดูก่อนว่าเป็นใคร", d: "เครื่องหมายข้างชื่อจะบอกว่าเป็นผู้เข้าพักที่ยืนยันแล้ว, 🔶 ยังไม่ยืนยัน (ให้ชื่อกับเลขห้องมาแต่จับคู่ไม่ได้) หรือเป็นผู้เยี่ยมชมเว็บไซต์ที่ไม่ได้พักกับเรา" },
          { t: "ยืนยันว่าเป็นผู้เข้าพักจริง", d: "ถ้าเขาพักกับเราจริง เช่น จองผ่าน Agoda หรือ walk-in ให้เช็กทะเบียนก่อน แล้วกด “ยืนยันผู้เข้าพัก” ระบบจะบันทึกชื่อคุณไว้ว่าเป็นคนยืนยัน" },
          { t: "ตอบคนเดียวพอ", d: "แชทหนึ่งห้องเป็นของคนที่เชื่อมต่ออยู่ ถ้าขึ้นว่า “เชื่อมต่อกับ” ชื่อคนอื่น คุณจะอ่านได้แต่พิมพ์ไม่ได้ ถ้าเขาพักเบรกอยู่ ให้กด “รับช่วงแชท”" },
          { t: "ตอบกลับ", d: "พิมพ์ในช่องด้านล่างแล้วกด Enter ผู้เข้าพักจะเห็นทันที" },
          { t: "คนละภาษาก็ไม่มีปัญหา", d: "ด้านบนจะบอกภาษาของผู้เข้าพัก และข้อความของเขาจะถูกแปลให้คุณอัตโนมัติ คุณพิมพ์ภาษาของคุณได้เลย" },
          { t: "จัดระเบียบรายชื่อ", d: "📌 “ปักหมุดการสนทนา” ตรึงบทสนทนาสำคัญไว้บนสุด ✎ เปลี่ยนชื่อ 🗑️ ลบทิ้ง — ลบแล้วกู้คืนไม่ได้" },
          { t: "กรองรายชื่อ", d: "ทั้งหมด / ผู้เข้าพัก / ผู้เยี่ยมชม จะได้ตอบผู้เข้าพักจริงก่อน" }
        ],
        tips: ["ถ้าคุณตอบแชทที่ยังไม่มีเจ้าของ ระบบจะเชื่อมต่อแชทนั้นให้คุณเองอัตโนมัติ"]
      },
      {
        id: "messages", ico: "✉️", title: "ข้อความ (จดหมายภายใน)",
        intro: "กล่องจดหมายของโรงแรมเอง เหมือนอีเมลแต่อยู่ในระบบนี้ และเป็นที่เก็บการจองใหม่ทุกรายการด้วย",
        steps: [
          { t: "กล่องข้อความ", d: "ข้อความที่เพื่อนร่วมงานส่งถึงคุณ กดเพื่ออ่าน" },
          { t: "เขียนข้อความ", d: "กด ✏️ “เขียนข้อความ” เริ่มพิมพ์ชื่อผู้รับในช่อง “ถึง” ใส่หัวเรื่อง เขียนเนื้อความ แล้วกดส่ง" },
          { t: "ตอบกลับ ส่งต่อ ติดดาว", d: "“ตอบกลับ” ตอบคนส่ง “ส่งต่อ” ส่งให้คนอื่น และ ⭐ “ติดดาว” เก็บไว้ในโฟลเดอร์ติดดาวเพื่อกลับมาหาง่าย" },
          { t: "ประกาศ", d: "📢 ประกาศจากผู้ดูแลระบบถึงทีมงานทุกคน อ่านทุกครั้งเมื่อเริ่มกะ" },
          { t: "การจองของผู้เข้าพัก", d: "🛎️ การจองใหม่ทุกรายการจะมาที่นี่ ดูรายละเอียดในหัวข้อถัดไป" },
          { t: "ถังขยะ", d: "🗑️ ข้อความที่ลบจะเก็บไว้ 30 วันแล้วลบถาวร กด “กู้คืน” เพื่อเอากลับมา" },
          { t: "รายงานข้อความ", d: "ถ้าเจอข้อความไม่เหมาะสม กด “รายงาน” ผู้ดูแลระบบจะเห็น" }
        ],
        tips: ["พนักงานส่งข้อความถึงคนอื่นได้ครั้งละไม่เกิน 10 คน ส่วนผู้ดูแลระบบส่งถึงทุกคนได้"]
      },
      {
        id: "bookings", ico: "🧾", title: "การจองของผู้เข้าพัก",
        intro: "ไปที่ ข้อความ → 🛎️ การจองของผู้เข้าพัก ที่นี่รวมทุกการจองจากเว็บไซต์ เรียงจากใหม่สุด",
        steps: [
          { t: "เปิดดูการจอง", d: "กดที่รายการ จะเห็นชื่อและช่องทางติดต่อผู้เข้าพัก วันที่เข้าพัก ห้อง ราคา และวิธีชำระเงิน" },
          { t: "กำหนดห้องพักตอนเช็กอิน", d: "พิมพ์เลขห้องจริง เช่น 204 แล้วบันทึก ต้องทำทุกครั้ง เพราะเป็นสิ่งที่ทำให้ผู้เข้าพักใช้บริการผ่านมือถือได้ และทำให้คำขอของเขาแสดงว่าต้องไปห้องไหน" },
          { t: "บันทึกการชำระเงิน", d: "ผู้เข้าพักที่เลือก “จ่ายตอนเช็กอิน” จะขึ้นว่า “รอชำระเงิน” เมื่อเขาจ่ายที่เคาน์เตอร์แล้ว ให้กด “บันทึกว่าชำระเงินแล้ว”" },
          { t: "ส่งอีเมลยืนยันอีกครั้ง", d: "กด “ส่งอีเมลยืนยันอีกครั้ง” แก้ข้อความหรือแก้ราคาที่ผิดได้ก่อนส่งออกไป" },
          { t: "คำขอพิเศษ", d: "เพิ่มหรือแก้ไขสิ่งที่ผู้เข้าพักขอไว้ แล้วส่งอีเมลยืนยันอีกครั้งเพื่อให้เขาเห็นในใบของเขา" },
          { t: "ยกเลิกการจอง", d: "กด “ยกเลิกการจอง” แล้วใส่เหตุผล เหตุผลนี้เห็นเฉพาะพนักงาน ผู้เข้าพักไม่เห็น เขาจะได้รับอีเมลแจ้งยกเลิก และถ้าวันนั้นยังว่างอยู่ ก็กด “เปิดการจองอีกครั้ง” ได้" },
          { t: "การจองหลายห้อง", d: "จะขึ้นว่า “ห้องที่ 1 จาก 3” พร้อมยอดรวมทั้งหมด ปุ่ม “ยกเลิกทั้งการจอง” จะยกเลิกทุกห้องพร้อมกันและส่งอีเมลแจ้งฉบับเดียว" },
          { t: "ค้นหาและจัดระเบียบ", d: "ค้นหาด้วยชื่อ รหัสการจอง หรือเลขห้อง ⭐ ติดดาวรายการสำคัญ และ “ป้ายกำกับของทีมงาน” ใช้จดโน้ตส่วนตัว เช่น “VIP โทรก่อนถึง”" },
          { t: "ดูอีเมลที่ส่งออกไปแล้ว", d: "“อีเมลที่ส่งแล้ว” จะแสดงทุกฉบับที่ระบบส่งให้การจองนี้ พร้อมบอกว่าส่งถึงหรือไม่" }
        ],
        tips: ["การจองที่ขึ้นว่า “ต้องตรวจสอบ” คือระบบอ่านข้อมูลอัตโนมัติไม่ครบ ให้เปิดดูแล้วเติมข้อมูลที่ขาดไป"],
        warn: "“ยกเลิก” ย้อนกลับได้ แต่ “ลบ” (เฉพาะผู้ดูแลระบบ) ย้อนกลับไม่ได้ ถ้าไม่แน่ใจให้ใช้ยกเลิก"
      },
      {
        id: "roster", ico: "🪪", title: "สถานะทีมงาน",
        intro: "ดูว่าตอนนี้ใครอยู่เวรบ้าง พนักงานดูได้ที่เมนู 🪪 สถานะทีม ส่วนผู้ดูแลระบบดูได้ที่ด้านบนของหน้า 👥 พนักงาน เหนือรายชื่อบัญชี",
        steps: [
          { t: "อ่านกระดาน", d: "การ์ดละหนึ่งคน บอกชื่อ ตำแหน่ง เวลากะ และสถานะว่า เข้ากะ พักงาน หรือ นอกกะ" },
          { t: "ระบบดูเวลาให้เอง", d: "สถานะ “เข้ากะ” และ “นอกกะ” เปลี่ยนตามเวลากะอัตโนมัติ ส่วน “พักงาน” ต้องตั้งเอง" },
          { t: "รีเฟรช", d: "ถ้าข้อมูลดูไม่อัปเดต ให้กด “รีเฟรช”" }
        ],
        tips: ["ปุ่ม “แก้ไข” สำหรับเปลี่ยนตำแหน่ง เวลาเวร หรือสถานะ มีเฉพาะผู้ดูแลระบบเท่านั้น"]
      },
      {
        id: "daily", ico: "✅", title: "งานประจำกะ ทีละขั้น",
        intro: "ถ้าไม่รู้ว่าจะเริ่มตรงไหน ให้ทำตามลำดับนี้",
        steps: [
          { t: "1. เข้าระบบและอ่านประกาศ", d: "ข้อความ → 📢 ประกาศ ประกาศใหม่สุดอยู่บนสุด" },
          { t: "2. เคลียร์กระดานคำขอ", d: "ทำจากบนลงล่าง รับงาน → เริ่ม → เสร็จสิ้น" },
          { t: "3. ตอบแชท", d: "ไปที่แชทสด ตอบผู้เข้าพักก่อน แล้วค่อยตอบผู้เยี่ยมชม" },
          { t: "4. ตรวจการจองใหม่", d: "ข้อความ → 🛎️ การจองของผู้เข้าพัก กำหนดเลขห้องให้แขกที่จะเข้าพักวันนี้" },
          { t: "5. บันทึกเงินตอนเช็กอิน", d: "กด “บันทึกว่าชำระเงินแล้ว” ทุกครั้งที่แขกจ่ายเงิน" },
          { t: "6. เปิดแท็บนี้ค้างไว้", d: "เปิดหน้าจอนี้ทิ้งไว้ จะได้ยินเสียงเตือนเมื่อมีงานใหม่" },
          { t: "7. ก่อนเลิกงาน", d: "ปิดงานที่รับไว้ให้เสร็จ หรือกดปล่อยงาน แล้วออกจากระบบ" }
        ]
      },
      {
        id: "trouble", ico: "🩺", title: "เมื่อเจอปัญหา",
        intro: "ปัญหาที่เจอบ่อย พร้อมวิธีแก้ที่เร็วที่สุด",
        steps: [
          { t: "เข้าระบบไม่ได้", d: "เช็กตัวพิมพ์ใหญ่-เล็ก และเว้นวรรคเกิน ถ้ายังไม่ได้ ให้กด “ลืมรหัสผ่าน” ที่หน้าเข้าสู่ระบบ" },
          { t: "ขึ้นว่าบัญชีถูกระงับ", d: "ผู้ดูแลระบบปิดบัญชีไว้ ให้ติดต่อขอเปิดใช้งานอีกครั้ง" },
          { t: "อยู่ ๆ ก็หลุดออกจากระบบ", d: "ระบบตัดการเข้าใช้งานเป็นระยะเพื่อความปลอดภัย เข้าใหม่ได้เลย ข้อมูลไม่หาย" },
          { t: "ไม่มีเสียงเตือน", d: "กดตรงไหนก็ได้บนหน้าจอหนึ่งครั้ง แล้วเช็กระดับเสียงของเครื่อง" },
          { t: "ขึ้นว่าติดต่อระบบของโรงแรมไม่ได้", d: "อินเทอร์เน็ตหรือเซิร์ฟเวอร์มีปัญหา รอสักครู่แล้วลองใหม่ สิ่งที่พิมพ์ไว้ยังอยู่" },
          { t: "ผู้เข้าพักไม่มีเลขห้อง", d: "ยังไม่มีใครกำหนดห้องให้ ไปที่ ข้อความ → การจองของผู้เข้าพัก → เปิดการจอง → กำหนดห้อง" },
          { t: "พิมพ์ในแชทไม่ได้", d: "แชทนั้นเชื่อมต่ออยู่กับพนักงานคนอื่น ให้กด “รับช่วงแชท”" },
          { t: "เผลอกดเสร็จสิ้น", d: "เปิดการ์ดนั้นแล้วกด “เปิดใหม่”" },
          { t: "เผลอกดยกเลิกรายการ", d: "เปลี่ยนตัวกรองไปที่ “ยกเลิกไว้” แล้วกด “นำกลับมา”" },
          { t: "หน้าจอเป็นภาษาที่ไม่ต้องการ", d: "เปลี่ยนได้ที่ช่องเลือกภาษามุมล่างซ้ายของเมนู" }
        ]
      },
      {
        id: "glossary", ico: "📖", title: "คำศัพท์ที่จะเจอบ่อย",
        intro: "ความหมายสั้น ๆ ของคำที่เห็นบนหน้าจอ",
        steps: [
          { t: "รอดำเนินการ", d: "ยังไม่มีใครเริ่มทำ" },
          { t: "กำลังดำเนินการ", d: "มีคนกำลังทำอยู่ตอนนี้" },
          { t: "เสร็จสิ้น", d: "ทำเสร็จแล้ว" },
          { t: "ปิดคำขอแล้ว", d: "พักไว้ ไม่ได้ทำ ดึงกลับมาได้" },
          { t: "ทดสอบ", d: "รายการที่กดทดลอง เก็บไว้ในระบบแต่ไม่นับเป็นงานและไม่ส่งเสียงเตือน" },
          { t: "ยังไม่ยืนยัน 🔶", d: "ระบบจับคู่คนนี้กับการจองไม่ได้" },
          { t: "ผู้เยี่ยมชม", d: "คนที่เข้าเว็บไซต์แต่ไม่ได้พักกับเรา" },
          { t: "Direct (Website)", d: "จองผ่านเว็บไซต์ของเราเอง" },
          { t: "OTA", d: "จองผ่าน Agoda, Booking.com, Airbnb หรือเว็บอื่น" },
          { t: "รหัสการจอง", d: "รหัสประจำการจอง เช่น JP-1001" },
          { t: "ใช้ห้องรายวัน (Day-use)", d: "ใช้ห้อง 3 ชั่วโมง ไม่ค้างคืน" },
          { t: "ชำระเงินล่วงหน้า", d: "จ่ายออนไลน์ก่อนเข้าพัก และคืนเงินไม่ได้" },
          { t: "จ่ายตอนเช็กอิน", d: "จ่ายที่เคาน์เตอร์ตอนมาถึง" }
        ]
      },
      {
        id: "site", ico: "🛠️", admin: true, title: "แก้ไขเว็บไซต์",
        intro: "แก้เว็บไซต์สาธารณะได้ด้วยตัวเอง ทั้งข้อความ รูปภาพ สี และเลือกว่าจะแสดงส่วนไหน ระบบบันทึกให้ทันทีที่คลิกออกจากช่อง และเว็บไซต์จริงจะเปลี่ยนตามทันที",
        steps: [
          { t: "ข้อความบนเว็บไซต์", d: "เลือก “ภาษาที่กำลังแก้ไข” ก่อน จากนั้นหาข้อความด้วยช่องค้นหาหรือเลื่อนดูตามกลุ่ม กดที่ช่อง แก้ข้อความ แล้วคลิกออก ระบบจะบันทึกให้และขึ้นว่า “บันทึกแล้ว ✓”" },
          { t: "ระบบแปลให้เอง", d: "แก้ข้อความภาษาเดียว อีกสี่ภาษาจะถูกแปลให้อัตโนมัติ จะได้ไม่มีภาษาไหนตกหล่น และคุณยังแก้คำในแต่ละภาษาเองทีหลังได้" },
          { t: "รูปภาพและวิดีโอ", d: "เปิดแต่ละหมวดเพื่อเพิ่ม เปลี่ยน สลับลำดับ หรือลบรูป อัปโหลดจากเครื่อง (ไม่เกิน 4 MB) หรือวางลิงก์ก็ได้ รูปแรกจะเป็นรูปหน้าปกของหมวดนั้น" },
          { t: "สี", d: "เลือกสีประจำแบรนด์ใหม่ ทั้งเว็บไซต์จะเปลี่ยนทันที กด “รีเซ็ตสี” เพื่อย้อนกลับ" },
          { t: "ส่วนต่าง ๆ ของเว็บไซต์", d: "ติ๊กเปิด-ปิดเพื่อซ่อนหรือแสดงแต่ละส่วน ตั้งแบนเนอร์ประกาศไว้ด้านบนเว็บไซต์ และปิดประเภทห้อง (การเปิด-ปิดห้องพัก) หรืออาคารเดย์ยูส (การเปิด-ปิดเดย์ยูส) ที่ไม่ว่างชั่วคราวได้" },
          { t: "การแก้ไขก่อนหน้า", d: "ดูทุกการเปลี่ยนแปลงของเว็บไซต์ พร้อมชื่อคนแก้และเวลา เรียงจากใหม่สุด" },
          { t: "ย้อนกลับ", d: "ทุกช่องมีปุ่ม “รีเซ็ต” ของตัวเอง และปุ่ม “ยกเลิกการแก้ไขทั้งหมดของฉัน” ที่ด้านล่างแท็บส่วนต่าง ๆ จะคืนข้อความ รูป และสีทั้งหมดกลับเป็นค่าเดิม" }
        ],
        tips: ["เปิดเว็บไซต์ไว้อีกแท็บหนึ่งข้าง ๆ หน้านี้ พอบันทึกแล้วจะเห็นผลทันที"],
        warn: "แท็บ “ราคาห้องพัก” ไม่เหมือนแท็บอื่น อ่านหัวข้อถัดไปก่อนแตะต้อง"
      },
      {
        id: "rates", ico: "💰", admin: true, title: "ราคาห้องพัก — อ่านก่อน",
        intro: "แก้ไขเว็บไซต์ → ราคาห้องพัก เป็นที่เดียวที่แก้แล้วกระทบเงินจริง ไม่มีฉบับร่าง ไม่มีตัวอย่างให้ดูก่อน และย้อนกลับไม่ได้ ทันทีที่กด “บันทึกราคา” ผู้เข้าพักคนถัดไปจะถูกคิดราคาใหม่",
        steps: [
          { t: "แก้อะไรได้บ้าง", d: "ราคาแบบไม่รวมอาหารเช้าและแบบรวมอาหารเช้า แยกตามประเภทห้องและแบบเตียง หน่วยเป็นบาทต่อคืน" },
          { t: "ค่าใช้จ่ายของผู้เข้าพักเพิ่ม", d: "ค่าเตียงเสริมต่อคืน ค่าอาหารเช้าเพิ่มต่อคนต่อคืน และค่าอาหารเช้าเด็กอายุ 5–8 ปี (อายุ 0–4 ปีฟรี ตั้งแต่ 9 ปีขึ้นไปคิดเท่าผู้ใหญ่)" },
          { t: "ราคาใช้ห้องรายวัน", d: "ราคาการใช้ห้อง 3 ชั่วโมง แยกตามอาคาร" },
          { t: "บันทึก", d: "กด “บันทึกราคา” ตรวจตัวเลขให้ดีสองรอบก่อนกด" }
        ],
        warn: "ราคาห้องพักไม่มีปุ่ม “ย้อนการแก้ไขทั้งหมด” จดราคาเดิมไว้ก่อนแก้เสมอ"
      },
      {
        id: "team", ico: "👥", admin: true, title: "บัญชีพนักงาน",
        intro: "เพิ่มคน กำหนดสิทธิ์ และช่วยพนักงานที่เข้าระบบไม่ได้ ด้านบนของหน้านี้คือกระดานสถานะทีมงาน จะได้เห็นว่าใครอยู่เวรและแก้ไขบัญชีได้ในหน้าเดียว",
        steps: [
          { t: "เพิ่มพนักงาน", d: "พิมพ์ชื่อ-นามสกุล ระบบจะสร้างชื่อผู้ใช้ให้เอง (อักษรแรกของชื่อ + นามสกุล) เลือกว่าเป็น “พนักงาน” หรือ “ผู้ดูแลระบบ” แล้วกด “เพิ่มพนักงาน”" },
          { t: "บอกวิธีเริ่มใช้งานให้เขา", d: "ให้เขาเข้าหน้าเข้าสู่ระบบ กด “บัญชีพนักงานใหม่” ใช้ชื่อผู้ใช้ของตัวเองกับรหัสผ่าน jparkhotel แล้วตั้งรหัสผ่านใหม่ของตัวเอง" },
          { t: "พนักงาน หรือ ผู้ดูแลระบบ?", d: "พนักงานดูแลคำขอ แชท ข้อความ และการจอง ส่วนผู้ดูแลระบบทำได้ทั้งหมดนั้น บวกกับแก้ไขเว็บไซต์ ราคา บัญชีพนักงาน โหมดปิดปรับปรุง และบันทึกการเข้าใช้งาน" },
          { t: "ระงับหรือลบบัญชี", d: "“ระงับ” คือห้ามเข้าระบบแต่ยังเก็บบัญชีไว้ “ลบ” คือลบทิ้ง ทั้งสองอย่างจะยังไม่มีผลจนกว่าจะกด “บันทึกการเปลี่ยนแปลง” กด “ย้อนกลับ” เพื่อยกเลิก" },
          { t: "คำขอรีเซ็ตรหัสผ่าน", d: "ข้อความ → 🔑 คำขอรีเซ็ตรหัสผ่าน กด “รีเซ็ตรหัสผ่าน” แล้วแจ้งรหัสผ่านชั่วคราวใหม่ให้พนักงาน ระบบแสดงรหัสนี้เพียงครั้งเดียว" }
        ],
        tips: ["คุณล็อกตัวเองออกจากระบบไม่ได้ บัญชีของคุณจะขึ้นคำว่า “คุณ” และลบไม่ได้"]
      },
      {
        id: "maintenance", ico: "🚧", admin: true, title: "โหมดปิดปรับปรุงและนโยบายการชำระเงิน",
        intro: "สองสวิตช์ที่เปลี่ยนสิ่งที่ผู้เข้าพักทำได้บนเว็บไซต์ ทั้งคู่จะถามยืนยันก่อน แล้วมีผลทันที",
        steps: [
          { t: "โหมดปิดปรับปรุง", d: "เปิดสวิตช์นี้แล้วผู้เข้าพักจะเห็นหน้าแจ้งปิดปรับปรุงแทนเว็บไซต์ แต่พนักงานยังเข้าระบบตรงนี้ได้ตามปกติ ใช้ตอนที่กำลังแก้ไขอะไรบางอย่าง" },
          { t: "บังคับชำระเงินล่วงหน้า", d: "เปิดในช่วงวันหยุดยาวหรือช่วงคนเยอะ ผู้เข้าพักจะเลือก “จ่ายตอนเช็กอิน” ไม่ได้อีก ทุกการจองใหม่ต้องจ่ายออนไลน์และคืนเงินไม่ได้ พอโรงแรมเงียบแล้วให้ปิดสวิตช์" },
          { t: "อ่านหมายเหตุด้านล่าง", d: "ถ้าโรงแรมยังไม่ได้เปิดใช้การชำระเงินออนไลน์ด้วยบัตร/พร้อมเพย์ หน้านี้จะแจ้งไว้ และสวิตช์ชำระเงินล่วงหน้าจะยังไม่มีผลจนกว่าจะเปิดใช้งาน" }
        ]
      },
      {
        id: "logs", ico: "🛡️", admin: true, title: "บันทึกการเข้าใช้งานและความปลอดภัย",
        intro: "บันทึกการเข้าสู่ระบบของพนักงานทุกครั้ง พร้อมอุปกรณ์ ตำแหน่งโดยประมาณ และสถานะว่าตอนนี้ออนไลน์อยู่หรือไม่",
        steps: [
          { t: "อ่านรายการ", d: "ใครเข้าระบบ จากอุปกรณ์และที่ไหน ใช้งานล่าสุดเมื่อไหร่ และออนไลน์หรือออฟไลน์ เครื่องของคุณเองจะมีป้ายว่า “นี่คือคุณ”" },
          { t: "ตัดการเข้าใช้งานของอุปกรณ์", d: "กด “ออกจากระบบ” ที่รายการนั้น ใช้ได้ดีกับกรณีมือถือหาย หรือมีคนลืมออกจากระบบไว้ในเครื่องส่วนกลาง" },
          { t: "ตัดทุกเครื่องจากที่เดียวกัน", d: "กด “ออกจากระบบทั้งหมด (n)” เพื่อตัดทุกการเข้าใช้งานจากที่อยู่นั้นพร้อมกัน" },
          { t: "แบนที่อยู่ IP", d: "“แบน IP” จะบล็อกที่อยู่นั้นและตัดการเข้าใช้งานทั้งหมดทันที กด “ยกเลิกแบน” เพื่อปลดบล็อก" }
        ],
        tips: ["ทุกคนเข้าระบบค้างไว้ได้ไม่เกิน 6 เครื่อง ถ้าเข้าเครื่องที่ 7 ระบบจะตัดเครื่องเก่าสุดออกเอง"],
        warn: "Wi-Fi ของโรงแรมใช้ที่อยู่ IP เดียวกันทั้งตึก ถ้าแบนไปอาจตัดทั้งผู้เข้าพักจริงและพนักงานของเราเอง แบนเฉพาะที่อยู่ที่แน่ใจจริง ๆ เท่านั้น"
      }
    ]
  };

  /* =====================  日本語  ===================== */
  const ja = {
    ui: {
      nav: "使い方ガイド",
      title: "使い方ガイド",
      subStaff: "ダッシュボードの操作を、ひとつずつ説明します。",
      subAdmin: "ダッシュボードの操作を、ひとつずつ説明します。管理者だけが使える機能も含みます。",
      toc: "目次",
      searchPh: "ガイド内を検索…",
      noMatch: "該当する項目がありません。短い言葉で試してください。",
      listen: "読み上げ",
      stop: "停止",
      print: "印刷 / PDFで保存",
      adminBadge: "管理者のみ",
      top: "目次に戻る",
      noVoice: "この端末には現在の言語の音声がないため、読み上げは利用できません。",
      openHint: "このページのガイドを開く",
      steps: "手順",
      tipTitle: "覚えておくと便利",
      warnTitle: "注意",
      readingTime: "読了目安 約{n}分",
      newBadge: "新着"
    },
    sections: [
      {
        id: "start", ico: "🚀", title: "はじめに",
        intro: "ログインとアカウント設定の手順です。ほとんどは最初の一度だけです。",
        steps: [
          { t: "スタッフページを開く", d: "ホテルのウェブサイトを開き、一番下の「スタッフログイン」を押します。お気に入りに登録しておくと、次から探さずに済みます。" },
          { t: "初回は「新しいスタッフアカウント」から", d: "管理者から渡されたユーザー名と、仮パスワード jparkhotel を入力します。続いて自分のパスワード（6文字以上）を決め、「保存してサインイン」を押します。" },
          { t: "2回目からは通常のログイン", d: "ユーザー名とパスワードを入力して「サインイン」を押すだけです。" },
          { t: "パスワードを忘れたとき", d: "ログイン画面の「パスワードをお忘れですか」を押します。管理者に申請が届き、新しい仮パスワードを発行してもらえます。" },
          { t: "ユーザー名を忘れたとき", d: "「ユーザー名をお忘れですか」を押し、氏名を入力して送信します。管理者から連絡があります。" },
          { t: "表示言語を選ぶ", d: "ログイン画面の下、およびダッシュボード左下のメニューで、タイ語・英語・日本語・簡体字中国語・繁体字中国語を切り替えられます。選んだ言語はこの端末に記憶されます。" },
          { t: "写真の登録とパスワード変更", d: "ダッシュボード左下の丸い写真を押すと、いつでも写真の登録とパスワードの変更ができます。" },
          { t: "終わったらサインアウト", d: "左下の「サインアウト」を押します。フロントの共用パソコンでは、勤務終了時に必ずサインアウトしてください。" }
        ],
        tips: [
          "同時にサインインできるのは6台までです。7台目でサインインすると、いちばん古い端末が自動的にサインアウトされます。",
          "パスワードは誰にも教えないでください。操作はすべてあなたの名前で記録されます。"
        ],
        warn: "仮パスワード jparkhotel が使えるのは初回サインインの一度だけです。その後は自分で決めたパスワードのみ有効です。"
      },
      {
        id: "tour", ico: "🧭", title: "ダッシュボードの見方",
        intro: "画面は1つ、左にメニューがあります。メニューを押すとページが切り替わります。切り替えても入力内容は消えません。",
        steps: [
          { t: "左のメニュー", d: "🛎️ リクエスト、💬 ライブチャット、✉️ メッセージ、🪪 チーム状況。管理者にはさらに、サイト編集・スタッフ・メンテナンス・アカウントログが表示されます。" },
          { t: "金色の数字", d: "メニュー横の数字は「未処理の件数」です。未完了のリクエスト、未読のチャット、未読のメール・新規予約の数を表します。" },
          { t: "点滅する！マーク", d: "リクエストの横で！が点滅していたら、まだ誰も見ていないリクエストがあります。リクエスト画面を数秒開くと点滅は止まります。" },
          { t: "通知音", d: "新しいリクエスト・チャット・予約があるたびに短い音が鳴ります。誰も対応しない場合は数分おきに鳴り続けます。" },
          { t: "ブラウザのタブ", d: "待機中の件があるとタブに🔔と件数が表示されるので、別のタブを見ていても気づけます。" },
          { t: "自動で更新されます", d: "更新ボタンを押す必要はありません。新しいリクエスト・チャット・予約は数秒ごとに自動で表示されます。" }
        ],
        tips: [
          "音が鳴らないときは、画面のどこかを一度クリックしてください。ブラウザはクリックがあるまで音を鳴らしません。",
          "勤務中はこの画面を専用のタブで開いたままにしてください。"
        ]
      },
      {
        id: "requests", ico: "🛎️", title: "お客様からのリクエスト",
        intro: "ここが中心の業務です。お客様がスマートフォンから依頼した内容がすべて届きます。上から順に対応してください。いちばん長く待っているお客様が常に一番上に表示されます。",
        steps: [
          { t: "カードを読む", d: "1枚ごとに、部屋番号・棟・部屋タイプ・依頼内容・待ち時間が表示されます。" },
          { t: "待ち時間を見る", d: "10分以内は通常です。オレンジは10分超、赤は20分超です。赤は次に優先して対応してください。" },
          { t: "担当する", d: "「担当する」を押すと、対応中であることがチームに伝わり「あなたが対応中です」に変わります。対応できなくなったら「担当を外れる」を押します。" },
          { t: "開始 → 完了", d: "作業を始めるときに「開始」、終わったら「完了」を押します。お客様のスマートフォンにも状況が反映されます。" },
          { t: "表示を絞り込む", d: "1段目のボタンは状態（すべて／受付待ち／対応中／完了／取り下げ済み）、2段目は部署（ハウスキーピング／メンテナンス／ダイニング・バー／フロント）で絞り込みます。" },
          { t: "すぐ探す", d: "上の検索欄に部屋番号・お客様の姓・予約番号を入力します。" },
          { t: "チームへのメモ", d: "「メモ」を押すと、スタッフだけに見える書き込みができます（例：タオルはドア前に置きました）。" },
          { t: "お客様と直接やりとり", d: "💬「メッセージ」を押すと、このリクエストについてお客様に返信できます。お客様のチャットに届きます。「全チャット」で会話全体を表示します。" },
          { t: "実際の依頼でない場合", d: "同僚の練習で入ったものは🧪「テストとして記録」を押します。記録は残りますが、件数にも通知にも含まれなくなります。対応不要の依頼は「取り下げる」を押すと「取り下げ済み」タブに移り、「元に戻す」でいつでも戻せます。" },
          { t: "まとめて処理する", d: "「選択」を押してカードにチェックを入れ、上部のバーから完了・テストとして記録・取り下げをまとめて実行できます。" }
        ],
        tips: [
          "名前の横の🔶「未確認」は、予約と照合できなかったお客様です。対応はしつつ、先に宿泊台帳を確認してください。",
          "部屋番号は、フロントがその予約に部屋を割り当てて初めて表示されます。",
          "🗑 削除ボタンは管理者にのみ表示されます。スタッフは代わりに「取り下げ」を使うので、記録が消えることはありません。"
        ]
      },
      {
        id: "guest", ico: "🔎", title: "このお客様は誰か",
        intro: "リクエストのカードやチャット上部にあるお客様名を押すと、右側からパネルが開き、分かっている情報がすべて表示されます。",
        steps: [
          { t: "開く", d: "お客様名を押します。閉じるときは✕、またはパネルの外側を押します。" },
          { t: "予約内容を見る", d: "氏名、予約番号、部屋番号と部屋タイプ、チェックイン・チェックアウト日、宿泊数、直接予約かAgoda／Booking.com経由かが分かります。" },
          { t: "予約と一致しない場合", d: "検索欄に姓・部屋番号・予約番号を入力し、正しい予約を選んで紐づけます。以降はリクエストに正しい部屋と棟が表示されます。" },
          { t: "棟を設定する", d: "部屋は分かっていて棟が不明な場合は、ここで棟を選びます。ハウスキーピングがどこへ向かうか分かります。" },
          { t: "他の依頼も確認", d: "「他に対応待ち」に、このお客様の他の依頼が並びます。一度にまとめてお持ちできます。" }
        ],
        tips: ["予約を紐づけると、このリクエスト・チャット・今後の依頼まで一度にすべて正しく表示されるようになります。"]
      },
      {
        id: "chat", ico: "💬", title: "ライブチャット",
        intro: "お客様はウェブサイトからホテルにメッセージを送れます。左に会話の一覧、右に会話の内容が表示されます。",
        steps: [
          { t: "会話を選ぶ", d: "左の一覧から選びます。名前の横に点があれば未読メッセージがあります。" },
          { t: "相手を確認する", d: "名前の横のマークで、確認済みのお客様か、🔶未確認（氏名と部屋番号は申告されたが照合できていない）か、宿泊していないサイト訪問者かが分かります。" },
          { t: "宿泊中のお客様を確認済みにする", d: "Agoda経由や当日飛び込みなど実際に宿泊中の場合は、台帳を確認してから「宿泊者を確認」を押します。あなたの名前が記録されます。" },
          { t: "返信は担当者ひとり", d: "チャットは接続中のスタッフのものです。「〇〇が対応中」と表示されている場合は閲覧のみで入力できません。相手が休憩中なら「対応を引き継ぐ」を押します。" },
          { t: "返信する", d: "下の入力欄に書いてEnterを押します。お客様にはすぐ届きます。" },
          { t: "言語が違っても大丈夫", d: "上部にお客様の言語が表示され、メッセージは自動で翻訳されます。あなたは自分の言語で書いて構いません。" },
          { t: "一覧を整理する", d: "📌「スレッドをピン留め」で重要な会話を上部に固定、✎で名前を変更、🗑️で削除します。削除は元に戻せません。" },
          { t: "絞り込み", d: "「すべて」「宿泊者」「訪問者」で切り替え、実際のお客様から先に対応できます。" }
        ],
        tips: ["担当者がいないチャットに返信すると、そのチャットは自動的にあなたの担当になります。"]
      },
      {
        id: "messages", ico: "✉️", title: "メッセージ（社内メール）",
        intro: "ホテル内専用のメールボックスです。新しい予約もすべてここに届きます。",
        steps: [
          { t: "受信トレイ", d: "同僚から届いたメッセージです。押すと本文が開きます。" },
          { t: "新しく書く", d: "✏️「作成」を押し、宛先欄に名前を入力、件名と本文を書いて送信します。" },
          { t: "返信・転送・スター", d: "「返信」は差出人へ、「転送」は他の人へ。⭐「スター」を付けるとスター付きフォルダに残り、あとで探しやすくなります。" },
          { t: "お知らせ", d: "📢 管理者から全員へのお知らせです。勤務開始時に必ず確認してください。" },
          { t: "予約", d: "🛎️ 新しい予約はすべてここに届きます。詳しくは次の項目をご覧ください。" },
          { t: "ゴミ箱", d: "🗑️ 削除したメッセージは30日間保管され、その後完全に削除されます。「復元」で戻せます。" },
          { t: "報告する", d: "不適切なメッセージがあれば「報告」を押すと管理者に通知されます。" }
        ],
        tips: ["スタッフは一度に10人まで送信できます。管理者は全員に送信できます。"]
      },
      {
        id: "bookings", ico: "🧾", title: "お客様の予約",
        intro: "メッセージ →🛎️ ゲスト予約。ウェブサイトからの予約が新しい順に並びます。",
        steps: [
          { t: "予約を開く", d: "行を押すと、お客様の氏名・連絡先・日程・部屋・料金・支払い方法が表示されます。" },
          { t: "チェックイン時に部屋番号を登録", d: "実際の部屋番号（例：204）を入力して保存します。毎回必ず行ってください。これがないとお客様はゲストサービスを利用できず、リクエストにも訪問先の部屋が表示されません。" },
          { t: "支払いを記録する", d: "「チェックイン時に支払う」を選んだお客様は「支払い待ち」と表示されます。フロントでお支払いを受けたら「支払い済みにする」を押します。" },
          { t: "確認メールを再送する", d: "「確認メールを再送」を押します。送信前に文面や誤った料金を修正できます。" },
          { t: "特別なご要望", d: "お客様のご要望を追加・編集し、確認メールを再送すればお客様の控えにも反映されます。" },
          { t: "予約をキャンセル", d: "「予約をキャンセル」を押し、理由を入力します。理由はスタッフのみが見るもので、お客様には表示されません。お客様には取消メールが届きます。日程に空きがあれば「予約を再開」で復活できます。" },
          { t: "複数部屋の予約", d: "「3部屋中1部屋目」のように表示され、合計金額も出ます。「予約全体をキャンセル」で全部屋を一度にキャンセルし、お客様へのメールは1通にまとめられます。" },
          { t: "探す・整理する", d: "氏名・予約番号・部屋番号で検索できます。⭐で重要な予約に印を付け、「スタッフラベル」に「VIP・到着前に要連絡」などの内部メモを残せます。" },
          { t: "送信済みメールを確認", d: "「送信済みメール」で、この予約についてシステムが送ったメールと到達状況を確認できます。" }
        ],
        tips: ["「要確認」と表示された予約は自動で読み取れなかったものです。開いて不足している項目を入力してください。"],
        warn: "「キャンセル」は元に戻せますが、「削除」（管理者のみ）は戻せません。迷ったらキャンセルを使ってください。"
      },
      {
        id: "roster", ico: "🪪", title: "チーム状況",
        intro: "いま誰が勤務中かが分かります。フロントはメニューの🪪「チーム状況」から、管理者は👥「スタッフ」ページ上部（アカウント一覧の上）にあります。",
        steps: [
          { t: "ボードを見る", d: "メンバーごとに、氏名・役割・シフト時間と、勤務中／休憩中／勤務外の状態が表示されます。" },
          { t: "時刻に応じて自動更新", d: "勤務中と勤務外はシフト時間から自動で切り替わります。休憩中は手動で設定します。" },
          { t: "更新", d: "表示が古いようなら「更新」を押してください。" }
        ],
        tips: ["役割・シフト・状態を変更する「編集」ボタンは管理者にのみ表示されます。"]
      },
      {
        id: "daily", ico: "✅", title: "1回の勤務の流れ",
        intro: "何から始めればよいか迷ったら、この順番で進めてください。",
        steps: [
          { t: "1. サインインしてお知らせを読む", d: "メッセージ →📢 お知らせ。新しいものが上に表示されます。" },
          { t: "2. リクエストを片づける", d: "上から順に。担当する → 開始 → 完了。" },
          { t: "3. チャットに返信する", d: "ライブチャットで、訪問者より宿泊中のお客様を優先します。" },
          { t: "4. 新しい予約を確認する", d: "メッセージ →🛎️ ゲスト予約。本日到着分の部屋番号を登録します。" },
          { t: "5. チェックイン時に入金を記録", d: "お支払いを受けたら「支払い済みにする」を押します。" },
          { t: "6. タブは開いたままに", d: "この画面を開いたままにしておくと、新着の通知音が聞こえます。" },
          { t: "7. 退勤前に", d: "担当したリクエストを完了または担当解除し、サインアウトします。" }
        ]
      },
      {
        id: "trouble", ico: "🩺", title: "困ったときは",
        intro: "よくあるトラブルと、いちばん早い解決方法です。",
        steps: [
          { t: "サインインできない", d: "大文字・小文字と余分な空白を確認してください。それでも入れない場合はログイン画面の「パスワードをお忘れですか」を押します。" },
          { t: "アカウントが停止中と表示される", d: "管理者が停止しています。再有効化を依頼してください。" },
          { t: "勝手にサインアウトされた", d: "安全のため一定時間で接続が切れます。もう一度サインインすれば大丈夫です。" },
          { t: "音が鳴らない", d: "画面を一度クリックし、パソコンの音量も確認してください。" },
          { t: "「ホテルのシステムに接続できません」と出る", d: "ネットワークかサーバーの問題です。少し待って再度お試しください。入力内容は保持されます。" },
          { t: "お客様に部屋番号がない", d: "まだ割り当てられていません。メッセージ → ゲスト予約 → 該当の予約を開く →「部屋を割り当て」を押します。" },
          { t: "チャットに入力できない", d: "そのチャットは他のスタッフが担当中です。「対応を引き継ぐ」を押してください。" },
          { t: "間違えて完了を押した", d: "カードを開いて「再開」を押します。" },
          { t: "間違えて取り下げた", d: "絞り込みを「取り下げ済み」に切り替え、「元に戻す」を押します。" },
          { t: "表示言語が違う", d: "メニュー左下の言語メニューで切り替えます。" }
        ]
      },
      {
        id: "glossary", ico: "📖", title: "画面に出てくる用語",
        intro: "画面上の言葉の簡単な意味です。",
        steps: [
          { t: "受付待ち", d: "まだ誰も着手していません。" },
          { t: "対応中", d: "いま誰かが対応しています。" },
          { t: "完了", d: "対応済みです。" },
          { t: "取り下げ済み", d: "対応せず保留にしたものです。元に戻せます。" },
          { t: "テスト", d: "練習用の依頼です。記録は残りますが、件数や通知には含まれません。" },
          { t: "未確認 🔶", d: "この方を予約と照合できていません。" },
          { t: "訪問者", d: "ウェブサイトを見ているだけで、宿泊はしていない方です。" },
          { t: "Direct (Website)", d: "当ホテルのサイトからの直接予約です。" },
          { t: "OTA", d: "Agoda、Booking.com、Airbnbなど外部サイト経由の予約です。" },
          { t: "予約番号", d: "予約ごとの番号です（例：JP-1001）。" },
          { t: "デイユース", d: "宿泊なしの3時間利用です。" },
          { t: "事前決済", d: "到着前にオンラインで支払い、返金不可です。" },
          { t: "チェックイン時払い", d: "到着時にフロントでお支払いいただきます。" }
        ]
      },
      {
        id: "site", ico: "🛠️", admin: true, title: "サイト編集",
        intro: "公開サイトの文章・写真・色・表示するセクションを自分で変更できます。入力欄から離れた時点で保存され、公開サイトにすぐ反映されます。",
        steps: [
          { t: "サイトの文章", d: "まず「編集する言語」を選び、検索欄またはグループを辿って文章を探します。欄を押して書き換え、外側をクリックすると保存され「保存しました ✓」と表示されます。" },
          { t: "自動で翻訳されます", d: "1つの言語を書き換えると、残り4言語は自動翻訳されます。訳が残らないことはありません。あとから各言語を手直しすることもできます。" },
          { t: "写真・動画", d: "セクションを開いて、写真の追加・差し替え・並べ替え・削除ができます。パソコンからアップロード（4MB未満）するか、リンクを貼り付けます。最初の写真がそのセクションの表紙になります。" },
          { t: "色", d: "ブランドカラーを選ぶと、サイト全体の配色がすぐに変わります。「色をリセット」で元に戻せます。" },
          { t: "セクション", d: "チェックの入切でセクションの表示・非表示を切り替え、サイト上部にお知らせバナーを出し、満室の客室タイプ（客室の掲載可否）やデイユースの棟を一時的に非表示にできます。" },
          { t: "編集履歴", d: "サイトへのすべての変更が、変更者と日時つきで新しい順に並びます。" },
          { t: "元に戻す", d: "各欄に「リセット」があり、「セクション」タブ下部の「自分の編集をすべて取り消す」で、文章・写真・色をまとめて元に戻せます。" }
        ],
        tips: ["ウェブサイトを別のタブで並べて開いておくと、保存のたびに反映が確認できます。"],
        warn: "「料金」タブだけは扱いが違います。触る前に次の項目を必ずお読みください。"
      },
      {
        id: "rates", ico: "💰", admin: true, title: "料金 — 最初にお読みください",
        intro: "サイト編集 → 料金は、変更が実際の売上に直結する唯一の場所です。下書きもプレビューも取り消しもありません。「料金を保存」を押した瞬間から、次のお客様は新しい料金で請求されます。",
        steps: [
          { t: "変更できるもの", d: "客室タイプとベッド構成ごとの、朝食なし／朝食つきの1泊料金（バーツ）です。" },
          { t: "追加人数の料金", d: "1泊あたりのエキストラベッド代、追加1名あたりの朝食代、5〜8歳の子ども朝食代（0〜4歳は無料、9歳以上は大人料金）。" },
          { t: "デイユース料金", d: "3時間利用の料金を、棟ごとに設定します。" },
          { t: "保存", d: "「料金を保存」を押します。押す前に数字を必ず2回確認してください。" }
        ],
        warn: "料金には「自分の編集をすべて取り消す」がありません。変更前に元の金額を必ず控えておいてください。"
      },
      {
        id: "team", ico: "👥", admin: true, title: "スタッフアカウント",
        intro: "メンバーの追加、権限の設定、ログインできなくなった人の対応を行います。ページ上部にはチーム状況のボードがあり、誰が勤務中かを見ながら、そのままアカウントを変更できます。",
        steps: [
          { t: "メンバーを追加する", d: "氏名を入力すると、ユーザー名（名前の頭文字＋姓）が自動で作られます。「スタッフ」か「管理者」を選び、「スタッフを追加」を押します。" },
          { t: "始め方を伝える", d: "ログイン画面で「新しいスタッフアカウント」を押し、自分のユーザー名とパスワード jparkhotel を入力して、自分のパスワードを決めてもらいます。" },
          { t: "スタッフと管理者の違い", d: "スタッフはリクエスト・チャット・メッセージ・予約を担当します。管理者はそれに加えて、サイト編集・料金・スタッフアカウント・メンテナンス・アカウントログも扱えます。" },
          { t: "停止と削除", d: "「停止」はログインを止めますがアカウントは残ります。「削除」は消去します。どちらも「変更を保存」を押すまで実行されません。「元に戻す」で取り消せます。" },
          { t: "パスワード再発行の申請", d: "メッセージ →🔑 パスワードリセット申請。「パスワードをリセット」を押し、表示された仮パスワードを本人に伝えます。表示は一度きりです。" }
        ],
        tips: ["自分を締め出すことはできません。自分のアカウントには「あなた」と表示され、削除できません。"]
      },
      {
        id: "maintenance", ico: "🚧", admin: true, title: "メンテナンスと支払いポリシー",
        intro: "お客様がサイトでできることを切り替える2つのスイッチです。どちらも確認のうえ、すぐに反映されます。",
        steps: [
          { t: "メンテナンスモード", d: "オンにすると、お客様にはサイトの代わりにメンテナンス案内が表示されます。スタッフはこの画面から通常どおりサインインできます。修正作業中にお使いください。" },
          { t: "事前決済を必須にする", d: "連休や繁忙期にオンにします。お客様は「チェックイン時に支払う」を選べなくなり、新規予約はすべてオンライン決済・返金不可になります。落ち着いたらオフに戻してください。" },
          { t: "下の注意書きを確認", d: "カード／PromptPayのオンライン決済がまだ有効でない場合はその旨が表示され、事前決済のスイッチは有効化されるまで効果がありません。" }
        ]
      },
      {
        id: "logs", ico: "🛡️", admin: true, title: "アカウントログとセキュリティ",
        intro: "スタッフのサインインをすべて記録し、端末・おおよその場所・現在オンラインかどうかを表示します。",
        steps: [
          { t: "一覧を見る", d: "誰が、どの端末・どこからサインインし、最後に操作した時刻、オンラインかオフラインかが分かります。自分の接続には「あなたのセッション」と表示されます。" },
          { t: "特定の端末をサインアウト", d: "その行の「サインアウト」を押します。紛失した携帯や、共用パソコンでの切り忘れに有効です。" },
          { t: "同じ場所からの接続をすべて解除", d: "「すべてサインアウト（n）」で、そのアドレスからの接続を一括で解除します。" },
          { t: "アドレスを禁止する", d: "「IPを禁止」でそのアドレスを遮断し、接続を即座に解除します。「禁止解除」で戻せます。" }
        ],
        tips: ["1人につき同時サインインは6台までで、7台目のサインインで最も古い接続が自動解除されます。"],
        warn: "ホテルのWi-Fiは館内全体で1つのアドレスを共有しています。禁止すると実際のお客様や自社スタッフまで締め出される恐れがあるため、確実な場合のみ実行してください。"
      }
    ]
  };

  /* =====================  简体中文  ===================== */
  const zhHans = {
    ui: {
      nav: "使用指南",
      title: "使用指南",
      subStaff: "把你面板上的每一项功能，一步一步讲清楚。",
      subAdmin: "把你面板上的每一项功能，一步一步讲清楚，包括仅管理员可用的工具。",
      toc: "目录",
      searchPh: "在指南中搜索…",
      noMatch: "指南里没有找到这个词，换个短一点的词试试。",
      listen: "朗读",
      stop: "停止",
      print: "打印 / 存为 PDF",
      adminBadge: "仅管理员",
      top: "回到目录",
      noVoice: "本设备没有当前语言的语音，无法朗读。",
      openHint: "打开本页的使用指南",
      steps: "操作步骤",
      tipTitle: "小提示",
      warnTitle: "注意",
      readingTime: "约需 {n} 分钟读完",
      newBadge: "新"
    },
    sections: [
      {
        id: "start", ico: "🚀", title: "开始使用",
        intro: "怎么登录、怎么设置自己的账号。大部分只需要在第一次做一遍。",
        steps: [
          { t: "打开员工页面", d: "进入酒店网站，点击页面最底部的“员工登录”。建议把这个页面加入收藏夹，以后就不用再找了。" },
          { t: "第一次请点“新员工账户”", d: "输入管理员给你的用户名和临时密码 jparkhotel，然后设置自己的密码（至少 6 位），点击“保存并登录”。" },
          { t: "以后正常登录即可", d: "输入用户名和密码，点击“登录”。" },
          { t: "忘记密码？", d: "在登录页点“忘记密码”。系统会把申请发给管理员，管理员会给你一个新的临时密码。" },
          { t: "忘记用户名？", d: "点“忘记用户名”，填写你的姓名并发送，管理员会告诉你用户名。" },
          { t: "选择语言", d: "登录框下方以及面板左下角都有语言选择，可切换泰语、英语、日语、简体中文和繁体中文，整个界面会跟着变。本设备会记住你的选择。" },
          { t: "上传头像、修改密码", d: "在面板左下角点自己的圆形头像，随时可以上传照片或修改密码。" },
          { t: "下班记得退出", d: "点左下角“登出”。前台是公用电脑，每次下班务必退出。" }
        ],
        tips: [
          "同一个账号最多可在 6 台设备上保持登录；第 7 次登录会自动把最早的一台挤下线。",
          "不要把密码告诉别人。你在系统里的每一步操作都会记在你名下。"
        ],
        warn: "临时密码 jparkhotel 只在第一次登录时有效，之后只能用你自己设置的密码。"
      },
      {
        id: "tour", ico: "🧭", title: "面板速览",
        intro: "只有一个界面，菜单在左边。点菜单就能换页，来回切换不会丢东西。",
        steps: [
          { t: "左边的菜单", d: "🛎️ 宾客请求、💬 在线聊天、✉️ 消息、🪪 团队状态。管理员还会看到：网站编辑、员工、维护模式、账户日志。" },
          { t: "金色的数字", d: "菜单旁的数字表示“还没处理完的量”：未完成的宾客请求、你未读的聊天、未读的消息和新预订。" },
          { t: "闪烁的感叹号", d: "宾客请求旁边闪 ！，说明有请求还没人看过。打开请求页面停留几秒，它就不闪了。" },
          { t: "提示音", d: "有新请求、新聊天消息、新预订时都会响一声。如果一直没人处理，每隔几分钟会再响一次。" },
          { t: "浏览器标签", d: "有待处理事项时，浏览器标签上会显示 🔔 和数量，就算你在看别的标签也能发现。" },
          { t: "会自动更新", d: "不用刷新页面。新的请求、聊天和预订每隔几秒就会自动出现。" }
        ],
        tips: [
          "听不到提示音时，在页面上随便点一下——浏览器要有点击后才允许播放声音。",
          "整个班次都把这个页面单独开一个标签，别关掉。"
        ]
      },
      {
        id: "requests", ico: "🛎️", title: "宾客请求",
        intro: "这是最主要的工作。客人用手机提的每一个需求都会到这里。从上往下做——等得最久的客人永远排在最上面。",
        steps: [
          { t: "看懂卡片", d: "每张卡片会显示房号、楼栋、房型、客人要什么，以及已经等了多久。" },
          { t: "注意等待时间", d: "10 分钟以内属正常，橙色表示超过 10 分钟，红色表示超过 20 分钟——红色的优先做。" },
          { t: "接手这单", d: "点“接手”，同事就知道你在处理了，卡片会变成“由您处理中”。如果做不了，点“放弃处理”。" },
          { t: "先“开始”，做完点“完成”", d: "动手时点“开始”，做完点“完成”。客人手机上会同步看到状态变化。" },
          { t: "筛选要看的内容", d: "第一排按状态筛选——全部、待处理、处理中、已完成、已关闭；第二排按部门筛选——客房、维修、餐饮、前台。" },
          { t: "快速找到某一条", d: "在上方搜索框输入房号、客人姓氏或预订编号。" },
          { t: "给同事留个备注", d: "点“备注”写一句只有员工能看到的话，例如“毛巾已放在门口”。" },
          { t: "直接和客人沟通", d: "点 💬“留言”就能就这一条请求回复客人，客人会在自己的聊天里看到。“完整聊天”会打开整段对话。" },
          { t: "不是真的工单？", d: "同事练习时提交的，点 🧪“标记为测试”，记录还在，但不再计入工作量、也不再响铃。不需要处理的请求点“关闭”，会移到“已关闭”标签，随时可以点“恢复”拿回来。" },
          { t: "批量处理", d: "点“选择”，勾选多张卡片，再用上方的按钮一次性完成、标记为测试或关闭。" }
        ],
        tips: [
          "名字旁的 🔶“待确认”表示系统没能把这位客人对上预订。照常服务，但先查一下入住登记。",
          "只有前台给该预订分配了房间之后，房号才会显示出来。",
          "🗑 删除按钮只有管理员才有。员工请用“关闭”，记录不会丢。"
        ]
      },
      {
        id: "guest", ico: "🔎", title: "这位客人是谁",
        intro: "点客人的名字（在请求卡片上，或聊天顶部），右侧会滑出一个面板，显示我们掌握的全部信息。",
        steps: [
          { t: "打开", d: "点客人姓名即可。点 ✕ 或面板外任意位置关闭。" },
          { t: "查看预订", d: "姓名、预订编号、房号和房型、入住与退房日期、住几晚，以及是直接订的还是通过 Agoda / Booking.com 订的。" },
          { t: "未匹配到预订？", d: "在搜索框输入姓氏、房号或预订编号，点中正确的那条预订即可关联。之后这位客人的请求就会显示正确的房间和楼栋。" },
          { t: "指定楼栋", d: "如果知道房号但不知道在哪栋，在这里选楼栋，客房部才知道往哪走。" },
          { t: "看他还有什么在等", d: "“同时等待处理”会列出这位客人其他没做完的需求，一趟就能全部送到。" }
        ],
        tips: ["关联一次预订，所有地方都会同时修正——这条请求、他的聊天，以及他之后提交的每一条请求。"]
      },
      {
        id: "chat", ico: "💬", title: "在线聊天",
        intro: "客人可以从网站上给酒店发消息。左边是会话列表，右边是会话内容。",
        steps: [
          { t: "选一个会话", d: "点左边的列表。名字旁有小圆点表示有你还没读的消息。" },
          { t: "先看清是谁", d: "名字旁的标记会告诉你：是已确认的住客，还是 🔶 待确认（报了姓名和房号但对不上），还是并未入住的网站访客。" },
          { t: "确认真实住客", d: "如果确实住在店里（比如 Agoda 订单或上门散客），先查登记，再点“确认住客”，系统会记下是你确认的。" },
          { t: "一个会话只由一个人回", d: "会话属于当前接入的那位员工。若显示“已连接 某某”，你只能看不能打字。对方在休息，就点“接管聊天”。" },
          { t: "回复", d: "在下方输入框打字，按回车发送，客人立刻就能看到。" },
          { t: "语言不同也没关系", d: "顶部会显示客人的语言，客人的消息会自动翻译给你看。你用自己的语言写就行。" },
          { t: "整理列表", d: "📌 把重要会话置顶，✎ 改名字，🗑️ 删除——删除无法恢复。" },
          { t: "筛选", d: "全部 / 住客 / 访客，方便优先回复真正的客人。" }
        ],
        tips: ["回复一个还没人接的会话，系统会自动把它分配给你。"]
      },
      {
        id: "messages", ico: "✉️", title: "消息",
        intro: "酒店自己的信箱，跟电子邮件差不多，只是在这个系统里。所有新预订也都会送到这里。",
        steps: [
          { t: "收件箱", d: "同事发给你的消息，点开即可阅读。" },
          { t: "写一封", d: "点 ✏️“写邮件”，在收件人栏输入名字，填主题，写正文，点发送。" },
          { t: "回复 / 转发 / 星标", d: "“回复”回给发件人，“转发”发给别人，⭐“星标”会留在星标夹里，方便以后再找。" },
          { t: "公告", d: "📢 管理员发给全体的通知。每次上班先看这里。" },
          { t: "宾客预订", d: "🛎️ 所有新预订都到这里，详见下一节。" },
          { t: "回收站", d: "🗑️ 删除的消息保留 30 天后彻底清除。点“恢复”可以取回。" },
          { t: "举报消息", d: "遇到不合适的内容，点“举报”，管理员会看到。" }
        ],
        tips: ["员工一次最多可发给 10 个人，管理员可以发给所有人。"]
      },
      {
        id: "bookings", ico: "🧾", title: "宾客预订",
        intro: "消息 →🛎️ 宾客预订。网站上的所有预订，最新的排在最前面。",
        steps: [
          { t: "打开一条预订", d: "点一行，就能看到客人姓名和联系方式、日期、房型、金额和付款方式。" },
          { t: "入住时分配房间", d: "填写真实房号（例如 204）并保存。每次都要做——客人靠它才能使用客房服务，他的请求也才会显示该去哪个房间。" },
          { t: "记录收款", d: "选择“入住时付款”的客人会显示“待付款”。在前台收到钱后，点“标记为已收款”。" },
          { t: "重新发送确认邮件", d: "点“重新发送确认邮件”。发出前可以先修改措辞或改掉写错的价格。" },
          { t: "特殊要求", d: "添加或修改客人的要求，然后重新发送确认邮件，客人那份上就会显示出来。" },
          { t: "取消预订", d: "点“取消预订”并填写原因；原因只有员工看得到，客人看不到。客人会收到取消邮件。若那几天仍有空房，可以点“恢复预订”。" },
          { t: "多间房的预订", d: "会显示“第 1 间 / 共 3 间”和总金额。“取消整个预订”会一次取消所有房间，并只给客人发一封邮件。" },
          { t: "查找与整理", d: "可按姓名、编号或房号搜索。⭐ 给重要预订加星，“员工标签”可以写内部备注，例如“VIP，到店前先致电”。" },
          { t: "查看已发邮件", d: "“已发送邮件”会列出系统为这笔预订发出的每一封邮件以及是否送达。" }
        ],
        tips: ["标着“需要核实”的预订是系统没能完整读取的，请打开补齐缺失信息。"],
        warn: "“取消”可以撤回，“删除”（仅管理员）不能。拿不准就用取消。"
      },
      {
        id: "roster", ico: "🪪", title: "团队状态",
        intro: "看现在谁在班上。前台从菜单的 🪪 团队状态进入；管理员在 👥 员工页面的最上方，就在账号列表上面。",
        steps: [
          { t: "看这块板", d: "每人一张卡片，显示姓名、职务、班次时间，以及当班 / 休息中 / 下班。" },
          { t: "跟着时间自动变", d: "“当班”和“下班”会按班次时间自动切换，“休息中”需要手动设置。" },
          { t: "刷新", d: "如果看起来不是最新的，点“刷新”。" }
        ],
        tips: ["只有管理员能看到“编辑”按钮，用来修改职务、班次或状态。"]
      },
      {
        id: "daily", ico: "✅", title: "一个班次怎么做",
        intro: "不知道从哪开始的话，就按这个顺序来。",
        steps: [
          { t: "1. 登录并看公告", d: "消息 →📢 公告，最新的在最上面。" },
          { t: "2. 清空请求看板", d: "从上往下做：接单 → 开始 → 完成。" },
          { t: "3. 回复聊天", d: "在线聊天里，先回住客，再回访客。" },
          { t: "4. 查看新预订", d: "消息 →🛎️ 宾客预订，给今天到店的客人分配房间。" },
          { t: "5. 入住时记录收款", d: "客人付款后点“标记为已收款”。" },
          { t: "6. 保持标签常开", d: "别关这个页面，有新事项才听得到提示音。" },
          { t: "7. 下班前", d: "把接下的工单做完或放开，然后登出。" }
        ]
      },
      {
        id: "trouble", ico: "🩺", title: "出问题怎么办",
        intro: "常见问题和最快的解决办法。",
        steps: [
          { t: "登录不上", d: "检查大小写和多余的空格。还是不行就在登录页点“忘记密码”。" },
          { t: "提示账号已停用", d: "管理员把账号关掉了，请他重新启用。" },
          { t: "自己被退出了", d: "为了安全，登录状态会定期失效，重新登录即可，东西不会丢。" },
          { t: "没有声音", d: "在页面上点一下，再检查电脑音量。" },
          { t: "提示连不上酒店系统", d: "网络或服务器出了问题。等一会儿再试，你输入的内容会保留。" },
          { t: "客人没有房号", d: "还没人分配。消息 → 宾客预订 → 打开该预订 → 分配房间。" },
          { t: "聊天里打不了字", d: "该会话由别人接入，点“接管聊天”。" },
          { t: "误点了“完成”", d: "打开那张卡片，点“重新打开”。" },
          { t: "误点了“关闭”", d: "把筛选切到“已关闭”，点“恢复”。" },
          { t: "界面语言不对", d: "在菜单左下角的语言选择里切换。" }
        ]
      },
      {
        id: "glossary", ico: "📖", title: "会看到的词",
        intro: "界面上这些词的简单意思。",
        steps: [
          { t: "待处理", d: "还没有人开始做。" },
          { t: "处理中", d: "有人正在做。" },
          { t: "已完成", d: "已经做完了。" },
          { t: "已搁置", d: "先放一边、没有去做，可以放回来。" },
          { t: "测试", d: "练习用的工单，会留记录，但不计入工作量、也不触发提醒。" },
          { t: "待确认 🔶", d: "系统没能把这个人对上任何预订。" },
          { t: "访客", d: "只是在看网站、并没有住店的人。" },
          { t: "Direct (Website)", d: "在我们自己的网站上订的。" },
          { t: "OTA", d: "通过 Agoda、Booking.com、Airbnb 等平台订的。" },
          { t: "预订编号", d: "每笔预订的编号，例如 JP-1001。" },
          { t: "钟点房（Day-use）", d: "3 小时使用，不过夜。" },
          { t: "预付", d: "到店前在线付款，且不可退款。" },
          { t: "入住时付款", d: "到店时在前台付。" }
        ]
      },
      {
        id: "site", ico: "🛠️", admin: true, title: "网站编辑",
        intro: "你可以自己改公开网站的文字、图片、颜色和显示哪些板块。点开输入框外面就自动保存，网站上立刻生效。",
        steps: [
          { t: "网站文字", d: "先选“正在编辑的语言”，再用搜索框或分组找到要改的文字。点进输入框改好后点旁边空白处，就会保存并显示“已保存 ✓”。" },
          { t: "会自动翻译", d: "改动其中一种语言，另外四种会自动翻译，不会漏掉任何语言。之后你还可以逐个语言手动润色。" },
          { t: "图片和视频", d: "打开任意板块即可添加、替换、调整顺序或删除图片。可从电脑上传（小于 4 MB）或粘贴链接。第一张图会作为该板块的封面。" },
          { t: "颜色", d: "选择新的品牌色，整个网站配色立刻更新。“重置颜色”可以还原。" },
          { t: "板块", d: "打勾或取消打勾来显示 / 隐藏板块，在网站顶部发布公告横幅，也可以把暂时不可售的房型或钟点房楼栋关掉。" },
          { t: "历史修改", d: "网站的每一次改动，以及是谁在什么时候改的，最新的在最前面。" },
          { t: "撤销", d: "每个字段都有自己的“重置”；板块标签页底部的“撤销我的全部修改”可以把文字、图片和颜色一次性还原。" }
        ],
        tips: ["再开一个浏览器标签并排放着网站，保存后马上就能看到效果。"],
        warn: "“房价”标签页和其他都不一样，动手之前请先看下一节。"
      },
      {
        id: "rates", ico: "💰", admin: true, title: "房价 — 请先读这一节",
        intro: "网站编辑 → 房价，是唯一改动会牵扯到真金白银的地方。没有草稿、没有预览、也不能撤销：一点“保存房价”，下一位客人就按新价格收费。",
        steps: [
          { t: "可以改什么", d: "各房型、各床型的“不含早”和“含早”价格，单位是每晚泰铢。" },
          { t: "加人加价", d: "每晚加床费、每位客人每晚的加早餐费，以及 5–8 岁儿童早餐费（0–4 岁免费，9 岁及以上按成人价）。" },
          { t: "钟点房价格", d: "3 小时使用的价格，按楼栋分别设置。" },
          { t: "保存", d: "点“保存房价”。按之前请把数字核对两遍。" }
        ],
        warn: "房价没有“撤销我的全部修改”这个后路。改之前一定先把原价记下来。"
      },
      {
        id: "team", ico: "👥", admin: true, title: "员工账号",
        intro: "添加人员、设置权限，以及帮登录不上的同事恢复。本页最上方就是团队状态看板，可以一边看谁在当班，一边改他的账号，不用来回切换。",
        steps: [
          { t: "添加人员", d: "填写姓名，系统会自动生成用户名（名字首字母 + 姓）。选择“员工”或“管理员”，点“添加员工”。" },
          { t: "告诉他怎么开始", d: "让他打开登录页，点“新员工账户”，用自己的用户名加密码 jparkhotel 登录，然后设置自己的密码。" },
          { t: "员工还是管理员？", d: "员工负责请求、聊天、消息和预订；管理员在此之外还能使用网站编辑、房价、员工账号、维护模式和账户日志。" },
          { t: "停用或删除", d: "“停用”是禁止登录但保留账号，“删除”是彻底移除。两者都要点“保存更改”才生效，点“撤销”可取消。" },
          { t: "密码重置请求", d: "消息 →🔑 密码重置请求。点“重置密码”，然后把新的临时密码念给本人——只显示这一次。" }
        ],
        tips: ["你不会把自己锁在外面：你自己的账号会标着“你”，无法被删除。"]
      },
      {
        id: "maintenance", ico: "🚧", admin: true, title: "维护模式与付款政策",
        intro: "两个开关，决定客人在网站上能做什么。两者都会先让你确认，然后立即生效。",
        steps: [
          { t: "维护模式", d: "打开后，客人看到的是维护提示页而不是网站，员工仍可从这里正常登录。修东西的时候用。" },
          { t: "要求预付款", d: "节假日和旺季打开：客人不能再选“入住时付款”，所有新预订必须在线付款且不可退款。淡季记得关掉。" },
          { t: "留意下方的说明", d: "如果酒店还没开通银行卡 / PromptPay 在线收款，页面上会写明，此时预付开关不会生效。" }
        ]
      },
      {
        id: "logs", ico: "🛡️", admin: true, title: "账户日志与安全",
        intro: "记录每一次员工登录，包括设备、大致位置，以及此刻是否在线。",
        steps: [
          { t: "看这份列表", d: "谁登录的、用什么设备、从哪里、最后活动时间，以及在线还是离线。你自己的那条会标着“这是您”。" },
          { t: "让某台设备退出", d: "点那一行的“登出”。手机丢了、或有人在公用电脑上忘了退出，都用它。" },
          { t: "一次清掉同一地址的全部登录", d: "点“全部登出（n）”，把该地址下的所有登录一次结束。" },
          { t: "封禁地址", d: "“封禁IP”会拦截该地址并立即结束它的所有登录，“解除封禁”可撤销。" }
        ],
        tips: ["每人最多同时登录 6 台设备，第 7 次登录会自动结束最早的一台。"],
        warn: "酒店 Wi-Fi 全楼共用同一个地址，封了可能把真正的客人和自己的员工一起挡在外面。只封你完全确定的地址。"
      }
    ]
  };

  /* =====================  繁體中文  ===================== */
  const zhHant = {
    ui: {
      nav: "使用指南",
      title: "使用指南",
      subStaff: "把你面板上的每一項功能，一步一步講清楚。",
      subAdmin: "把你面板上的每一項功能，一步一步講清楚，包含僅管理員可用的工具。",
      toc: "目錄",
      searchPh: "在指南中搜尋…",
      noMatch: "指南裡找不到這個詞，換個短一點的詞試試。",
      listen: "朗讀",
      stop: "停止",
      print: "列印 / 存成 PDF",
      adminBadge: "僅管理員",
      top: "回到目錄",
      noVoice: "本裝置沒有目前語言的語音，無法朗讀。",
      openHint: "開啟本頁的使用指南",
      steps: "操作步驟",
      tipTitle: "小提示",
      warnTitle: "注意",
      readingTime: "約需 {n} 分鐘讀完",
      newBadge: "新"
    },
    sections: [
      {
        id: "start", ico: "🚀", title: "開始使用",
        intro: "怎麼登入、怎麼設定自己的帳戶。大部分只要在第一次做一遍。",
        steps: [
          { t: "打開員工頁面", d: "進入飯店網站，點頁面最下方的「員工登入」。建議把這個頁面加入書籤，以後就不用再找了。" },
          { t: "第一次請點「新員工帳戶」", d: "輸入管理員給你的使用者名稱和臨時密碼 jparkhotel，接著設定自己的密碼（至少 6 位），點「儲存並登入」。" },
          { t: "之後正常登入就好", d: "輸入使用者名稱和密碼，點「登入」。" },
          { t: "忘記密碼？", d: "在登入頁點「忘記密碼」。系統會把申請送給管理員，管理員會給你新的臨時密碼。" },
          { t: "忘記使用者名稱？", d: "點「忘記使用者名稱」，填上你的姓名並送出，管理員會告訴你。" },
          { t: "選擇語言", d: "登入框下方以及面板左下角都有語言選單，可切換泰文、英文、日文、簡體中文和繁體中文，整個畫面都會跟著換。本裝置會記住你的選擇。" },
          { t: "上傳大頭照、修改密碼", d: "在面板左下角點自己的圓形頭像，隨時可以上傳照片或修改密碼。" },
          { t: "下班記得登出", d: "點左下角「登出」。櫃檯是共用電腦，每次下班務必登出。" }
        ],
        tips: [
          "同一個帳戶最多可在 6 台裝置保持登入；第 7 次登入會自動把最早的一台擠下線。",
          "不要把密碼告訴別人。你在系統裡的每一步操作都會記在你名下。"
        ],
        warn: "臨時密碼 jparkhotel 只在第一次登入時有效，之後只能用你自己設定的密碼。"
      },
      {
        id: "tour", ico: "🧭", title: "面板速覽",
        intro: "只有一個畫面，選單在左邊。點選單就能換頁，來回切換不會弄丟東西。",
        steps: [
          { t: "左邊的選單", d: "🛎️ 賓客請求、💬 即時聊天、✉️ 訊息、🪪 團隊狀態。管理員還會看到：網站編輯、員工、維護模式、帳戶日誌。" },
          { t: "金色的數字", d: "選單旁的數字代表「還沒處理完的量」：未完成的賓客請求、你未讀的聊天、未讀的訊息和新訂房。" },
          { t: "閃爍的驚嘆號", d: "賓客請求旁邊閃 ！，表示有請求還沒人看過。打開請求頁面停留幾秒，它就不閃了。" },
          { t: "提示音", d: "有新請求、新聊天訊息、新訂房時都會響一聲。如果一直沒人處理，每隔幾分鐘會再響一次。" },
          { t: "瀏覽器分頁", d: "有待處理事項時，分頁上會顯示 🔔 和數量，就算你在看別的分頁也能發現。" },
          { t: "會自動更新", d: "不必重新整理頁面。新的請求、聊天和訂房每隔幾秒就會自動出現。" }
        ],
        tips: [
          "聽不到提示音時，在頁面上隨便點一下——瀏覽器要有點擊後才允許播放聲音。",
          "整個班次都把這個頁面單獨開一個分頁，別關掉。"
        ]
      },
      {
        id: "requests", ico: "🛎️", title: "賓客請求",
        intro: "這是最主要的工作。賓客用手機提的每一個需求都會到這裡。從上往下做——等最久的賓客永遠排在最上面。",
        steps: [
          { t: "看懂卡片", d: "每張卡片會顯示房號、棟別、房型、賓客要什麼，以及已經等了多久。" },
          { t: "注意等待時間", d: "10 分鐘以內算正常，橘色表示超過 10 分鐘，紅色表示超過 20 分鐘——紅色的優先做。" },
          { t: "接手這一單", d: "點「接手」，同事就知道你在處理了，卡片會變成「由您處理中」。如果做不了，點「放棄處理」。" },
          { t: "先「開始」，做完點「完成」", d: "動手時點「開始」，做完點「完成」。賓客手機上會同步看到狀態變化。" },
          { t: "篩選要看的內容", d: "第一排依狀態篩選——全部、待處理、處理中、已完成、已關閉；第二排依部門篩選——客房清潔、維修、餐飲與酒吧、櫃檯。" },
          { t: "快速找到某一筆", d: "在上方搜尋框輸入房號、賓客姓氏或訂房編號。" },
          { t: "留一則備註給同事", d: "點「備註」寫一句只有員工看得到的話，例如「毛巾已放在門口」。" },
          { t: "直接和賓客溝通", d: "點 💬「留言」就能針對這一筆請求回覆賓客，賓客會在自己的聊天裡看到。「完整聊天」會打開整段對話。" },
          { t: "不是真的工單？", d: "同事練習時送出的，點 🧪「標記為測試」，紀錄還在，但不再計入工作量、也不再響鈴。不需要處理的請求點「關閉」，會移到「已關閉」標籤，隨時可以點「復原」拿回來。" },
          { t: "批次處理", d: "點「選擇」，勾選多張卡片，再用上方的按鈕一次完成、標記為測試或關閉。" }
        ],
        tips: [
          "名字旁的 🔶「待確認」表示系統沒能把這位賓客對上訂房。照常服務，但先查一下住客登記。",
          "要等櫃檯替該筆訂房分配房間之後，房號才會顯示出來。",
          "🗑 刪除按鈕只有管理員才有。員工請用「關閉」，紀錄不會不見。"
        ]
      },
      {
        id: "guest", ico: "🔎", title: "這位賓客是誰",
        intro: "點賓客的名字（在請求卡片上，或聊天最上方），右側會滑出一個面板，顯示我們掌握的全部資訊。",
        steps: [
          { t: "打開", d: "點賓客姓名即可。點 ✕ 或面板外任一處關閉。" },
          { t: "查看訂房", d: "姓名、訂房編號、房號與房型、入住與退房日期、住幾晚，以及是直接訂的還是透過 Agoda / Booking.com 訂的。" },
          { t: "未比對到訂房？", d: "在搜尋框輸入姓氏、房號或訂房編號，點選正確的那筆訂房即可連結。之後這位賓客的請求就會顯示正確的房間和棟別。" },
          { t: "指定棟別", d: "如果知道房號但不知道在哪一棟，在這裡選棟別，客房部才知道往哪裡走。" },
          { t: "看他還有什麼在等", d: "「同時等待處理」會列出這位賓客其他還沒做完的需求，一趟就能全部送到。" }
        ],
        tips: ["連結一次訂房，所有地方都會同時修正——這筆請求、他的聊天，以及他之後送出的每一筆請求。"]
      },
      {
        id: "chat", ico: "💬", title: "即時聊天",
        intro: "賓客可以從網站傳訊息給飯店。左邊是對話清單，右邊是對話內容。",
        steps: [
          { t: "選一個對話", d: "點左邊的清單。名字旁有小圓點表示有你還沒讀的訊息。" },
          { t: "先看清楚是誰", d: "名字旁的標記會告訴你：是已確認的住客，還是 🔶 待確認（報了姓名和房號但對不上），還是並未入住的網站訪客。" },
          { t: "確認真的住客", d: "如果確實住在店裡（例如 Agoda 訂單或現場散客），先查登記，再點「確認住客」，系統會記下是你確認的。" },
          { t: "一個對話只由一人回", d: "對話屬於目前連線的那位員工。若顯示「已連線 某某」，你只能看不能打字。對方在休息，就點「接手聊天」。" },
          { t: "回覆", d: "在下方輸入框打字，按 Enter 送出，賓客立刻就會看到。" },
          { t: "語言不同也沒關係", d: "最上方會顯示賓客的語言，賓客的訊息會自動翻譯給你看。你用自己的語言寫就行。" },
          { t: "整理清單", d: "📌「釘選對話」把重要對話置頂，✎「重新命名」改名字，🗑️「刪除」移除——刪除無法復原。" },
          { t: "篩選", d: "全部 / 住客 / 訪客，方便先回覆真正的賓客。" }
        ],
        tips: ["回覆一個還沒人接手的對話，系統會自動指派給你。"]
      },
      {
        id: "messages", ico: "✉️", title: "訊息（內部信箱）",
        intro: "飯店自己的信箱，跟電子郵件差不多，只是在這個系統裡。所有新訂房也都會送到這裡。",
        steps: [
          { t: "收件匣", d: "同事寄給你的訊息，點開就能閱讀。" },
          { t: "寫一封", d: "點 ✏️「撰寫」，在收件者欄輸入名字，填主旨，寫內文，按送出。" },
          { t: "回覆 / 轉寄 / 星號", d: "「回覆」回給寄件者，「轉寄」寄給別人，⭐「加星號」會留在「已加星號」資料夾，方便之後再找。" },
          { t: "公告", d: "📢 管理員發給全體的通知。每次上班先看這裡。" },
          { t: "賓客預訂", d: "🛎️ 所有新訂房都到這裡，詳見下一節。" },
          { t: "垃圾桶", d: "🗑️ 刪除的訊息保留 30 天後徹底清除。點「還原」可以取回。" },
          { t: "檢舉訊息", d: "遇到不合適的內容，點「檢舉」，管理員就會看到。" }
        ],
        tips: ["員工一次最多可寄給 10 個人，管理員可以寄給所有人。"]
      },
      {
        id: "bookings", ico: "🧾", title: "賓客預訂",
        intro: "訊息 →🛎️ 賓客預訂。網站上的所有訂房，最新的排在最前面。",
        steps: [
          { t: "打開一筆訂房", d: "點一列，就能看到賓客姓名與聯絡方式、日期、房型、金額和付款方式。" },
          { t: "入住時分配房間", d: "填寫真實房號（例如 204）並儲存。每次都要做——賓客要靠它才能使用賓客服務，他的請求也才會顯示該去哪一間房。" },
          { t: "記錄收款", d: "選擇「入住時付款」的賓客會顯示「等待付款」。在櫃檯收到錢後，點「標記為已收款」。" },
          { t: "重寄確認信", d: "點「重新發送確認郵件」。寄出前可以先修改文字或改掉寫錯的價格。" },
          { t: "特殊需求", d: "新增或修改賓客的需求，然後重新發送確認郵件，賓客那份上就會顯示出來。" },
          { t: "取消預訂", d: "點「取消預訂」並填寫原因；原因只有員工看得到，賓客看不到。賓客會收到取消通知信。若那幾天仍有空房，可以點「恢復預訂」。" },
          { t: "多間房的訂房", d: "會顯示「第 1 間 / 共 3 間」和總金額。「取消整個預訂」會一次取消所有房間，並只寄給賓客一封信。" },
          { t: "尋找與整理", d: "可依姓名、編號或房號搜尋。⭐ 給重要訂房加星號，「員工標籤」可以寫內部備註，例如「VIP，到店前先致電」。" },
          { t: "查看已寄出的信", d: "「已寄送郵件」會列出系統為這筆訂房寄出的每一封信以及是否送達。" }
        ],
        tips: ["標示「需要核實」的訂房是系統沒能完整讀取的，請打開補齊缺少的資訊。"],
        warn: "「取消預訂」可以還原，「刪除」（僅管理員）不行。拿不準就用取消。"
      },
      {
        id: "roster", ico: "🪪", title: "團隊狀態",
        intro: "看現在誰在班上。櫃檯從選單的 🪪 團隊狀態進入；管理員在 👥 員工頁面的最上方，就在帳戶清單上面。",
        steps: [
          { t: "看這塊板", d: "每人一張卡片，顯示姓名、職務、班次時間，以及當班 / 休息中 / 下班。" },
          { t: "跟著時間自動變", d: "「當班」和「下班」會依班次時間自動切換，「休息中」需要手動設定。" },
          { t: "重新整理", d: "如果看起來不是最新的，點「重新整理」。" }
        ],
        tips: ["只有管理員看得到「編輯」按鈕，用來修改職務、班次或狀態。"]
      },
      {
        id: "daily", ico: "✅", title: "一個班次怎麼做",
        intro: "不知道從哪開始的話，就照這個順序來。",
        steps: [
          { t: "1. 登入並看公告", d: "訊息 →📢 公告，最新的在最上面。" },
          { t: "2. 清空請求看板", d: "從上往下做：接手 → 開始 → 完成。" },
          { t: "3. 回覆聊天", d: "在即時聊天裡，先回住客，再回訪客。" },
          { t: "4. 查看新訂房", d: "訊息 →🛎️ 賓客預訂，替今天到店的賓客分配房間。" },
          { t: "5. 入住時記錄收款", d: "賓客付款後點「標記為已收款」。" },
          { t: "6. 分頁保持開著", d: "別關這個頁面，有新事項才聽得到提示音。" },
          { t: "7. 下班前", d: "把接手的工單做完或放棄處理，然後登出。" }
        ]
      },
      {
        id: "trouble", ico: "🩺", title: "出問題怎麼辦",
        intro: "常見問題和最快的解決辦法。",
        steps: [
          { t: "登入不了", d: "檢查大小寫和多餘的空格。還是不行就在登入頁點「忘記密碼」。" },
          { t: "顯示帳戶已停用", d: "管理員把帳戶關掉了，請他重新啟用。" },
          { t: "自己被登出了", d: "為了安全，登入狀態會定期失效，重新登入即可，東西不會不見。" },
          { t: "沒有聲音", d: "在頁面上點一下，再檢查電腦音量。" },
          { t: "顯示連不上飯店系統", d: "網路或伺服器出了問題。等一下再試，你輸入的內容會保留。" },
          { t: "賓客沒有房號", d: "還沒人分配。訊息 → 賓客預訂 → 打開該筆訂房 →「分配房間」。" },
          { t: "聊天裡打不了字", d: "該對話由別人連線中，點「接手聊天」。" },
          { t: "誤點了「完成」", d: "打開那張卡片，點「重新開啟」。" },
          { t: "誤點了「關閉」", d: "把篩選切到「已關閉」，點「復原」。" },
          { t: "介面語言不對", d: "在選單左下角的語言選單裡切換。" }
        ]
      },
      {
        id: "glossary", ico: "📖", title: "會看到的詞",
        intro: "畫面上這些詞的簡單意思。",
        steps: [
          { t: "待處理", d: "還沒有人開始做。" },
          { t: "處理中", d: "有人正在做。" },
          { t: "已完成", d: "已經做完了。" },
          { t: "已關閉", d: "先放一邊、沒有去做，可以復原。" },
          { t: "測試", d: "練習用的工單，會留紀錄，但不計入工作量、也不會觸發提醒。" },
          { t: "待確認 🔶", d: "系統沒能把這個人對上任何訂房。" },
          { t: "訪客", d: "只是在看網站、並沒有住房的人。" },
          { t: "Direct (Website)", d: "在我們自己的網站上訂的。" },
          { t: "OTA", d: "透過 Agoda、Booking.com、Airbnb 等平台訂的。" },
          { t: "訂房編號", d: "每筆訂房的編號，例如 JP-1001。" },
          { t: "鐘點房（Day-use）", d: "3 小時使用，不過夜。" },
          { t: "預付款", d: "到店前線上付款，且不可退款。" },
          { t: "入住時付款", d: "到店時在櫃檯付。" }
        ]
      },
      {
        id: "site", ico: "🛠️", admin: true, title: "網站編輯",
        intro: "你可以自己改公開網站的文字、圖片、顏色和要顯示哪些版塊。點到輸入框外面就自動儲存，網站上立刻生效。",
        steps: [
          { t: "網站文字", d: "先選「正在編輯的語言」，再用搜尋框或分組找到要改的文字。點進欄位改好後點旁邊空白處，就會儲存並顯示「已儲存 ✓」。" },
          { t: "會自動翻譯", d: "改動其中一種語言，另外四種會自動翻譯，不會漏掉任何語言。之後你還可以逐一語言手動潤飾。" },
          { t: "照片與影片", d: "打開任一版塊即可新增、替換、調整順序或移除照片。可從電腦上傳（小於 4 MB）或貼上連結。第一張圖會當作該版塊的封面。" },
          { t: "顏色", d: "選擇新的品牌色，整個網站配色立刻更新。「重設顏色」可以還原。" },
          { t: "版塊", d: "打勾或取消打勾來顯示 / 隱藏版塊，在網站上方發布公告橫幅，也可以把暫時不可售的房型（房型上架狀態）或鐘點房棟別（鐘點房上架狀態）關掉。" },
          { t: "歷史修改", d: "網站的每一次改動，以及是誰在什麼時候改的，最新的在最前面。" },
          { t: "還原", d: "每個欄位都有自己的「重設」；版塊分頁最下方的「復原我的全部修改」可以把文字、照片和顏色一次還原。" }
        ],
        tips: ["再開一個瀏覽器分頁並排放著網站，儲存後馬上就能看到效果。"],
        warn: "「房價」分頁和其他都不一樣，動手之前請先看下一節。"
      },
      {
        id: "rates", ico: "💰", admin: true, title: "房價 — 請先讀這一節",
        intro: "網站編輯 → 房價，是唯一改動會牽涉到真金白銀的地方。沒有草稿、沒有預覽、也不能還原：一點「儲存房價」，下一位賓客就照新價格收費。",
        steps: [
          { t: "可以改什麼", d: "各房型、各床型的「僅房費」和「含早餐」價格，單位是每晚泰銖。" },
          { t: "加人加價", d: "每晚加床費、每位賓客每晚的加早餐費，以及 5–8 歲兒童早餐費（0–4 歲免費，9 歲以上依成人價）。" },
          { t: "鐘點房價格", d: "3 小時使用的價格，依棟別分別設定。" },
          { t: "儲存", d: "點「儲存房價」。按之前請把數字核對兩遍。" }
        ],
        warn: "房價沒有「復原我的全部修改」這條後路。改之前一定先把原價記下來。"
      },
      {
        id: "team", ico: "👥", admin: true, title: "員工帳戶",
        intro: "新增人員、設定權限，以及協助登入不了的同事。本頁最上方就是團隊狀態看板，可以一邊看誰在當班，一邊改他的帳戶，不用來回切換。",
        steps: [
          { t: "新增人員", d: "填寫姓名，系統會自動產生使用者名稱（名字首字母 + 姓）。選擇「員工」或「管理員」，點「新增員工」。" },
          { t: "告訴他怎麼開始", d: "請他打開登入頁，點「新員工帳戶」，用自己的使用者名稱加上密碼 jparkhotel 登入，然後設定自己的密碼。" },
          { t: "員工還是管理員？", d: "員工負責請求、聊天、訊息和訂房；管理員在此之外還能使用網站編輯、房價、員工帳戶、維護模式和帳戶日誌。" },
          { t: "停用或刪除", d: "「停用」是禁止登入但保留帳戶，「刪除」是徹底移除。兩者都要點「儲存變更」才生效，點「復原」可取消。" },
          { t: "密碼重設請求", d: "訊息 →🔑 密碼重設請求。點「重設密碼」，然後把新的臨時密碼唸給本人——只會顯示這一次。" }
        ],
        tips: ["你不會把自己鎖在外面：你自己的帳戶會標著「您」，無法刪除。"]
      },
      {
        id: "maintenance", ico: "🚧", admin: true, title: "維護模式與付款政策",
        intro: "兩個開關，決定賓客在網站上能做什麼。兩者都會先讓你確認，然後立即生效。",
        steps: [
          { t: "維護模式", d: "打開後，賓客看到的是維護通知頁而不是網站，員工仍可從這裡正常登入。修東西的時候用。" },
          { t: "新訂房要求預付款", d: "連假和旺季打開：賓客不能再選「入住時付款」，所有新訂房必須線上付款且不可退款。淡季記得關掉。" },
          { t: "留意下方的說明", d: "如果飯店還沒開通信用卡 / PromptPay 線上收款，頁面上會寫明，此時預付款開關不會生效。" }
        ]
      },
      {
        id: "logs", ico: "🛡️", admin: true, title: "帳戶日誌與安全",
        intro: "記錄每一次員工登入，包含裝置、大致位置，以及此刻是否在線。",
        steps: [
          { t: "看這份清單", d: "誰登入的、用什麼裝置、從哪裡、最後活動時間，以及在線或離線。你自己那筆會標著「這是您」。" },
          { t: "讓某台裝置登出", d: "點那一列的「登出」。手機掉了、或有人在共用電腦上忘了登出，都用它。" },
          { t: "一次清掉同一位址的全部登入", d: "點「全部登出（n）」，把該位址下的所有登入一次結束。" },
          { t: "封鎖位址", d: "「封鎖IP」會擋掉該位址並立即結束它的所有登入，「解除封鎖」可撤銷。" }
        ],
        tips: ["每人最多同時登入 6 台裝置，第 7 次登入會自動結束最早的一台。"],
        warn: "飯店 Wi-Fi 全棟共用同一個位址，封了可能把真正的賓客和自己的員工一起擋在外面。只封你完全確定的位址。"
      }
    ]
  };

  /* LANGUAGES-GO-HERE */

  return { en: en, th: th, ja: ja, "zh-Hans": zhHans, "zh-Hant": zhHant };
})();
