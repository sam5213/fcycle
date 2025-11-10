// chart.js

// Импортируем Chart.js
// <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

// 🆕 Функция получения уровня активности для фазы
function getActivityLevelForPhase(phaseName) {
  // 🔥 Карта соответствия русских имён фаз английским ключам
  const phaseKeyMap = {
    "Менструация": "menstruation",
    "Фолликулярная фаза": "follicular",
    "Овуляция": "ovulation",
    "Лютеиновая фаза": "luteal",
  };

  // 🔥 Карта уровней активности
  const activityMap = {
    "menstruation": 1, // Низкий
    "follicular": 3,   // Средний
    "ovulation": 5,    // Высокий
    "luteal": 2,       // Низкий/средний
  };

  const phaseKey = phaseKeyMap[phaseName];
  if (phaseKey === undefined) {
    console.warn(`⚠️ Неизвестная фаза "${phaseName}". Возвращаем уровень 1.`);
    return 1;
  }

  const level = activityMap[phaseKey];
  if (level === undefined) {
    console.warn(`⚠️ Уровень активности для фазы "${phaseName}" не найден. Возвращаем 1.`);
    return 1;
  }

  return level;
}

// 🆕 Функция отрисовки графика активности с Chart.js
function drawActivityChart() {
  console.log("🎨 drawActivityChart вызвана");
  const canvas = document.getElementById("activity-chart-canvas");
  if (!canvas) {
    console.warn("❌ Canvas для графика активности не найден.");
    return;
  }

  console.log("Canvas найден, начинаю отрисовку...");

  // Удаляем старый график, если он есть
  if (window.activityChartInstance) {
    console.log("🗑️ Удаляем старый график");
    window.activityChartInstance.destroy();
  }

  // 🔥 Проверим, загружены ли phases и appState.lastPeriodDate
  if (!phases || Object.keys(phases).length === 0) {
    console.error("❌ Фазы не загружены!");
    return;
  }

  if (!appState.lastPeriodDate) {
    console.error("❌ Дата начала цикла не установлена!");
    return;
  }

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  console.log(`📅 Рассчитываем активность для ${daysInMonth} дней месяца ${currentMonth + 1}/${currentYear}`);

  // Рассчитываем уровень активности для каждого дня месяца
  const activityLevels = [];
  const backgroundColors = [];
  const borderColors = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = new Date(currentYear, currentMonth, day);
    console.log(`📅 Обрабатываю день ${day}, дата: ${dayDate.toISOString().split('T')[0]}`);
    
    const cycleDay = getDayOfCycle(dayDate); // Используем функцию из script.js
    console.log(`   -> cycleDay: ${cycleDay}`);

    let level = 1;
    let color = "#cccccc"; // Серый по умолчанию

    if (cycleDay === null) {
      // День до начала отслеживания
      level = 1;
      color = "#cccccc";
      console.log(`   -> До начала цикла, уровень: ${level}, цвет: ${color}`);
    } else {
      const phase = getPhaseForDay(cycleDay); // Используем функцию из script.js
      console.log(`   -> phase:`, phase);
      if (!phase) {
        console.error(`❌ Фаза для дня ${cycleDay} не найдена!`);
        continue; // Пропускаем день
      }
      level = getActivityLevelForPhase(phase.name);
      color = phase.color;

      console.log(`   -> Фаза: ${phase.name}, уровень: ${level}, цвет: ${color}`);

      // 🆕 Добавляем прозрачность для прогнозируемых дней
      const isPredictedDay = appState.nextPredictedCycle &&
                             dayDate >= new Date(appState.nextPredictedCycle.predictedStartDate);
      if (isPredictedDay) {
        // Превращаем цвет в rgba с прозрачностью
        //const rgb = color.replace('#', '').match(/.{2}/g).map(hex => parseInt(hex, 16));
        //color = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.4)`;
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        color = `rgba(${r}, ${g}, ${b}, 0.4)`;
        console.log(`   -> Прогнозируемый день, цвет изменён на: ${color}`);
      }
    }

    activityLevels.push(level);
    backgroundColors.push(color);
    borderColors.push("#8B7B8B");
  }

  console.log("📊 Уровни активности:", activityLevels);
  console.log("🎨 Цвета фона:", backgroundColors);

  // Создаем новый график
  window.activityChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString()), // ['1', '2', ..., '30']
      datasets: [{
        label: 'Уровень активности',
         activityLevels,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: false,
          min: 1,
          max: 5,
          ticks: {
            stepSize: 1,
            color: "#8B7B8B",
          },
          grid: {
            color: "rgba(139, 123, 139, 0.1)",
          }
        },
        x: {
          ticks: {
            color: "#8B7B8B",
          },
          grid: {
            display: false,
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const day = context.dataIndex + 1;
              const level = context.parsed.y;
              return `День ${day}: Уровень ${level}`;
            }
          }
        }
      }
    }
  });

  console.log("✅ График успешно отрисован");
}

// Экспортируем функции, чтобы их можно было вызвать из script.js
window.drawActivityChart = drawActivityChart;
