/* ═══════════════════════════════════════════════════
   FOCUS TOGETHER — Stats Module (Adım 6)
   ═══════════════════════════════════════════════════
   ✅ Bugünkü pomodoro sayısı
   ✅ Toplam çalışma süresi
   ✅ 7 günlük geçmiş (localStorage)
   ✅ Günlük bar chart
   ✅ Streak (ard arda gün)
   ═══════════════════════════════════════════════════ */

const STORAGE_KEY = 'ft_pomodoro_history';

  // ─── DOM ──────────────────────────────────────────
  let els = {};

  function cacheDom() {
    els.panel       = document.getElementById('stats-panel');
    els.btnToggle   = document.getElementById('btn-stats-toggle');
    els.btnClose    = document.getElementById('btn-stats-close');
    els.todayCount  = document.getElementById('stats-today-count');
    els.todayMins   = document.getElementById('stats-today-mins');
    els.weekCount   = document.getElementById('stats-week-count');
    els.streak      = document.getElementById('stats-streak');
    els.chart       = document.getElementById('stats-chart');
  }

  // ═══════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════

  function init() {
    cacheDom();

    if (els.btnToggle) {
      els.btnToggle.addEventListener('click', togglePanel);
    }
    if (els.btnClose) {
      els.btnClose.addEventListener('click', togglePanel);
    }

    refresh();
    console.log('📊 Stats modülü başlatıldı');
  }

  function togglePanel() {
    if (!els.panel) return;
    els.panel.classList.toggle('open');
    if (els.panel.classList.contains('open')) {
      refresh();
    }
  }

  // ═══════════════════════════════════════════════════
  //  DATA
  // ═══════════════════════════════════════════════════

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function cleanOldEntries() {
    const history = getHistory();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const filtered = history.filter(h => h.timestamp > weekAgo);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  }

  function getToday() {
    const today = new Date().toISOString().slice(0, 10);
    return getHistory().filter(h => h.date === today);
  }

  function getStreak() {
    const history = getHistory();
    if (history.length === 0) return 0;

    const uniqueDays = [...new Set(history.map(h => h.date))].sort().reverse();
    let streak = 0;
    const today = new Date();

    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);

      if (uniqueDays.includes(dateStr)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return streak;
  }

  function getLast7Days() {
    const history = getHistory();
    const days = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayName = d.toLocaleDateString('tr-TR', { weekday: 'short' });
      const count = history.filter(h => h.date === dateStr).length;
      days.push({ date: dateStr, day: dayName, count });
    }

    return days;
  }

  // ═══════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════

  function refresh() {
    cleanOldEntries();

    const todayEntries = getToday();
    const todayCount = todayEntries.length;
    const todayMins = todayEntries.reduce((sum, h) => sum + (h.duration || 1500) / 60, 0);
    const weekHistory = getHistory();
    const weekCount = weekHistory.length;
    const streak = getStreak();

    if (els.todayCount) els.todayCount.textContent = todayCount;
    if (els.todayMins) els.todayMins.textContent = Math.round(todayMins);
    if (els.weekCount) els.weekCount.textContent = weekCount;
    if (els.streak) els.streak.textContent = streak;

    renderChart();
  }

  function renderChart() {
    if (!els.chart) return;

    const days = getLast7Days();
    const maxCount = Math.max(...days.map(d => d.count), 1);

    els.chart.innerHTML = days.map(d => {
      const height = d.count > 0 ? Math.max(12, (d.count / maxCount) * 100) : 4;
      const isToday = d.date === new Date().toISOString().slice(0, 10);
      return `
        <div class="chart-bar-wrapper">
          <div class="chart-bar ${isToday ? 'today' : ''} ${d.count > 0 ? 'has-data' : ''}"
               style="height: ${height}%"
               title="${d.count} pomodoro">
            ${d.count > 0 ? `<span class="chart-bar-value">${d.count}</span>` : ''}
          </div>
          <span class="chart-bar-label ${isToday ? 'today' : ''}">${d.day}</span>
        </div>
      `;
    }).join('');
  }

  // ═══════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════

export const FocusStats = { init, refresh };
