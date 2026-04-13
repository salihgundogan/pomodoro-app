/* ═══════════════════════════════════════════════════
   FOCUS TOGETHER — Supabase Configuration
   ═══════════════════════════════════════════════════
   
   Supabase anon key PUBLIC bir anahtardır.
   Güvenlik Row Level Security (RLS) ile sağlanır.
   
   Production'da Netlify Environment Variables
   üzerinden yönetilir.
   ═══════════════════════════════════════════════════ */

const CONFIG = {
  SUPABASE_URL:      'https://oxuutvrfexoyxoyzfior.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94dXV0dnJmZXhveXhveXpmaW9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTU4NTksImV4cCI6MjA5MTY3MTg1OX0.7uhlDFQlX0neeO1YIKAKa_NgBDqVeNTMHSIxbW-qdT8',

  // Oda ayarları
  ROOM_EXPIRY_HOURS: 24,  // Oda kaç saat sonra expire olur
};

/**
 * Supabase client'ını başlatır.
 */
function initSupabase() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    console.error(
      '❌ Supabase anahtarları tanımlı değil. ' +
      'js/config.js dosyasını kontrol et.'
    );
    return null;
  }

  const { createClient } = supabase;
  return createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

// Global Supabase client
const supabaseClient = initSupabase();
