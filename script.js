// App State
let appState = {
  isSetup: false,
  lastPeriodDate: null,
  cycleLength: 28,
  currentTab: "today",
  selectedDay: null,
  moodEntries: {},
  dayNotes: {},
}

// 🆕 Загружаемые из Gist рекомендации (инициализируем пустым объектом)
let phases = {};

// Mood emojis mapping
const moodEmojis = {
  happy: "😊",
  neutral: "😐",
  sad: "🥺",
  tired: "😴",
  strong: "💪",
  blooming: "🌸",
}

// 🆕 Функция загрузки рекомендаций из Gist
async function loadRecommendationsFromGist() {
  const gistId = "064a337ec1de1bf772d8942bedcae1be";
  const fileName = "recommendations.json";

  try {
    const response = await fetch(`https://api.github.com/gists/${gistId}`);
    if (!response.ok) {
      throw new Error(`Ошибка загрузки Gist: ${response.status}`);
    }

    const gist = await response.json();
    const fileContent = gist.files[fileName]?.content;

    if (!fileContent) {
      throw new Error(`Файл ${fileName} не найден в Gist`);
    }

    phases = JSON.parse(fileContent);
    console.log("✅ Рекомендации успешно загружены из Gist:", phases);
  } catch (error) {
    console.error("❌ Ошибка при загрузке рекомендаций:", error);
    alert("Не удалось загрузить рекомендации. Проверьте подключение к интернету.");
  }
}

// 🆕 Функция загрузки данных пользователя из Gist
async function loadUserDataFromServer() {
  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString();
  if (!userId) return;

  try {
    const response = await fetch('https://fcycle-85.deno.dev/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) return;

    const data = await response.json();
    if (data.appState) {
      // Объединяем данные: сначала локальные, потом загруженные (локальные приоритетнее)
      appState = { ...data.appState, ...appState };
      saveAppState(); // Сохраняем объединённое состояние локально
      console.log("✅ Данные пользователя загружены из облака");
      // Перезагружаем интерфейс
      if (appState.isSetup) {
        updateTodayView();
        generateCalendar();
        updateDiaryView();
      }
    }
  } catch (e) {
    console.error("❌ Ошибка загрузки данных из облака:", e);
  }
}

// 🆕 Функция сохранения данных пользователя в Gist
async function saveUserDataToServer() {
  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString();
  if (!userId) return;

  try {
    await fetch('https://fcycle-85.deno.dev/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, appState }),
    });
  } catch (e) {
    console.error("❌ Ошибка сохранения данных в облако:", e);
  }
}

// Initialize app
document.addEventListener("DOMContentLoaded", async () => {
  await loadRecommendationsFromGist();

  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
    console.log("Telegram WebApp initialized");
  } else {
    console.warn("Telegram WebApp not detected. Running in standalone mode?");
  }

  document.body.style.opacity = "0";
  document.body.style.transition = "opacity 0.5s ease";

  // 🔥 Загружаем данные из облака ПЕРЕД загрузкой локальных
  await loadUserDataFromServer();
  loadAppState(); // Загружаем локальные (они перезапишут, если были изменения)

  initializeEventListeners();

  if (appState.isSetup) {
    showMainApp();
  } else {
    showWelcomeScreen();
  }

  setTimeout(() => {
    document.body.style.opacity = "1";
  }, 100);
});

// Event Listeners
function initializeEventListeners() {
  document.getElementById("start-journey").addEventListener("click", setupApp);

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => switchTab(e.target.closest(".nav-item").dataset.tab));
  });

  document.querySelectorAll(".mood-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => selectMood(e.target.dataset.mood));
  });

  document.getElementById("save-mood").addEventListener("click", saveDailyMood);

  document.getElementById("close-modal").addEventListener("click", closeModal);
  document.getElementById("save-note").addEventListener("click", saveDayNote);

  document.getElementById("day-modal").addEventListener("click", (e) => {
    if (e.target.id === "day-modal") closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = document.getElementById("day-modal");
      if (!modal.classList.contains("hidden")) {
        closeModal();
      }
    }

    if (e.key === "Tab" && document.activeElement.classList.contains("mood-btn")) {
      e.preventDefault();
      const moodBtns = Array.from(document.querySelectorAll(".mood-btn"));
      const currentIndex = moodBtns.indexOf(document.activeElement);
      const nextIndex = e.shiftKey
        ? (currentIndex - 1 + moodBtns.length) % moodBtns.length
        : (currentIndex + 1) % moodBtns.length;
      moodBtns[nextIndex].focus();
    }
  });

  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  });

  document.addEventListener("touchend", (e) => {
    if (!touchStartX || !touchStartY) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;

    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      const tabs = ["today", "calendar", "diary"];
      const currentTabIndex = tabs.indexOf(appState.currentTab);

      if (diffX > 0 && currentTabIndex < tabs.length - 1) {
        switchTab(tabs[currentTabIndex + 1]);
      } else if (diffX < 0 && currentTabIndex > 0) {
        switchTab(tabs[currentTabIndex - 1]);
      }
    }

    touchStartX = 0;
    touchStartY = 0;
  });

  let longPressTimer = null;
  const title = document.querySelector(".welcome-content h1");
  if (title) {
    title.addEventListener("mousedown", startLongPress);
    title.addEventListener("mouseup", cancelLongPress);
    title.addEventListener("mouseleave", cancelLongPress);
    title.addEventListener("touchstart", startLongPress);
    title.addEventListener("touchend", cancelLongPress);
  }

  function startLongPress() {
    longPressTimer = setTimeout(() => {
      if (confirm("Would you like to export your cycle data for backup?")) {
        exportUserData();
      }
    }, 2000);
  }

  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }
}

// 🆕 Функция для отправки рекомендации через fetch
function sendRecommendationToTelegram(recommendationText, phaseName, cycleDay) {
  try {
    const dataToSend = {
      recommendation: recommendationText,
      phase: phaseName,
      cycleDay: cycleDay,
      timestamp: new Date().toISOString(),
    };

    fetch('https://fcycle-85.deno.dev/api/book', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataToSend),
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        showNotification("✨ Recommendation sent to your chat!");
      } else {
        showNotification("❌ Failed to send recommendation");
      }
    })
    .catch(error => {
      console.error('Error sending recommendation:', error);
      showNotification("❌ Error sending recommendation");
    });
  } catch (error) {
    console.error("Error in sendRecommendationToTelegram:", error);
    showNotification("❌ Error sending recommendation");
  }
}

// App Setup
function setupApp() {
  const lastPeriodInput = document.getElementById("last-period");
  const cycleLengthSelect = document.getElementById("cycle-length");

  if (!lastPeriodInput.value) {
    alert("Пожалуйста, выберите дату начала вашей последней менструации");
    return;
  }

  appState.lastPeriodDate = new Date(lastPeriodInput.value);
  appState.cycleLength = Number.parseInt(cycleLengthSelect.value);
  appState.isSetup = true;

  saveAppState();
  showMainApp();
  updateTodayView();
  checkForNotifications();

  // 🔥 Сразу сохраняем в облако
  saveUserDataToServer();
}

function showWelcomeScreen() {
  document.getElementById("welcome-screen").classList.remove("hidden");
  document.getElementById("main-app").classList.add("hidden");
}

function showMainApp() {
  document.getElementById("welcome-screen").classList.add("hidden");
  document.getElementById("main-app").classList.remove("hidden");
  updateTodayView();
  generateCalendar();
  updateDiaryView();
}

// Tab Management
function switchTab(tabName) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active");
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");

  document.querySelectorAll(".tab-pane").forEach((pane) => {
    pane.classList.remove("active");
  });
  document.getElementById(`${tabName}-tab`).classList.add("active");

  appState.currentTab = tabName;

  if (tabName === "calendar") {
    generateCalendar();
  } else if (tabName === "diary") {
    updateDiaryView();
  } else if (tabName === "today") {
    updateTodayView();
  }
}

// Cycle Calculations
function getCurrentCycleDay() {
  if (!appState.lastPeriodDate) return 1;

  const today = new Date();
  const diffTime = today - appState.lastPeriodDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return (diffDays % appState.cycleLength) + 1;
}

function getPhaseForDay(day) {
  for (const [phaseName, phase] of Object.entries(phases)) {
    if (phase.days.includes(day)) {
      return { name: phaseName, ...phase };
    }
  }
  return phases.menstruation;
}

function getDayOfCycle(date) {
  if (!appState.lastPeriodDate) return 1;

  const diffTime = date - appState.lastPeriodDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return (diffDays % appState.cycleLength) + 1;
}

// Today View Updates
function updateTodayView() {
  const currentDay = getCurrentCycleDay();
  const currentPhase = getPhaseForDay(currentDay);

  const hour = new Date().getHours();
  let greeting = "Доброе утро, красавица";
  if (hour >= 12 && hour < 17) greeting = "Добрый день, милая";
  else if (hour >= 17) greeting = "Добрый вечер, дорогая";

  document.getElementById("greeting").textContent = greeting;
  document.getElementById("current-day").textContent = currentDay;
  document.getElementById("phase-name").textContent = currentPhase.name;

  const phaseIndicator = document.getElementById("phase-indicator");
  phaseIndicator.className = `phase-indicator ${currentPhase.name.toLowerCase()}`;

  const randomRecommendation =
    currentPhase.recommendations[Math.floor(Math.random() * currentPhase.recommendations.length)];
  document.getElementById("recommendation-text").textContent = randomRecommendation;
  document.getElementById("recommendation-icon").innerHTML = currentPhase.icon;

  const activitiesList = document.getElementById("activities-list");
  if (activitiesList && currentPhase.activities) {
    activitiesList.innerHTML = currentPhase.activities
      .map((activity) => `<span class="activity-tag">${activity}</span>`)
      .join("");
  }

  const today = new Date().toDateString();
  const todayMood = appState.moodEntries[today];
  if (todayMood) {
    document.querySelector(`[data-mood="${todayMood.mood}"]`).classList.add("selected");
  } else {
    document.querySelectorAll(".mood-btn").forEach((btn) => {
      btn.classList.remove("selected");
    });
  }

  const recommendationCard = document.getElementById("recommendation-card");
  recommendationCard.classList.add("phase-transition");
  setTimeout(() => {
    recommendationCard.classList.remove("phase-transition");
  }, 2000);

  const sendButtonContainer = document.getElementById("send-to-telegram-container");
  if (!sendButtonContainer) {
    const container = document.createElement("div");
    container.id = "send-to-telegram-container";
    container.style.marginTop = "1rem";
    container.style.textAlign = "center";

    const sendButton = document.createElement("button");
    sendButton.id = "send-to-telegram-btn";
    sendButton.textContent = "";
    sendButton.style.padding = "25px";
    sendButton.style.backgroundColor = "#e8b4cb00";
    sendButton.style.color = "#ffffffdb";
    sendButton.style.border = "none";
    sendButton.style.borderRadius = "50%";
    sendButton.style.cursor = "pointer";
    sendButton.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
    sendButton.style.transition = "all 0.2s ease";
    sendButton.style.backgroundImage = "url('tg.png')";
    sendButton.style.backgroundSize = "70%";
    sendButton.style.backgroundRepeat = "no-repeat";
    sendButton.style.backgroundPosition = "center";

    sendButton.onmouseover = function() {
      this.style.backgroundColor = "#d4a5c29c";
      this.style.transform = "translateY(-1px)";
      this.style.boxShadow = "0 3px 6px rgba(0,0,0,0.15)";
    };

    sendButton.onmouseout = function() {
      this.style.backgroundColor = "#d4a5c270";
      this.style.transform = "translateY(0)";
      this.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
    };

    sendButton.addEventListener("click", function() {
      sendRecommendationToTelegram(
        document.getElementById("recommendation-text").textContent,
        currentPhase.name,
        currentDay
      );
    });

    container.appendChild(sendButton);
    const recommendationSection = document.querySelector(".recommendation-section");
    if (recommendationSection) {
      recommendationSection.appendChild(container);
    } else {
      const recCard = document.getElementById("recommendation-card");
      if (recCard && recCard.parentNode) {
        recCard.parentNode.appendChild(container);
      }
    }
  }
}

// Mood Management
function selectMood(mood) {
  document.querySelectorAll(".mood-btn").forEach((btn) => {
    btn.classList.remove("selected");
  });
  const selectedBtn = document.querySelector(`[data-mood="${mood}"]`);
  selectedBtn.classList.add("selected");
  selectedBtn.style.transform = "scale(1.2)";
  setTimeout(() => {
    selectedBtn.style.transform = "";
  }, 200);
}

function saveDailyMood() {
  const selectedMood = document.querySelector(".mood-btn.selected");
  if (!selectedMood) {
    alert("Пожалуйста, выберите, как вы себя чувствуете сегодня");
    return;
  }

  const today = new Date().toDateString();
  appState.moodEntries[today] = {
    mood: selectedMood.dataset.mood,
    date: today,
    cycleDay: getCurrentCycleDay(),
  };

  saveAppState();

  // 🔥 Сразу сохраняем в облако
  saveUserDataToServer();

  const button = document.getElementById("save-mood");
  const originalText = button.textContent;
  button.textContent = "Сохранили! 💕";
  button.style.background = "#B8E6B8";
  setTimeout(() => {
    button.textContent = originalText;
    button.style.background = "";
  }, 2000);
}

// Calendar Generation
function generateCalendar() {
  const calendarGrid = document.getElementById("calendar-grid");
  calendarGrid.innerHTML = "";

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const dayHeaders = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  dayHeaders.forEach((day) => {
    const header = document.createElement("div");
    header.textContent = day;
    header.style.textAlign = "center";
    header.style.fontWeight = "bold";
    header.style.color = "#8B7B8B";
    header.style.fontSize = "0.8rem";
    header.style.padding = "0.5rem";
    calendarGrid.appendChild(header);
  });

  for (let i = 0; i < startingDayOfWeek; i++) {
    const emptyDay = document.createElement("div");
    emptyDay.className = "calendar-day empty";
    calendarGrid.appendChild(emptyDay);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayElement = document.createElement("div");
    dayElement.className = "calendar-day";
    dayElement.textContent = day;

    const dayDate = new Date(currentYear, currentMonth, day);
    const cycleDay = getDayOfCycle(dayDate);
    const phase = getPhaseForDay(cycleDay);

    dayElement.style.backgroundColor = phase.color;
    dayElement.style.color = "white";

    if (day === today.getDate()) {
      dayElement.classList.add("current");
    }

    dayElement.addEventListener("click", () => openDayModal(dayDate, cycleDay, phase));
    calendarGrid.appendChild(dayElement);
  }
}

// Day Modal
function openDayModal(date, cycleDay, phase) {
  const modal = document.getElementById("day-modal");
  const dateStr = date.toLocaleDateString("ru-RU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  document.getElementById("modal-date").textContent = `${dateStr} - День ${cycleDay}`;
  document.getElementById("modal-phase").className = `modal-phase ${phase.name.toLowerCase()}`;
  document.getElementById("modal-phase").querySelector(".phase-name").textContent = phase.name;

  const randomRecommendation = phase.recommendations[Math.floor(Math.random() * phase.recommendations.length)];
  document.getElementById("modal-recommendation").textContent = randomRecommendation;

  const dateKey = date.toDateString();
  const existingNote = appState.dayNotes[dateKey] || "";
  document.getElementById("modal-note-input").value = existingNote;

  appState.selectedDay = date;
  modal.classList.remove("hidden");

  const sendButtonInModal = document.getElementById("send-to-telegram-btn-modal");
  if (!sendButtonInModal) {
    const sendButton = document.createElement("button");
    sendButton.id = "send-to-telegram-btn-modal";
    sendButton.textContent = "";
    sendButton.style.marginTop = "1rem";
    sendButton.style.padding = "25px";
    sendButton.style.backgroundColor = "#e8b4cb00";
    sendButton.style.color = "white";
    sendButton.style.border = "none";
    sendButton.style.borderRadius = "50%";
    sendButton.style.cursor = "pointer";
    sendButton.style.fontWeight = "500";
    sendButton.style.backgroundImage = "url('tg.png')";
    sendButton.style.backgroundSize = "60%";
    sendButton.style.backgroundRepeat = "no-repeat";
    sendButton.style.backgroundPosition = "center";

    sendButton.addEventListener("click", function() {
      sendRecommendationToTelegram(
        document.getElementById("modal-recommendation").textContent,
        phase.name,
        cycleDay
      );
    });

    const modalContent = document.querySelector(".modal-content");
    if (modalContent) {
      const closeButton = document.getElementById("close-modal");
      if (closeButton && closeButton.parentNode) {
        closeButton.parentNode.insertBefore(sendButton, closeButton);
      } else {
        modalContent.appendChild(sendButton);
      }
    }
  }
}

function closeModal() {
  document.getElementById("day-modal").classList.add("hidden");
  appState.selectedDay = null;
}

function saveDayNote() {
  if (!appState.selectedDay) return;

  const note = document.getElementById("modal-note-input").value;
  const dateKey = appState.selectedDay.toDateString();

  if (note.trim()) {
    appState.dayNotes[dateKey] = note;
  } else {
    delete appState.dayNotes[dateKey];
  }

  saveAppState();
  closeModal();

  // 🔥 Сразу сохраняем в облако
  saveUserDataToServer();

  if (appState.currentTab === "diary") {
    updateDiaryView();
  }
}

// Diary View
function updateDiaryView() {
  const diaryEntries = document.getElementById("diary-entries");
  diaryEntries.innerHTML = "";

  const allEntries = [];

  Object.values(appState.moodEntries).forEach((entry) => {
    allEntries.push({
      date: new Date(entry.date),
      type: "mood",
       entry,
    });
  });

  Object.entries(appState.dayNotes).forEach(([dateStr, note]) => {
    allEntries.push({
      date: new Date(dateStr),
      type: "note",
      payload: { note, date: dateStr },
    });
  });

  allEntries.sort((a, b) => b.date - a.date);

  if (allEntries.length === 0) {
    diaryEntries.innerHTML = `
      <div style="text-align: center; color: #8B7B8B; padding: 2rem;">
        <p>Ваше прекрасное путешествие начинается здесь...</p>
        <p style="font-size: 0.9rem; margin-top: 0.5rem;">Добавляйте настроения и заметки, чтобы видеть их в своем дневнике</p>
      </div>
    `;
    return;
  }

  allEntries.forEach((entry) => {
    const entryElement = document.createElement("div");
    entryElement.className = "diary-entry fade-in";

    const dateStr = entry.date.toLocaleDateString("ru-RU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    if (entry.type === "mood") {
      entryElement.innerHTML = `
        <div class="diary-entry-date">${dateStr} - День ${entry.data.cycleDay}</div>
        <div class="diary-entry-mood">${moodEmojis[entry.data.mood]}</div>
        ${entry.data.note ? `<div class="diary-entry-note">${entry.data.note}</div>` : ""}
      `;
    } else {
      entryElement.innerHTML = `
        <div class="diary-entry-date">${dateStr}</div>
        <div class="diary-entry-note">${entry.data.note}</div>
      `;
    }

    diaryEntries.appendChild(entryElement);
  });
}

// Notifications
function checkForNotifications() {
  const currentDay = getCurrentCycleDay();
  const daysUntilPeriod = appState.cycleLength - currentDay + 1;

  if (daysUntilPeriod === 2) {
    showNotification("Месячные могут начаться через 2 дня. Самое время быть особенно бережной к себе. 🌙");
  } else if (daysUntilPeriod === 1) {
    showNotification("Месячные могут начаться завтра. Подготовьте свое уютное пространство и любимые предметы комфорта. 🌸");
  }

  const currentPhase = getPhaseForDay(currentDay);
  if (currentDay === 1) {
    setTimeout(() => {
      showNotification("Добро пожаловать на этап вашего обновления. Ваше тело делает прекрасную работу. 💕");
    }, 3000);
  } else if (currentDay === 6) {
    setTimeout(() => {
      showNotification("Чувствуете, как к вам возвращается энергия? У вас начинается творческая фаза! ✨");
    }, 3000);
  } else if (currentDay === 14) {
    setTimeout(() => {
      showNotification("Ты сегодня сияешь! Идеальное время, чтобы блистать и общаться. 🌟");
    }, 3000);
  } else if (currentDay === 17) {
    setTimeout(() => {
      showNotification("Пришло время обратиться внутрь себя. Сейчас твоя мудрость глубочайшая. 🌙");
    }, 3000);
  }

  const moodEntryCount = Object.keys(appState.moodEntries).length;
  if (moodEntryCount === 7) {
    setTimeout(() => {
      showNotification("Вы занимаетесь отслеживанием уже неделю! Вы создаёте такую прекрасную практику. 🌱");
    }, 5000);
  } else if (moodEntryCount === 30) {
    setTimeout(() => {
      showNotification("Целый месяц самопознания! Вы по-настоящему цените свой путь. 🌺");
    }, 5000);
  }
}

function showNotification(message) {
  const notification = document.getElementById("notification");
  document.getElementById("notification-text").textContent = message;
  notification.classList.remove("hidden");
  setTimeout(() => {
    notification.classList.add("hidden");
  }, 5000);
}

// Data Persistence
function saveAppState() {
  localStorage.setItem(
    "lunaAppState",
    JSON.stringify({
      ...appState,
      lastPeriodDate: appState.lastPeriodDate ? appState.lastPeriodDate.toISOString() : null,
    })
  );
}

function loadAppState() {
  const saved = localStorage.getItem("lunaAppState");
  if (saved) {
    const parsed = JSON.parse(saved);
    appState = {
      ...appState,
      ...parsed,
      lastPeriodDate: parsed.lastPeriodDate ? new Date(parsed.lastPeriodDate) : null,
    };
  }
}

// Utility Functions
function formatDate(date) {
  return date.toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Data export functionality for user privacy
function exportUserData() {
  const exportData = {
    version: "1.0",
    exportDate: new Date().toISOString(),
    cycleData: {
      lastPeriodDate: appState.lastPeriodDate,
      cycleLength: appState.cycleLength,
    },
    moodEntries: appState.moodEntries,
    dayNotes: appState.dayNotes,
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `luna-cycle-data-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
