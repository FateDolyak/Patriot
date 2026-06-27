import { useState } from 'react';
import {
  signIn,
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signInWithRedirect,
} from 'aws-amplify/auth';
import { SOCIAL_LOGIN_ENABLED } from '../amplify';
import { useAuth } from '../auth';

const MODES = { SIGN_IN: 'sign_in', SIGN_UP: 'sign_up', CONFIRM: 'confirm' };

export default function Login() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState(MODES.SIGN_IN);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = () =>
    run(async () => {
      await signIn({ username: email, password });
      await refresh();
    });

  const handleSignUp = () =>
    run(async () => {
      await signUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      });
      setMode(MODES.CONFIRM);
    });

  const handleConfirm = () =>
    run(async () => {
      await confirmSignUp({ username: email, confirmationCode: code });
      await signIn({ username: email, password });
      await refresh();
    });

  const handleGoogle = () => run(() => signInWithRedirect({ provider: 'Google' }));

  return (
    <div className="auth-card">
      <h2 className="auth-title">
        {mode === MODES.SIGN_IN && 'Welcome back, patriot'}
        {mode === MODES.SIGN_UP && 'Join the Trail'}
        {mode === MODES.CONFIRM && 'Check your email'}
      </h2>

      {error && <div className="error-banner">{error}</div>}

      {mode === MODES.CONFIRM ? (
        <>
          <p className="muted">
            We sent a verification code to <strong>{email}</strong>.
          </p>
          <input
            className="field"
            placeholder="Verification code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn primary" disabled={busy} onClick={handleConfirm}>
            {busy ? 'Verifying…' : 'Verify & enter'}
          </button>
          <button
            className="link-btn"
            disabled={busy}
            onClick={() => run(() => resendSignUpCode({ username: email }))}
          >
            Resend code
          </button>
        </>
      ) : (
        <>
          <input
            className="field"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="field"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {mode === MODES.SIGN_IN ? (
            <button className="btn primary" disabled={busy} onClick={handleSignIn}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          ) : (
            <button className="btn primary" disabled={busy} onClick={handleSignUp}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
          )}

          {SOCIAL_LOGIN_ENABLED && (
            <>
              <div className="divider">or</div>
              <button className="btn google" disabled={busy} onClick={handleGoogle}>
                Continue with Google
              </button>
            </>
          )}

          <p className="muted switch">
            {mode === MODES.SIGN_IN ? (
              <>
                New here?{' '}
                <button className="link-btn" onClick={() => setMode(MODES.SIGN_UP)}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button className="link-btn" onClick={() => setMode(MODES.SIGN_IN)}>
                  Sign in
                </button>
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
