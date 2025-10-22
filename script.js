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
    // Можно добавить fallback-данные здесь, если нужно
  }
}

// Initialize app
document.addEventListener("DOMContentLoaded", async () => {
  // 🆕 Сначала загружаем рекомендации
  await loadRecommendationsFromGist();

  // Инициализация Telegram WebApp
  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
    console.log("Telegram WebApp initialized");
  } else {
    console.warn("Telegram WebApp not detected. Running in standalone mode?");
  }

  // Add loading state
  document.body.style.opacity = "0"
  document.body.style.transition = "opacity 0.5s ease"

  loadAppState()
  initializeEventListeners()

  if (appState.isSetup) {
    showMainApp()
  } else {
    showWelcomeScreen()
  }

  // Gentle fade in
  setTimeout(() => {
    document.body.style.opacity = "1"
  }, 100)
})

// Event Listeners
function initializeEventListeners() {
  // Welcome screen
  document.getElementById("start-journey").addEventListener("click", setupApp)

  // Navigation
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => switchTab(e.target.closest(".nav-item").dataset.tab))
  })

  // Mood selection
  document.querySelectorAll(".mood-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => selectMood(e.target.dataset.mood))
  })

  // Save mood and note
  document.getElementById("save-mood").addEventListener("click", saveDailyMood)

  // Modal
  document.getElementById("close-modal").addEventListener("click", closeModal)
  document.getElementById("save-note").addEventListener("click", saveDayNote)

  // Click outside modal to close
  document.getElementById("day-modal").addEventListener("click", (e) => {
    if (e.target.id === "day-modal") closeModal()
  })

  // Keyboard navigation support
  document.addEventListener("keydown", (e) => {
    // Close modal with Escape key
    if (e.key === "Escape") {
      const modal = document.getElementById("day-modal")
      if (!modal.classList.contains("hidden")) {
        closeModal()
      }
    }

    // Tab navigation for mood buttons
    if (e.key === "Tab" && document.activeElement.classList.contains("mood-btn")) {
      e.preventDefault()
      const moodBtns = Array.from(document.querySelectorAll(".mood-btn"))
      const currentIndex = moodBtns.indexOf(document.activeElement)
      const nextIndex = e.shiftKey
        ? (currentIndex - 1 + moodBtns.length) % moodBtns.length
        : (currentIndex + 1) % moodBtns.length
      moodBtns[nextIndex].focus()
    }
  })

  // Touch gesture support for mobile
  let touchStartX = 0
  let touchStartY = 0

  document.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX
    touchStartY = e.touches[0].clientY
  })

  document.addEventListener("touchend", (e) => {
    if (!touchStartX || !touchStartY) return

    const touchEndX = e.changedTouches[0].clientX
    const touchEndY = e.changedTouches[0].clientY

    const diffX = touchStartX - touchEndX
    const diffY = touchStartY - touchEndY

    // Only handle horizontal swipes that are significant
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      const tabs = ["today", "calendar", "diary"]
      const currentTabIndex = tabs.indexOf(appState.currentTab)

      if (diffX > 0 && currentTabIndex < tabs.length - 1) {
        // Swipe left - next tab
        switchTab(tabs[currentTabIndex + 1])
      } else if (diffX < 0 && currentTabIndex > 0) {
        // Swipe right - previous tab
        switchTab(tabs[currentTabIndex - 1])
      }
    }

    touchStartX = 0
    touchStartY = 0
  })

  // Settings menu (hidden feature - long press on Luna title)
  let longPressTimer = null

  const title = document.querySelector(".welcome-content h1")
  if (title) {
    title.addEventListener("mousedown", startLongPress)
    title.addEventListener("mouseup", cancelLongPress)
    title.addEventListener("mouseleave", cancelLongPress)
    title.addEventListener("touchstart", startLongPress)
    title.addEventListener("touchend", cancelLongPress)
  }

  function startLongPress() {
    longPressTimer = setTimeout(() => {
      if (confirm("Would you like to export your cycle data for backup?")) {
        exportUserData()
      }
    }, 2000)
  }

  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
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

// App Setup
function setupApp() {
  const lastPeriodInput = document.getElementById("last-period")
  const cycleLengthSelect = document.getElementById("cycle-length")

  if (!lastPeriodInput.value) {
    alert("Пожалуйста, выберите дату начала вашей последней менструации")
    return
  }

  appState.lastPeriodDate = new Date(lastPeriodInput.value)
  appState.cycleLength = Number.parseInt(cycleLengthSelect.value)
  appState.isSetup = true

  saveAppState()
  showMainApp()
  updateTodayView()
  checkForNotifications()
}

function showWelcomeScreen() {
  document.getElementById("welcome-screen").classList.remove("hidden")
  document.getElementById("main-app").classList.add("hidden")
}

function showMainApp() {
  document.getElementById("welcome-screen").classList.add("hidden")
  document.getElementById("main-app").classList.remove("hidden")
  updateTodayView()
  generateCalendar()
  updateDiaryView()
}

// Tab Management
function switchTab(tabName) {
  // Update navigation
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active")
  })
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active")

  // Update content
  document.querySelectorAll(".tab-pane").forEach((pane) => {
    pane.classList.remove("active")
  })
  document.getElementById(`${tabName}-tab`).classList.add("active")

  appState.currentTab = tabName

  // Refresh content based on tab
  if (tabName === "calendar") {
    generateCalendar()
  } else if (tabName === "diary") {
    updateDiaryView()
  } else if (tabName === "today") {
    updateTodayView()
  }
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

function getDayOfCycle(date) {
  if (!appState.lastPeriodDate) return 1

  const diffTime = date - appState.lastPeriodDate
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  return (diffDays % appState.cycleLength) + 1
}

// Today View Updates
function updateTodayView() {
  const currentDay = getCurrentCycleDay()
  const currentPhase = getPhaseForDay(currentDay)

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
    //document.getElementById("daily-note").value = todayMood.note || ""
  } else {
    // Clear previous selections
    document.querySelectorAll(".mood-btn").forEach((btn) => {
      btn.classList.remove("selected")
    })
    //document.getElementById("daily-note").value = ""
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
    sendButton.textContent = "Send to Chat 💬";
    sendButton.style.padding = "0.5rem 1rem";
    sendButton.style.backgroundColor = "#0088cc";
    sendButton.style.color = "white";
    sendButton.style.border = "none";
    sendButton.style.borderRadius = "20px";
    sendButton.style.cursor = "pointer";
    sendButton.style.fontSize = "0.9rem";
    sendButton.style.fontWeight = "500";
    sendButton.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
    sendButton.style.transition = "all 0.2s ease";
    
    // Добавляем hover эффект
    sendButton.onmouseover = function() {
      this.style.backgroundColor = "#0077b3";
      this.style.transform = "translateY(-1px)";
      this.style.boxShadow = "0 3px 6px rgba(0,0,0,0.15)";
    };
    
    sendButton.onmouseout = function() {
      this.style.backgroundColor = "#0088cc";
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
}

// Mood Management
function selectMood(mood) {
  document.querySelectorAll(".mood-btn").forEach((btn) => {
    btn.classList.remove("selected")
  })
  const selectedBtn = document.querySelector(`[data-mood="${mood}"]`)
  selectedBtn.classList.add("selected")

  // Add gentle animation feedback
  selectedBtn.style.transform = "scale(1.2)"
  setTimeout(() => {
    selectedBtn.style.transform = ""
  }, 200)
}

function saveDailyMood() {
  const selectedMood = document.querySelector(".mood-btn.selected")
  //const note = document.getElementById("daily-note").value

  if (!selectedMood) {
    alert("Пожалуйста, выберите, как вы себя чувствуете сегодня")
    return
  }

  const today = new Date().toDateString()
  appState.moodEntries[today] = {
    mood: selectedMood.dataset.mood,
    //note: note,
    date: today,
    cycleDay: getCurrentCycleDay(),
  }

  saveAppState()

  // Show success feedback
  const button = document.getElementById("save-mood")
  const originalText = button.textContent
  button.textContent = "Сохранили! 💕"
  button.style.background = "#B8E6B8"

  setTimeout(() => {
    button.textContent = originalText
    button.style.background = ""
  }, 2000)
}

// Calendar Generation
function generateCalendar() {
  const calendarGrid = document.getElementById("calendar-grid")
  calendarGrid.innerHTML = ""

  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()

  // Get first day of month and number of days
  const firstDay = new Date(currentYear, currentMonth, 1)
  const lastDay = new Date(currentYear, currentMonth + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayOfWeek = firstDay.getDay()

  // Add day headers
  const dayHeaders = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
  dayHeaders.forEach((day) => {
    const header = document.createElement("div")
    header.textContent = day
    header.style.textAlign = "center"
    header.style.fontWeight = "bold"
    header.style.color = "#8B7B8B"
    header.style.fontSize = "0.8rem"
    header.style.padding = "0.5rem"
    calendarGrid.appendChild(header)
  })

  // Add empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    const emptyDay = document.createElement("div")
    emptyDay.className = "calendar-day empty"
    calendarGrid.appendChild(emptyDay)
  }

  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dayElement = document.createElement("div")
    dayElement.className = "calendar-day"
    dayElement.textContent = day

    const dayDate = new Date(currentYear, currentMonth, day)
    const cycleDay = getDayOfCycle(dayDate)
    const phase = getPhaseForDay(cycleDay)

  // Apply phase color
    dayElement.style.backgroundColor = phase.color
    dayElement.style.color = "white"

    // Mark current day
    if (day === today.getDate()) {
      dayElement.classList.add("current")
    }

    // Add click handler
    dayElement.addEventListener("click", () => openDayModal(dayDate, cycleDay, phase))

    calendarGrid.appendChild(dayElement)
  }
}

// Day Modal
function openDayModal(date, cycleDay, phase) {
  const modal = document.getElementById("day-modal")
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  document.getElementById("modal-date").textContent = `${dateStr} - Day ${cycleDay}`
  document.getElementById("modal-phase").className = `modal-phase ${phase.name.toLowerCase()}`
  document.getElementById("modal-phase").querySelector(".phase-name").textContent = phase.name

  const randomRecommendation = phase.recommendations[Math.floor(Math.random() * phase.recommendations.length)]
  document.getElementById("modal-recommendation").textContent = randomRecommendation

  // Load existing note
  const dateKey = date.toDateString()
  const existingNote = appState.dayNotes[dateKey] || ""
  document.getElementById("modal-note-input").value = existingNote

  appState.selectedDay = date
  modal.classList.remove("hidden")
  
  // Добавляем кнопку отправки в модальное окно (если её ещё нет)
  const sendButtonInModal = document.getElementById("send-to-telegram-btn-modal");
  if (!sendButtonInModal) {
    // Создаем кнопку отправки
    const sendButton = document.createElement("button");
    sendButton.id = "send-to-telegram-btn-modal";
    sendButton.textContent = "Send to Chat 💬";
    sendButton.style.marginTop = "1rem";
    sendButton.style.padding = "0.5rem 1rem";
    sendButton.style.backgroundColor = "#0088cc";
    sendButton.style.color = "white";
    sendButton.style.border = "none";
    sendButton.style.borderRadius = "20px";
    sendButton.style.cursor = "pointer";
    sendButton.style.fontSize = "0.9rem";
    sendButton.style.width = "100%";
    sendButton.style.fontWeight = "500";
    
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
  document.getElementById("day-modal").classList.add("hidden")
  appState.selectedDay = null
}

function saveDayNote() {
  if (!appState.selectedDay) return

  const note = document.getElementById("modal-note-input").value
  const dateKey = appState.selectedDay.toDateString()

  if (note.trim()) {
    appState.dayNotes[dateKey] = note
  } else {
    delete appState.dayNotes[dateKey]
  }

  saveAppState()
  closeModal()

  // Refresh diary if it's the current tab
  if (appState.currentTab === "diary") {
    updateDiaryView()
  }
}

// Diary View
function updateDiaryView() {
  const diaryEntries = document.getElementById("diary-entries")
  diaryEntries.innerHTML = ""

  // Combine mood entries and day notes
  const allEntries = []

  // Add mood entries
  Object.values(appState.moodEntries).forEach((entry) => {
    allEntries.push({
      date: new Date(entry.date),
      type: "mood",
      data: entry,
    })
  })

  // Add day notes
  Object.entries(appState.dayNotes).forEach(([dateStr, note]) => {
    allEntries.push({
      date: new Date(dateStr),
      type: "note",
      data: { note, date: dateStr },
    })
  })

  // Sort by date (newest first)
  allEntries.sort((a, b) => b.date - a.date)

  if (allEntries.length === 0) {
    diaryEntries.innerHTML = `
            <div style="text-align: center; color: #8B7B8B; padding: 2rem;">
                <p>Your beautiful journey starts here...</p>
                <p style="font-size: 0.9rem; margin-top: 0.5rem;">Add moods and notes to see them in your diary</p>
            </div>
        `
    return
  }

  allEntries.forEach((entry) => {
    const entryElement = document.createElement("div")
    entryElement.className = "diary-entry fade-in"

    const dateStr = entry.date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })

    if (entry.type === "mood") {
      entryElement.innerHTML = `
                <div class="diary-entry-date">${dateStr} - Day ${entry.data.cycleDay}</div>
                <div class="diary-entry-mood">${moodEmojis[entry.data.mood]}</div>
                ${entry.data.note ? `<div class="diary-entry-note">${entry.data.note}</div>` : ""}
            `
    } else {
      entryElement.innerHTML = `
                <div class="diary-entry-date">${dateStr}</div>
                <div class="diary-entry-note">${entry.data.note}</div>
            `
    }

    diaryEntries.appendChild(entryElement)
  })
}

// Notifications
function checkForNotifications() {
  const currentDay = getCurrentCycleDay()
  const daysUntilPeriod = appState.cycleLength - currentDay + 1

  if (daysUntilPeriod === 2) {
    showNotification("Месячные могут начаться через 2 дня. Самое время быть особенно бережной к себе. 🌙")
  } else if (daysUntilPeriod === 1) {
    showNotification("Месячные могут начаться завтра. Подготовьте свое уютное пространство и любимые предметы комфорта. 🌸")
  }

  // Show phase-specific gentle reminders
  const currentPhase = getPhaseForDay(currentDay)
  if (currentDay === 1) {
    setTimeout(() => {
      showNotification("Добро пожаловать на этап вашего обновления. Ваше тело делает прекрасную работу. 💕")
    }, 3000)
  } else if (currentDay === 6) {
    setTimeout(() => {
      showNotification("Чувствуете, как к вам возвращается энергия? У вас начинается творческая фаза! ✨")
    }, 3000)
  } else if (currentDay === 14) {
    setTimeout(() => {
      showNotification("Ты сегодня сияешь! Идеальное время, чтобы блистать и общаться. 🌟")
    }, 3000)
  } else if (currentDay === 17) {
    setTimeout(() => {
      showNotification("Пришло время обратиться внутрь себя. Сейчас твоя мудрость глубочайшая. 🌙")
    }, 3000)
  }

  const moodEntryCount = Object.keys(appState.moodEntries).length
  if (moodEntryCount === 7) {
    setTimeout(() => {
      showNotification("Вы занимаетесь отслеживанием уже неделю! Вы создаёте такую прекрасную практику. 🌱")
    }, 5000)
  } else if (moodEntryCount === 30) {
    setTimeout(() => {
      showNotification("Целый месяц самопознания! Вы по-настоящему цените свой путь. 🌺")
    }, 5000)
  }
}

function showNotification(message) {
  const notification = document.getElementById("notification")
  document.getElementById("notification-text").textContent = message
  notification.classList.remove("hidden")

  setTimeout(() => {
    notification.classList.add("hidden")
  }, 5000)
}

// Data Persistence
function saveAppState() {
  localStorage.setItem(
    "lunaAppState",
    JSON.stringify({
      ...appState,
      lastPeriodDate: appState.lastPeriodDate ? appState.lastPeriodDate.toISOString() : null,
    }),
  )
}

function loadAppState() {
  const saved = localStorage.getItem("lunaAppState")
  if (saved) {
    const parsed = JSON.parse(saved)
    appState = {
      ...appState,
      ...parsed,
      lastPeriodDate: parsed.lastPeriodDate ? new Date(parsed.lastPeriodDate) : null,
    }
  }
}

// Utility Functions
function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
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
  }

  const dataStr = JSON.stringify(exportData, null, 2)
  const dataBlob = new Blob([dataStr], { type: "application/json" })
  const url = URL.createObjectURL(dataBlob)

  const link = document.createElement("a")
  link.href = url
  link.download = `luna-cycle-data-${new Date().toISOString().split("T")[0]}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
