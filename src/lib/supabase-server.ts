import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side client for reading session from cookie in server components / route handlers
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('sb-access-token')?.value;

  const client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });

  return client;
}

export async function getServerSession() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('sb-access-token')?.value;
  const refreshToken = cookieStore.get('sb-refresh-token')?.value;

  if (!accessToken) return null;

  const client = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken ?? '',
  });

  if (error || !data.session) return null;
  return data.session;
}
