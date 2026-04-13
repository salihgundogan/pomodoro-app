/* ═══════════════════════════════════════════════════
   FOCUS TOGETHER — Timer Module (Adım 3)
   ═══════════════════════════════════════════════════
   ✅ Senkron Pomodoro timer (started_at tabanlı)
   ✅ Timer modları: Pomodoro 25/5, Özel süre
   ✅ Supabase Realtime broadcast ile senkronizasyon
   ✅ Başlat / Duraklat / Sıfırla kontrolleri
   ✅ SVG progress ring animasyonu
   ✅ Otomatik mola geçişi
   ═══════════════════════════════════════════════════ */

const FocusTimer = (function () {
  'use strict';

  // ─── Timer Modları ────────────────────────────────
  const MODES = {
    pomodoro:  { label: 'Pomodoro',    work: 25 * 60, break: 5 * 60 },
    long:      { label: 'Uzun Odak',   work: 50 * 60, break: 10 * 60 },
    short:     { label: 'Kısa Sprint', work: 15 * 60, break: 3 * 60 },
  };

  // ─── State ───────────────────────────────────────
  let state = {
    roomId: null,
    mode: 'pomodoro',
    phase: 'work',         // 'work' veya 'break'
    status: 'idle',        // 'idle' | 'running' | 'paused' | 'done'
    durationSeconds: MODES.pomodoro.work,
    startedAt: null,       // ISO timestamp
    pausedRemaining: null, // paused durumunda kalan saniye
    elapsed: 0,
    completedPomodoros: 0,
  };

  let tickInterval = null;
  let realtimeChannel = null;

  // ─── DOM Referansları ─────────────────────────────
  const els = {};

  function cacheDom() {
    els.display      = document.getElementById('timer-display');
    els.modeLabel    = document.getElementById('timer-mode-label');
    els.phaseLabel   = document.getElementById('timer-phase-label');
    els.btnStart     = document.getElementById('btn-start-timer');
    els.btnPause     = document.getElementById('btn-pause-timer');
    els.btnReset     = document.getElementById('btn-reset-timer');
    els.progressRing = document.getElementById('timer-progress');
    els.pomodoroCount = document.getElementById('pomodoro-count');
    els.modeBtns     = document.querySelectorAll('[data-timer-mode]');
  }

  // ═══════════════════════════════════════════════════
  //  TIMER CORE
  // ═══════════════════════════════════════════════════

  /**
   * Timer'ı başlatır.
   * started_at → sunucu zamanında kayıt.
   * Realtime broadcast ile diğer kullanıcıya bildirilir.
   */
  async function start() {
    if (state.status === 'running') return;

    const now = new Date().toISOString();
    let duration = state.durationSeconds;

    // Paused durumundan devam ediyorsa kalan süreyi kullan
    if (state.status === 'paused' && state.pausedRemaining !== null) {
      duration = state.pausedRemaining;
    }

    state.startedAt = now;
    state.durationSeconds = duration;
    state.status = 'running';
    state.pausedRemaining = null;

    // Supabase timers tablosuna yaz
    await syncTimerToDB();

    // Broadcast
    broadcastTimerEvent('timer:start', {
      startedAt: now,
      durationSeconds: duration,
      mode: state.mode,
      phase: state.phase,
    });

    startTicking();
    updateControls();
    console.log(`▶️ Timer başladı: ${formatTime(duration)}`);
  }

  /**
   * Timer'ı duraklatır.
   * Kalan süreyi kaydeder.
   */
  async function pause() {
    if (state.status !== 'running') return;

    const remaining = getRemaining();
    state.status = 'paused';
    state.pausedRemaining = remaining;

    stopTicking();

    await syncTimerToDB();

    broadcastTimerEvent('timer:pause', {
      pausedRemaining: remaining,
    });

    updateControls();
    console.log(`⏸️ Timer duraklatıldı: ${formatTime(remaining)} kaldı`);
  }

  /**
   * Timer'ı sıfırlar.
   */
  async function reset() {
    state.status = 'idle';
    state.startedAt = null;
    state.pausedRemaining = null;
    state.phase = 'work';
    state.durationSeconds = MODES[state.mode].work;

    stopTicking();

    await syncTimerToDB();

    broadcastTimerEvent('timer:reset', {
      mode: state.mode,
    });

    renderTimer(state.durationSeconds);
    updateControls();
    updatePhaseLabel();
    console.log('🔄 Timer sıfırlandı');
  }

  /**
   * Kalan süreyi hesaplar (started_at tabanlı senkronizasyon).
   * Bu yöntem sayesinde iki kullanıcı her zaman aynı süreyi görür.
   */
  function getRemaining() {
    if (state.status === 'paused') {
      return state.pausedRemaining || state.durationSeconds;
    }
    if (state.status !== 'running' || !state.startedAt) {
      return state.durationSeconds;
    }

    const now = Date.now();
    const started = new Date(state.startedAt).getTime();
    const elapsed = Math.floor((now - started) / 1000);
    const remaining = Math.max(0, state.durationSeconds - elapsed);
    return remaining;
  }

  /**
   * Her saniye çağrılır — ekranı günceller.
   */
  function tick() {
    const remaining = getRemaining();
    renderTimer(remaining);

    if (remaining <= 0) {
      onTimerComplete();
    }
  }

  function startTicking() {
    stopTicking();
    tick(); // Hemen ilk tick
    tickInterval = setInterval(tick, 1000);
  }

  function stopTicking() {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  }

  // ═══════════════════════════════════════════════════
  //  TIMER COMPLETE
  // ═══════════════════════════════════════════════════

  function onTimerComplete() {
    stopTicking();

    if (state.phase === 'work') {
      state.completedPomodoros++;
      updatePomodoroCount();
      saveToLocalHistory();

      // Mola fazına geç
      state.phase = 'break';
      state.durationSeconds = MODES[state.mode].break;
      state.status = 'idle';
      state.startedAt = null;
      state.pausedRemaining = null;

      showTimerNotification('Pomodoro tamamlandı! 🎉', 'Mola zamanı.');
    } else {
      // Mola bitti → çalışma fazına dön
      state.phase = 'work';
      state.durationSeconds = MODES[state.mode].work;
      state.status = 'idle';
      state.startedAt = null;
      state.pausedRemaining = null;

      showTimerNotification('Mola bitti! 💪', 'Çalışmaya devam.');
    }

    broadcastTimerEvent('timer:complete', {
      phase: state.phase,
      completedPomodoros: state.completedPomodoros,
    });

    renderTimer(state.durationSeconds);
    updateControls();
    updatePhaseLabel();
  }

  // ═══════════════════════════════════════════════════
  //  RENDERING
  // ═══════════════════════════════════════════════════

  function renderTimer(remaining) {
    if (!els.display) return;

    // Zaman gösterimi
    els.display.textContent = formatTime(remaining);

    // Progress ring
    if (els.progressRing) {
      const total = state.durationSeconds;
      const progress = total > 0 ? remaining / total : 1;
      const circumference = 2 * Math.PI * 140; // r=140
      const offset = circumference * (1 - progress);
      els.progressRing.style.strokeDasharray = circumference;
      els.progressRing.style.strokeDashoffset = offset;
    }
  }

  function updateControls() {
    if (!els.btnStart) return;

    const isIdle    = state.status === 'idle';
    const isRunning = state.status === 'running';
    const isPaused  = state.status === 'paused';

    els.btnStart.hidden = isRunning;
    els.btnPause.hidden = !isRunning;
    els.btnReset.hidden = isIdle;

    // Mod butonlarını çalışırken/pause'da devre dışı bırak
    els.modeBtns.forEach(btn => {
      btn.disabled = isRunning || isPaused;
    });

    // Start buton text güncelle
    if (isPaused) {
      els.btnStart.querySelector('.btn-label').textContent = 'Devam Et';
    } else {
      els.btnStart.querySelector('.btn-label').textContent = 'Başlat';
    }
  }

  function updatePhaseLabel() {
    if (!els.phaseLabel) return;
    if (state.phase === 'work') {
      els.phaseLabel.textContent = 'Çalışma';
      els.phaseLabel.className = 'timer-phase phase-work';
    } else {
      els.phaseLabel.textContent = 'Mola';
      els.phaseLabel.className = 'timer-phase phase-break';
    }
  }

  function updatePomodoroCount() {
    if (!els.pomodoroCount) return;
    els.pomodoroCount.textContent = state.completedPomodoros;
  }

  // ═══════════════════════════════════════════════════
  //  MODE SELECTION
  // ═══════════════════════════════════════════════════

  function setMode(modeName) {
    if (!MODES[modeName] || state.status !== 'idle') return;

    state.mode = modeName;
    state.phase = 'work';
    state.durationSeconds = MODES[modeName].work;

    // Active class
    els.modeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.timerMode === modeName);
    });

    // Mode label
    if (els.modeLabel) {
      els.modeLabel.textContent = `${MODES[modeName].label} — ${MODES[modeName].work / 60} dakika`;
    }

    renderTimer(state.durationSeconds);
    updatePhaseLabel();

    broadcastTimerEvent('timer:mode', { mode: modeName });
    console.log(`🎚️ Mod değişti: ${MODES[modeName].label}`);
  }

  // ═══════════════════════════════════════════════════
  //  SUPABASE REALTIME
  // ═══════════════════════════════════════════════════

  /**
   * Oda için Realtime channel başlatır.
   * Timer olaylarını broadcast eder ve dinler.
   */
  function subscribeToRoom(roomId) {
    if (!supabaseClient || !roomId) return;

    state.roomId = roomId;

    // Önceki subscription'ı temizle
    unsubscribe();

    realtimeChannel = supabaseClient.channel(`room:${roomId}`, {
      config: { broadcast: { self: false } },
    });

    // Timer olaylarını dinle
    realtimeChannel
      .on('broadcast', { event: 'timer:start' }, ({ payload }) => {
        console.log('📡 Alındı: timer:start', payload);
        state.startedAt = payload.startedAt;
        state.durationSeconds = payload.durationSeconds;
        state.mode = payload.mode || state.mode;
        state.phase = payload.phase || state.phase;
        state.status = 'running';
        state.pausedRemaining = null;
        startTicking();
        updateControls();
        updatePhaseLabel();
        syncModeButtons();
      })
      .on('broadcast', { event: 'timer:pause' }, ({ payload }) => {
        console.log('📡 Alındı: timer:pause', payload);
        state.status = 'paused';
        state.pausedRemaining = payload.pausedRemaining;
        stopTicking();
        renderTimer(state.pausedRemaining);
        updateControls();
      })
      .on('broadcast', { event: 'timer:reset' }, ({ payload }) => {
        console.log('📡 Alındı: timer:reset', payload);
        if (payload.mode) state.mode = payload.mode;
        state.status = 'idle';
        state.startedAt = null;
        state.pausedRemaining = null;
        state.phase = 'work';
        state.durationSeconds = MODES[state.mode].work;
        stopTicking();
        renderTimer(state.durationSeconds);
        updateControls();
        updatePhaseLabel();
        syncModeButtons();
      })
      .on('broadcast', { event: 'timer:complete' }, ({ payload }) => {
        console.log('📡 Alındı: timer:complete', payload);
        state.phase = payload.phase;
        if (payload.completedPomodoros !== undefined) {
          state.completedPomodoros = payload.completedPomodoros;
          updatePomodoroCount();
        }
        state.status = 'idle';
        state.startedAt = null;
        state.pausedRemaining = null;
        state.durationSeconds = state.phase === 'work'
          ? MODES[state.mode].work
          : MODES[state.mode].break;
        stopTicking();
        renderTimer(state.durationSeconds);
        updateControls();
        updatePhaseLabel();
      })
      .on('broadcast', { event: 'timer:mode' }, ({ payload }) => {
        console.log('📡 Alındı: timer:mode', payload);
        if (state.status === 'idle' && payload.mode) {
          state.mode = payload.mode;
          state.durationSeconds = MODES[payload.mode].work;
          state.phase = 'work';
          renderTimer(state.durationSeconds);
          updatePhaseLabel();
          syncModeButtons();
          if (els.modeLabel) {
            els.modeLabel.textContent =
              `${MODES[payload.mode].label} — ${MODES[payload.mode].work / 60} dakika`;
          }
        }
      })
      .subscribe((status) => {
        console.log(`📡 Realtime kanal durumu: ${status}`);
      });
  }

  function unsubscribe() {
    if (realtimeChannel) {
      supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  function broadcastTimerEvent(event, payload) {
    if (!realtimeChannel) return;
    realtimeChannel.send({
      type: 'broadcast',
      event: event,
      payload: payload,
    });
  }

  function syncModeButtons() {
    els.modeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.timerMode === state.mode);
    });
  }

  // ═══════════════════════════════════════════════════
  //  SUPABASE DB SYNC
  // ═══════════════════════════════════════════════════

  /**
   * Timer durumunu veritabanına yazar.
   * Sayfa yenilendiğinde kalan süre buradan okunur.
   */
  async function syncTimerToDB() {
    if (!supabaseClient || !state.roomId) return;

    try {
      // Mevcut timer kaydını kontrol et
      const { data: existing } = await supabaseClient
        .from('timers')
        .select('id')
        .eq('room_id', state.roomId)
        .maybeSingle();

      const timerData = {
        room_id: state.roomId,
        started_at: state.startedAt,
        duration_seconds: state.durationSeconds,
        status: state.status,
      };

      if (existing) {
        await supabaseClient
          .from('timers')
          .update(timerData)
          .eq('id', existing.id);
      } else {
        await supabaseClient
          .from('timers')
          .insert(timerData);
      }
    } catch (err) {
      console.error('Timer DB sync hatası:', err);
    }
  }

  /**
   * Sayfa yenilendiğinde veya odaya katılındığında
   * mevcut timer durumunu DB'den okur.
   */
  async function loadTimerFromDB(roomId) {
    if (!supabaseClient) return;

    try {
      const { data } = await supabaseClient
        .from('timers')
        .select('*')
        .eq('room_id', roomId)
        .maybeSingle();

      if (!data) return;

      state.status = data.status || 'idle';
      state.durationSeconds = data.duration_seconds || MODES[state.mode].work;
      state.startedAt = data.started_at;

      if (state.status === 'running' && state.startedAt) {
        // Timer çalışıyorsa → kaldığı yerden devam
        const remaining = getRemaining();
        if (remaining > 0) {
          startTicking();
        } else {
          onTimerComplete();
        }
      } else if (state.status === 'paused') {
        // Paused → kalan süreyi göster
        const elapsed = state.startedAt
          ? Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000)
          : 0;
        state.pausedRemaining = Math.max(0, state.durationSeconds - elapsed);
        renderTimer(state.pausedRemaining);
      } else {
        renderTimer(state.durationSeconds);
      }

      updateControls();
      updatePhaseLabel();
    } catch (err) {
      console.error('Timer DB load hatası:', err);
    }
  }

  // ═══════════════════════════════════════════════════
  //  NOTIFICATIONS
  // ═══════════════════════════════════════════════════

  function showTimerNotification(title, body) {
    // Sesli uyarı
    playNotificationSound();

    // Toast (her zaman göster)
    if (typeof showToast === 'function') {
      showToast(title);
    }

    // Browser Notification (izin varsa)
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="12" cy="16" r="9" fill="none" stroke="%23a78bfa" stroke-width="1.5"/><circle cx="20" cy="16" r="9" fill="none" stroke="%23a78bfa" stroke-width="1.5"/></svg>',
      });
    }
  }

  function playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = 'sine';
      gain.gain.value = 0.15;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // AudioContext desteklenmiyor, sessizce atla
    }
  }

  // ═══════════════════════════════════════════════════
  //  LOCAL HISTORY (localStorage)
  // ═══════════════════════════════════════════════════

  function saveToLocalHistory() {
    try {
      const key = 'ft_pomodoro_history';
      const history = JSON.parse(localStorage.getItem(key) || '[]');
      history.push({
        date: new Date().toISOString().slice(0, 10),
        mode: state.mode,
        duration: MODES[state.mode].work,
        timestamp: Date.now(),
      });
      // Son 7 gün
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const filtered = history.filter(h => h.timestamp > weekAgo);
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch {
      // localStorage hatası, sessizce atla
    }
  }

  // ═══════════════════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════════════════

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // ═══════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════

  function init(roomId) {
    cacheDom();

    // Bildirim izni iste
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Mode buton click
    els.modeBtns.forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.timerMode));
    });

    // Kontrol butonları
    els.btnStart.addEventListener('click', start);
    els.btnPause.addEventListener('click', pause);
    els.btnReset.addEventListener('click', reset);

    // İlk render
    setMode('pomodoro');
    updateControls();

    // Realtime subscribe
    subscribeToRoom(roomId);

    // DB'den mevcut durumu yükle
    loadTimerFromDB(roomId);

    console.log('⏱️ Timer modülü başlatıldı');
  }

  function destroy() {
    stopTicking();
    unsubscribe();
    state.status = 'idle';
    state.startedAt = null;
    state.pausedRemaining = null;
    state.completedPomodoros = 0;
  }

  return { init, destroy, getState: () => ({ ...state }) };

})();

// showToast fonksiyonunu global yapmak için
// (app.js'deki IIFE içinden erişilebilir olması lazım)
// Bu fonksiyon app.js'de tanımlı, timer.js'de window üzerinden çağıracağız:
if (typeof window.showToast !== 'function') {
  window.showToast = function(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    }, 2500);
  };
}
