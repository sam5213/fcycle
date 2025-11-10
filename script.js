// App State
let appState = {
  isSetup: false,
  lastPeriodDate: null,
  previousLastPeriodDate: null, // Для хранения предыдущей даты
  viewedMonthOffset: 0, // 🆕 Смещение месяца для отображения в календаре (0 — текущий)
  firstTrackingDate: null, // 🆕 Дата, когда пользователь впервые начал отслеживание
  // --- История и прогноз циклов ---
  completedCycles: [],       // 🆕 Массив завершенных циклов [{ startDate: ISOString, endDate: ISOString, length: Number }, ...]
  currentCycle: null,        // 🆕 Объект текущего цикла { startDate: ISOString, predictedEndDate: ISOString, predictedLength: Number }
  nextPredictedCycle: null,  // 🆕 Прогноз следующего цикла { predictedStartDate: ISOString, confidence: "низкая"|"средняя"|"высокая" }
  defaultCycleLength: 28,    // Дефолтная длина цикла
  cycleLength: 28,           // Текущая (или средняя) длина цикла
  // --- Остальные данные ---
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

// 🆕 Функция для отправки данных пользователя на сервер (анонимизированных)
async function saveUserDataToGist(data) {
  try {
    const response = await fetch('https://fcycle-85.deno.dev/api/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      console.warn("Не удалось сохранить данные на сервере");
    }
  } catch (error) {
    console.error("Ошибка при отправке данных пользователя на сервер:", error);
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
  // Открытие модального окна (если плавающая кнопка осталась от предыдущего решения)
  // или вызывайте openNewCycleDialog() напрямую из нужного места
  // Например, из кнопки в интерфейсе.

  // Обработчики кнопок внутри модального окна
  document.getElementById("close-new-cycle-modal")?.addEventListener("click", closeNewCycleModal);
  document.getElementById("cancel-new-cycle-btn")?.addEventListener("click", closeNewCycleModal);
  document.getElementById("new-cycle-today-btn")?.addEventListener("click", handleNewCycleToday);
  document.getElementById("confirm-new-cycle-btn")?.addEventListener("click", handleConfirmNewCycleDate);

  // Закрытие модального окна по клику вне его области
  document.getElementById("new-cycle-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "new-cycle-modal") closeNewCycleModal();
  });

  // Закрытие модального окна по клавише Escape
  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("new-cycle-modal");
    if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
      closeNewCycleModal();
    }
  });

  // 🆕 Добавляем обработчики событий для навигации по месяцам
  document.getElementById("prev-month")?.addEventListener("click", () => {
    generateCalendar(appState.viewedMonthOffset - 1);
  });
  
  document.getElementById("next-month")?.addEventListener("click", () => {
    generateCalendar(appState.viewedMonthOffset + 1);
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
  const lastPeriodInput = document.getElementById("last-period")
  const cycleLengthSelect = document.getElementById("cycle-length")

  if (!lastPeriodInput.value) {
    alert("Пожалуйста, выберите дату начала вашей последней менструации")
    return
  }

  const initialDate = new Date(lastPeriodInput.value + 'T00:00:00');
  appState.lastPeriodDate = initialDate;
  appState.cycleLength = Number.parseInt(cycleLengthSelect.value);
  appState.isSetup = true;

  console.log("Установка даты начала цикла:", initialDate.toISOString());
  console.log("💾 Установленная дата начала цикла:", appState.lastPeriodDate.toISOString());
  console.log("📏 Установленная длина цикла:", appState.cycleLength);

  // Устанавливаем дату начала отслеживания
  if (!appState.firstTrackingDate) {
    appState.firstTrackingDate = initialDate;
  }

  // 🆕 Инициализируем первый цикл
  appState.currentCycle = {
    startDate: initialDate.toISOString(),
    predictedEndDate: null,
    predictedLength: appState.cycleLength
  };
  appState.defaultCycleLength = appState.cycleLength;

  // 🆕 Прогнозируем следующий цикл
  predictNextCycle();

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
    generateCalendar(appState.viewedMonthOffset);
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

// 🆕 Рассчитать предсказанную длину цикла на основе завершенных
function calculatePredictedLength() {
  if (appState.completedCycles.length === 0) {
    console.log("Недостаточно данных для расчета средней длины цикла.");
    return appState.defaultCycleLength; // Возвращаем дефолтную, если данных мало
  }

  // Берем только циклы с известной длиной (исключаем последний незавершенный)
  const completedCycles = appState.completedCycles.filter(cycle => cycle.length !== null);

  if (completedCycles.length === 0) {
    console.log("Нет завершенных циклов для расчета.");
    return appState.defaultCycleLength;
  }

  const totalLength = completedCycles.reduce((sum, cycle) => sum + cycle.length, 0);
  const averageLength = Math.round(totalLength / completedCycles.length);

  console.log(`Средняя длина цикла рассчитана: ${averageLength} дней (на основе ${completedCycles.length} циклов)`);
  return averageLength;
}

// 🆕 Прогнозировать следующий цикл
function predictNextCycle() {
  if (!appState.currentCycle || !appState.currentCycle.startDate) {
    console.log("Нет текущего цикла для прогноза.");
    appState.nextPredictedCycle = null;
    return;
  }

  const predictedLength = appState.currentCycle.predictedLength || appState.defaultCycleLength;
  const currentStartDate = new Date(appState.currentCycle.startDate);
  
  const predictedNextStartDate = new Date(currentStartDate);
  predictedNextStartDate.setDate(currentStartDate.getDate() + predictedLength);

  // Простая оценка уверенности
  let confidence = "низкая";
  if (appState.completedCycles.length >= 3) {
    confidence = "высокая";
  } else if (appState.completedCycles.length >= 1) {
    confidence = "средняя";
  }

  appState.nextPredictedCycle = {
    predictedStartDate: predictedNextStartDate.toISOString(),
    confidence: confidence
  };
  
  console.log("Прогноз следующего цикла обновлен:", appState.nextPredictedCycle);
}

// 🆕 Завершить текущий цикл и начать новый
function completeAndStartNewCycle(newStartDate) {
  const newDateObj = new Date(newStartDate);
  
  // 1. Если есть текущий цикл, завершаем его
  if (appState.currentCycle) {
    const previousCycle = {
      startDate: appState.currentCycle.startDate,
      endDate: newDateObj.toISOString(),
      length: Math.floor((newDateObj - new Date(appState.currentCycle.startDate)) / (1000 * 60 * 60 * 24)),
    };
    
    // Проверка на "ошибочную" дату (< 7 дней)
    if (previousCycle.length > 0 && previousCycle.length < 7) {
        console.warn(`Цикл длиной ${previousCycle.length} дней считается ошибочным и не добавляется в историю.`);
        // Удаляем последний цикл из истории, если он был добавлен
        if (appState.completedCycles.length > 0) {
            const lastInHistory = appState.completedCycles[appState.completedCycles.length - 1];
            if (new Date(lastInHistory.startDate).getTime() === new Date(appState.currentCycle.startDate).getTime()) {
                 console.log("Удаление ошибочного цикла из истории.");
                 appState.completedCycles.pop();
            }
        }
        // Не продолжаем, так как это ошибка
        return false;
    } else if (previousCycle.length >= 7) {
        appState.completedCycles.push(previousCycle);
        console.log("Завершенный цикл добавлен в историю:", previousCycle);
        
        // Ограничиваем историю
        if (appState.completedCycles.length > 6) {
            appState.completedCycles.shift();
        }
    } else {
        console.warn("Новая дата должна быть позже предыдущей.");
        return false; // Не продолжаем
    }
  }

  // 2. Создаем новый текущий цикл
  const newPredictedLength = calculatePredictedLength();
  appState.currentCycle = {
    startDate: newDateObj.toISOString(),
    predictedEndDate: null, // Можно рассчитать, если нужно
    predictedLength: newPredictedLength
  };
  
  console.log("Новый текущий цикл установлен:", appState.currentCycle);

  // 3. Прогнозируем следующий
  predictNextCycle();

  // 4. Обновляем дублирующие поля для совместимости с UI
  appState.lastPeriodDate = newDateObj;
  appState.cycleLength = newPredictedLength;
  
  return true;
}

// Cycle Calculations
function getCurrentCycleDay() {
  if (!appState.lastPeriodDate) return 1

  const today = new Date()
  const diffTime = today - appState.lastPeriodDate
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  return (diffDays % appState.cycleLength) + 1
}

function getPhaseForDay(day) {
  for (const [phaseName, phase] of Object.entries(phases)) {
    if (phase.days.includes(day)) {
      return { name: phaseName, ...phase }
    }
  }
  return phases.menstruation // Default fallback
}

// 🆕 Исправленная функция: возвращает null для дней до начала цикла
function getDayOfCycle(date) {
  if (!appState.lastPeriodDate) return 1

  // Проверяем, до начала отслеживания ли день
  if (appState.firstTrackingDate && date < appState.firstTrackingDate) {
    return null; 
  }

  // Если дата раньше даты начала последнего цикла
  if (date < appState.lastPeriodDate) {
    // Пытаемся найти предыдущий цикл
    if (appState.completedCycles && appState.completedCycles.length > 0) {
      // Ищем последний завершённый цикл, который был до этой даты
      const relevantCycle = [...appState.completedCycles]
        .reverse()
        .find(cycle => new Date(cycle.startDate) <= date);

      if (relevantCycle) {
        const startDate = new Date(relevantCycle.startDate);
        const diffTime = date - startDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        // Используем длину этого цикла для расчета
        const cycleLength = relevantCycle.length || appState.defaultCycleLength;
        return (diffDays % cycleLength) + 1;
      }
    }
    
    // Если предыдущего цикла нет, возвращаем "старый" расчет
    const diffTime = date - new Date("1970-01-01T00:00:00Z"); // или любая другая "нулевая" дата
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return (diffDays % appState.defaultCycleLength) + 1;
    }

  // Если дата позже или равна lastPeriodDate, считаем как обычно
  const diffTime = date - appState.lastPeriodDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return (diffDays % appState.cycleLength) + 1;
}

// Today View Updates
function updateTodayView() {
  const currentDay = getCurrentCycleDay()
  const currentPhase = getPhaseForDay(currentDay)
  console.log('currentDay в updateTodayView:', currentDay);
  console.log('currentPhase в updateTodayView:', currentPhase);

  // Update greeting based on time
  const hour = new Date().getHours()
  let greeting = "Доброе утро, красавица"
  if (hour >= 12 && hour < 17) greeting = "Добрый день, милая"
  else if (hour >= 17) greeting = "Добрый вечер, дорогая"

  document.getElementById("greeting").textContent = greeting

  // Update cycle info
  document.getElementById("current-day").textContent = currentDay
  document.getElementById("phase-name").textContent = currentPhase.name

  // Update phase indicator
  const phaseIndicator = document.getElementById("phase-indicator")
  phaseIndicator.className = `phase-indicator ${currentPhase.name.toLowerCase()}`

  const randomRecommendation =
    currentPhase.recommendations[Math.floor(Math.random() * currentPhase.recommendations.length)]
  document.getElementById("recommendation-text").textContent = randomRecommendation
  document.getElementById("recommendation-icon").innerHTML = currentPhase.icon

  const activitiesList = document.getElementById("activities-list")
  if (activitiesList && currentPhase.activities) {
    activitiesList.innerHTML = currentPhase.activities
      .map((activity) => `<span class="activity-tag">${activity}</span>`)
      .join("")
  }

  // Load today's mood if exists
  const today = new Date().toDateString()
  const todayMood = appState.moodEntries[today]
  if (todayMood) {
    document.querySelector(`[data-mood="${todayMood.mood}"]`).classList.add("selected")
  } else {
    // Clear previous selections
    document.querySelectorAll(".mood-btn").forEach((btn) => {
      btn.classList.remove("selected")
    })
  }

  const recommendationCard = document.getElementById("recommendation-card")
  recommendationCard.classList.add("phase-transition")
  setTimeout(() => {
    recommendationCard.classList.remove("phase-transition")
  }, 2000)
  
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
    sendButton.style.color = "#ffffffdb";
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
  
  // 🆕 Добавляем прогноз следующего цикла (если он есть)
  /*const existingPrediction = document.querySelector('.prediction-section');
  if (!existingPrediction && appState.nextPredictedCycle) {
    const predictedDate = new Date(appState.nextPredictedCycle.predictedStartDate);
    const formattedDate = predictedDate.toLocaleDateString("ru-RU", {
        year: 'numeric', month: 'long', day: 'numeric'
    });
    const predictionHTML = `
        <div class="prediction-section" style="margin-top: 1rem; padding: 1rem; background-color: #f0f8ff; border-radius: 12px; border-left: 4px solid #87cefa;">
            <h4 style="margin: 0 0 0.5rem 0; color: #6b5b73;">🔮 Прогноз</h4>
            <p style="margin: 0.25rem 0; font-size: 0.95rem;"><strong>Следующий цикл:</strong> ${formattedDate}</p>
            <p style="margin: 0.25rem 0; font-size: 0.95rem;"><strong>Уверенность:</strong> ${appState.nextPredictedCycle.confidence}</p>
        </div>
    `;
    // Находим карточку рекомендаций и добавляем прогноз после неё
    const recCard = document.getElementById("recommendation-card");
    if (recCard && recCard.parentNode) {
      recCard.insertAdjacentHTML('afterend', predictionHTML);
    }
  }*/

  // 🆕 Вызываем отрисовку графика
  console.log("🔍 Вызов drawActivityChart из updateTodayView..."); // 🔥 ДОБАВЬТЕ ЭТУ СТРОКУ
  if (typeof drawActivityChart === 'function') {
    drawActivityChart();
  } else {
    console.error("❌ drawActivityChart не является функцией!");
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
  const entry = {
    mood: selectedMood.dataset.mood,
    note: note,
    date: today,
    cycleDay: getCurrentCycleDay(),
  };
  appState.moodEntries[today] = entry;

  saveAppState();

  // 🆕 Сохраняем данные на сервер
  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() || "anonymous";
  saveUserDataToGist({
    type: "mood",
    payload: entry,
    userId: userId,
    timestamp: new Date().toISOString(),
  });

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
// 🆕 Обновлённая функция: генерирует календарь с учётом смещения месяца
function generateCalendar(monthOffset = 0) {
  const calendarGrid = document.getElementById("calendar-grid");
  calendarGrid.innerHTML = "";

  const today = new Date();
  // Вычисляем целевой месяц и год
  const targetDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const currentMonth = targetDate.getMonth();
  const currentYear = targetDate.getFullYear();

  // Обновляем заголовок календаря
  const monthNames = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
  ];
  document.getElementById("calendar-month-year").textContent = `${monthNames[currentMonth]} ${currentYear}`;

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
    const cycleDay = getDayOfCycle(dayDate); // Может быть null
    let phase;

    // 🆕 Обрабатываем дни до начала цикла
    if (cycleDay === null) {
      // День до начала цикла
      phase = {
        name: "pre-tracking",
        color: "#cccccc", // Серый цвет
        recommendations: ["День до начала отсчета отслеживания."],
        activities: [],
        icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" fill="#cccccc"/></svg>`
      };
      // Устанавливаем серый цвет и не добавляем клик
      dayElement.style.backgroundColor = phase.color;
      dayElement.style.color = "white";
      dayElement.style.cursor = "default";
      dayElement.style.opacity = "0.8";
    } else {
      // День после начала отслеживания
      phase = getPhaseForDay(cycleDay);

      // Apply phase color
      dayElement.style.backgroundColor = phase.color;
      dayElement.style.color = "white";
  
      // 🆕 Проверяем, является ли день прогнозируемым (после окончания текущего цикла)
      const isPredictedDay = appState.nextPredictedCycle &&
                               dayDate >= new Date(appState.nextPredictedCycle.predictedStartDate);
  
      // 🆕 Проверяем, является ли день "прошлым" (до lastPeriodDate)
      const isPastTrackedDay = dayDate < appState.lastPeriodDate;

      if (isPredictedDay) {
        // Прогнозируемые дни — тусклые и некликабельные
        dayElement.style.opacity = "0.4";
        dayElement.style.cursor = "default";
      } else if (isPastTrackedDay) {
        // Прошедшие дни (до lastPeriodDate) — тусклые и некликабельные
        dayElement.style.opacity = "0.6";
        dayElement.style.cursor = "default";
      } else {
        // Дни текущего цикла — яркие и кликабельные
        dayElement.style.opacity = "1";
        dayElement.addEventListener("click", () => openDayModal(dayDate, cycleDay, phase));
      }
    }
    // Mark current day
    if (day === today.getDate() && monthOffset === 0) {
      dayElement.classList.add("current");
    }

    calendarGrid.appendChild(dayElement);
  }

  // 🆕 Обновляем состояние смещения месяца
  appState.viewedMonthOffset = monthOffset;
  saveAppState();
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

  console.log('dateStr в openDayModal', dateStr);
  console.log('cycleDay в openDayModal', cycleDay);
  console.log('date в openDayModal', date);
  console.log('phase в openDayModal', phase);

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

  // 🆕 Сохраняем данные на сервер
  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() || "anonymous";
  saveUserDataToGist({
    type: "note",
    payload: { note: note, date: dateKey },
    userId: userId,
    timestamp: new Date().toISOString(),
  });

  // 🔥 Сразу сохраняем в облако
  saveUserDataToServer();

  closeModal();

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
      payload: entry,
    });
  });

  // Add day notes
  Object.entries(appState.dayNotes).forEach(([dateStr, note]) => {
    allEntries.push({
      date: new Date(dateStr),
      type: "note",
      payload: { note, date: dateStr },
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
                <div class="diary-entry-date">${dateStr} - Day ${entry.payload.cycleDay}</div>
                <div class="diary-entry-mood">${moodEmojis[entry.payload.mood]}</div>
                ${entry.payload.note ? `<div class="diary-entry-note">${entry.payload.note}</div>` : ""}
            `;
    } else {
      entryElement.innerHTML = `
                <div class="diary-entry-date">${dateStr}</div>
                <div class="diary-entry-note">${entry.payload.note}</div>
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
      firstTrackingDate: appState.firstTrackingDate ? appState.firstTrackingDate.toISOString() : null,
      // completedCycles, currentCycle, nextPredictedCycle сохранятся автоматически
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
      firstTrackingDate: parsed.firstTrackingDate ? new Date(parsed.firstTrackingDate) : null,
      // completedCycles, currentCycle, nextPredictedCycle: parsed.XXX || []
      // Сбрасываем смещение при загрузке
      viewedMonthOffset: 0,
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
      completedCycles: appState.completedCycles,
      currentCycle: appState.currentCycle,
      nextPredictedCycle: appState.nextPredictedCycle,
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

// 🆕 Функция для отправки данных пользователя на сервер (анонимизированных)
async function saveUserDataToGist(data) {
  try {
    const response = await fetch('https://fcycle-85.deno.dev/api/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      console.warn("Не удалось сохранить данные на сервере");
    }
  } catch (error) {
    console.error("Ошибка при отправке данных пользователя на сервер:", error);
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
      appState = { ...data.appState, ...appState };
      saveAppState();
      console.log("✅ Данные пользователя загружены из облака");
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

// 🆕 Функция открытия модального окна "Новый цикл?"
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

// 🆕 Функция закрытия модального окна "Новый цикл?"
function closeNewCycleModal() {
  document.getElementById("new-cycle-modal").classList.add("hidden");
}

// 🆕 Обработчик события: "Начался сегодня"
function handleNewCycleToday() {
  const today = new Date();
  
  const success = completeAndStartNewCycle(today);
  if (!success) {
      alert("Ошибка при установке новой даты начала цикла.");
      return;
  }
  
  finalizeNewCycle(); // Сохраняет, обновляет UI
}

// 🆕 Обработчик события: Подтверждение выбранной даты
function handleConfirmNewCycleDate() {
  const dateInput = document.getElementById("new-cycle-date-input");
  const newDateStr = dateInput.value;

  if (!newDateStr) {
    alert("Пожалуйста, выберите дату начала цикла.");
    return;
  }

  const newDate = new Date(newDateStr + 'T00:00:00');
  if (isNaN(newDate.getTime())) {
    alert("Неверный формат даты.");
    return;
  }
  
  const success = completeAndStartNewCycle(newDate);
  if (!success) {
      // Сообщение об ошибке уже показано в completeAndStartNewCycle
      return; 
  }
  
  finalizeNewCycle(); // Сохраняет, обновляет UI
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

// 🆕 Функция завершения текущего цикла и начала нового
function completeAndStartNewCycle(newStartDate) {
  const newDateObj = new Date(newStartDate);
  
  // 1. Если есть текущий цикл, завершаем его
  if (appState.currentCycle) {
    const previousCycle = {
      startDate: appState.currentCycle.startDate,
      endDate: newDateObj.toISOString(),
      length: Math.floor((newDateObj - new Date(appState.currentCycle.startDate)) / (1000 * 60 * 60 * 24)),
    };
    
    // Проверка на "ошибочную" дату (< 7 дней)
    if (previousCycle.length > 0 && previousCycle.length < 7) {
        console.warn(`Цикл длиной ${previousCycle.length} дней считается ошибочным и не добавляется в историю.`);
        // Удаляем последний цикл из истории, если он был добавлен
        if (appState.completedCycles.length > 0) {
            const lastInHistory = appState.completedCycles[appState.completedCycles.length - 1];
            if (new Date(lastInHistory.startDate).getTime() === new Date(appState.currentCycle.startDate).getTime()) {
                 console.log("Удаление ошибочного цикла из истории.");
                 appState.completedCycles.pop();
            }
        }
        // Не продолжаем, так как это ошибка
        return false;
    } else if (previousCycle.length >= 7) {
        appState.completedCycles.push(previousCycle);
        console.log("Завершенный цикл добавлен в историю:", previousCycle);
        
        // Ограничиваем историю
        if (appState.completedCycles.length > 6) {
            appState.completedCycles.shift();
        }
    } else {
        console.warn("Новая дата должна быть позже предыдущей.");
        return false; // Не продолжаем
    }
  }

  // 2. Создаем новый текущий цикл
  const newPredictedLength = calculatePredictedLength();
  appState.currentCycle = {
    startDate: newDateObj.toISOString(),
    predictedEndDate: null, // Можно рассчитать, если нужно
    predictedLength: newPredictedLength
  };
  
  console.log("Новый текущий цикл установлен:", appState.currentCycle);

  // 3. Прогнозируем следующий
  predictNextCycle();

  // 4. Обновляем дублирующие поля для совместимости с UI
  appState.lastPeriodDate = newDateObj;
  appState.cycleLength = newPredictedLength;
  
  return true;
}

// 🆕 Функция расчета предсказанной длины цикла
function calculatePredictedLength() {
  if (appState.completedCycles.length === 0) {
    console.log("Недостаточно данных для расчета средней длины цикла.");
    return appState.defaultCycleLength; // Возвращаем дефолтную, если данных мало
  }

  // Берем только циклы с известной длиной (исключаем последний незавершенный)
  const completedCycles = appState.completedCycles.filter(cycle => cycle.length !== null);

  if (completedCycles.length === 0) {
    console.log("Нет завершенных циклов для расчета.");
    return appState.defaultCycleLength;
  }

  const totalLength = completedCycles.reduce((sum, cycle) => sum + cycle.length, 0);
  const averageLength = Math.round(totalLength / completedCycles.length);

  console.log(`Средняя длина цикла рассчитана: ${averageLength} дней (на основе ${completedCycles.length} циклов)`);
  return averageLength;
}

// 🆕 Функция прогнозирования следующего цикла
function predictNextCycle() {
  if (!appState.currentCycle || !appState.currentCycle.startDate) {
    console.log("Нет текущего цикла для прогноза.");
    appState.nextPredictedCycle = null;
    return;
  }

  const predictedLength = appState.currentCycle.predictedLength || appState.defaultCycleLength;
  const currentStartDate = new Date(appState.currentCycle.startDate);
  
  const predictedNextStartDate = new Date(currentStartDate);
  predictedNextStartDate.setDate(currentStartDate.getDate() + predictedLength);

  // Простая оценка уверенности
  let confidence = "низкая";
  if (appState.completedCycles.length >= 3) {
    confidence = "высокая";
  } else if (appState.completedCycles.length >= 1) {
    confidence = "средняя";
  }

  appState.nextPredictedCycle = {
    predictedStartDate: predictedNextStartDate.toISOString(),
    confidence: confidence
  };
  
  console.log("Прогноз следующего цикла обновлен:", appState.nextPredictedCycle);
}
