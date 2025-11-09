// chart.js

// Импортируем Chart.js
// <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

// 🆕 Функция получения уровня активности для фазы
function getActivityLevelForPhase(phaseName) {
  const activityMap = {
    "menstruation": 1, // Низкий
    "follicular": 3,   // Средний
    "ovulation": 5,    // Высокий
    "luteal": 2,       // Низкий/средний
    // "pre-cycle": 1, // Серый
  };
  return activityMap[phaseName] || 1; // По умолчанию низкий
}

// 🆕 Функция отрисовки графика активности с Chart.js
function drawActivityChart() {
  const canvas = document.getElementById("activity-chart-canvas");
  if (!canvas) {
    console.warn("❌ Canvas для графика активности не найден.");
    return;
  }

  // Удаляем старый график, если он есть
  if (window.activityChartInstance) {
    window.activityChartInstance.destroy();
  }

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Рассчитываем уровень активности для каждого дня месяца
  const activityLevels = [];
  const backgroundColors = [];
  const borderColors = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = new Date(currentYear, currentMonth, day);
    const cycleDay = getDayOfCycle(dayDate); // Используем функцию из script.js

    let level = 1;
    let color = "#cccccc"; // Серый по умолчанию

    if (cycleDay === null) {
      // День до начала отслеживания
      level = 1;
      color = "#cccccc";
    } else {
      const phase = getPhaseForDay(cycleDay); // Используем функцию из script.js
      level = getActivityLevelForPhase(phase.name);
      color = phase.color;

      // 🆕 Добавляем прозрачность для прогнозируемых дней
      const isPredictedDay = appState.nextPredictedCycle &&
                             dayDate >= new Date(appState.nextPredictedCycle.predictedStartDate);
      if (isPredictedDay) {
        // Превращаем цвет в rgba с прозрачностью
        const rgb = color.replace('#', '').match(/.{2}/g).map(hex => parseInt(hex, 16));
        color = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.4)`;
      }
    }

    activityLevels.push(level);
    backgroundColors.push(color);
    borderColors.push("#8B7B8B");
  }

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
}

// Экспортируем функции, чтобы их можно было вызвать из script.js
window.drawActivityChart = drawActivityChart;
