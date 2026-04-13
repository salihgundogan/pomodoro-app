/* ═══════════════════════════════════════════════════
   FOCUS TOGETHER — App Logic (Adım 3)
   ═══════════════════════════════════════════════════
   ✅ Oda sistemi (oluştur / katıl / Supabase CRUD)
   ✅ Senkron Timer (started_at tabanlı + Realtime)
   ✅ Timer modları (Pomodoro / Uzun Odak / Kısa Sprint)
   ✅ Loading & hata durumları
   ═══════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── DOM Referansları ────────────────────────────
  const btnCreateRoom   = document.getElementById('btn-create-room');
  const btnJoinRoom     = document.getElementById('btn-join-room');
  const btnCopyCode     = document.getElementById('btn-copy-code');
  const btnBack         = document.getElementById('btn-back');
  const inputRoomCode   = document.getElementById('input-room-code');
  const actionsDefault  = document.getElementById('actions-default');
  const roomCreated     = document.getElementById('room-created');
  const codeDisplay     = document.getElementById('code-display');
  const statusText      = document.getElementById('status-text');
  const statusDot       = document.querySelector('.status-dot');
  const errorMessage    = document.getElementById('error-message');
  const lobbyCard       = document.getElementById('lobby-card');
  const roomScreen      = document.getElementById('room-screen');
  const roomCodeDisplay = document.getElementById('room-code-display');
  const roomUserCount   = document.getElementById('room-user-count');
  const btnLeaveRoom    = document.getElementById('btn-leave-room');

  // ─── State ───────────────────────────────────────
  let currentRoomCode = null;
  let currentRoomId   = null;
  let isLoading       = false;

  // ─── Cihaz kimliği (anonim, localStorage) ────────
  function getDeviceKey() {
    let key = localStorage.getItem('ft_device_key');
    if (!key) {
      key = 'user_' + crypto.randomUUID();
      localStorage.setItem('ft_device_key', key);
    }
    return key;
  }
  const DEVICE_KEY = getDeviceKey();

  // ═══════════════════════════════════════════════════
  //  ROOM CODE GENERATION
  // ═══════════════════════════════════════════════════

  /**
   * 6 haneli rastgele sayısal oda kodu üretir.
   * Crypto API varsa onu kullanır (daha güvenli random).
   * @returns {string} 6 karakterlik sayısal string
   */
  function generateRoomCode() {
    if (window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      return (array[0] % 1000000).toString().padStart(6, '0');
    }
    return Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  }

  /**
   * Üretilen kodu ekranda animasyonlu şekilde gösterir.
   * @param {string} code - 6 haneli oda kodu
   */
  function displayCode(code) {
    const digits = codeDisplay.querySelectorAll('.code-digit');
    digits.forEach((el, i) => {
      el.textContent = '—';
      el.classList.remove('active');
      setTimeout(() => {
        el.textContent = code[i];
        el.classList.add('active');
      }, 100 + i * 80);
    });
  }

  // ═══════════════════════════════════════════════════
  //  SUPABASE — ODA OLUŞTUR
  // ═══════════════════════════════════════════════════

  /**
   * Oda oluşturur ve Supabase'e kaydeder.
   * Çakışma olursa (unique constraint) yeni kod dener.
   * Maks. 3 deneme yapılır.
   */
  async function createRoom() {
    if (isLoading || !supabaseClient) {
      if (!supabaseClient) showError('Supabase bağlantısı kurulamadı.');
      return;
    }

    setLoading(true, btnCreateRoom);
    hideError();

    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const code = generateRoomCode();

      // expires_at = şimdi + 24 saat
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + CONFIG.ROOM_EXPIRY_HOURS);

      const { data, error } = await supabaseClient
        .from('rooms')
        .insert({
          code: code,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) {
        // 23505 = unique_violation → kod çakışması, tekrar dene
        if (error.code === '23505' && attempt < maxRetries - 1) {
          console.warn(`⚠️ Kod çakışması: ${code}, yeniden deniyor...`);
          continue;
        }
        console.error('❌ Oda oluşturma hatası:', error);
        showError('Oda oluşturulamadı. Lütfen tekrar dene.');
        setLoading(false, btnCreateRoom);
        return;
      }

      // Başarılı!
      currentRoomCode = code;
      currentRoomId = data.id;

      console.log(`🏠 Oda oluşturuldu: ${code} (ID: ${data.id})`);
      showRoomCreated(code);
      setLoading(false, btnCreateRoom);
      return;
    }

    showError('Oda kodu üretilemedi. Lütfen tekrar dene.');
    setLoading(false, btnCreateRoom);
  }

  // ═══════════════════════════════════════════════════
  //  SUPABASE — ODAYA KATIL
  // ═══════════════════════════════════════════════════

  /**
   * Girilen kod ile Supabase'den odayı sorgular.
   * Oda varsa ve expire olmamışsa → oda ekranına geçiş.
   */
  async function joinRoom() {
    const code = inputRoomCode.value.trim();
    if (code.length !== 6 || isLoading || !supabaseClient) {
      if (!supabaseClient) showError('Supabase bağlantısı kurulamadı.');
      return;
    }

    setLoading(true, btnJoinRoom);
    hideError();

    const { data, error } = await supabaseClient
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();

    if (error || !data) {
      console.error('❌ Oda bulunamadı:', error);
      showError('Bu kodla bir oda bulunamadı. Kodu kontrol et.');
      setLoading(false, btnJoinRoom);
      return;
    }

    // Expire kontrolü
    const now = new Date();
    const expiresAt = new Date(data.expires_at);
    if (now > expiresAt) {
      showError('Bu odanın süresi dolmuş. Yeni bir oda oluştur.');
      setLoading(false, btnJoinRoom);
      return;
    }

    // Başarılı!
    currentRoomCode = code;
    currentRoomId = data.id;

    console.log(`🔗 Odaya katıldı: ${code} (ID: ${data.id})`);
    showToast('Odaya bağlanıldı!');
    enterRoomScreen(code);
    setLoading(false, btnJoinRoom);
  }

  // ═══════════════════════════════════════════════════
  //  UI TRANSITIONS
  // ═══════════════════════════════════════════════════

  /**
   * Oda oluşturulduğunda: butonları gizle, kodu göster.
   */
  function showRoomCreated(code) {
    actionsDefault.hidden = true;
    roomCreated.hidden = false;
    displayCode(code);
    updateStatus('Oda oluşturuldu — kodu paylaş', true);
  }

  /**
   * "Geri dön" butonuna basıldığında lobby ekranına döner.
   */
  function showDefaultView() {
    currentRoomCode = null;
    currentRoomId = null;
    actionsDefault.hidden = false;
    roomCreated.hidden = true;
    inputRoomCode.value = '';
    btnJoinRoom.disabled = true;
    hideError();
    updateStatus('Bağlantı bekleniyor', false);
  }

  /**
   * Oda ekranına geçiş — hem oluşturan hem katılan için.
   */
  function enterRoomScreen(code) {
    lobbyCard.hidden = true;
    roomScreen.hidden = false;
    roomCodeDisplay.textContent = code;
    updateStatus('Odada — arkadaşını bekle', true);

    // Timer modülünü başlat
    if (typeof FocusTimer !== 'undefined' && currentRoomId) {
      FocusTimer.init(currentRoomId);
    }

    // Presence modülünü başlat
    if (typeof FocusPresence !== 'undefined' && currentRoomId) {
      FocusPresence.subscribe(currentRoomId, DEVICE_KEY);
    }

    // Chat modülünü başlat
    if (typeof FocusChat !== 'undefined' && currentRoomId) {
      FocusChat.init(currentRoomId, DEVICE_KEY);
    }
  }

  /**
   * Oda ekranından çıkış — lobby'ye dön.
   */
  function leaveRoomScreen() {
    // Timer modülünü durdur
    if (typeof FocusTimer !== 'undefined') {
      FocusTimer.destroy();
    }

    // Presence modülünü durdur
    if (typeof FocusPresence !== 'undefined') {
      FocusPresence.unsubscribe();
    }

    // Chat modülünü durdur
    if (typeof FocusChat !== 'undefined') {
      FocusChat.destroy();
    }

    roomScreen.hidden = true;
    lobbyCard.hidden = false;
    showDefaultView();
    showToast('Odadan ayrıldın');
  }

  /**
   * Status bar'ı günceller.
   */
  function updateStatus(text, connected) {
    statusText.textContent = text;
    statusDot.classList.toggle('connected', connected);
  }

  /**
   * Loading durumunu yönetir.
   */
  function setLoading(loading, btn) {
    isLoading = loading;
    if (btn) {
      btn.disabled = loading;
      btn.classList.toggle('loading', loading);
    }
  }

  /**
   * Hata mesajı gösterir.
   */
  function showError(msg) {
    if (!errorMessage) return;
    errorMessage.textContent = msg;
    errorMessage.hidden = false;
    // 5 saniye sonra otomatik gizle
    setTimeout(() => hideError(), 5000);
  }

  /**
   * Hata mesajını gizler.
   */
  function hideError() {
    if (!errorMessage) return;
    errorMessage.textContent = '';
    errorMessage.hidden = true;
  }

  // ═══════════════════════════════════════════════════
  //  CLIPBOARD
  // ═══════════════════════════════════════════════════

  async function copyCodeToClipboard() {
    if (!currentRoomCode) return;
    try {
      await navigator.clipboard.writeText(currentRoomCode);
      showToast('Kod kopyalandı!');
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = currentRoomCode;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('Kod kopyalandı!');
    }
  }

  /**
   * Toast bildirimi gösterir.
   */
  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    }, 2500);
  }

  // ═══════════════════════════════════════════════════
  //  INPUT VALIDATION
  // ═══════════════════════════════════════════════════

  function handleCodeInput(e) {
    const cleaned = e.target.value.replace(/[^0-9]/g, '');
    e.target.value = cleaned;
    btnJoinRoom.disabled = cleaned.length !== 6;
    if (cleaned.length > 0) hideError();
  }

  // ═══════════════════════════════════════════════════
  //  EVENT LISTENERS
  // ═══════════════════════════════════════════════════

  btnCreateRoom.addEventListener('click', createRoom);
  btnCopyCode.addEventListener('click', copyCodeToClipboard);
  btnBack.addEventListener('click', showDefaultView);
  inputRoomCode.addEventListener('input', handleCodeInput);
  btnJoinRoom.addEventListener('click', joinRoom);
  btnLeaveRoom.addEventListener('click', leaveRoomScreen);

  // Oda oluşturulduktan sonra "Odaya Gir" butonu
  document.getElementById('btn-enter-room').addEventListener('click', () => {
    if (currentRoomCode) {
      enterRoomScreen(currentRoomCode);
    }
  });

  // Enter tuşu ile katılma
  inputRoomCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !btnJoinRoom.disabled) {
      joinRoom();
    }
  });

  // ═══════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════

  if (supabaseClient) {
    console.log('🎯 Focus Together — Adım 3 yüklendi (Senkron Timer)');
    console.log('🔑 Cihaz kimliği:', DEVICE_KEY);
    updateStatus('Supabase bağlı — hazır', true);
  } else {
    console.error('❌ Supabase bağlantısı kurulamadı');
    updateStatus('Bağlantı hatası', false);
  }

})();
