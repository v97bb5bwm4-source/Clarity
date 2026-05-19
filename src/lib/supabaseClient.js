import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const hasSupabaseUrl = Boolean(
  supabaseUrl && supabaseUrl !== "https://your-project-ref.supabase.co",
);
const hasSupabaseAnonKey = Boolean(
  supabaseAnonKey && supabaseAnonKey !== "your-supabase-anon-key",
);

export const isSupabaseConfigured = hasSupabaseUrl && hasSupabaseAnonKey;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
