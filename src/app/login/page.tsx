'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('error')
      : null
  );

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/api/auth/callback`;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        scopes: 'openid email profile',
        queryParams: {
          // Restrict to institutional domain if configured
          ...(process.env.NEXT_PUBLIC_ALLOWED_DOMAIN
            ? { hd: process.env.NEXT_PUBLIC_ALLOWED_DOMAIN }
            : {}),
        },
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
    // On success Supabase redirects the browser — no need to setLoading(false)
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img
          src="/hucm_logo.png"
          alt="HUCM Seal"
          style={{ width: 72, height: 72, objectFit: 'contain', marginBottom: 16 }}
        />
        <h1 style={styles.title}>Impact Dashboard</h1>
        <p style={styles.subtitle}>
          Howard University College of Medicine
          <br />
          Office of Faculty Development &amp; JEDI
        </p>

        <hr style={styles.divider} />

        <p style={styles.prompt}>Sign in with your institutional Google account to continue.</p>

        {error && (
          <div style={styles.errorBox}>
            {errorMessages[error] ?? `Authentication error: ${error}`}
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{ ...styles.googleBtn, opacity: loading ? 0.7 : 1 }}
        >
          <GoogleIcon />
          {loading ? 'Redirecting…' : 'Sign in with Google'}
        </button>

        <p style={styles.note}>
          Access is restricted to authorized faculty and administrators.
        </p>
      </div>
    </div>
  );
}

const errorMessages: Record<string, string> = {
  missing_code: 'The authentication flow was interrupted. Please try again.',
  auth_failed: 'Could not verify your identity. Please try again.',
  access_denied: 'Access was denied. Please use an authorized account.',
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #065e68 0%, #097C87 60%, #1aabba 100%)',
    padding: '24px',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '40px 36px',
    maxWidth: 420,
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#0d2e32',
    fontFamily: '"Garamond", "EB Garamond", serif',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: '0.8rem',
    color: '#5a8a8f',
    lineHeight: 1.6,
  },
  divider: {
    border: 'none',
    borderTop: '1px solid #d4eaec',
    margin: '20px 0',
  },
  prompt: {
    fontSize: '0.85rem',
    color: '#0d2e32',
    marginBottom: 20,
  },
  errorBox: {
    background: '#fff0f0',
    border: '1px solid #f5c6cb',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: '0.8rem',
    color: '#721c24',
    marginBottom: 16,
    textAlign: 'left',
  },
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    padding: '12px 20px',
    border: '1px solid #dadce0',
    borderRadius: 8,
    background: '#fff',
    color: '#3c4043',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s, box-shadow 0.15s',
  },
  note: {
    marginTop: 20,
    fontSize: '0.72rem',
    color: '#5a8a8f',
  },
};
