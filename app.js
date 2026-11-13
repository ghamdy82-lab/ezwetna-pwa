/* 
 * Azwetna Platform - Core Application Logic (v2.2)
 * Developed & Owned by: Taghreed Hamdy (CodeCraft Egypt) © 2026
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, query, where, serverTimestamp, doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

console.log("%c منصة عَزْوَتْنَا © 2026 | تطوير: م. تغريد حمدي (CodeCraft Egypt) ", "background: #1F4E5B; color: #FFD166; font-size: 13px; font-weight: bold; padding: 8px 12px; border-radius: 6px;");

const TELEGRAM_BOT_TOKEN = "9241445474:AAH8uKYRudHx9JhWGgoC8gTMIghtk0bu2rk";
const TELEGRAM_CHAT_ID = "9127937709";

async function sendTelegramAlert(text) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text })
    });
  } catch (e) { console.error("Telegram error", e); }
}

const firebaseConfig = {
  apiKey: "AIzaSyB76NcdVQTSUIYxeBsXh9ojeTMWg9L5mt8",
  authDomain: "azwetna.firebaseapp.com",
  projectId: "azwetna",
  storageBucket: "azwetna.firebasestorage.app",
  messagingSenderId: "1029926764111",
  appId: "1:1029926764111:web:91ad2c45165c86e5fc743a",
  measurementId: "G-JN3ERLW46Y"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let allWorkers = [];
let allCategories = [];
let currentCategory = "all";
let currentUser = null;
let pendingAction = null;
const PAGE_SIZE = 12;
let visibleCount = PAGE_SIZE;

// =========================================================================
// 1. محرك القرب الجغرافي وتوحيد الحروف العربية للبحث الذكي
// =========================================================================
function normalizeArabic(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/(^|\s)ال/g, "$1")
    .replace(/اولي|اول/g, "1")
    .replace(/تانيه|ثانيه|تاني|ثاني/g, "2")
    .replace(/تالته|ثالثه|تالت|ثالث/g, "3")
    .replace(/رابعه|رابع/g, "4")
    .replace(/خامسه|خامس/g, "5")
    .replace(/سادسه|سادس/g, "6")
    .replace(/سابعه|سابع/g, "7")
    .trim();
}

function extractLocationProfile(rawText) {
  const norm = normalizeArabic(rawText);
  let mainZone = null;

  const mahaliyaMatch = norm.match(/محليه\s*([1-7])/);
  if (mahaliyaMatch) {
    mainZone = `m${mahaliyaMatch[1]}`;
  } else if (norm.includes("شباب")) {
    mainZone = "shabab";
  } else if (norm.includes("مستقبل")) {
    mainZone = "mostaqbal";
  } else if (norm.includes("قطاميه")) {
    mainZone = "katameya";
  }

  let subZone = null;
  const subMatch = norm.match(/(منطقه|مجاوره|حي)\s*([1-9])/);
  if (subMatch) {
    subZone = `${subMatch[1]}_${subMatch[2]}`;
  }

  return { norm, mainZone, subZone };
}

const ZONE_NEIGHBORS = {
  m1: ["m2", "m3"],
  m2: ["m1", "m3", "m4"],
  m3: ["m1", "m2", "m4", "m5"],
  m4: ["m2", "m3", "m5", "m6"],
  m5: ["m3", "m4", "m6", "m7"],
  m6: ["m4", "m5", "m7", "shabab"],
  m7: ["m5", "m6", "shabab", "mostaqbal"],
  shabab: ["m6", "m7", "mostaqbal"],
  mostaqbal: ["m7", "shabab"],
  katameya: ["m1", "m2"]
};

function getZoneSteps(fromZone, toZone) {
  if (!fromZone || !toZone) return 99;
  if (fromZone === toZone) return 0;
  const visited = new Set([fromZone]);
  const queue = [[fromZone, 0]];
  while (queue.length > 0) {
    const [curr, dist] = queue.shift();
    const neighbors = ZONE_NEIGHBORS[curr] || [];
    for (const next of neighbors) {
      if (next === toZone) return dist + 1;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([next, dist + 1]);
      }
    }
  }
  return 50;
}

function evaluateProximity(userAddress, workerArea) {
  if (!userAddress || !workerArea) return { rank: 99, badgeHTML: "" };
  const userLoc = extractLocationProfile(userAddress);
  const workerLoc = extractLocationProfile(workerArea);

  if (userLoc.mainZone && workerLoc.mainZone) {
    const steps = getZoneSteps(userLoc.mainZone, workerLoc.mainZone);
    if (steps === 0) {
      if (userLoc.subZone && workerLoc.subZone && userLoc.subZone === workerLoc.subZone) {
        return { rank: 0, badgeHTML: `<span class="proximity-badge proximity-exact">📍 في منطقتك بالظبط</span>` };
      }
      return { rank: 1, badgeHTML: `<span class="proximity-badge proximity-exact">📍 في محليتك</span>` };
    }
    if (steps === 1) {
      return { rank: 2, badgeHTML: `<span class="proximity-badge proximity-near">🚶 قريب منك</span>` };
    }
    return { rank: 2 + steps, badgeHTML: "" };
  }

  if (userLoc.norm.length >= 3 && workerLoc.norm.includes(userLoc.norm)) {
    return { rank: 1, badgeHTML: `<span class="proximity-badge proximity-exact">📍 في منطقتك</span>` };
  }
  return { rank: 99, badgeHTML: "" };
}

// يظهر شريط التنويه فقط لغير المسجلين، ويختفي تماماً بمجرد تسجيل العنوان لتوفير المساحة
function updateAddressPromptUI() {
  const savedAddress = (localStorage.getItem("ezwetna_user_address") || "").trim();
  const dismissed = sessionStorage.getItem("ezwetna_dismissed_addr_prompt") === "1";
  const promptBanner = document.getElementById("addressPromptBanner");
  if (!promptBanner) return;

  if (savedAddress || dismissed) {
    promptBanner.classList.remove("active");
  } else {
    promptBanner.classList.add("active");
  }
}

// اختيار أيقونة معبرة تلقائياً حسب المهنة والقسم
function getProfessionIcon(worker) {
  const catObj = allCategories.find(c => c.id === worker.category);
  const j = `${worker.job || ""} ${worker.category || ""} ${catObj ? catObj.name : ""}`;
  if (j.includes("قرآن") || j.includes("قران") || j.includes("تحفيظ") || j.includes("تجويد")) return "📖";
  if (j.includes("مدرس") || j.includes("تعليم") || j.includes("تأسيس") || j.includes("دروس")) return "🎓";
  if (worker.avatar && worker.avatar !== "🛠️") return worker.avatar;
  if (catObj && catObj.icon && catObj.icon !== "🛠️") return catObj.icon;
  if (j.includes("سباك")) return "🚰";
  if (j.includes("كهربا")) return "⚡";
  if (j.includes("نجار")) return "🪚";
  if (j.includes("تكييف") || j.includes("تبريد")) return "❄️";
  if (j.includes("نقاش") || j.includes("دهان")) return "🎨";
  if (j.includes("مكوج") || j.includes("مغسل") || j.includes("دراي")) return "👔";
  if (j.includes("كوافير") || j.includes("تجميل") || j.includes("حلاق")) return "✂️";
  if (j.includes("ترزي") || j.includes("خياط") || j.includes("تفصيل")) return "🧵";
  if (j.includes("حدايد") || j.includes("بويات") || j.includes("مؤان")) return "🧰";
  if (j.includes("طبيب") || j.includes("دكتور") || j.includes("عياد") || j.includes("صيدل")) return "🩺";
  if (j.includes("ماركت") || j.includes("بقال") || j.includes("عطار")) return "🛒";
  if (j.includes("مكتب") || j.includes("ادوات مدرسيه")) return "📚";
  if (j.includes("موبايل") || j.includes("دش") || j.includes("كاميرات")) return "📱";
  if (j.includes("غسالات") || j.includes("ثلاجات") || j.includes("بوتاجاز") || j.includes("اجهزه")) return "🔌";
  if (j.includes("توصيل") || j.includes("مشاوير") || j.includes("سياره")) return "🚗";
  if (j.includes("ألوميتال") || j.includes("الوميتال") || j.includes("سلك")) return "🪟";
  return worker.avatar || "🛠️";
}

function formatWaNumber(raw) {
  const clean = (raw || "").replace(/[^0-9]/g, '');
  return clean.startsWith('0') ? '2' + clean : (clean.startsWith('20') ? clean : '20' + clean);
}

window.trackAction = async function(workerId, actionType, workerName = "") {
  if (!workerId) return;
  try {
    const ratedList = JSON.parse(localStorage.getItem("ezwetna_rated_workers") || "[]");
    if (!ratedList.includes(workerId)) {
      localStorage.setItem("ezwetna_last_contacted", JSON.stringify({
        id: workerId,
        name: workerName || "الحرفي",
        time: Date.now()
      }));
    }

    const workerRef = doc(db, "workers", workerId);
    const fieldToUpdate = actionType === 'call' ? 'callClicks' : 'waClicks';
    await updateDoc(workerRef, {
      [fieldToUpdate]: increment(1)
    });
  } catch (err) {}
};

// =========================================================================
// 2. نافذة اختيار الرقم الذكية (تمنع زحمة الـ 4 أزرار على الكارت)
// =========================================================================
window.handleContactClick = function(workerId, mode) {
  const worker = allWorkers.find(w => w.id === workerId);
  if (!worker) return;

  const cleanPhone1 = worker.phone ? worker.phone.replace(/[^0-9]/g, '') : '';
  const cleanPhone2 = worker.phone2 ? worker.phone2.replace(/[^0-9]/g, '') : '';

  const p1Call = worker.phone1Call !== undefined ? worker.phone1Call : Boolean(cleanPhone1);
  const p1Wa = worker.phone1Wa !== undefined ? worker.phone1Wa : Boolean(cleanPhone1);
  const p2Call = worker.phone2Call !== undefined ? worker.phone2Call : Boolean(cleanPhone2);
  const p2Wa = worker.phone2Wa !== undefined ? worker.phone2Wa : false;

  const savedAddress = (localStorage.getItem("ezwetna_user_address") || "").trim();
  const addressPart = savedAddress ? `، أنا جارك من (${savedAddress})` : "";
  const waMsg = encodeURIComponent(`السلام عليكم، شفت بيانات حضرتك على منصة (عزوتنا)${addressPart} ومحتاج أستفسر بخصوص: `);

  const options = [];
  if (mode === 'call') {
    if (cleanPhone1 && p1Call) options.push({ num: cleanPhone1, label: "الرقم الأساسي" });
    if (cleanPhone2 && p2Call && cleanPhone2 !== cleanPhone1) options.push({ num: cleanPhone2, label: "الرقم الثاني / البديل" });
  } else {
    if (cleanPhone1 && p1Wa) options.push({ num: cleanPhone1, label: "واتساب الرقم الأساسي" });
    if (cleanPhone2 && p2Wa && cleanPhone2 !== cleanPhone1) options.push({ num: cleanPhone2, label: "واتساب الرقم الثاني" });
  }

  if (options.length === 0) return;

  // لو فيه رقم واحد متاح، يتصل أو يفتح واتساب فوراً
  if (options.length === 1) {
    trackAction(worker.id, mode, worker.name);
    if (mode === 'call') {
      window.location.href = `tel:${options[0].num}`;
    } else {
      window.open(`https://wa.me/${formatWaNumber(options[0].num)}?text=${waMsg}`, '_blank');
    }
    return;
  }

  // لو فيه رقمين متاحين، يفتح نافذة أنيقة يختار منها الرقم
  const modal = document.getElementById("contactChooserModal");
  const title = document.getElementById("chooserModalTitle");
  const sub = document.getElementById("chooserModalSub");
  const container = document.getElementById("chooserButtonsContainer");
  if (!modal || !container) return;

  title.innerHTML = mode === 'call' ? `📞 اختر الرقم للاتصال` : `💬 اختر الرقم لمراسلة واتساب`;
  sub.textContent = worker.name;

  container.innerHTML = options.map((opt, idx) => {
    const href = mode === 'call'
      ? `tel:${opt.num}`
      : `https://wa.me/${formatWaNumber(opt.num)}?text=${waMsg}`;
    const bg = mode === 'call' ? (idx === 0 ? '#0f4c5c' : '#334155') : '#25D366';
    const icon = mode === 'call' ? '<i class="fa-solid fa-phone"></i>' : '<i class="fa-brands fa-whatsapp"></i>';
    const targetAttr = mode === 'wa' ? 'target="_blank"' : '';

    return `
      <a href="${href}" ${targetAttr} onclick="trackAction('${worker.id}', '${mode}', '${(worker.name || '').replace(/'/g, "\\'")}'); document.getElementById('contactChooserModal').style.display='none';"
         style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:${bg}; color:#fff; border-radius:12px; text-decoration:none; font-weight:700; font-size:0.88rem;">
        <span>${icon} ${opt.label}</span>
        <span dir="ltr" style="background:rgba(255,255,255,0.2); padding:2px 8px; border-radius:8px; font-size:0.82rem;">${opt.num}</span>
      </a>
    `;
  }).join("");

  modal.style.display = "flex";
};

function checkSmartReviewBanner() {
  const banner = document.getElementById("smartReviewBanner");
  const nameEl = document.getElementById("smartReviewWorkerName");
  const rateBtn = document.getElementById("smartReviewBtn");
  const dismissBtn = document.getElementById("dismissSmartReviewBtn");
  if (!banner || !nameEl || !rateBtn) return;

  try {
    const lastContact = JSON.parse(localStorage.getItem("ezwetna_last_contacted") || "null");
    const ratedList = JSON.parse(localStorage.getItem("ezwetna_rated_workers") || "[]");
    if (!lastContact || !lastContact.id || ratedList.includes(lastContact.id)) {
      banner.classList.remove("active");
      return;
    }

    nameEl.textContent = lastContact.name;
    banner.classList.add("active");

    rateBtn.onclick = () => openRatingModal(lastContact.id, lastContact.name);
    if (dismissBtn) {
      dismissBtn.onclick = () => {
        localStorage.removeItem("ezwetna_last_contacted");
        banner.classList.remove("active");
      };
    }
  } catch (e) {}
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkSmartReviewBanner();
});

window.openWorkerCardModal = function(workerId) {
  const worker = allWorkers.find(w => w.id === workerId);
  if (!worker) return;
  const cardData = worker.cardImage || worker.photoUrl;
  if (!cardData) return;

  const modal = document.getElementById("cardViewerModal");
  const title = document.getElementById("cardModalTitle");
  const img = document.getElementById("cardModalImg");
  const downloadBtn = document.getElementById("downloadCardBtn");

  if (title) title.textContent = `🪪 كارت: ${worker.name}`;
  if (img) img.src = cardData;
  if (downloadBtn) {
    downloadBtn.href = cardData;
    downloadBtn.download = `كارت-${worker.name.replace(/\s+/g, '-')}.jpg`;
  }
  if (modal) modal.style.display = "flex";
};

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem("ezwetna_favorites") || "[]");
  } catch (e) {
    return [];
  }
}

window.toggleFavorite = function(workerId) {
  let favs = getFavorites();
  if (favs.includes(workerId)) {
    favs = favs.filter(id => id !== workerId);
  } else {
    favs.push(workerId);
  }
  localStorage.setItem("ezwetna_favorites", JSON.stringify(favs));
  renderCategoriesUI();
  filterWorkers(false);
};

function autoFillSavedPhone() {
  const savedPhone = localStorage.getItem("ezwetna_user_phone") || "";
  if (!savedPhone) return;
  const rPhone = document.getElementById("rPhone");
  const sugPhone = document.getElementById("popupSugPhone");
  if (rPhone && !rPhone.value) rPhone.value = savedPhone;
  if (sugPhone && !sugPhone.value) sugPhone.value = savedPhone;
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  const navAvatar = document.getElementById('navUserAvatar');
  const navAvatarContainer = document.getElementById('navAvatarContainer');
  const logoutSection = document.getElementById('logoutSection');
  const profileGoogleLoginBtn = document.getElementById('profileGoogleLoginBtn');
  const profileLoggedInText = document.getElementById('profileLoggedInText');

  if (user) {
    const loginModal = document.getElementById("loginModal");
    if (loginModal) loginModal.style.display = "none";
    
    if (navAvatar && navAvatarContainer && user.photoURL) {
      navAvatar.src = user.photoURL;
      navAvatarContainer.style.border = "2px solid #10b981";
    }

    if (logoutSection) logoutSection.style.display = "block";
    if (profileGoogleLoginBtn) profileGoogleLoginBtn.style.display = "none";
    if (profileLoggedInText) {
      profileLoggedInText.style.display = "block";
      profileLoggedInText.innerHTML = `✅ مسجل دخول باسم: ${user.displayName || user.email}`;
    }

    if (pendingAction === 'suggestion') {
      autoFillSavedPhone();
      document.getElementById("sugModal").style.display = "flex";
    }
    if (pendingAction && pendingAction.startsWith('rate_')) {
      const parts = pendingAction.split('_');
      openRatingModal(parts[1], parts[2]);
    }
    pendingAction = null;
  } else {
    if (navAvatar && navAvatarContainer) {
      navAvatar.src = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
      navAvatarContainer.style.border = "2px solid transparent";
    }
    if (logoutSection) logoutSection.style.display = "none";
    if (profileGoogleLoginBtn) profileGoogleLoginBtn.style.display = "flex";
    if (profileLoggedInText) profileLoggedInText.style.display = "none";
  }
});

async function handleGoogleSignIn() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    alert("تعذر تسجيل الدخول، تأكد من فتح الموقع عبر الرابط الرسمي.");
  }
}

const googleLoginBtn = document.getElementById("googleLoginBtn");
if (googleLoginBtn) googleLoginBtn.addEventListener("click", handleGoogleSignIn);

const profileGoogleLoginBtn = document.getElementById("profileGoogleLoginBtn");
if (profileGoogleLoginBtn) profileGoogleLoginBtn.addEventListener("click", handleGoogleSignIn);

const workersList = document.getElementById("workersList");
const searchInput = document.getElementById("searchInput");
const categoriesBar = document.getElementById("categoriesBar");

// =========================================================================
// 3. بناء شريط الأقسام المختصر + شبكة كل الأقسام (Grid) بالعدادات
// =========================================================================
window.selectCategory = function(catId) {
  currentCategory = catId;
  visibleCount = PAGE_SIZE;
  const allCatsModal = document.getElementById("allCategoriesModal");
  if (allCatsModal) allCatsModal.style.display = "none";
  renderCategoriesUI();
  filterWorkers(true);
};

function renderCategoriesUI() {
  if (!categoriesBar) return;

  const counts = {};
  allWorkers.forEach(w => {
    const c = w.category || "other";
    counts[c] = (counts[c] || 0) + 1;
  });

  const favsCount = allWorkers.filter(w => getFavorites().includes(w.id)).length;
  const emgCount = allWorkers.filter(w => Boolean(w.isEmergency)).length;

  // ترتيب الأقسام تنازلياً حسب عدد الحرفيين لعرض أشهر 3 أقسام فقط في الشريط السريع
  const sortedCats = [...allCategories].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
  const topQuickCats = sortedCats.filter(c => (counts[c.id] || 0) > 0).slice(0, 3);

  // لو المستخدم مختار قسم من الشبكة مش من الـ 3 الأوائل، نظهره في الشريط عشان يعرف هو واقف فين
  const selectedCatObj = allCategories.find(c => c.id === currentCategory);
  if (selectedCatObj && !topQuickCats.some(c => c.id === selectedCatObj.id)) {
    topQuickCats.unshift(selectedCatObj);
  }

  categoriesBar.innerHTML = `
    <button type="button" class="cat-pill all-grid-trigger" id="openAllCatsGridBtn">
      ⊞ الأقسام <span class="cat-count-badge">${allCategories.length}</span>
    </button>
    <button type="button" class="cat-pill ${currentCategory === 'all' ? 'active' : ''}" onclick="selectCategory('all')">
      الكل <span class="cat-count-badge">${allWorkers.length}</span>
    </button>
    <button type="button" class="cat-pill ${currentCategory === 'favs' ? 'active' : ''}" onclick="selectCategory('favs')">
      ❤️ مفضلتي <span class="cat-count-badge">${favsCount}</span>
    </button>
    <button type="button" class="cat-pill ${currentCategory === 'emergency' ? 'active' : ''}" onclick="selectCategory('emergency')">
      🚨 طوارئ <span class="cat-count-badge">${emgCount}</span>
    </button>
    ${topQuickCats.map(cat => `
      <button type="button" class="cat-pill ${currentCategory === cat.id ? 'active' : ''}" onclick="selectCategory('${cat.id}')">
        ${cat.icon || '🛠️'} ${cat.name} <span class="cat-count-badge">${counts[cat.id] || 0}</span>
      </button>
    `).join("")}
  `;

  const openGridBtn = document.getElementById("openAllCatsGridBtn");
  if (openGridBtn) {
    openGridBtn.addEventListener("click", () => {
      const modal = document.getElementById("allCategoriesModal");
      if (modal) modal.style.display = "flex";
    });
  }

  // تعبئة شبكة كل الأقسام (Grid Modal)
  const gridContainer = document.getElementById("allCategoriesGrid");
  const modalTitle = document.getElementById("allCatsModalTitle");
  if (modalTitle) modalTitle.textContent = `⊞ جميع أقسام الدليل (${allCategories.length} قسم)`;
  if (gridContainer) {
    gridContainer.innerHTML = `
      <div class="cat-grid-card ${currentCategory === 'all' ? 'active' : ''}" onclick="selectCategory('all')">
        <span class="cat-grid-icon">📋</span>
        <span class="cat-grid-name">كل التخصصات</span>
        <span class="cat-grid-count">${allWorkers.length} حرفي</span>
      </div>
      <div class="cat-grid-card ${currentCategory === 'emergency' ? 'active' : ''}" onclick="selectCategory('emergency')">
        <span class="cat-grid-icon">🚨</span>
        <span class="cat-grid-name">طوارئ 24 ساعة</span>
        <span class="cat-grid-count">${emgCount} حرفي</span>
      </div>
      ${sortedCats.map(cat => `
        <div class="cat-grid-card ${currentCategory === cat.id ? 'active' : ''}" onclick="selectCategory('${cat.id}')">
          <span class="cat-grid-icon">${cat.icon || '🛠️'}</span>
          <span class="cat-grid-name">${cat.name}</span>
          <span class="cat-grid-count">${counts[cat.id] || 0} في القسم</span>
        </div>
      `).join("")}
    `;
  }
}

async function initDirectoryData() {
  try {
    const [catSnap, workerSnap] = await Promise.all([
      getDocs(collection(db, "categories")),
      getDocs(query(collection(db, "workers"), where("status", "==", "approved")))
    ]);

    allCategories = [];
    catSnap.forEach(d => allCategories.push({ docId: d.id, ...d.data() }));

    allWorkers = [];
    workerSnap.forEach(d => allWorkers.push({ id: d.id, ...d.data() }));

    renderCategoriesUI();
    filterWorkers(true);
    checkSmartReviewBanner();
  } catch (error) {
    console.error(error);
  }
}

function updateActiveCategoryHeader(filteredCount) {
  const titleEl = document.getElementById("activeCatTitleText");
  const countEl = document.getElementById("activeCatCountText");
  if (!titleEl || !countEl) return;

  const rawSearch = searchInput ? searchInput.value.trim() : "";
  if (rawSearch) {
    titleEl.innerHTML = `🔍 نتائج البحث عن: "${rawSearch}"`;
    countEl.textContent = `(${filteredCount} نتيجة)`;
    return;
  }

  if (currentCategory === "all") {
    titleEl.innerHTML = `📋 جميع التخصصات في الدليل`;
  } else if (currentCategory === "favs") {
    titleEl.innerHTML = `❤️ قائمتي المفضلة`;
  } else if (currentCategory === "emergency") {
    titleEl.innerHTML = `🚨 خدمات طوارئ 24 ساعة`;
  } else {
    const catObj = allCategories.find(c => c.id === currentCategory);
    titleEl.innerHTML = catObj ? `${catObj.icon || '🛠️'} قسم: ${catObj.name}` : `🛠️ القسم المختار`;
  }
  countEl.textContent = `(${filteredCount} متاح)`;
}

function renderWorkers(workers) {
  if (!workersList) return;
  const loadMoreContainer = document.getElementById("loadMoreContainer");
  const loadMoreBtn = document.getElementById("loadMoreBtn");

  updateActiveCategoryHeader(workers.length);

  if (workers.length === 0) {
    if (loadMoreContainer) loadMoreContainer.style.display = "none";
    const emptyMsg = currentCategory === "favs" 
      ? "لسه مضفتش أي حرفي للمفضلة ❤️.. اضغط على علامة القلب جنب أي حرفي لحفظه هنا!" 
      : "مفيش نتايج مطابقة للبحث حالياً";
    workersList.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#64748B;"><p style="font-size:1rem; font-weight:700;">${emptyMsg}</p></div>`;
    return;
  }

  const favs = getFavorites();
  const savedAddress = (localStorage.getItem("ezwetna_user_address") || "").trim();

  const enrichedWorkers = workers.map(w => {
    const prox = evaluateProximity(savedAddress, w.area);
    return { ...w, _proxRank: prox.rank, _proxBadge: prox.badgeHTML };
  });

  if (savedAddress) {
    enrichedWorkers.sort((a, b) => {
      if (a._proxRank !== b._proxRank) return a._proxRank - b._proxRank;
      return (b.rating || 5) - (a.rating || 5);
    });
  }

  const visibleSlice = enrichedWorkers.slice(0, visibleCount);
  const remaining = enrichedWorkers.length - visibleSlice.length;

  if (loadMoreContainer && loadMoreBtn) {
    if (remaining > 0) {
      loadMoreContainer.style.display = "block";
      loadMoreBtn.textContent = `عرض المزيد من الحرفيين (متبقي ${remaining}) 👇`;
      loadMoreBtn.onclick = () => {
        visibleCount += PAGE_SIZE;
        renderWorkers(workers);
      };
    } else {
      loadMoreContainer.style.display = "none";
    }
  }

  workersList.innerHTML = visibleSlice.map(worker => {
    const cleanPhone1 = worker.phone ? worker.phone.replace(/[^0-9]/g, '') : '';
    const cleanPhone2 = worker.phone2 ? worker.phone2.replace(/[^0-9]/g, '') : '';
    
    const p1Call = worker.phone1Call !== undefined ? worker.phone1Call : Boolean(cleanPhone1);
    const p1Wa = worker.phone1Wa !== undefined ? worker.phone1Wa : Boolean(cleanPhone1);
    const p2Call = worker.phone2Call !== undefined ? worker.phone2Call : Boolean(cleanPhone2);
    const p2Wa = worker.phone2Wa !== undefined ? worker.phone2Wa : false;

    const hasAnyCall = (cleanPhone1 && p1Call) || (cleanPhone2 && p2Call);
    const hasAnyWa = (cleanPhone1 && p1Wa) || (cleanPhone2 && p2Wa);
    
    const iconEmoji = getProfessionIcon(worker);
    const hasCard = Boolean(worker.cardImage || worker.photoUrl);
    const ratingVal = worker.rating || 5.0;
    const ratingCount = worker.ratingsCount || 0;
    const isFav = favs.includes(worker.id);
    const safeName = (worker.name || '').replace(/'/g, "\\'");

    // معالجة كلمة "لا يوجد" في العنوان تلقائياً
    const rawArea = (worker.area || "").trim();
    const displayArea = (!rawArea || rawArea === "لا يوجد" || rawArea === "لايوجد")
      ? "التجمع الثالث (خدمة متنقلة)"
      : rawArea;

    const emergencyBadge = worker.isEmergency 
      ? `<span style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 3px 8px; border-radius: 20px; font-weight: bold; font-size: 0.7rem; display: inline-flex; align-items: center; gap: 3px;">🚨 طوارئ 24 ساعة</span>`
      : '';

    // أيقونة اتصال واحدة وأيقونة واتساب واحدة فقط
    let actionButtonsHTML = "";
    if (hasAnyCall) {
      actionButtonsHTML += `
        <button type="button" onclick="handleContactClick('${worker.id}', 'call')" style="width: 38px; height: 38px; border-radius: 11px; border: 1px solid #cce7e8; background: #eef8f8; color: #0f4c5c; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1rem;" title="اتصال هاتفي">
          <i class="fa-solid fa-phone"></i>
        </button>`;
    }
    if (hasAnyWa) {
      actionButtonsHTML += `
        <button type="button" onclick="handleContactClick('${worker.id}', 'wa')" style="width: 38px; height: 38px; border-radius: 11px; border: none; background: #25D366; color: #ffffff; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1.15rem;" title="مراسلة واتساب">
          <i class="fa-brands fa-whatsapp"></i>
        </button>`;
    }

    const cardViewerBtn = hasCard
      ? `<button type="button" onclick="openWorkerCardModal('${worker.id}')" style="flex: 1; padding: 7px; border-radius: 8px; border: 1px solid #bae6fd; background: #f0f9ff; font-size: 0.78rem; font-weight: bold; color: #0369a1; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
           🪪 الكارت
         </button>`
      : '';

    return `
      <div class="worker-card">
        
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="worker-avatar" title="${worker.job || ''}">
              ${iconEmoji}
            </div>
            <div>
              <h3 style="margin: 0; font-size: 1.02rem; font-weight: bold; color: #0f4c5c;">${worker.name}</h3>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 2px;">
                ${worker._proxBadge}
                ${worker.experience ? `<span style="font-size: 0.72rem; color: #64748b;">خبرة: ${worker.experience}</span>` : ''}
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 6px;">
            <div onclick="openRatingModal('${worker.id}', '${safeName}')" style="cursor: pointer; display: flex; align-items: center; gap: 4px; background: #fff9e6; color: #b7791f; padding: 4px 8px; border-radius: 12px; font-size: 0.78rem; font-weight: bold; border: 1px solid #fef3c7;" title="اضغط لتقييم الحرفي">
              <i class="fa-solid fa-star" style="color: #f59e0b; font-size: 0.74rem;"></i>
              <span>${Number(ratingVal).toFixed(1)}</span>
              <span style="color: #92400e; font-size: 0.68rem; font-weight: 600;">(${ratingCount > 0 ? ratingCount : 'قيّمه'})</span>
            </div>

            <button type="button" onclick="toggleFavorite('${worker.id}')" title="إضافة للمفضلة" style="background: ${isFav ? '#fef2f2' : '#f8fafc'}; border: 1px solid ${isFav ? '#fecaca' : '#e2e8f0'}; color: ${isFav ? '#ef4444' : '#94a3b8'}; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.92rem; transition: 0.2s;">
              <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
            </button>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px; flex-wrap: wrap; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span style="background: #eef8f8; color: #0f4c5c; padding: 4px 11px; border-radius: 20px; font-weight: bold; font-size: 0.8rem;">
              ${worker.job}
            </span>
            ${emergencyBadge}
          </div>

          <div style="display: flex; gap: 6px; align-items: center;">
            ${actionButtonsHTML}
          </div>
        </div>

        <div style="font-size: 0.79rem; color: #64748b; display: flex; flex-direction: column; gap: 3px; margin-top: 2px;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <i class="fa-solid fa-location-dot" style="color: #e63946;"></i>
            <span>${displayArea}</span>
          </div>
          ${worker.bio ? `<div style="font-size: 0.75rem; color: #718096; margin-right: 18px;">${worker.bio}</div>` : ''}
        </div>

        <div style="display: flex; gap: 6px; margin-top: 4px; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
          <button type="button" onclick="openRatingModal('${worker.id}', '${safeName}')" style="flex: 1; padding: 7px; border-radius: 8px; border: 1px solid #fde68a; background: #fffbeb; font-size: 0.76rem; font-weight: bold; color: #b45309; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
            <i class="fa-solid fa-star" style="color:#f59e0b;"></i> قيّم تجربتك
          </button>
          <button type="button" onclick="viewWorkerReviews('${worker.id}', '${safeName}')" style="flex: 1; padding: 7px; border-radius: 8px; border: 1px solid #cbd5e0; background: #f8fafc; font-size: 0.76rem; font-weight: bold; color: #4a5568; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
            <i class="fa-regular fa-comments"></i> الآراء (${ratingCount})
          </button>
          ${cardViewerBtn}
        </div>

      </div>
    `;
  }).join("");
}

// =========================================================================
// 4. فلترة الحرفيين والبحث الشامل (يشمل أسماء الأقسام الجديدة بالعربي)
// =========================================================================
function filterWorkers(resetPage = true) {
  if (resetPage) visibleCount = PAGE_SIZE;

  const rawSearch = searchInput ? searchInput.value.trim() : "";
  const normSearch = normalizeArabic(rawSearch);

  if (normSearch.length > 0 && currentCategory !== "favs" && currentCategory !== "emergency") {
    currentCategory = "all";
    renderCategoriesUI();
  }

  const favs = getFavorites();

  const filtered = allWorkers.filter(w => {
    let matchesCategory = false;
    if (currentCategory === "all") matchesCategory = true;
    else if (currentCategory === "favs") matchesCategory = favs.includes(w.id);
    else if (currentCategory === "emergency") matchesCategory = Boolean(w.isEmergency);
    else matchesCategory = (w.category === currentCategory);

    if (!normSearch) return matchesCategory;

    const catObj = allCategories.find(c => c.id === w.category);
    const catArabicName = catObj ? catObj.name : "";
    const searchableText = normalizeArabic(`${w.name || ""} ${w.job || ""} ${w.area || ""} ${w.bio || ""} ${catArabicName}`);

    return matchesCategory && searchableText.includes(normSearch);
  });

  renderWorkers(filtered);
}
if (searchInput) searchInput.addEventListener("input", () => filterWorkers(true));

document.querySelectorAll(".quick-tag-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    chip.classList.toggle("selected");
    const commentBox = document.getElementById("rComment");
    if (!commentBox) return;
    const tagText = chip.getAttribute("data-tag");
    if (chip.classList.contains("selected")) {
      commentBox.value = commentBox.value ? `${commentBox.value} - ${tagText}` : tagText;
    } else {
      commentBox.value = commentBox.value.replace(tagText, "").replace(/^\s*-\s*|\s*-\s*$/g, "").replace(/\s*-\s*-\s*/g, " - ").trim();
    }
  });
});

window.openRatingModal = function(workerId, workerName) {
  if (!currentUser) {
    pendingAction = `rate_${workerId}_${workerName}`;
    document.getElementById("loginModal").style.display = "flex";
  } else {
    document.getElementById("rateWorkerId").value = workerId;
    document.getElementById("ratingWorkerTitle").innerText = `تقييم: ${workerName}`;
    document.querySelectorAll(".quick-tag-chip").forEach(c => c.classList.remove("selected"));
    const commentBox = document.getElementById("rComment");
    if (commentBox) commentBox.value = "";
    autoFillSavedPhone();
    document.getElementById("ratingModal").style.display = "flex";
  }
};

const modeRatingBtn = document.getElementById("modePlatformRatingBtn");
const modeSugBtn = document.getElementById("modePlatformSugBtn");
const feedbackTypeInput = document.getElementById("feedbackEntryType");
const platformStarsGroup = document.getElementById("platformStarsGroup");
const sugModalHeaderTitle = document.getElementById("sugModalHeaderTitle");
const popupSugText = document.getElementById("popupSugText");
const popupSugBtn = document.getElementById("popupSugBtn");

if (modeRatingBtn && modeSugBtn) {
  modeRatingBtn.addEventListener("click", () => {
    modeRatingBtn.classList.add("active");
    modeSugBtn.classList.remove("active");
    if (feedbackTypeInput) feedbackTypeInput.value = "rating";
    if (platformStarsGroup) platformStarsGroup.style.display = "block";
    if (sugModalHeaderTitle) sugModalHeaderTitle.innerHTML = "⭐ تقييم منصة عزوتنا";
    if (popupSugText) popupSugText.placeholder = "اكتب رأيك وتجربتك مع منصة عزوتنا ليظهر لجيرانك...";
    if (popupSugBtn) popupSugBtn.innerText = "إرسال تقييم المنصة";
  });

  modeSugBtn.addEventListener("click", () => {
    modeSugBtn.classList.add("active");
    modeRatingBtn.classList.remove("active");
    if (feedbackTypeInput) feedbackTypeInput.value = "suggestion";
    if (platformStarsGroup) platformStarsGroup.style.display = "none";
    if (sugModalHeaderTitle) sugModalHeaderTitle.innerHTML = "📩 إرسال شكوى أو مقترح للإدارة";
    if (popupSugText) popupSugText.placeholder = "اكتب شكواك أو اقتراحك لتطوير المنصة هنا (رسالة خاصة للإدارة)...";
    if (popupSugBtn) popupSugBtn.innerText = "إرسال الشكوى / المقترح";
  });
}

function triggerSuggestionModal() {
  if (!currentUser) {
    pendingAction = 'suggestion';
    document.getElementById("loginModal").style.display = "flex";
  } else {
    autoFillSavedPhone();
    document.getElementById("sugModal").style.display = "flex";
  }
}

const openSugBtn = document.getElementById("openSugModalBtn");
if (openSugBtn) openSugBtn.addEventListener("click", triggerSuggestionModal);

window.addEventListener("load", () => {
  if (window.location.hash === "#feedback") {
    setTimeout(triggerSuggestionModal, 500);
  }
});

const closeSugModalBtn = document.getElementById("closeSugModalBtn");
if (closeSugModalBtn) closeSugModalBtn.addEventListener("click", () => document.getElementById("sugModal").style.display = "none");

const popupSugForm = document.getElementById("popupSugForm");
if (popupSugForm) {
  popupSugForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const entryType = feedbackTypeInput ? feedbackTypeInput.value : "rating";
    const text = document.getElementById("popupSugText").value.trim();
    const rating = entryType === "rating" && document.getElementById("sugStars") ? Number(document.getElementById("sugStars").value) : null;
    const phone = document.getElementById("popupSugPhone") ? document.getElementById("popupSugPhone").value.trim() : "";
    const btn = document.getElementById("popupSugBtn");
    btn.disabled = true; btn.innerText = "جارٍ الإرسال...";

    try {
      await addDoc(collection(db, "suggestions"), {
        type: entryType,
        message: text,
        rating: rating,
        userName: currentUser.displayName,
        userPhone: phone || "بدون رقم",
        status: "pending",
        createdAt: serverTimestamp()
      });
      const phoneMsg = phone ? `\n📞 الواتساب: ${phone}` : "";
      if (entryType === "rating") {
        await sendTelegramAlert(`⭐ تقييم جديد للمنصة من (${currentUser.displayName}):\n🌟 النجوم: ${rating}\n💬 الرأي: ${text}${phoneMsg}`);
        alert("تسلم! تقييمك للمنصة وصل بنجاح.");
      } else {
        await sendTelegramAlert(`📩 شكوى / مقترح جديد من (${currentUser.displayName}):\n💬 الرسالة: ${text}${phoneMsg}`);
        alert("تسلم! رسالتك وصلت لإدارة عزوتنا وهنهتم بيها فوراً.");
      }
      document.getElementById("popupSugText").value = "";
      document.getElementById("sugModal").style.display = "none";
      if (window.location.hash === "#feedback") history.replaceState(null, null, ' ');
    } catch (err) { alert("حدث خطأ."); } finally {
      btn.disabled = false;
      btn.innerText = entryType === "rating" ? "إرسال تقييم المنصة" : "إرسال الشكوى / المقترح";
    }
  });
}

const openPlatformReviewsBtn = document.getElementById("openPlatformReviewsBtn");
if (openPlatformReviewsBtn) {
  openPlatformReviewsBtn.addEventListener("click", async () => {
    document.getElementById("viewReviewsTitle").innerHTML = `<i class="fa-solid fa-star" style="color:#f59e0b;"></i> آراء الجيران في منصة عزوتنا`;
    const container = document.getElementById("reviewsContainer");
    container.innerHTML = '<div style="text-align: center; color: #64748b; padding: 20px;">جارٍ تحميل الآراء...</div>';
    document.getElementById("viewReviewsModal").style.display = "flex";

    try {
      const q = query(collection(db, "suggestions"), where("status", "==", "approved"));
      const snap = await getDocs(q);
      const ratingsOnly = [];
      snap.forEach(d => {
        const item = d.data();
        if (item.type !== "suggestion") ratingsOnly.push(item);
      });

      if (ratingsOnly.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:20px;">
            <p style="color:#64748b; font-size:0.9rem; margin-bottom:12px;">كن أول من يشارك رأيه وتقييمه لمنصة عزوتنا!</p>
            <button type="button" onclick="document.getElementById('viewReviewsModal').style.display='none'; document.getElementById('openSugModalBtn').click();" style="background:var(--accent); color:#fff; border:none; padding:8px 16px; border-radius:20px; font-weight:bold; cursor:pointer; font-size:0.82rem;">⭐ قيّم المنصة الآن</button>
          </div>
        `;
        return;
      }

      container.innerHTML = ratingsOnly.map(s => `
        <div style="border-bottom:1px solid #f1f5f9; padding-bottom:12px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="color:var(--primary); font-size:0.9rem;">${s.userName || 'أحد جيران الحي'}</strong>
            <span style="color:#B45309; background:#FEF3C7; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">⭐ ${s.rating || 5}</span>
          </div>
          <p style="margin:0; font-size:0.85rem; color:#475569; line-height:1.5;">${s.message}</p>
        </div>
      `).join("");
    } catch (error) {
      container.innerHTML = '<p style="text-align:center; color:#ef4444; font-size:0.9rem;">تعذر تحميل التقييمات حالياً.</p>';
    }
  });
}

const submitRatingForm = document.getElementById("submitRatingForm");
if (submitRatingForm) {
  submitRatingForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const workerId = document.getElementById("rateWorkerId").value;
    const rating = Number(document.getElementById("rStars").value);
    const comment = document.getElementById("rComment").value.trim();
    const phone = document.getElementById("rPhone") ? document.getElementById("rPhone").value.trim() : "";
    
    const workerObj = allWorkers.find(x => x.id === workerId);
    const workerName = workerObj ? workerObj.name : "مقدم خدمة";

    const btn = document.getElementById("submitRateBtn");
    btn.disabled = true; btn.innerText = "جارٍ الإرسال...";

    try {
      await addDoc(collection(db, "reviews"), {
        workerId, workerName, 
        userName: currentUser.displayName,
        userPhone: phone || "بدون رقم",
        rating, comment, status: "pending", createdAt: serverTimestamp()
      });

      const ratedList = JSON.parse(localStorage.getItem("ezwetna_rated_workers") || "[]");
      if (!ratedList.includes(workerId)) {
        ratedList.push(workerId);
        localStorage.setItem("ezwetna_rated_workers", JSON.stringify(ratedList));
      }
      localStorage.removeItem("ezwetna_last_contacted");
      checkSmartReviewBanner();

      const phoneMsg = phone ? `\n📞 الواتساب: ${phone}` : "";
      await sendTelegramAlert(`⭐ تقييم من الجار (${currentUser.displayName})${phoneMsg}\n🛠️ لـ: ${workerName}\n🌟 النجوم: ${rating}\n💬 الرأي: ${comment}`);
      alert("شكراً لأمانتك! تقييمك وصل وهيفيد كل جيرانك في التجمع.");
      submitRatingForm.reset();
      document.getElementById("ratingModal").style.display = "none";
    } catch (err) { alert("حدث خطأ."); } finally { btn.disabled = false; btn.innerText = "إرسال التقييم للمراجعة"; }
  });
}

updateAddressPromptUI();
initDirectoryData();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

window.viewWorkerReviews = async function(workerId, workerName) {
  const safeName = (workerName || '').replace(/'/g, "\\'");
  document.getElementById("viewReviewsTitle").innerHTML = `<i class="fa-solid fa-star" style="color:#FFD166;"></i> آراء الجيران في (${workerName})`;
  const container = document.getElementById("reviewsContainer");
  container.innerHTML = '<div style="text-align: center; color: #64748b; padding: 20px;">جارٍ التحميل...</div>';
  document.getElementById("viewReviewsModal").style.display = "flex";

  try {
    const q = query(collection(db, "reviews"), where("workerId", "==", workerId), where("status", "==", "approved"));
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = `
        <div style="text-align:center; padding:20px;">
          <p style="color:#64748b; font-size:0.9rem; margin-bottom:12px;">لسه مفيش تقييمات لـ (${workerName}).. جربت شغله؟ خليك أول جار يقيمه ويفيد المنطقة!</p>
          <button type="button" onclick="document.getElementById('viewReviewsModal').style.display='none'; openRatingModal('${workerId}', '${safeName}');" style="background:var(--accent); color:#fff; border:none; padding:8px 16px; border-radius:20px; font-weight:bold; cursor:pointer; font-size:0.82rem;">⭐ اكتب أول تقييم</button>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    snap.forEach(docSnap => {
      const r = docSnap.data();
      container.innerHTML += `
        <div style="border-bottom:1px solid #f1f5f9; padding-bottom:12px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="color:var(--primary); font-size:0.9rem;">${r.userName || 'جار'}</strong>
            <span style="color:#B45309; background:#FEF3C7; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">⭐ ${r.rating}</span>
          </div>
          <p style="margin:0; font-size:0.85rem; color:#475569; line-height:1.5;">${r.comment}</p>
        </div>
      `;
    });
  } catch (error) {
    container.innerHTML = '<p style="text-align:center; color:#ef4444; font-size:0.9rem;">حدث خطأ في تحميل التقييمات.</p>';
  }
};

let deferredPrompt;
const installAppBtn = document.getElementById('installAppBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installAppBtn) installAppBtn.style.display = 'block';
});
if (installAppBtn) {
  installAppBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt = null;
      installAppBtn.style.display = 'none';
    }
  });
}

// =========================================================================
// 5. إدارة نافذة حسابي (عرض شيك + تعديل + مسح)
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
  const navSearchBtn = document.getElementById("navSearchBtn");
  const navShareBtn = document.getElementById("navShareBtn");
  const navJoinBtn = document.getElementById("navJoinBtn");
  const navProfileBtn = document.getElementById("navProfileBtn");

  const profileModal = document.getElementById("profileModalOverlay");
  const closeProfileModal = document.getElementById("closeProfileModal");
  const saveProfileBtn = document.getElementById("saveProfileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const userPhoneInput = document.getElementById("userSavedPhone");
  const userAddressInput = document.getElementById("userSavedAddress");

  const profileSavedView = document.getElementById("profileSavedView");
  const profileFormView = document.getElementById("profileFormView");
  const displaySavedAddress = document.getElementById("displaySavedAddress");
  const displaySavedPhone = document.getElementById("displaySavedPhone");
  const editSavedProfileBtn = document.getElementById("editSavedProfileBtn");
  const clearSavedProfileBtn = document.getElementById("clearSavedProfileBtn");

  const searchDropdownBar = document.getElementById("searchDropdownBar");
  const closeSearchBtn = document.getElementById("closeSearchBtn");

  function renderProfileModalState(forceEdit = false) {
    const savedAddr = (localStorage.getItem("ezwetna_user_address") || "").trim();
    const savedPh = (localStorage.getItem("ezwetna_user_phone") || "").trim();

    if (!forceEdit && (savedAddr || savedPh)) {
      if (profileSavedView) profileSavedView.style.display = "block";
      if (profileFormView) profileFormView.style.display = "none";
      if (displaySavedAddress) displaySavedAddress.textContent = savedAddr || "غير محدد";
      if (displaySavedPhone) displaySavedPhone.textContent = savedPh || "غير مسجل";
    } else {
      if (profileSavedView) profileSavedView.style.display = "none";
      if (profileFormView) profileFormView.style.display = "block";
      if (userAddressInput) userAddressInput.value = savedAddr;
      if (userPhoneInput) userPhoneInput.value = savedPh;
    }
  }

  function openAddressModal(forceEdit = false) {
    if (!profileModal) return;
    renderProfileModalState(forceEdit);
    profileModal.classList.add("active");
  }

  if (editSavedProfileBtn) {
    editSavedProfileBtn.addEventListener("click", () => renderProfileModalState(true));
  }

  if (clearSavedProfileBtn) {
    clearSavedProfileBtn.addEventListener("click", () => {
      if (confirm("هل تريدين مسح بيانات العنوان والهاتف المسجلة من هذا الجهاز؟")) {
        localStorage.removeItem("ezwetna_user_address");
        localStorage.removeItem("ezwetna_user_phone");
        updateAddressPromptUI();
        renderProfileModalState(true);
        filterWorkers(false);
      }
    });
  }

  const openAddressSetupBtn = document.getElementById("openAddressSetupBtn");
  const dismissAddressPromptBtn = document.getElementById("dismissAddressPromptBtn");

  if (openAddressSetupBtn) openAddressSetupBtn.addEventListener("click", () => openAddressModal(true));
  if (dismissAddressPromptBtn) {
    dismissAddressPromptBtn.addEventListener("click", () => {
      sessionStorage.setItem("ezwetna_dismissed_addr_prompt", "1");
      updateAddressPromptUI();
    });
  }

  if (navSearchBtn && searchDropdownBar) {
    navSearchBtn.addEventListener("click", () => {
      searchDropdownBar.classList.toggle("active");
      if (searchDropdownBar.classList.contains("active")) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => searchInput && searchInput.focus(), 250);
      }
    });
  }

  if (closeSearchBtn && searchDropdownBar) {
    closeSearchBtn.addEventListener("click", () => {
      searchDropdownBar.classList.remove("active");
      if (searchInput) {
        searchInput.value = "";
        filterWorkers(true);
      }
    });
  }

  if (navShareBtn) {
    navShareBtn.addEventListener("click", async () => {
      const officialUrl = "https://azwetna.web.app/";
      const shareText = "دليل «عَزْوَتْنَا» لخدمات وأهالي التجمع الثالث والقطامية - تواصل مع أمهر الحرفيين ومقدمي الخدمات الموثوقين مباشرة بدون وسيط:";
      if (navigator.share) {
        try {
          await navigator.share({
            title: "منصة عَزْوَتْنَا | دليل خدمات التجمع الثالث",
            text: shareText,
            url: officialUrl,
          });
        } catch (err) {}
      } else {
        const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText + " " + officialUrl)}`;
        window.open(waUrl, "_blank");
      }
    });
  }

  if (navJoinBtn) {
    navJoinBtn.addEventListener("click", () => {
      window.location.href = "register.html";
    });
  }

  if (navProfileBtn) navProfileBtn.addEventListener("click", () => openAddressModal(false));
  if (closeProfileModal && profileModal) {
    closeProfileModal.addEventListener("click", () => profileModal.classList.remove("active"));
  }
  if (profileModal) {
    profileModal.addEventListener("click", (e) => {
      if (e.target === profileModal) profileModal.classList.remove("active");
    });
  }

  if (saveProfileBtn) {
    saveProfileBtn.addEventListener("click", () => {
      if (userPhoneInput) localStorage.setItem("ezwetna_user_phone", userPhoneInput.value.trim());
      if (userAddressInput) localStorage.setItem("ezwetna_user_address", userAddressInput.value.trim());
      updateAddressPromptUI();
      renderProfileModalState(false);
      filterWorkers(true);
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (!currentUser) return;
      try {
        await signOut(auth);
        alert("تم تسجيل الخروج من حساب Google بنجاح.");
        profileModal.classList.remove("active");
      } catch (e) {
        alert("حدث خطأ أثناء تسجيل الخروج.");
      }
    });
  }
});