/* ═══════════════════════════════════════════════════
   FOCUS TOGETHER — Presence Module (Adım 4)
   ═══════════════════════════════════════════════════
   ✅ Supabase Presence ile online kullanıcı takibi
   ✅ Kim bağlı / kim ayrıldı gösterimi
   ✅ Kullanıcı sayısı güncelleme
   ✅ Sekme kapanma / bağlantı kesilme tespiti
   ✅ Heartbeat (düzenli sinyal)
   ✅ Reconnect & duplicate temizleme desteği
   ═══════════════════════════════════════════════════ */

import { supabaseClient } from './config.js';

  // ─── State ───────────────────────────────────────
  let presenceChannel = null;
  let roomId = null;
  let deviceKey = null;
  let onlineUsers = [];
  let isTracked = false;     // Şu an track edili mi?

  // Bound handler referansları (removeEventListener için)
  let _boundBeforeUnload = null;
  let _boundPageHide = null;

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

    // Önceki kanalı tamamen temizle (duplicate önleme)
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
          // Önce eski kaydı temizle (duplicate önleme)
          await presenceChannel.untrack();

          // Kendimizi presence olarak track et
          await presenceChannel.track({
            device_key: deviceKey,
            joined_at: new Date().toISOString(),
            user_agent: navigator.userAgent.slice(0, 50),
          });

          isTracked = true;
          updateConnectionStatus(true);
        }
      });

    // ─── Lifecycle Event'leri ───────────────────────
    // Sadece gerçek sayfa kapanma event'lerini dinle.
    // visibilitychange kullanılmıyor çünkü sekme değiştirme
    // veya arka plana alma gerçek bir ayrılma değildir.
    // Supabase Presence'ın kendi heartbeat timeout'u,
    // gerçek WebSocket kopmasını otomatik algılar.
    _boundBeforeUnload = handleBeforeUnload.bind(null);
    _boundPageHide = handlePageHide.bind(null);

    window.addEventListener('beforeunload', _boundBeforeUnload);
    window.addEventListener('pagehide', _boundPageHide);
  }

  /**
   * Presence kanalından çık — tüm kaynakları temizle.
   */
  function unsubscribe() {
    // Lifecycle dinleyicileri temizle
    if (_boundBeforeUnload) {
      window.removeEventListener('beforeunload', _boundBeforeUnload);
      _boundBeforeUnload = null;
    }
    if (_boundPageHide) {
      window.removeEventListener('pagehide', _boundPageHide);
      _boundPageHide = null;
    }

    if (presenceChannel) {
      try {
        presenceChannel.untrack();
      } catch (e) {
        // Kanal zaten kapalıysa sessizce atla
      }
      supabaseClient.removeChannel(presenceChannel);
      presenceChannel = null;
    }

    isTracked = false;
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

  /**
   * beforeunload: Sekme kapanırken presence'ı kaldır.
   * untrack() async olduğu için, ek olarak sendBeacon
   * ile Supabase Realtime WebSocket'i kapatmayı deneriz.
   */
  function handleBeforeUnload() {
    if (presenceChannel) {
      // untrack çağır — tarayıcı izin verdiği kadarıyla çalışır
      presenceChannel.untrack();
      isTracked = false;
    }
  }

  /**
   * pagehide: beforeunload'dan daha güvenilir (özellikle mobilde).
   * Safari ve mobil Chrome'da beforeunload her zaman ateşlenmez.
   */
  function handlePageHide(event) {
    if (presenceChannel) {
      presenceChannel.untrack();
      isTracked = false;
    }
  }

  // NOT: visibilitychange handler kaldırıldı.
  // Sekme değiştirme / arka plana alma → untrack yapmak
  // yanlış pozitif "ayrıldı" mesajlarına neden oluyordu.
  // Supabase Presence kendi heartbeat mekanizması ile
  // gerçek WebSocket kopmasını (sekme kapatma, internet
  // kesintisi, tarayıcı kapatma) otomatik algılar ve
  // leave event'i tetikler.

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

export const FocusPresence = {
    subscribe,
    unsubscribe,
    getOnlineCount,
  };
