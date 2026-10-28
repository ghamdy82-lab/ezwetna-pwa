// بيانات تجريبية للحرفيين في التجمع الثالث
// جلب الحرفيين المسجلين من ذاكرة المتصفح
const localWorkers = JSON.parse(localStorage.getItem('custom_workers')) || [];

// الداتا التجريبية الافتراضية
const defaultWorkers = [
  {
    id: 1,
    name: "عماد سباكة",
    job: "سباك صحي وشبكات",
    category: "plumber",
    area: "المحلية الثالثة - التجمع الثالث",
    phone: "01000000001",
    avatar: "🔧"
  },
  {
    id: 2,
    name: "محمد كرم",
    job: "كهربائي منازل وصيانة لوحات",
    category: "electric",
    area: "المحلية الأولى - التجمع الثالث",
    phone: "01100000002",
    avatar: "⚡"
  },
  {
    id: 3,
    name: "الأسطى إبراهيم",
    job: "نجار أبواب ومطابخ",
    category: "carpenter",
    area: "المحلية الرابعة - التجمع الثالث",
    phone: "01200000003",
    avatar: "🪚"
  },
  {
    id: 4,
    name: "أحمد النقاش",
    job: "تشطيبات ودهانات حديثة",
    category: "paint",
    area: "أرابيلا - التجمع",
    phone: "01000000004",
    avatar: "🎨"
  },
  {
    id: 5,
    name: "المهندس محمود",
    job: "صيانة وشحن تكييفات",
    category: "ac",
    area: "المحلية الخامسة - التجمع الثالث",
    phone: "01100000005",
    avatar: "❄️"
  }
];

// دمج الاتنين بحيث أي حرفي جديد ينزل في الأول خالص
const workersData = [...localWorkers, ...defaultWorkers];

// عناصر الـ DOM
const workersList = document.getElementById("workersList");
const searchInput = document.getElementById("searchInput");
const categoryButtons = document.querySelectorAll(".cat-pill");

let currentCategory = "all";

// دالة عرض الكروت بتصميم المودرن
function renderWorkers(workers) {
  if (workers.length === 0) {
    workersList.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #64748B;">
        <p style="font-size: 1.1rem; font-weight: 600;">مفيش نتايج مطابقة للبحث</p>
        <p style="font-size: 0.85rem; margin-top: 6px;">جربي تبحثي باسم تاني أو تختاري قسم تاني</p>
      </div>
    `;
    return;
  }

  workersList.innerHTML = workers.map(worker => `
    <div class="worker-card">
      <div class="worker-info">
        <div class="worker-avatar">${worker.avatar}</div>
        <div class="worker-details">
          <h3>${worker.name}</h3>
          <span class="job-title">${worker.job}</span>
          <p class="area-tag">📍 ${worker.area}</p>
        </div>
      </div>
      <a href="tel:${worker.phone}" class="call-btn">
        <span>اتصال</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
        </svg>
      </a>
    </div>
  `).join("");
}

// دالة التصفية الشاملة (بحث + تصنيف)
function filterWorkers() {
  const searchTerm = searchInput.value.trim().toLowerCase();

  const filtered = workersData.filter(worker => {
    const matchesCategory = (currentCategory === "all") || (worker.category === currentCategory);
    const matchesSearch = worker.name.toLowerCase().includes(searchTerm) ||
                          worker.job.toLowerCase().includes(searchTerm) ||
                          worker.area.toLowerCase().includes(searchTerm);
    return matchesCategory && matchesSearch;
  });

  renderWorkers(filtered);
}

// تفعيل أزرار الأقسام
categoryButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    categoryButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentCategory = btn.getAttribute("data-cat");
    filterWorkers();
  });
});

// تفعيل البحث الحي
searchInput.addEventListener("input", filterWorkers);

// تسجيل الـ Service Worker لتشغيل الـ PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(() => console.log("Service Worker تم تفعيله بنجاح"))
      .catch(err => console.log("فشل تسجيل Service Worker:", err));
  });
}

// العرض الأولي عند الفتح
renderWorkers(workersData);