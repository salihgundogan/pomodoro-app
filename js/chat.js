/* ═══════════════════════════════════════════════════
   FOCUS TOGETHER — Chat Module (Adım 5)
   ═══════════════════════════════════════════════════
   ✅ Anlık mesajlaşma (Supabase Realtime broadcast)
   ✅ Hazır mesajlar (quick reactions)
   ✅ Mesaj geçmişi (son 50 mesaj DB'den)
   ✅ Browser Notification desteği
   ✅ Mesaj baloncukları (ben / arkadaş ayrımı)
   ═══════════════════════════════════════════════════ */

import { supabaseClient } from './config.js';

  // ─── Hazır Mesajlar ───────────────────────────────
  const QUICK_MESSAGES = [
    { emoji: '👋', text: 'Merhaba!' },
    { emoji: '💪', text: 'Hadi başlayalım!' },
    { emoji: '☕', text: 'Mola vakti!' },
    { emoji: '🎯', text: 'Odaklan!' },
    { emoji: '🔥', text: 'Harika gidiyorsun!' },
    { emoji: '✅', text: 'Tamamladım!' },
  ];

  // ─── State ───────────────────────────────────────
  let chatChannel = null;
  let roomId = null;
  let deviceKey = null;
  let messages = [];
  let isOpen = false;
  let unreadCount = 0;

  // ─── DOM ──────────────────────────────────────────
  let els = {};

  function cacheDom() {
    els.panel       = document.getElementById('chat-panel');
    els.messages    = document.getElementById('chat-messages');
    els.input       = document.getElementById('chat-input');
    els.btnSend     = document.getElementById('btn-chat-send');
    els.btnToggle   = document.getElementById('btn-chat-toggle');
    els.quickBar    = document.getElementById('chat-quick-messages');
    els.badge       = document.getElementById('chat-unread-badge');
    els.btnClose    = document.getElementById('btn-chat-close');
  }

  // ═══════════════════════════════════════════════════
  //  INIT & SUBSCRIBE
  // ═══════════════════════════════════════════════════

  function init(rId, dKey) {
    roomId = rId;
    deviceKey = dKey;
    cacheDom();

    // Hazır mesajları render et
    renderQuickMessages();

    // Event listeners
    els.btnToggle.addEventListener('click', togglePanel);
    els.btnClose.addEventListener('click', togglePanel);
    els.btnSend.addEventListener('click', sendMessage);
    els.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Realtime subscribe
    subscribeToBroadcast();

    // DB'den geçmiş mesajları yükle
    loadMessagesFromDB();

    console.log('💬 Chat modülü başlatıldı');
  }

  function destroy() {
    if (chatChannel) {
      supabaseClient.removeChannel(chatChannel);
      chatChannel = null;
    }
    messages = [];
    unreadCount = 0;
    isOpen = false;
  }

  // ═══════════════════════════════════════════════════
  //  REALTIME BROADCAST
  // ═══════════════════════════════════════════════════

  function subscribeToBroadcast() {
    if (!supabaseClient || !roomId) return;

    chatChannel = supabaseClient.channel(`chat:${roomId}`, {
      config: { broadcast: { self: false } },
    });

    chatChannel
      .on('broadcast', { event: 'chat:message' }, ({ payload }) => {
        receiveMessage(payload);
      })
      .subscribe((status) => {
        console.log(`💬 Chat kanal: ${status}`);
      });
  }

  // ═══════════════════════════════════════════════════
  //  SEND & RECEIVE
  // ═══════════════════════════════════════════════════

  function sendMessage() {
    const text = els.input.value.trim();
    if (!text) return;

    const msg = {
      id: crypto.randomUUID(),
      sender_key: deviceKey,
      content: text,
      timestamp: new Date().toISOString(),
      isMe: true,
    };

    // Lokalde ekle
    addMessage(msg);
    els.input.value = '';

    // Broadcast
    if (chatChannel) {
      chatChannel.send({
        type: 'broadcast',
        event: 'chat:message',
        payload: {
          id: msg.id,
          sender_key: deviceKey,
          content: text,
          timestamp: msg.timestamp,
        },
      });
    }

    // DB'ye kaydet
    saveMessageToDB(text);
  }

  function sendQuickMessage(text) {
    els.input.value = text;
    sendMessage();
  }

  function receiveMessage(payload) {
    const msg = {
      ...payload,
      isMe: payload.sender_key === deviceKey,
    };

    addMessage(msg);

    // Panel kapalıysa unread artır
    if (!isOpen) {
      unreadCount++;
      updateBadge();
      showChatNotification(msg.content);
    }
  }

  function addMessage(msg) {
    messages.push(msg);
    // Son 100 mesaj tut
    if (messages.length > 100) messages = messages.slice(-100);
    renderMessages();
  }

  // ═══════════════════════════════════════════════════
  //  DB OPERATIONS
  // ═══════════════════════════════════════════════════

  async function saveMessageToDB(content) {
    if (!supabaseClient || !roomId) return;
    try {
      await supabaseClient.from('messages').insert({
        room_id: roomId,
        sender_key: deviceKey,
        content: content,
      });
    } catch (err) {
      console.error('Mesaj kayıt hatası:', err);
    }
  }

  async function loadMessagesFromDB() {
    if (!supabaseClient || !roomId) return;
    try {
      const { data } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (data && data.length > 0) {
        messages = data.map(m => ({
          id: m.id,
          sender_key: m.sender_key,
          content: m.content,
          timestamp: m.created_at,
          isMe: m.sender_key === deviceKey,
        }));
        renderMessages();
      }
    } catch (err) {
      console.error('Mesaj yükleme hatası:', err);
    }
  }

  // ═══════════════════════════════════════════════════
  //  RENDERING
  // ═══════════════════════════════════════════════════

  function renderMessages() {
    if (!els.messages) return;

    els.messages.innerHTML = messages.map(msg => {
      const time = formatMessageTime(msg.timestamp);
      const cls = msg.isMe ? 'chat-bubble me' : 'chat-bubble other';
      return `
        <div class="${cls}">
          <div class="chat-bubble-content">${escapeHtml(msg.content)}</div>
          <div class="chat-bubble-time">${time}</div>
        </div>
      `;
    }).join('');

    // En alta kaydır
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function renderQuickMessages() {
    if (!els.quickBar) return;

    els.quickBar.innerHTML = QUICK_MESSAGES.map(q => `
      <button class="quick-msg-btn" type="button" title="${q.text}" data-msg="${q.text}">
        ${q.emoji}
      </button>
    `).join('');

    // Click handlers
    els.quickBar.querySelectorAll('.quick-msg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sendQuickMessage(btn.dataset.msg);
      });
    });
  }

  // ═══════════════════════════════════════════════════
  //  PANEL TOGGLE
  // ═══════════════════════════════════════════════════

  function togglePanel() {
    isOpen = !isOpen;
    if (els.panel) els.panel.classList.toggle('open', isOpen);
    if (els.btnToggle) els.btnToggle.classList.toggle('active', isOpen);

    if (isOpen) {
      unreadCount = 0;
      updateBadge();
      els.messages.scrollTop = els.messages.scrollHeight;
      els.input.focus();
    }
  }

  function updateBadge() {
    if (!els.badge) return;
    if (unreadCount > 0) {
      els.badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      els.badge.hidden = false;
    } else {
      els.badge.hidden = true;
    }
  }

  // ═══════════════════════════════════════════════════
  //  NOTIFICATIONS
  // ═══════════════════════════════════════════════════

  function showChatNotification(text) {
    // Toast
    if (typeof window.showToast === 'function') {
      window.showToast(`💬 ${text}`);
    }

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Focus Together — Yeni Mesaj', {
        body: text,
        tag: 'focus-chat',
      });
    }
  }

  // ═══════════════════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════════════════

  function formatMessageTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ═══════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════

export const FocusChat = { init, destroy };
