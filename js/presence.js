/* ═══════════════════════════════════════════════════
   FOCUS TOGETHER — Presence Module (Adım 4)
   ═══════════════════════════════════════════════════
   ✅ Supabase Presence ile online kullanıcı takibi
   ✅ Kim bağlı / kim ayrıldı gösterimi
   ✅ Kullanıcı sayısı güncelleme
   ✅ Sekme kapanma / bağlantı kesilme tespiti
   ✅ Heartbeat (düzenli sinyal)
   ✅ Reconnect desteği
   ═══════════════════════════════════════════════════ */

const FocusPresence = (function () {
  'use strict';

  // ─── State ───────────────────────────────────────
  let presenceChannel = null;
  let roomId = null;
  let deviceKey = null;
  let onlineUsers = [];

  // ─── DOM Referansları ─────────────────────────────
  let els = {};

  function cacheDom() {
    els.userCount    = document.getElementById('room-user-count');
    els.userList     = document.getElementById('presence-user-list');
    els.statusText   = document.getElementById('status-text');
    els.statusDot    = document.querySelector('.status-dot');
  }

  // ═══════════════════════════════════════════════════
  //  SUBSCRIBE TO PRESENCE
  // ═══════════════════════════════════════════════════

  /**
   * Presence kanalına abone olur.
   * Kullanıcıyı "online" olarak işaretler.
   */
  function subscribe(rId, dKey) {
    if (!supabaseClient) return;

    roomId = rId;
    deviceKey = dKey;
    cacheDom();

    // Önceki kanalı temizle
    unsubscribe();

    presenceChannel = supabaseClient.channel(`presence:${roomId}`, {
      config: {
        presence: { key: deviceKey },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        onlineUsers = parsePresenceState(state);
        renderPresence();
        console.log('👥 Presence sync:', onlineUsers.length, 'kullanıcı');
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log(`👋 Katıldı: ${key}`);
        if (key !== deviceKey) {
          showPresenceToast(`Arkadaşın odaya katıldı`);
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log(`👋 Ayrıldı: ${key}`);
        if (key !== deviceKey) {
          showPresenceToast(`Arkadaşın odadan ayrıldı`);
        }
      })
      .subscribe(async (status) => {
        console.log(`📡 Presence kanal: ${status}`);

        if (status === 'SUBSCRIBED') {
          // Kendimizi presence olarak track et
          await presenceChannel.track({
            device_key: deviceKey,
            joined_at: new Date().toISOString(),
            user_agent: navigator.userAgent.slice(0, 50),
          });

          updateConnectionStatus(true);
        }
      });

    // Sekme kapanırken temizle
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Sekme görünürlük değişimi
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  /**
   * Presence kanalından çık.
   */
  function unsubscribe() {
    if (presenceChannel) {
      presenceChannel.untrack();
      supabaseClient.removeChannel(presenceChannel);
      presenceChannel = null;
    }
    window.removeEventListener('beforeunload', handleBeforeUnload);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    onlineUsers = [];
  }

  // ═══════════════════════════════════════════════════
  //  PARSING & RENDERING
  // ═══════════════════════════════════════════════════

  /**
   * presenceState objesini düz kullanıcı dizisine çevirir.
   */
  function parsePresenceState(state) {
    const users = [];
    for (const [key, presences] of Object.entries(state)) {
      if (presences.length > 0) {
        users.push({
          key: key,
          ...presences[0],
          isMe: key === deviceKey,
        });
      }
    }
    return users;
  }

  /**
   * Kullanıcı sayısını ve listesini günceller.
   */
  function renderPresence() {
    const count = onlineUsers.length;

    // Sayı güncelle
    if (els.userCount) {
      els.userCount.innerHTML = `
        <span class="user-dot"></span>
        ${count} kişi
      `;

      // 2+ kişi olunca vurgu efekti
      els.userCount.classList.toggle('multi-user', count >= 2);
    }

    // Kullanıcı listesi (avatarlar)
    if (els.userList) {
      els.userList.innerHTML = onlineUsers.map((user, i) => `
        <div class="presence-avatar ${user.isMe ? 'is-me' : ''}" 
             title="${user.isMe ? 'Sen' : 'Arkadaş'}"
             style="animation-delay: ${i * 0.1}s">
          <span class="presence-avatar-icon">${user.isMe ? '👤' : '👥'}</span>
          <span class="presence-online-dot"></span>
        </div>
      `).join('');
    }

    // Status update
    if (count >= 2) {
      updateConnectionStatus(true, 'Birlikte çalışıyorsunuz! 🎯');
    } else {
      updateConnectionStatus(true, 'Odada — arkadaşını bekle');
    }
  }

  // ═══════════════════════════════════════════════════
  //  EVENT HANDLERS
  // ═══════════════════════════════════════════════════

  function handleBeforeUnload() {
    if (presenceChannel) {
      presenceChannel.untrack();
    }
  }

  function handleVisibilityChange() {
    if (!presenceChannel) return;

    if (document.visibilityState === 'hidden') {
      // Sekme arka plana gitti — ama bağlantıyı koparmıyoruz
      console.log('📱 Sekme arka plana gitti');
    } else {
      // Sekme geri geldi — presence güncelle
      console.log('📱 Sekme geri geldi');
      presenceChannel.track({
        device_key: deviceKey,
        joined_at: new Date().toISOString(),
        user_agent: navigator.userAgent.slice(0, 50),
      });
    }
  }

  // ═══════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════

  function updateConnectionStatus(connected, text) {
    if (els.statusDot) {
      els.statusDot.classList.toggle('connected', connected);
    }
    if (els.statusText && text) {
      els.statusText.textContent = text;
    }
  }

  function showPresenceToast(msg) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg);
    }
  }

  function getOnlineCount() {
    return onlineUsers.length;
  }

  // ═══════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════

  return {
    subscribe,
    unsubscribe,
    getOnlineCount,
  };

})();
