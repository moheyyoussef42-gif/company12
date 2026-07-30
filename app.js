// -------------------------------------------------------------
// Constants and State Variables
// -------------------------------------------------------------
const INSTAPAY_NUMBER = "01200422224";
const ADMIN_PIN = "19055";

// App state
let bookings = [];
let selectedDateIndex = 0;
let selectedSlotTime = "";
let selectedDateString = "";
let currentAdminFilter = "all";
let activeSettingsTab = sessionStorage.getItem("adminSettingsTab") || "days";

// Days of the week in Arabic
const ARABIC_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

// -------------------------------------------------------------
// Admin Settings (stored in localStorage)
// -------------------------------------------------------------
const DEFAULT_SETTINGS = {
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    timeSlots: [
        "02:00 م - 03:00 م",
        "03:00 م - 04:00 م",
        "04:00 م - 05:00 م",
        "05:00 م - 06:00 م",
        "06:00 م - 07:00 م",
        "07:00 م - 08:00 م",
        "08:00 م - 09:00 م",
        "09:00 م - 10:00 م",
        "10:00 م - 11:00 م",
        "11:00 م - 12:00 ص",
        "12:00 ص - 01:00 ص",
        "01:00 ص - 02:00 ص"
    ],
    slotPrice: 140,
    daysAhead: 7,
    blockedDates: []
};

const loadSettings = () => {
    const stored = localStorage.getItem("adminSettings");
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            return { ...DEFAULT_SETTINGS, ...parsed };
        } catch (e) {
            return { ...DEFAULT_SETTINGS };
        }
    }
    return { ...DEFAULT_SETTINGS };
};

const loadSettingsFromServer = async () => {
    try {
        const response = await fetch(`/api/settings?_=${Date.now()}`);
        if (!response.ok) throw new Error("Failed to load settings");
        const serverSettings = await response.json();
        adminSettings = { ...DEFAULT_SETTINGS, ...serverSettings };
        localStorage.setItem("adminSettings", JSON.stringify(adminSettings));
    } catch (e) {
        adminSettings = loadSettings();
    }
};

const saveSettings = async (settings) => {
    localStorage.setItem("adminSettings", JSON.stringify(settings));
    try {
        const response = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings)
        });
        if (!response.ok) throw new Error("Failed to save settings");
        adminSettings = await response.json();
        localStorage.setItem("adminSettings", JSON.stringify(adminSettings));
    } catch (e) {
        console.error("Failed to sync settings", e);
    }
};

let adminSettings = loadSettings();

// Get active time slots from settings
const getTimeSlots = () => adminSettings.timeSlots;

// Get slot price from settings
const getSlotPrice = () => adminSettings.slotPrice;

// Get dates list based on settings
const getDatesList = () => {
    const list = [];
    const today = new Date();
    for (let i = 0; i < adminSettings.daysAhead; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);

        const dayIdx = d.getDay();
        const dayName = i === 0 ? "اليوم" : (i === 1 ? "غداً" : ARABIC_DAYS[dayIdx]);
        const dateString = d.toLocaleDateString('en-CA');
        const displayDate = `${d.getDate()} / ${d.getMonth() + 1}`;

        list.push({ dayName, dateString, displayDate, dayIdx });
    }
    return list;
};

// Get filtered dates (active days only, excluding blocked dates)
const getFilteredDates = () => {
    const allDates = getDatesList();
    return allDates.filter(item =>
        adminSettings.activeDays.includes(item.dayIdx) &&
        !adminSettings.blockedDates.includes(item.dateString)
    );
};

// -------------------------------------------------------------
// App Initialization
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    await loadBookingsFromStorage();
    await loadSettingsFromServer();
    renderDateTabs();
    renderSlots();
    setupEventListeners();

    if (sessionStorage.getItem("adminLoggedIn") === "true") {
        document.getElementById("btn-admin-portal").innerHTML = '<span class="btn-icon">👑</span> لوحة التحكم';
    }

    updatePriceDisplays();

    setInterval(async () => {
        await refreshLiveData();
    }, 5000);

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            refreshLiveData();
        }
    });
});

const refreshLiveData = async () => {
    try {
        const adminDashboardOpen = !document.getElementById("modal-admin-dashboard").classList.contains("hidden");

        // Add cache-busting query param to ensure fresh data on every device
        const cacheBuster = `_=${Date.now()}`;
        const [bookingsResponse, settingsResponse] = await Promise.all([
            fetch(`/api/bookings?${cacheBuster}`),
            fetch(`/api/settings?${cacheBuster}`)
        ]);

        if (bookingsResponse.ok) {
            const serverBookings = await bookingsResponse.json();
            if (Array.isArray(serverBookings)) {
                // Merge: keep local bookings that aren't in server response yet
                // (due to Blob propagation delay, server may return stale data)
                const serverIds = new Set(serverBookings.map(b => b.id));
                const localOnly = bookings.filter(b => !serverIds.has(b.id));
                bookings = [...serverBookings, ...localOnly];
                localStorage.setItem("mal3abak_bookings", JSON.stringify(bookings));
            }
        }

        if (settingsResponse.ok && !adminDashboardOpen) {
            const serverSettings = await settingsResponse.json();
            adminSettings = { ...DEFAULT_SETTINGS, ...serverSettings };
            localStorage.setItem("adminSettings", JSON.stringify(adminSettings));
        }

        // Skip user-facing re-renders when admin dashboard is open to prevent tab reset issues
        if (!adminDashboardOpen) {
            renderDateTabs();
            renderSlots();
        }
        updatePriceDisplays();

        if (adminDashboardOpen && sessionStorage.getItem("adminLoggedIn") === "true") {
            renderAdminStats();
            renderAdminBookingsList();
        }
    } catch (e) {
        console.error("Failed to refresh live data", e);
    }
};

const updatePriceDisplays = () => {
    const priceEl = document.querySelector(".meta-value.price-display");
    if (priceEl) priceEl.textContent = `${getSlotPrice()} جنيه`;

    const modalPrice = document.getElementById("modal-price-display");
    if (modalPrice) modalPrice.textContent = `${getSlotPrice()} جنيه`;
};

// Load data from localStorage
const loadBookingsFromStorage = async () => {
    try {
        const response = await fetch(`/api/bookings?_=${Date.now()}`);
        if (!response.ok) throw new Error("Failed to load bookings");
        const serverBookings = await response.json();
        bookings = Array.isArray(serverBookings) ? serverBookings : [];
    } catch (e) {
        const stored = localStorage.getItem("mal3abak_bookings");
        bookings = stored ? JSON.parse(stored) : [];
    }
    localStorage.setItem("mal3abak_bookings", JSON.stringify(bookings));
};

const saveBookingsToStorage = async () => {
    localStorage.setItem("mal3abak_bookings", JSON.stringify(bookings));
    try {
        await fetch("/api/bookings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bookings)
        });
    } catch (e) {
        console.error("Failed to sync bookings", e);
    }
};

// -------------------------------------------------------------
// DOM Renderers
// -------------------------------------------------------------

const renderDateTabs = () => {
    const container = document.getElementById("date-tabs");
    container.innerHTML = "";

    const filteredDates = getFilteredDates();

    if (filteredDates.length === 0) {
        container.innerHTML = `<div style="padding:20px; color:var(--text-muted); text-align:center;">لا توجد أيام متاحة حالياً.</div>`;
        document.getElementById("slots-grid").innerHTML = "";
        return;
    }

    if (selectedDateIndex >= filteredDates.length) {
        selectedDateIndex = 0;
    }

    filteredDates.forEach((item, index) => {
        const tab = document.createElement("button");
        tab.className = `date-tab ${index === selectedDateIndex ? 'active' : ''}`;
        tab.innerHTML = `
            <span class="tab-day">${item.dayName}</span>
            <span class="tab-date">${item.displayDate}</span>
        `;
        tab.addEventListener("click", () => {
            selectedDateIndex = index;
            renderDateTabs();
            renderSlots();
        });
        container.appendChild(tab);
    });
};

const renderSlots = () => {
    const grid = document.getElementById("slots-grid");
    grid.innerHTML = "";

    const filteredDates = getFilteredDates();
    if (filteredDates.length === 0) return;

    if (selectedDateIndex >= filteredDates.length) {
        selectedDateIndex = 0;
    }

    const targetDate = filteredDates[selectedDateIndex].dateString;
    const timeSlots = getTimeSlots();
    const price = getSlotPrice();

    timeSlots.forEach(time => {
        const booking = bookings.find(b => b.date === targetDate && b.time === time && b.status !== "cancelled");

        let status = "available";
        let statusLabel = "متاح";

        if (booking) {
            status = booking.status;
            statusLabel = booking.status === "confirmed" ? "محجوز" : "معلق (تحقق)";
        }

        const card = document.createElement("div");
        card.className = `slot-card ${status}`;
        card.innerHTML = `
            <span class="slot-time" dir="ltr">${time}</span>
            <span class="slot-price">${price} جنيه</span>
            <span class="slot-status-badge">${statusLabel}</span>
        `;

        if (status === "available") {
            card.addEventListener("click", () => {
                openBookingModal(targetDate, time);
            });
        }

        grid.appendChild(card);
    });
};

// -------------------------------------------------------------
// Modals Handlers
// -------------------------------------------------------------
const openBookingModal = (dateStr, timeStr) => {
    selectedDateString = dateStr;
    selectedSlotTime = timeStr;

    const allDates = getDatesList();
    const dateObj = allDates.find(d => d.dateString === dateStr);

    document.getElementById("modal-display-date").textContent = dateObj ? `${dateObj.dayName} (${dateObj.displayDate})` : dateStr;
    document.getElementById("modal-display-time").textContent = timeStr;

    const priceSpan = document.getElementById("modal-price-display");
    if (priceSpan) priceSpan.textContent = `${getSlotPrice()} جنيه`;

    document.getElementById("booking-name").value = "";
    document.getElementById("booking-phone").value = "";
    document.getElementById("booking-ref").value = "";

    document.getElementById("modal-booking").classList.remove("hidden");
};

const closeModal = (modalId) => {
    document.getElementById(modalId).classList.add("hidden");
};

const showToast = (message, isError = false) => {
    const toast = document.getElementById("toast-notification");
    toast.textContent = message;
    toast.style.borderLeftColor = isError ? "var(--status-booked)" : "var(--primary-green)";
    toast.classList.remove("hidden");
    setTimeout(() => { toast.classList.add("hidden"); }, 4000);
};

// -------------------------------------------------------------
// Booking Form Submission
// -------------------------------------------------------------
const handleBookingSubmit = async (e) => {
    e.preventDefault();

    const name = document.getElementById("booking-name").value.trim();
    const phone = document.getElementById("booking-phone").value.trim();
    const reference = document.getElementById("booking-ref").value.trim();

    if (!name || !phone || !reference) {
        showToast("يرجى ملء جميع الحقول المطلوبة", true);
        return;
    }

    const egPhoneRegex = /^01[0125][0-9]{8}$/;
    if (!egPhoneRegex.test(phone)) {
        showToast("برجاء إدخال رقم هاتف مصري صحيح مكون من 11 رقم", true);
        return;
    }

    const newBooking = {
        id: "b_" + Date.now(),
        name,
        phone,
        date: selectedDateString,
        time: selectedSlotTime,
        reference,
        status: "pending"
    };

    try {
        const response = await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newBooking)
        });

        if (response.status === 409) {
            showToast("عذراً، هذا الموعد تم حجزه للتو!", true);
            closeModal("modal-booking");
            await refreshLiveData();
            return;
        }

        if (!response.ok) throw new Error("Failed to save booking");

        // Optimistic update: add booking to local array immediately
        // (don't wait for GET which may return stale data due to Blob propagation delay)
        bookings.push(newBooking);
        localStorage.setItem("mal3abak_bookings", JSON.stringify(bookings));
    } catch (e) {
        const alreadyBooked = bookings.some(b => b.date === selectedDateString && b.time === selectedSlotTime && b.status !== "cancelled");
        if (alreadyBooked) {
            showToast("عذراً، هذا الموعد تم حجزه للتو!", true);
            closeModal("modal-booking");
            renderSlots();
            return;
        }
        bookings.push(newBooking);
        await saveBookingsToStorage();
    }

    closeModal("modal-booking");
    renderSlots();
    showToast("🎉 تم إرسال طلب الحجز بنجاح! بانتظار مراجعة المسؤول.");
};

// -------------------------------------------------------------
// Check Booking Status
// -------------------------------------------------------------
const handleCheckStatus = () => {
    const phoneInput = document.getElementById("check-phone").value.trim();
    const resultsContainer = document.getElementById("check-results");

    if (!phoneInput) {
        showToast("يرجى إدخال رقم الهاتف للاستعلام", true);
        return;
    }

    resultsContainer.innerHTML = "";
    resultsContainer.classList.remove("hidden");

    const userBookings = bookings.filter(b => b.phone === phoneInput && b.status !== "cancelled");

    if (userBookings.length === 0) {
        resultsContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 10px;">لا توجد حجوزات مسجلة لهذا الرقم.</p>`;
        return;
    }

    const allDates = getDatesList();

    userBookings.forEach(booking => {
        let statusText = "", statusClass = "";
        switch (booking.status) {
            case "pending": statusText = "معلق - بانتظار تأكيد الدفع"; statusClass = "status-text-pending"; break;
            case "confirmed": statusText = "مؤكد - تم الحجز"; statusClass = "status-text-confirmed"; break;
            case "cancelled": statusText = "ملغى / مرفوض"; statusClass = "status-text-cancelled"; break;
        }

        const matchDateObj = allDates.find(d => d.dateString === booking.date);
        const displayDate = matchDateObj ? `${matchDateObj.dayName} (${matchDateObj.displayDate})` : booking.date;

        const item = document.createElement("div");
        item.className = "booking-status-item";
        item.innerHTML = `
            <div>
                <div>📅 <strong>التاريخ:</strong> ${displayDate}</div>
                <div>🕒 <strong>الوقت:</strong> <span dir="ltr">${booking.time}</span></div>
            </div>
            <div><span class="${statusClass}">${statusText}</span></div>
        `;
        resultsContainer.appendChild(item);
    });
};

// -------------------------------------------------------------
// Admin Portal Logic
// -------------------------------------------------------------
const openAdminPortal = () => {
    if (sessionStorage.getItem("adminLoggedIn") === "true") {
        openAdminDashboard();
    } else {
        document.getElementById("admin-pin").value = "";
        document.getElementById("admin-login-error").classList.add("hidden");
        document.getElementById("modal-admin-login").classList.remove("hidden");
    }
};

const handleAdminLogin = () => {
    const pin = document.getElementById("admin-pin").value;
    if (pin === ADMIN_PIN) {
        sessionStorage.setItem("adminLoggedIn", "true");
        document.getElementById("btn-admin-portal").innerHTML = '<span class="btn-icon">👑</span> لوحة التحكم';
        closeModal("modal-admin-login");
        openAdminDashboard();
    } else {
        document.getElementById("admin-login-error").classList.remove("hidden");
    }
};

const openAdminDashboard = () => {
    document.getElementById("modal-admin-dashboard").classList.remove("hidden");
    renderAdminStats();
    renderAdminBookingsList();
    renderAdminSettings();
};

const handleAdminLogout = () => {
    sessionStorage.removeItem("adminLoggedIn");
    document.getElementById("btn-admin-portal").innerHTML = '<span class="btn-icon">🔒</span> بوابة المسؤول';
    closeModal("modal-admin-dashboard");
    showToast("تم تسجيل الخروج بنجاح.");
};

const renderAdminStats = () => {
    const pendingCount = bookings.filter(b => b.status === "pending").length;
    const confirmedCount = bookings.filter(b => b.status === "confirmed").length;
    const totalRevenue = confirmedCount * getSlotPrice();

    document.getElementById("stat-pending-count").textContent = pendingCount;
    document.getElementById("stat-confirmed-count").textContent = confirmedCount;
    document.getElementById("stat-revenue").textContent = `${totalRevenue} ج.م`;
};

const renderAdminBookingsList = () => {
    const tbody = document.getElementById("admin-bookings-list");
    tbody.innerHTML = "";

    let filtered = bookings.filter(b => b.status !== "cancelled");
    if (currentAdminFilter === "pending") filtered = bookings.filter(b => b.status === "pending");
    else if (currentAdminFilter === "confirmed") filtered = bookings.filter(b => b.status === "confirmed");

    filtered.sort((a, b) => b.id.localeCompare(a.id));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">لا توجد طلبات حجز حالياً.</td></tr>`;
        return;
    }

    const allDates = getDatesList();

    filtered.forEach(b => {
        const tr = document.createElement("tr");
        let statusBadge = "", actionButtons = "";

        if (b.status === "pending") {
            statusBadge = `<span class="badge-status pending">معلق</span>`;
            actionButtons = `
                <button class="btn-action-approve" onclick="adminApproveBooking('${b.id}')">تأكيد ✅</button>
                <button class="btn-action-reject" onclick="adminRejectBooking('${b.id}')">رفض ❌</button>
            `;
        } else if (b.status === "confirmed") {
            statusBadge = `<span class="badge-status confirmed">مؤكد</span>`;
            actionButtons = `<button class="btn-action-reject" onclick="adminRejectBooking('${b.id}')">إلغاء</button>`;
        } else {
            statusBadge = `<span class="badge-status cancelled">ملغى</span>`;
            actionButtons = `<span style="color: var(--text-muted)">—</span>`;
        }

        const dateObj = allDates.find(d => d.dateString === b.date);
        const displayDate = dateObj ? `${dateObj.dayName} (${dateObj.displayDate})` : b.date;

        tr.innerHTML = `
            <td><strong>${b.name}</strong></td>
            <td><a href="tel:${b.phone}" style="color: var(--primary-neon); text-decoration:none;">${b.phone}</a></td>
            <td>
                <div>📅 ${displayDate}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);" dir="ltr">${b.time}</div>
            </td>
            <td><code class="font-monospace">${b.reference}</code></td>
            <td>${statusBadge}</td>
            <td><div class="admin-actions">${actionButtons}</div></td>
        `;
        tbody.appendChild(tr);
    });
};

window.adminApproveBooking = async (id) => {
    const booking = bookings.find(b => b.id === id);
    if (booking) {
        booking.status = "confirmed";
        await saveBookingsToStorage();
        showToast(`تم تأكيد الحجز باسم ${booking.name}`);
        renderAdminStats();
        renderAdminBookingsList();
        renderSlots();
    }
};

window.adminRejectBooking = async (id) => {
    const booking = bookings.find(b => b.id === id);
    if (booking) {
        if (confirm(`هل أنت متأكد من إلغاء/رفض حجز ${booking.name}؟`)) {
            bookings = bookings.filter(b => b.id !== id);
            await saveBookingsToStorage();
            showToast(`تم إلغاء حجز ${booking.name}`, true);
            renderAdminStats();
            renderAdminBookingsList();
            renderSlots();
        }
    }
};

// =============================================================
// ADMIN SETTINGS PANEL (Days, Times, Dates, Price)
// =============================================================
const renderAdminSettings = () => {
    const container = document.getElementById("admin-settings-panel");
    if (!container) return;

    container.innerHTML = `
        <!-- Tab Navigation -->
        <div class="settings-tabs">
            <button class="settings-tab ${activeSettingsTab === "days" ? "active" : ""}" data-tab="days">📅 الأيام</button>
            <button class="settings-tab ${activeSettingsTab === "times" ? "active" : ""}" data-tab="times">🕐 المواعيد</button>
            <button class="settings-tab ${activeSettingsTab === "dates" ? "active" : ""}" data-tab="dates">📆 التواريخ</button>
            <button class="settings-tab ${activeSettingsTab === "pricing" ? "active" : ""}" data-tab="pricing">💰 السعر</button>
        </div>

        <!-- Days Tab -->
        <div class="settings-content ${activeSettingsTab === "days" ? "active" : ""}" id="tab-days">
            <h4>تفعيل / إلغاء أيام الأسبوع</h4>
            <p class="settings-desc">اختر الأيام اللي المستخدمين يقدروا يحجزوا فيها</p>
            <div class="day-toggles-grid" id="day-toggles-grid"></div>
        </div>

        <!-- Times Tab -->
        <div class="settings-content ${activeSettingsTab === "times" ? "active" : ""}" id="tab-times">
            <h4>إدارة المواعيد المتاحة</h4>
            <p class="settings-desc">أضف أو احذف مواعيد الحجز المتاحة</p>
            <div class="time-slots-list" id="time-slots-list"></div>
            <div class="add-slot-form">
                <div class="add-slot-row">
                    <div class="time-input-group">
                        <label>من الساعة:</label>
                        <select id="new-slot-start-hour"></select>
                        <select id="new-slot-start-period">
                            <option value="م">م (مساءً)</option>
                            <option value="ص">ص (صباحاً)</option>
                        </select>
                    </div>
                    <div class="time-input-group">
                        <label>إلى الساعة:</label>
                        <select id="new-slot-end-hour"></select>
                        <select id="new-slot-end-period">
                            <option value="م">م (مساءً)</option>
                            <option value="ص">ص (صباحاً)</option>
                        </select>
                    </div>
                    <button class="btn-primary btn-add-slot" id="btn-add-slot">➕ إضافة</button>
                </div>
            </div>
        </div>

        <!-- Dates Tab -->
        <div class="settings-content ${activeSettingsTab === "dates" ? "active" : ""}" id="tab-dates">
            <h4>التحكم في التواريخ</h4>
            <p class="settings-desc">حدد عدد الأيام اللي تظهر للمستخدمين وامنع تواريخ معينة</p>
            <div class="dates-control">
                <div class="days-ahead-control">
                    <label>عدد الأيام المعروضة للحجز (من اليوم):</label>
                    <div class="days-ahead-input">
                        <button class="btn-circle" id="btn-days-minus">−</button>
                        <span class="days-ahead-value" id="days-ahead-value">${adminSettings.daysAhead}</span>
                        <button class="btn-circle" id="btn-days-plus">+</button>
                    </div>
                </div>
                <div class="blocked-dates-section">
                    <label>حظر تواريخ معينة (اختياري):</label>
                    <div class="blocked-dates-list" id="blocked-dates-list"></div>
                    <div class="add-blocked-date">
                        <input type="date" id="block-date-input">
                        <button class="btn-primary" id="btn-block-date">🚫 حظر التاريخ</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Pricing Tab -->
        <div class="settings-content ${activeSettingsTab === "pricing" ? "active" : ""}" id="tab-pricing">
            <h4>سعر الساعة</h4>
            <p class="settings-desc">عدّل سعر حجز الساعة الواحدة بالجنيه المصري</p>
            <div class="price-control">
                <div class="price-input-wrapper">
                    <button class="btn-circle" id="btn-price-minus">−</button>
                    <div class="price-display">
                        <input type="number" id="price-input" value="${adminSettings.slotPrice}" min="10" step="10">
                        <span class="price-currency">ج.م</span>
                    </div>
                    <button class="btn-circle" id="btn-price-plus">+</button>
                </div>
            </div>
        </div>

        <!-- Save Button -->
        <button class="btn-success settings-save-btn" id="btn-save-settings">💾 حفظ جميع الإعدادات وتطبيقها</button>
    `;

    // Initialize tabs
    initSettingsTabs();
    // Render day toggles
    renderDayToggles();
    // Render time slots
    renderTimeSlotsList();
    // Render blocked dates
    renderBlockedDates();
    // Populate hour selects
    populateHourSelects();
    // Setup settings events
    setupSettingsEvents();
};

const initSettingsTabs = () => {
    const tabs = document.querySelectorAll(".settings-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            activeSettingsTab = tab.dataset.tab;
            sessionStorage.setItem("adminSettingsTab", activeSettingsTab);
            tabs.forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".settings-content").forEach(c => c.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
        });
    });
};

const renderDayToggles = () => {
    const grid = document.getElementById("day-toggles-grid");
    grid.innerHTML = "";

    ARABIC_DAYS.forEach((day, idx) => {
        const isChecked = adminSettings.activeDays.includes(idx);
        const wrapper = document.createElement("div");
        wrapper.className = `day-toggle-item ${isChecked ? "active" : ""}`;
        wrapper.innerHTML = `
            <input type="checkbox" id="day-toggle-${idx}" ${isChecked ? "checked" : ""}>
            <label for="day-toggle-${idx}">${day}</label>
        `;
        const chk = wrapper.querySelector("input");
        chk.addEventListener("change", () => {
            wrapper.classList.toggle("active", chk.checked);
        });
        grid.appendChild(wrapper);
    });
};

const renderTimeSlotsList = () => {
    const list = document.getElementById("time-slots-list");
    list.innerHTML = "";

    adminSettings.timeSlots.forEach((slot, idx) => {
        const item = document.createElement("div");
        item.className = "time-slot-item";
        item.innerHTML = `
            <span class="time-slot-text" dir="ltr">${slot}</span>
            <button class="btn-remove-slot" data-idx="${idx}">✕</button>
        `;
        item.querySelector(".btn-remove-slot").addEventListener("click", () => {
            adminSettings.timeSlots.splice(idx, 1);
            renderTimeSlotsList();
        });
        list.appendChild(item);
    });

    if (adminSettings.timeSlots.length === 0) {
        list.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:15px;">لا توجد مواعيد. أضف مواعيد جديدة.</p>`;
    }
};

const populateHourSelects = () => {
    const hours = [];
    for (let i = 1; i <= 12; i++) {
        hours.push(i < 10 ? `0${i}` : `${i}`);
    }

    ["new-slot-start-hour", "new-slot-end-hour"].forEach(id => {
        const select = document.getElementById(id);
        select.innerHTML = "";
        hours.forEach(h => {
            const opt = document.createElement("option");
            opt.value = h;
            opt.textContent = h + ":00";
            select.appendChild(opt);
        });
    });
};

const renderBlockedDates = () => {
    const list = document.getElementById("blocked-dates-list");
    list.innerHTML = "";

    if (adminSettings.blockedDates.length === 0) {
        list.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">لا توجد تواريخ محظورة.</p>`;
        return;
    }

    adminSettings.blockedDates.forEach((date, idx) => {
        const chip = document.createElement("div");
        chip.className = "blocked-date-chip";
        chip.innerHTML = `
            <span>${date}</span>
            <button class="btn-remove-blocked" data-idx="${idx}">✕</button>
        `;
        chip.querySelector(".btn-remove-blocked").addEventListener("click", () => {
            adminSettings.blockedDates.splice(idx, 1);
            renderBlockedDates();
        });
        list.appendChild(chip);
    });
};

const setupSettingsEvents = () => {
    // Add new time slot
    document.getElementById("btn-add-slot").addEventListener("click", () => {
        const startH = document.getElementById("new-slot-start-hour").value;
        const startP = document.getElementById("new-slot-start-period").value;
        const endH = document.getElementById("new-slot-end-hour").value;
        const endP = document.getElementById("new-slot-end-period").value;

        const newSlot = `${startH}:00 ${startP} - ${endH}:00 ${endP}`;

        if (adminSettings.timeSlots.includes(newSlot)) {
            showToast("هذا الميعاد موجود بالفعل!", true);
            return;
        }

        adminSettings.timeSlots.push(newSlot);
        renderTimeSlotsList();
        showToast("تم إضافة الميعاد.");
    });

    // Days ahead controls
    document.getElementById("btn-days-minus").addEventListener("click", () => {
        const val = document.getElementById("days-ahead-value");
        let current = parseInt(val.textContent);
        if (current > 1) {
            current--;
            val.textContent = current;
        }
    });

    document.getElementById("btn-days-plus").addEventListener("click", () => {
        const val = document.getElementById("days-ahead-value");
        let current = parseInt(val.textContent);
        if (current < 30) {
            current++;
            val.textContent = current;
        }
    });

    // Block date
    document.getElementById("btn-block-date").addEventListener("click", () => {
        const input = document.getElementById("block-date-input");
        const dateVal = input.value;
        if (!dateVal) {
            showToast("اختر تاريخ أولاً!", true);
            return;
        }
        if (adminSettings.blockedDates.includes(dateVal)) {
            showToast("هذا التاريخ محظور بالفعل!", true);
            return;
        }
        adminSettings.blockedDates.push(dateVal);
        renderBlockedDates();
        input.value = "";
        showToast("تم حظر التاريخ.");
    });

    // Price controls
    document.getElementById("btn-price-minus").addEventListener("click", () => {
        const input = document.getElementById("price-input");
        let val = parseInt(input.value) || 0;
        if (val > 10) {
            input.value = val - 10;
        }
    });

    document.getElementById("btn-price-plus").addEventListener("click", () => {
        const input = document.getElementById("price-input");
        let val = parseInt(input.value) || 0;
        input.value = val + 10;
    });

    // SAVE ALL SETTINGS
    document.getElementById("btn-save-settings").addEventListener("click", async () => {
        // Collect days
        const newActiveDays = [];
        ARABIC_DAYS.forEach((_, i) => {
            const cb = document.getElementById(`day-toggle-${i}`);
            if (cb && cb.checked) newActiveDays.push(i);
        });

        if (newActiveDays.length === 0) {
            showToast("⚠️ لازم تفعّل يوم واحد على الأقل!", true);
            return;
        }

        if (adminSettings.timeSlots.length === 0) {
            showToast("⚠️ لازم تضيف ميعاد واحد على الأقل!", true);
            return;
        }

        // Collect days ahead
        const daysAhead = parseInt(document.getElementById("days-ahead-value").textContent) || 7;

        // Collect price
        const price = parseInt(document.getElementById("price-input").value) || 200;

        // Update settings
        adminSettings.activeDays = newActiveDays;
        adminSettings.daysAhead = daysAhead;
        adminSettings.slotPrice = price;

        // Save
        await saveSettings(adminSettings);

        // Refresh user-facing UI
        selectedDateIndex = 0;
        renderDateTabs();
        renderSlots();
        updatePriceDisplays();

        showToast("✅ تم حفظ جميع الإعدادات وتطبيقها!");
    });
};

// -------------------------------------------------------------
// Utilities & Clipboard
// -------------------------------------------------------------
const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
        showToast("تم نسخ الرقم إلى الحافظة!");
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
};

// -------------------------------------------------------------
// Event Listeners Setup
// -------------------------------------------------------------
const setupEventListeners = () => {
    document.getElementById("btn-copy-number").addEventListener("click", () => {
        copyToClipboard(INSTAPAY_NUMBER);
    });

    document.getElementById("btn-copy-modal-num").addEventListener("click", () => {
        copyToClipboard(INSTAPAY_NUMBER);
    });

    document.getElementById("booking-form").addEventListener("submit", handleBookingSubmit);
    document.getElementById("btn-check-status").addEventListener("click", handleCheckStatus);

    document.getElementById("btn-admin-portal").addEventListener("click", openAdminPortal);
    document.getElementById("btn-submit-login").addEventListener("click", handleAdminLogin);
    document.getElementById("btn-admin-logout").addEventListener("click", handleAdminLogout);

    document.getElementById("admin-pin").addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleAdminLogin();
    });

    const filterBtns = document.querySelectorAll(".filter-btn");
    filterBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            filterBtns.forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            currentAdminFilter = e.target.getAttribute("data-filter");
            renderAdminBookingsList();
        });
    });
};
