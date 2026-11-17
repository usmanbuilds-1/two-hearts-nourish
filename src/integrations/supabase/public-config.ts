/**
 * Public Supabase project configuration.
 *
 * The project URL and publishable key are intentionally safe to expose in a browser
 * application. They are not authorization secrets; RLS and server-only credentials
 * remain the security boundary.
 *
 * Keep runtime env support so deployments can override these values, but retain
 * known-good fallbacks so a Lovable/Vite build cannot ship with an undefined URL.
 */
export const PUBLIC_SUPABASE_URL = "https://dvudxkpfiiiviongkhcc.supabase.co";
export const PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Mx0sEbLHtng8_PfrvgQi_w_jRncfiqY";

export function browserSupabaseConfig() {
  return {
    url:
      import.meta.env["VITE_SUPABASE_URL"] ||
      process.env["SUPABASE_URL"] ||
      PUBLIC_SUPABASE_URL,
    publishableKey:
      import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
      process.env["SUPABASE_PUBLISHABLE_KEY"] ||
      PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function serverSupabaseUrl() {
  return process.env["SUPABASE_URL"] || PUBLIC_SUPABASE_URL;
}
