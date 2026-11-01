/* 
 * Azwetna Platform - Core Application Logic
 * Developed & Owned by: Taghreed Hamdy (CodeCraft Egypt) © 2026
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where } 
from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// بصمة الملكية الفكرية في المتصفح
console.log(
  "%c منصة عَزْوَتْنَا © 2026 | تطوير وملكية فكرية: م. تغريد حمدي (Taghreed Hamdy - CodeCraft Egypt) ",
  "background: #1F4E5B; color: #FFD166; font-size: 13px; font-weight: bold; padding: 8px 12px; border-radius: 6px;"
);

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

const workersList = document.getElementById("workersList");
const searchInput = document.getElementById("searchInput");
const categoriesBar = document.getElementById("categoriesBar");

let allWorkers = [];
let currentCategory = "all";

// 1. جلب الأقسام من Firestore
async function fetchCategories() {
  try {
    const snap = await getDocs(collection(db, "categories"));
    if (!categoriesBar) return;

    categoriesBar.innerHTML = `<button class="cat-pill active" data-cat="all">الكل</button>`;

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
  } catch (error) {
    console.error("فشل جلب الأقسام:", error);
  }
}

// 2. جلب الحرفيين المعتمدين فقط
async function fetchApprovedWorkers() {
  try {
    const q = query(collection(db, "workers"), where("status", "==", "approved"));
    const snap = await getDocs(q);

    allWorkers = [];
    snap.forEach(docSnap => {
      allWorkers.push({ id: docSnap.id, ...docSnap.data() });
    });

    renderWorkers(allWorkers);
  } catch (error) {
    console.error("فشل جلب الحرفيين:", error);
    workersList.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:#ef4444;">تعذر الاتصال بالسحابة، يرجى إعادة المحاولة.</p>`;
  }
}

// 3. عرض كروت الحرفيين شاملة الخبرة والنبذة
function renderWorkers(workers) {
  if (!workersList) return;

  if (workers.length === 0) {
    workersList.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: #64748B;">
        <p style="font-size: 1.1rem; font-weight: 700;">مفيش نتايج مطابقة للبحث حالياً</p>
        <p style="font-size: 0.85rem; margin-top: 6px;">جربي تبحثي باسم تاني أو اختاري قسم مختلف</p>
      </div>
    `;
    return;
  }

  workersList.innerHTML = workers.map(worker => {
    const cleanPhone = worker.phone ? worker.phone.replace(/[^0-9]/g, '') : '';
    const whatsappNum = cleanPhone.startsWith('0') ? '2' + cleanPhone : cleanPhone;

    // تجهيز الأيقونة أو الصورة الشخصية لو مرفوعة
    const avatarHTML = worker.photoUrl 
      ? `<img src="${worker.photoUrl}" alt="${worker.name}" class="worker-img">`
      : `<div class="worker-avatar">${worker.avatar || '🛠️'}</div>`;

    // شارة سنين الخبرة
    const expBadge = worker.experience 
      ? `<span class="exp-badge">خبرة ${worker.experience}</span>` 
      : '';

    // النبذة التعريفية
    const bioHTML = worker.bio 
      ? `<p class="worker-bio">${worker.bio}</p>` 
      : '';

    return `
      <div class="worker-card">
        <div>
          <div class="worker-info" style="display:flex; align-items:flex-start; gap:14px;">
            ${avatarHTML}
            <div class="worker-details" style="flex:1;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                <h3 style="margin:0; font-size:1.05rem; font-weight:800; color:var(--primary);">${worker.name}</h3>
                ${expBadge}
              </div>
              <span class="job-title" style="display:inline-block; font-size:0.85rem; margin-top:2px;">${worker.job || ''}</span>
              <p class="area-tag" style="margin:4px 0 0; font-size:0.8rem; color:#64748b;">📍 ${worker.area || ''}</p>
            </div>
          </div>
          ${bioHTML}
        </div>

        <div class="worker-actions" style="display:flex; gap:8px; margin-top:6px;">
          <a href="tel:${cleanPhone}" class="call-btn" style="flex:1;">
            <i class="fa-solid fa-phone"></i> اتصال
          </a>
          <a href="https://wa.me/${whatsappNum}" target="_blank" class="chat-btn" style="flex:1;">
            <i class="fa-brands fa-whatsapp"></i> واتساب
          </a>
        </div>
      </div>
    `;
  }).join("");
}

// 4. البحث والفلترة اللحظية (بالاسم، المهنة، المنطقة، أو النبذة)
function filterWorkers() {
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";

  const filtered = allWorkers.filter(worker => {
    const matchesCategory = (currentCategory === "all") || (worker.category === currentCategory);
    const matchesSearch = (worker.name && worker.name.toLowerCase().includes(searchTerm)) ||
                          (worker.job && worker.job.toLowerCase().includes(searchTerm)) ||
                          (worker.area && worker.area.toLowerCase().includes(searchTerm)) ||
                          (worker.bio && worker.bio.toLowerCase().includes(searchTerm));
    return matchesCategory && matchesSearch;
  });

  renderWorkers(filtered);
}

if (searchInput) {
  searchInput.addEventListener("input", filterWorkers);
}

// 5. تفعيل أزرار مشاركة التطبيق مع الجيران
function shareApplication() {
  const shareText = "يا جيراني في التجمع، ده دليل «عَزْوَتْنَا» فيه أرقام الصنايعية والخدمات الموثوقة في منطقتنا للتواصل المباشر من غير وسيط:";
  const shareUrl = window.location.origin + window.location.pathname;

  if (navigator.share) {
    navigator.share({
      title: "منصة عَزْوَتْنَا - دليل خدمات التجمع",
      text: shareText,
      url: shareUrl
    }).catch(() => {});
  } else {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`;
    window.open(waUrl, "_blank");
  }
}

const shareHeaderBtn = document.getElementById("shareAppBtn");
const footerShareBtn = document.getElementById("footerShareBtn");
if (shareHeaderBtn) shareHeaderBtn.addEventListener("click", shareApplication);
if (footerShareBtn) footerShareBtn.addEventListener("click", shareApplication);

// تشغيل التطبيق
fetchCategories();
fetchApprovedWorkers();