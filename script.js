// App State
let appState = {
  isSetup: false,
  lastPeriodDate: null,
  previousLastPeriodDate: null, // Для хранения предыдущей даты
  cycleHistory: [],              // 🆕 История циклов
  cycleLength: 28,               // По умолчанию или средняя
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
      // Объединяем данные: сначала загруженные, потом локальные (локальные приоритетнее)
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
    // Close modal with Escape key
    if (e.key === "Escape") {
      const modal = document.getElementById("day-modal");
      const newCycleModal = document.getElementById("new-cycle-modal");
      if (!modal.classList.contains("hidden")) {
        closeModal();
      } else if (newCycleModal && !newCycleModal.classList.contains("hidden")) {
        closeNewCycleModal();
      }
    }

    // Tab navigation for mood buttons
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

  // Touch gesture support for mobile
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

    // Only handle horizontal swipes that are significant
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      const tabs = ["today", "calendar", "diary"];
      const currentTabIndex = tabs.indexOf(appState.currentTab);

      if (diffX > 0 && currentTabIndex < tabs.length - 1) {
        // Swipe left - next tab
        switchTab(tabs[currentTabIndex + 1]);
      } else if (diffX < 0 && currentTabIndex > 0) {
        // Swipe right - previous tab
        switchTab(tabs[currentTabIndex - 1]);
      }
    }

    touchStartX = 0;
    touchStartY = 0;
  });

  // Settings menu (hidden feature - long press on Luna title)
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

  // --- Обработчики событий для нового модального окна "Новый цикл" ---
  document.getElementById("close-new-cycle-modal")?.addEventListener("click", closeNewCycleModal);
  document.getElementById("cancel-new-cycle-btn")?.addEventListener("click", closeNewCycleModal);
  document.getElementById("new-cycle-today-btn")?.addEventListener("click", handleNewCycleToday);
  document.getElementById("confirm-new-cycle-btn")?.addEventListener("click", handleConfirmNewCycleDate);

  document.getElementById("new-cycle-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "new-cycle-modal") {
      closeNewCycleModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("new-cycle-modal");
    if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
      closeNewCycleModal();
    }
  });
}

// 🆕 Функция для отправки рекомендации через fetch (как в работающем сервере)
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

  const initialDate = new Date(lastPeriodInput.value);
  appState.lastPeriodDate = initialDate;
  appState.cycleLength = Number.parseInt(cycleLengthSelect.value);
  appState.isSetup = true;

  // 🆕 Добавляем первый цикл в историю
  addCycleToHistory(initialDate);

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
  // Update navigation
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active");
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");

  // Update content
  document.querySelectorAll(".tab-pane").forEach((pane) => {
    pane.classList.remove("active");
  });
  document.getElementById(`${tabName}-tab`).classList.add("active");

  appState.currentTab = tabName;

  // Refresh content based on tab
  if (tabName === "calendar") {
    generateCalendar();
  } else if (tabName === "diary") {
    updateDiaryView();
  } else if (tabName === "today") {
    updateTodayView();
  }

  // 🆕 Показываем или скрываем плавающую кнопку
  const floatBtn = document.getElementById("float-new-cycle-btn");
  if (floatBtn) {
    if (tabName === "today") {
      floatBtn.style.display = "flex";
    } else {
      floatBtn.style.display = "none";
    }
  }
}

// 🆕 Cycle History Management

// 🆕 Добавление нового цикла в историю
function addCycleToHistory(startDate) {
  console.log("Добавляем цикл в историю. Новая дата:", startDate.toISOString().split('T')[0]);
  
  // 1. Проверяем, есть ли уже установленная дата начала цикла
  if (!appState.lastPeriodDate) {
    console.log("Первый цикл. Просто добавляем.");
    // Если это первый цикл, просто добавляем его
    const newCycle = {
      startDate: startDate.toISOString(),
      endDate: null,
      length: null
    };
    appState.cycleHistory.push(newCycle);
    
    // Ограничиваем историю
    if (appState.cycleHistory.length > 6) {
      appState.cycleHistory.shift();
    }
    
    console.log("Первый цикл добавлен в историю:", appState.cycleHistory);
    return;
  }

  // 2. Рассчитываем разницу в днях между новой и предыдущей датой
  const previousStartDate = appState.lastPeriodDate;
  const diffTime = startDate - previousStartDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  console.log(`Разница между ${previousStartDate.toISOString().split('T')[0]} и ${startDate.toISOString().split('T')[0]}: ${diffDays} дней`);

  // 3. Если разница меньше 7 дней, считаем предыдущую дату ошибочной
  if (diffDays > 0 && diffDays < 7) {
    console.log(`Разница ${diffDays} дней < 7. Предыдущая дата (${previousStartDate.toISOString().split('T')[0]}) считается ошибочной.`);
    
    // a. Удаляем последний "ошибочный" цикл из истории (если он был добавлен)
    if (appState.cycleHistory.length > 0) {
      const lastCycle = appState.cycleHistory[appState.cycleHistory.length - 1];
      if (new Date(lastCycle.startDate).getTime() === previousStartDate.getTime()) {
        console.log("Удаляем ошибочный цикл из истории.");
        appState.cycleHistory.pop();
      }
    }
    
    // b. Добавляем новый корректный цикл
    const correctedCycle = {
      startDate: startDate.toISOString(),
      endDate: null,
      length: null
    };
    appState.cycleHistory.push(correctedCycle);
    
    // Ограничиваем историю
    if (appState.cycleHistory.length > 6) {
      appState.cycleHistory.shift();
    }
    
    console.log("История циклов обновлена (ошибка исправлена):", appState.cycleHistory);
    return;
  }

  // 4. Если разница 7 или более дней (или отрицательная/ноль - новая дата раньше или та же)
  if (diffDays >= 7) {
    console.log(`Разница ${diffDays} дней >= 7. Это новый цикл.`);
    
    // a. Обновляем endDate и length предыдущего цикла в истории
    if (appState.cycleHistory.length > 0) {
      const lastCycleIndex = appState.cycleHistory.length - 1;
      const lastCycle = appState.cycleHistory[lastCycleIndex];
      
      // Проверяем, что это именно предыдущий цикл, который мы завершаем
      if (new Date(lastCycle.startDate).getTime() === previousStartDate.getTime()) {
        lastCycle.endDate = startDate.toISOString();
        lastCycle.length = diffDays;
        console.log(`Предыдущий цикл завершен. Длина: ${diffDays} дней.`);
      } else {
        console.warn("Предупреждение: Не совпадает дата начала предыдущего цикла при завершении.");
      }
    }
    
    // b. Добавляем новый цикл
    const newCycle = {
      startDate: startDate.toISOString(),
      endDate: null,
      length: null
    };
    appState.cycleHistory.push(newCycle);
    
    // Ограничиваем историю
    if (appState.cycleHistory.length > 6) {
      appState.cycleHistory.shift();
    }
    
    console.log("История циклов обновлена (новый цикл):", appState.cycleHistory);
    return;
  }

  // 5. Если diffDays <= 0 (новая дата раньше или равна предыдущей)
  if (diffDays <= 0) {
    console.warn("Новая дата начала цикла должна быть позже предыдущей.");
    // Можно показать уведомление пользователю
    // alert("Новая дата начала цикла должна быть позже предыдущей.");
    return;
  }
}

// 🆕 Расчет средней длины цикла на основе истории
function calculateAverageCycleLength() {
  if (appState.cycleHistory.length < 2) {
    console.log("Недостаточно данных для расчета средней длины цикла.");
    return appState.cycleLength; // Возвращаем текущую, если данных мало
  }

  // Берем только циклы с известной длиной (исключаем последний незавершенный)
  const completedCycles = appState.cycleHistory.filter(cycle => cycle.length !== null);

  if (completedCycles.length === 0) {
    console.log("Нет завершенных циклов для расчета.");
    return appState.cycleLength;
  }

  const totalLength = completedCycles.reduce((sum, cycle) => sum + cycle.length, 0);
  const averageLength = Math.round(totalLength / completedCycles.length);

  console.log(`Средняя длина цикла рассчитана: ${averageLength} дней (на основе ${completedCycles.length} циклов)`);
  return averageLength;
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
  return phases.menstruation; // Default fallback
}

// 🆕 Исправленная функция: возвращает null для дней до начала цикла
function getDayOfCycle(date) {
  if (!appState.lastPeriodDate) return 1;

  // Если дата раньше даты начала последнего цикла, возвращаем null
  if (date < appState.lastPeriodDate) {
    return null; // Или 0, или специальный маркер
  }

  const diffTime = date - appState.lastPeriodDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return (diffDays % appState.cycleLength) + 1;
}

// Today View Updates
function updateTodayView() {
  const currentDay = getCurrentCycleDay();
  const currentPhase = getPhaseForDay(currentDay);

  // Update greeting based on time
  const hour = new Date().getHours();
  let greeting = "Доброе утро, красавица";
  if (hour >= 12 && hour < 17) greeting = "Добрый день, милая";
  else if (hour >= 17) greeting = "Добрый вечер, дорогая";

  document.getElementById("greeting").textContent = greeting;

  // Update cycle info
  document.getElementById("current-day").textContent = currentDay;
  document.getElementById("phase-name").textContent = currentPhase.name;

  // Update phase indicator
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

  // Load today's mood if exists
  const today = new Date().toDateString();
  const todayMood = appState.moodEntries[today];
  if (todayMood) {
    document.querySelector(`[data-mood="${todayMood.mood}"]`).classList.add("selected");
  } else {
    // Clear previous selections
    document.querySelectorAll(".mood-btn").forEach((btn) => {
      btn.classList.remove("selected");
    });
  }

  const recommendationCard = document.getElementById("recommendation-card");
  recommendationCard.classList.add("phase-transition");
  setTimeout(() => {
    recommendationCard.classList.remove("phase-transition");
  }, 2000);
  
  // Добавляем кнопку отправки рекомендации в чат (если её ещё нет)
  const sendButtonContainer = document.getElementById("send-to-telegram-container");
  if (!sendButtonContainer) {
    // Создаем контейнер для кнопки
    const container = document.createElement("div");
    container.id = "send-to-telegram-container";
    container.style.marginTop = "1rem";
    container.style.textAlign = "center";
    
    // Создаем кнопку
    const sendButton = document.createElement("button");
    sendButton.id = "send-to-telegram-btn";
    sendButton.textContent = "";
    sendButton.style.padding = "25px";
    sendButton.style.backgroundColor = "#e8b4cb00";
    sendButton.style.color = "white";
    sendButton.style.border = "none";
    sendButton.style.borderRadius = "50%";
    sendButton.style.cursor = "pointer";
    sendButton.style.fontSize = "0.9rem";
    sendButton.style.fontWeight = "500";
    sendButton.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
    sendButton.style.transition = "all 0.2s ease";
    sendButton.style.backgroundImage = "url('tg.png')";
    sendButton.style.backgroundSize = "70%"; // Размер иконки
    sendButton.style.backgroundRepeat = "no-repeat";
    sendButton.style.backgroundPosition = "center";
    
    // Добавляем hover эффект
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
    
    // Добавляем обработчик клика
    sendButton.addEventListener("click", function() {
      sendRecommendationToTelegram(
        document.getElementById("recommendation-text").textContent,
        currentPhase.name,
        currentDay
      );
    });
    
    container.appendChild(sendButton);
    
    // Находим карточку рекомендаций и добавляем кнопку после неё
    const recommendationSection = document.querySelector(".recommendation-section");
    if (recommendationSection) {
      recommendationSection.appendChild(container);
    } else {
      // Если нет специальной секции, добавляем после recommendation-card
      const recCard = document.getElementById("recommendation-card");
      if (recCard && recCard.parentNode) {
        recCard.parentNode.appendChild(container);
      }
    }
  }

  // 🆕 Добавляем плавающую кнопку "Новый цикл?" (если её ещё нет)
  const existingFloatBtn = document.getElementById("float-new-cycle-btn");
  if (!existingFloatBtn) {
    const floatBtn = document.createElement("button");
    floatBtn.id = "float-new-cycle-btn";
    floatBtn.title = "Новый цикл?";
    floatBtn.innerHTML = "🩸"; // Можно заменить на SVG-иконку
    floatBtn.style.position = "fixed";
    floatBtn.style.bottom = "100px"; // Выше кнопок навигации
    floatBtn.style.right = "20px";
    floatBtn.style.width = "50px";
    floatBtn.style.height = "50px";
    floatBtn.style.borderRadius = "50%";
    floatBtn.style.backgroundColor = "rgba(212, 165, 194, 0.8)"; // #d4a5c2 с прозрачностью
    floatBtn.style.color = "white";
    floatBtn.style.border = "none";
    floatBtn.style.fontSize = "24px";
    floatBtn.style.cursor = "pointer";
    floatBtn.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
    floatBtn.style.zIndex = "100";
    floatBtn.style.display = "flex";
    floatBtn.style.alignItems = "center";
    floatBtn.style.justifyContent = "center";
    floatBtn.style.transition = "all 0.2s ease";

    floatBtn.addEventListener("click", () => {
      openNewCycleDialog(); // Открываем диалог выбора
    });

    document.body.appendChild(floatBtn);
  }

  // Показываем кнопку только на вкладке "Сегодня"
  const todayTab = document.getElementById("today-tab");
  const floatBtn = document.getElementById("float-new-cycle-btn");
  if (floatBtn) {
    if (todayTab.classList.contains("active")) {
      floatBtn.style.display = "flex";
    } else {
      floatBtn.style.display = "none";
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

  // Add gentle animation feedback
  selectedBtn.style.transform = "scale(1.2)";
  setTimeout(() => {
    selectedBtn.style.transform = "";
  }, 200);
}

function saveDailyMood() {
  const selectedMood = document.querySelector(".mood-btn.selected");
  // ✅ Безопасное получение значения note
  const noteElement = document.getElementById("daily-note");
  const note = noteElement ? noteElement.value : ""; // Если элемента нет — пустая строка

  if (!selectedMood) {
    alert("Пожалуйста, выберите, как вы себя чувствуете сегодня");
    return;
  }

  const today = new Date().toDateString();
  appState.moodEntries[today] = {
    mood: selectedMood.dataset.mood,
    note: note,
    date: today,
    cycleDay: getCurrentCycleDay(),
  };

  saveAppState();

  // 🔥 Сразу сохраняем в облако
  saveUserDataToServer();

  // Show success feedback
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

  // Get first day of month and number of days
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  // Add day headers
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

  // Add empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    const emptyDay = document.createElement("div");
    emptyDay.className = "calendar-day empty";
    calendarGrid.appendChild(emptyDay);
  }

  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dayElement = document.createElement("div");
    dayElement.className = "calendar-day";
    dayElement.textContent = day;

    const dayDate = new Date(currentYear, currentMonth, day);
    const cycleDay = getDayOfCycle(dayDate); // Всегда считаем день цикла
    const phase = getPhaseForDay(cycleDay);

    // Apply phase color
    dayElement.style.backgroundColor = phase.color;
    dayElement.style.color = "white";

    // Mark current day
    if (day === today.getDate()) {
      dayElement.classList.add("current");
    }

    // 🆕 Добавляем click handler ТОЛЬКО для дней >= lastPeriodDate
    // Это предотвращает открытие модального окна для "прошлых" дней
    if (appState.lastPeriodDate && dayDate >= appState.lastPeriodDate) {
      dayElement.addEventListener("click", () => openDayModal(dayDate, cycleDay, phase));
    } else {
      // Опционально: визуальный признак, что день "недоступен для редактирования"
      dayElement.style.cursor = "default"; // Не "pointer"
      dayElement.style.opacity = "0.8";
      // Цвет фазы и номер дня остаются, как и были рассчитаны
    }

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

  // Load existing note
  const dateKey = date.toDateString();
  const existingNote = appState.dayNotes[dateKey] || "";
  document.getElementById("modal-note-input").value = existingNote;

  appState.selectedDay = date;
  modal.classList.remove("hidden");
  
  // Добавляем кнопку отправки в модальное окно (если её ещё нет)
  const sendButtonInModal = document.getElementById("send-to-telegram-btn-modal");
  if (!sendButtonInModal) {
    // Создаем кнопку отправки
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
    sendButton.style.fontSize = "0.9rem";
    sendButton.style.fontWeight = "500";
    sendButton.style.backgroundImage = "url('tg.png')";
    sendButton.style.backgroundSize = "60%"; // Размер иконки
    sendButton.style.backgroundRepeat = "no-repeat";
    sendButton.style.backgroundPosition = "center";
    
    // Добавляем обработчик клика
    sendButton.addEventListener("click", function() {
      sendRecommendationToTelegram(
        document.getElementById("modal-recommendation").textContent,
        phase.name,
        cycleDay
      );
    });
    
    // Находим контейнер модального окна и добавляем кнопку перед закрывающим элементом
    const modalContent = document.querySelector(".modal-content");
    if (modalContent) {
      // Проверяем, есть ли уже кнопка
      if (!modalContent.querySelector("#send-to-telegram-btn-modal")) {
        // Ищем последний элемент перед закрывающим крестиком
        const closeButton = document.getElementById("close-modal");
        if (closeButton && closeButton.parentNode) {
          closeButton.parentNode.insertBefore(sendButton, closeButton);
        } else {
          modalContent.appendChild(sendButton);
        }
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

  // Refresh diary if it's the current tab
  if (appState.currentTab === "diary") {
    updateDiaryView();
  }
}

// Diary View
function updateDiaryView() {
  const diaryEntries = document.getElementById("diary-entries");
  diaryEntries.innerHTML = "";

  // Combine mood entries and day notes
  const allEntries = [];

  // Add mood entries
  Object.values(appState.moodEntries).forEach((entry) => {
    allEntries.push({
      date: new Date(entry.date),
      type: "mood",
      data: entry,
    });
  });

  // Add day notes
  Object.entries(appState.dayNotes).forEach(([dateStr, note]) => {
    allEntries.push({
      date: new Date(dateStr),
      type: "note",
      data: { note, date: dateStr },
    });
  });

  // Sort by date (newest first)
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
                <div class="diary-entry-date">${dateStr} - Day ${entry.data.cycleDay}</div>
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

  // Show phase-specific gentle reminders
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
      previousLastPeriodDate: appState.previousLastPeriodDate ? appState.previousLastPeriodDate.toISOString() : null,
      // cycleHistory сохранится автоматически как массив объектов
    }),
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
      previousLastPeriodDate: parsed.previousLastPeriodDate ? new Date(parsed.previousLastPeriodDate) : null,
      // cycleHistory: parsed.cycleHistory || [] // Восстановится как массив
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
      cycleHistory: appState.cycleHistory, // 🆕 Экспортируем историю
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

// 🆕 Функции для работы с кастомным модальным окном "Новый цикл"

// 🆕 Открытие кастомного модального окна "Новый цикл"
function openNewCycleDialog() {
  const modal = document.getElementById("new-cycle-modal");
  const dateInput = document.getElementById("new-cycle-date-input");

  // Устанавливаем текущую дату по умолчанию
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;

  modal.classList.remove("hidden");

  // Фокус на поле даты для удобства
  setTimeout(() => dateInput.focus(), 100);
}

// 🆕 Закрытие модального окна "Новый цикл"
function closeNewCycleModal() {
  document.getElementById("new-cycle-modal").classList.add("hidden");
}

// 🆕 Обработчик события: "Начался сегодня"
function handleNewCycleToday() {
  const today = new Date();
  
  // 1. Сохраняем текущую дату как предыдущую
  appState.previousLastPeriodDate = appState.lastPeriodDate;
  
  // 2. Добавляем текущий цикл в историю
  addCycleToHistory(today);
  
  // 3. Устанавливаем сегодня как начало нового цикла
  appState.lastPeriodDate = today;
  
  // 4. Рассчитываем новую среднюю длину
  const newAverageLength = calculateAverageCycleLength();
  if (newAverageLength !== appState.cycleLength) {
    appState.cycleLength = newAverageLength;
    showNotification(`Средняя длина цикла обновлена: ${newAverageLength} дней`);
  }
  
  finalizeNewCycle();
}

// 🆕 Обработчик события: Подтверждение выбранной даты
function handleConfirmNewCycleDate() {
  const dateInput = document.getElementById("new-cycle-date-input");
  const newDateStr = dateInput.value;

  if (!newDateStr) {
    alert("Пожалуйста, выберите дату начала цикла.");
    return;
  }

  const newDate = new Date(newDateStr);
  if (isNaN(newDate.getTime())) {
    alert("Неверный формат даты.");
    return;
  }
  
  // 1. Сохраняем текущую дату как предыдущую
  appState.previousLastPeriodDate = appState.lastPeriodDate;
  
  // 2. Добавляем новый цикл в историю
  addCycleToHistory(newDate);
  
  // 3. Обновляем lastPeriodDate
  appState.lastPeriodDate = newDate;
  
  // 4. Рассчитываем новую среднюю длину
  const newAverageLength = calculateAverageCycleLength();
  if (newAverageLength !== appState.cycleLength) {
    appState.cycleLength = newAverageLength;
    showNotification(`Средняя длина цикла обновлена: ${newAverageLength} дней`);
  }
  
  finalizeNewCycle();
}

// 🆕 Финализация установки новой даты
function finalizeNewCycle() {
  saveAppState();
  saveUserDataToServer();
  updateTodayView();
  generateCalendar();
  updateDiaryView();
  closeNewCycleModal();
  showNotification("Дата начала цикла обновлена!");
}
