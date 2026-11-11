/* 
 * Azwetna Platform - Core Application Logic
 * Developed & Owned by: Taghreed Hamdy (CodeCraft Egypt) © 2026
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, query, where, serverTimestamp, doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// بصمة الملكية الفكرية
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

// دالة لحساب ضغطات الاتصال والواتساب لكل حرفي في فايربيز
window.trackAction = async function(workerId, actionType) {
  if (!workerId) return;
  try {
    const workerRef = doc(db, "workers", workerId);
    const fieldToUpdate = actionType === 'call' ? 'callClicks' : 'waClicks';
    await updateDoc(workerRef, {
      [fieldToUpdate]: increment(1)
    });
  } catch (err) {
    console.error("خطأ في تسجيل التفاعل:", err);
  }
};

// إدارة قائمة المفضلة (❤️) بدون تسجيل دخول على جهاز الجار
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
  filterWorkers();
};

// ملء رقم الهاتف تلقائياً من بيانات "حسابي" لو الجار حافظه
function autoFillSavedPhone() {
  const savedPhone = localStorage.getItem("ezwetna_user_phone") || "";
  if (!savedPhone) return;
  const rPhone = document.getElementById("rPhone");
  const sugPhone = document.getElementById("popupSugPhone");
  if (rPhone && !rPhone.value) rPhone.value = savedPhone;
  if (sugPhone && !sugPhone.value) sugPhone.value = savedPhone;
}

let currentUser = null;
let pendingAction = null;

// 1. مراقبة حالة المستخدم
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  const authBox = document.getElementById("userAuthStateBox");
  const navAvatar = document.getElementById('navUserAvatar');
  const navAvatarContainer = document.getElementById('navAvatarContainer');

  if (user) {
    const loginModal = document.getElementById("loginModal");
    if (loginModal) loginModal.style.display = "none";
    
    if (navAvatar && navAvatarContainer && user.photoURL) {
      navAvatar.src = user.photoURL;
      navAvatarContainer.style.border = "2px solid #10b981";
    }

    if (pendingAction === 'suggestion') {
      autoFillSavedPhone();
      document.getElementById("sugModal").style.display = "flex";
    }
    if (pendingAction && pendingAction.startsWith('rate_')) {
      const parts = pendingAction.split('_');
      document.getElementById("rateWorkerId").value = parts[1];
      document.getElementById("ratingWorkerTitle").innerText = `تقييم: ${parts[2]}`;
      autoFillSavedPhone();
      document.getElementById("ratingModal").style.display = "flex";
    }
    pendingAction = null;
  } else {
    if (authBox) authBox.innerHTML = ``;
    if (navAvatar && navAvatarContainer) {
      navAvatar.src = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
      navAvatarContainer.style.border = "2px solid transparent";
    }
  }
});

const googleLoginBtn = document.getElementById("googleLoginBtn");
if (googleLoginBtn) {
  googleLoginBtn.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      alert("تعذر تسجيل الدخول، حاول مرة تانية.");
    }
  });
}

const workersList = document.getElementById("workersList");
const searchInput = document.getElementById("searchInput");
const categoriesBar = document.getElementById("categoriesBar");
let allWorkers = [];
let currentCategory = "all";

async function fetchCategories() {
  try {
    const snap = await getDocs(collection(db, "categories"));
    if (!categoriesBar) return;
    categoriesBar.innerHTML = `
      <button class="cat-pill active" data-cat="all">الكل</button>
      <button class="cat-pill" data-cat="favs">❤️ مفضلتي</button>
      <button class="cat-pill" data-cat="emergency">🚨 طوارئ 24 ساعة</button>
    `;
    snap.forEach(docSnap => {
      const cat = docSnap.data();
      const btn = document.createElement("button");
      btn.className = "cat-pill";
      btn.setAttribute("data-cat", cat.id);
      btn.innerHTML = `${cat.icon || '🛠️'} ${cat.name}`;
      categoriesBar.appendChild(btn);
    });
    document.querySelectorAll(".cat-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".cat-pill").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentCategory = btn.getAttribute("data-cat");
        filterWorkers();
      });
    });
  } catch (error) { console.error(error); }
}

async function fetchApprovedWorkers() {
  try {
    const q = query(collection(db, "workers"), where("status", "==", "approved"));
    const snap = await getDocs(q);
    allWorkers = [];
    snap.forEach(docSnap => allWorkers.push({ id: docSnap.id, ...docSnap.data() }));
    renderWorkers(allWorkers);
  } catch (error) { console.error(error); }
}

function renderWorkers(workers) {
  if (!workersList) return;
  if (workers.length === 0) {
    const emptyMsg = currentCategory === "favs" 
      ? "لسه مضفتش أي حرفي للمفضلة ❤️.. اضغط على علامة القلب جنب أي حرفي لحفظه هنا!" 
      : "مفيش نتايج مطابقة للبحث حالياً";
    workersList.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#64748B;"><p style="font-size:1.05rem; font-weight:700;">${emptyMsg}</p></div>`;
    return;
  }

  const favs = getFavorites();
  const savedAddress = localStorage.getItem("ezwetna_user_address") || "";

  workersList.innerHTML = workers.map(worker => {
    const cleanPhone = worker.phone ? worker.phone.replace(/[^0-9]/g, '') : '';
    const whatsappNum = cleanPhone.startsWith('0') ? '2' + cleanPhone : (cleanPhone.startsWith('20') ? cleanPhone : '20' + cleanPhone);
    
    // تضمين عنوان الجار تلقائياً لو حافظه في حسابه
    const addressPart = savedAddress ? `، أنا جارك من (${savedAddress})` : "";
    const waMsg = encodeURIComponent(`السلام عليكم، شفت بيانات حضرتك على منصة (عزوتنا)${addressPart} ومحتاج أستفسر بخصوص: `);
    
    const avatarHTML = worker.photoUrl ? `<img src="${worker.photoUrl}" alt="${worker.name}" class="worker-img">` : `<div class="worker-avatar">${worker.avatar || '🛠️'}</div>`;
    const ratingVal = worker.rating || 5.0;
    const ratingCount = worker.ratingsCount || 0;
    const isFav = favs.includes(worker.id);

    const emergencyBadge = worker.isEmergency 
      ? `<span style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 3px 8px; border-radius: 20px; font-weight: bold; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 3px;">🚨 طوارئ 24 ساعة</span>`
      : '';

    return `
      <div class="worker-card" style="background: #ffffff; border-radius: 16px; padding: 12px 14px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid #edf2f7; display: flex; flex-direction: column; gap: 8px;">
        
        <!-- 1. السطر الأول: الصورة والاسم ع اليمين + شارة التقييم والقلب ع الشمال -->
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 46px; height: 46px; border-radius: 50%; overflow: hidden; border: 2px solid #0f4c5c; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
              ${avatarHTML}
            </div>
            <div>
              <h3 style="margin: 0; font-size: 1.05rem; font-weight: bold; color: #0f4c5c;">${worker.name}</h3>
              ${worker.experience ? `<span style="font-size: 0.72rem; color: #64748b;">خبرة: ${worker.experience}</span>` : ''}
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 6px;">
            <!-- شارة التقييم والنجوم -->
            <div style="display: flex; align-items: center; gap: 4px; background: #fff9e6; color: #b7791f; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; border: 1px solid #fef3c7;">
              <i class="fa-solid fa-star" style="color: #f59e0b; font-size: 0.75rem;"></i>
              <span>${Number(ratingVal).toFixed(1)}</span>
              <span style="color: #a0aec0; font-size: 0.72rem; font-weight: normal;">(${ratingCount})</span>
            </div>

            <!-- زرار القلب للمفضلة -->
            <button type="button" onclick="toggleFavorite('${worker.id}')" title="إضافة للمفضلة" style="background: ${isFav ? '#fef2f2' : '#f8fafc'}; border: 1px solid ${isFav ? '#fecaca' : '#e2e8f0'}; color: ${isFav ? '#ef4444' : '#94a3b8'}; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; transition: 0.2s;">
              <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
            </button>
          </div>
        </div>

        <!-- 2. السطر الثاني: نوع الحرفة وشارة الطوارئ + أيقونات الاتصال والواتس -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px; flex-wrap: wrap; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span style="background: #eef8f8; color: #0f4c5c; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 0.82rem;">
              ${worker.job}
            </span>
            ${emergencyBadge}
          </div>

          <div style="display: flex; gap: 8px; align-items: center;">
            <!-- زرار اتصال كبير -->
            <a href="tel:${cleanPhone}" onclick="trackAction('${worker.id}', 'call')" style="width: 42px; height: 42px; border-radius: 12px; background: #eef8f8; color: #0f4c5c; display: flex; align-items: center; justify-content: center; text-decoration: none; font-size: 1.1rem;" title="اتصال">
              <i class="fa-solid fa-phone"></i>
            </a>

            <!-- زرار واتساب كبير -->
            <a href="https://wa.me/${whatsappNum}?text=${waMsg}" onclick="trackAction('${worker.id}', 'wa')" target="_blank" style="width: 42px; height: 42px; border-radius: 12px; background: #25D366; color: #ffffff; display: flex; align-items: center; justify-content: center; text-decoration: none; font-size: 1.25rem;" title="واتساب">
              <i class="fa-brands fa-whatsapp"></i>
            </a>
          </div>
        </div>

        <!-- 3. السطر الثالث: العنوان والملاحظة -->
        <div style="font-size: 0.8rem; color: #64748b; display: flex; flex-direction: column; gap: 3px; margin-top: 2px;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <i class="fa-solid fa-location-dot" style="color: #e63946;"></i>
            <span>${worker.area || ''}</span>
          </div>
          ${worker.bio ? `<div style="font-size: 0.76rem; color: #718096; margin-right: 18px;">${worker.bio}</div>` : ''}
        </div>

        <!-- 4. السطر الرابع: التقييم والآراء -->
        <div style="display: flex; gap: 8px; margin-top: 4px; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
          <button type="button" onclick="openRatingModal('${worker.id}', '${worker.name}')" style="flex: 1; padding: 7px; border-radius: 8px; border: 1px solid #cbd5e0; background: #f8fafc; font-size: 0.78rem; font-weight: bold; color: #4a5568; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
            <i class="fa-solid fa-pen"></i> تقييم
          </button>
          <button type="button" onclick="viewWorkerReviews('${worker.id}', '${worker.name}')" style="flex: 1; padding: 7px; border-radius: 8px; border: 1px solid #cbd5e0; background: #f8fafc; font-size: 0.78rem; font-weight: bold; color: #4a5568; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
            <i class="fa-regular fa-comments"></i> آراء
          </button>
        </div>

      </div>
    `;
  }).join("");
}

function filterWorkers() {
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
  if (searchTerm.length > 0 && currentCategory !== "favs" && currentCategory !== "emergency") {
    currentCategory = "all";
    document.querySelectorAll(".cat-pill").forEach(b => {
      b.getAttribute("data-cat") === "all" ? b.classList.add("active") : b.classList.remove("active");
    });
  }

  const favs = getFavorites();

  const filtered = allWorkers.filter(w => {
    let matchesCategory = false;
    if (currentCategory === "all") matchesCategory = true;
    else if (currentCategory === "favs") matchesCategory = favs.includes(w.id);
    else if (currentCategory === "emergency") matchesCategory = Boolean(w.isEmergency);
    else matchesCategory = (w.category === currentCategory);

    const matchesSearch = !searchTerm || 
      (w.name && w.name.toLowerCase().includes(searchTerm)) || 
      (w.job && w.job.toLowerCase().includes(searchTerm)) || 
      (w.area && w.area.toLowerCase().includes(searchTerm));

    return matchesCategory && matchesSearch;
  });
  renderWorkers(filtered);
}
if (searchInput) searchInput.addEventListener("input", filterWorkers);

window.openRatingModal = function(workerId, workerName) {
  if (!currentUser) {
    pendingAction = `rate_${workerId}_${workerName}`;
    document.getElementById("loginModal").style.display = "flex";
  } else {
    document.getElementById("rateWorkerId").value = workerId;
    document.getElementById("ratingWorkerTitle").innerText = `تقييم: ${workerName}`;
    autoFillSavedPhone();
    document.getElementById("ratingModal").style.display = "flex";
  }
};

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
if (openSugBtn) {
  openSugBtn.addEventListener("click", triggerSuggestionModal);
}

// لو الحرفي فتح الرابط من تقرير الواتساب (#feedback) يفتح له نافذة التقييم والمقترحات مباشرة
window.addEventListener("load", () => {
  if (window.location.hash === "#feedback") {
    setTimeout(triggerSuggestionModal, 500);
  }
});

const closeSugModalBtn = document.getElementById("closeSugModalBtn");
if (closeSugModalBtn) closeSugModalBtn.addEventListener("click", () => document.getElementById("sugModal").style.display = "none");

// إرسال الشكوى أو تقييم المنصة
const popupSugForm = document.getElementById("popupSugForm");
if (popupSugForm) {
  popupSugForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const text = document.getElementById("popupSugText").value.trim();
    const phone = document.getElementById("popupSugPhone") ? document.getElementById("popupSugPhone").value.trim() : "";
    const btn = document.getElementById("popupSugBtn");
    btn.disabled = true; btn.innerText = "جارٍ الإرسال...";

    try {
      await addDoc(collection(db, "suggestions"), {
        message: text,
        userName: currentUser.displayName,
        userPhone: phone || "بدون رقم",
        createdAt: serverTimestamp()
      });
      const phoneMsg = phone ? `\n📞 الواتساب: ${phone}` : "";
      await sendTelegramAlert(`💡 رسالة/تقييم للمنصة من (${currentUser.displayName}):${phoneMsg}\n💬 الرسالة: ${text}`);
      alert("تسلم! رسالتك وصلت لإدارة عزوتنا بنجاح.");
      document.getElementById("popupSugText").value = "";
      document.getElementById("sugModal").style.display = "none";
      if (window.location.hash === "#feedback") {
        history.replaceState(null, null, ' ');
      }
    } catch (err) { alert("حدث خطأ."); } finally { btn.disabled = false; btn.innerText = "إرسال للإدارة فوراً"; }
  });
}

// إرسال التقييم للحرفي
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
      const phoneMsg = phone ? `\n📞 الواتساب: ${phone}` : "";
      await sendTelegramAlert(`⭐ تقييم من الجار (${currentUser.displayName})${phoneMsg}\n🛠️ لـ: ${workerName}\n🌟 النجوم: ${rating}\n💬 الرأي: ${comment}`);
      alert("شكراً لأمانتك! التقييم وصل للمراجعة.");
      submitRatingForm.reset();
      document.getElementById("ratingModal").style.display = "none";
    } catch (err) { alert("حدث خطأ."); } finally { btn.disabled = false; btn.innerText = "إرسال التقييم للمراجعة"; }
  });
}

fetchCategories();
fetchApprovedWorkers();

// تسجيل الـ Service Worker لتفعيل التثبيت كتطبيق PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker تم تسجيله بنجاح:', reg.scope))
      .catch(err => console.error('فشل تسجيل Service Worker:', err));
  });
}

// دالة عرض التقييمات في النافذة المنبثقة
window.viewWorkerReviews = async function(workerId, workerName) {
  document.getElementById("viewReviewsTitle").innerHTML = `<i class="fa-solid fa-star" style="color:#FFD166;"></i> آراء الجيران في (${workerName})`;
  const container = document.getElementById("reviewsContainer");
  container.innerHTML = '<div style="text-align: center; color: #64748b; padding: 20px;">جارٍ التحميل...</div>';
  document.getElementById("viewReviewsModal").style.display = "flex";

  try {
    const q = query(collection(db, "reviews"), where("workerId", "==", workerId), where("status", "==", "approved"));
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:0.9rem; margin-top:20px;">لسه مفيش تقييمات، خليك أول جار يقيم!</p>';
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

// برمجة زرار تثبيت التطبيق (PWA)
let deferredPrompt;
const installAppBtn = document.getElementById('installAppBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installAppBtn) {
    installAppBtn.style.display = 'block';
  }
});

if (installAppBtn) {
  installAppBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('تم التثبيت بنجاح!');
      }
      deferredPrompt = null;
      installAppBtn.style.display = 'none';
    }
  });
}

// تشغيل وتفعيل شريط التنقل السفلي والبوب-أب (Bottom Nav & Profile)
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

  const searchDropdownBar = document.getElementById("searchDropdownBar");
  const closeSearchBtn = document.getElementById("closeSearchBtn");

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
        filterWorkers();
      }
    });
  }

  if (navShareBtn) {
    navShareBtn.addEventListener("click", async () => {
      const shareUrl = window.location.origin + window.location.pathname;
      if (navigator.share) {
        try {
          await navigator.share({
            title: "منصة عَزْوَتْنَا",
            text: "دليل خدمات وأهالي التجمع الثالث - تواصل مع أمهر الحرفيين مباشرة بدون وسيط!",
            url: shareUrl,
          });
        } catch (err) {}
      } else {
        navigator.clipboard.writeText(shareUrl);
        alert("تم نسخ رابط المنصة بنجاح!");
      }
    });
  }

  if (navJoinBtn) {
    navJoinBtn.addEventListener("click", () => {
      window.location.href = "register.html";
    });
  }

  if (navProfileBtn && profileModal) {
    navProfileBtn.addEventListener("click", () => {
      if (userPhoneInput) userPhoneInput.value = localStorage.getItem("ezwetna_user_phone") || "";
      if (userAddressInput) userAddressInput.value = localStorage.getItem("ezwetna_user_address") || "";
      profileModal.classList.add("active");
    });
  }

  if (closeProfileModal && profileModal) {
    closeProfileModal.addEventListener("click", () => {
      profileModal.classList.remove("active");
    });
  }

  if (profileModal) {
    profileModal.addEventListener("click", (e) => {
      if (e.target === profileModal) {
        profileModal.classList.remove("active");
      }
    });
  }

  if (saveProfileBtn) {
    saveProfileBtn.addEventListener("click", () => {
      if (userPhoneInput) localStorage.setItem("ezwetna_user_phone", userPhoneInput.value.trim());
      if (userAddressInput) localStorage.setItem("ezwetna_user_address", userAddressInput.value.trim());
      alert("تم حفظ بياناتك بنجاح! هيتم كتابة رقمك وعنوانك تلقائياً لتسهيل طلب الخدمات.");
      profileModal.classList.remove("active");
      renderWorkers(allWorkers); // تحديث رسائل الواتساب بالعنوان الجديد فوراً
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try { await signOut(auth); } catch(e) {}
      localStorage.removeItem("ezwetna_user_phone");
      localStorage.removeItem("ezwetna_user_address");
      alert("تم تسجيل الخروج بنجاح.");
      window.location.reload();
    });
  }
});