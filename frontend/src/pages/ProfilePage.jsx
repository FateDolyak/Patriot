import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import Login from '../components/Login';
import { getMe, updateDisplayName } from '../api';

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMe()
      .then((p) => {
        setProfile(p);
        setDisplayName(p.displayName || '');
      })
      .catch((err) => setError(err.message));
  }, [user]);

  const save = async () => {
    setError('');
    setStatus('');
    setBusy(true);
    try {
      const updated = await updateDisplayName(displayName.trim());
      setProfile((p) => ({ ...p, displayName: updated.displayName }));
      setStatus('Saved!');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) return <p className="muted center">Loading…</p>;

  if (!user) {
    return (
      <div className="page-panel">
        <p className="muted center">Sign in to view your profile.</p>
        <Login />
      </div>
    );
  }

  return (
    <div className="profile page-panel">
      <h2 className="page-title">Your Profile</h2>
      {error && <div className="error-banner">{error}</div>}
      {status && <div className="success-banner">{status}</div>}

      <label className="label">Display name</label>
      <p className="muted small">This is how you appear on the leaderboard.</p>
      <input
        className="field"
        maxLength={40}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="e.g. Minuteman Mike"
      />
      <button className="btn primary" disabled={busy || !displayName.trim()} onClick={save}>
        {busy ? 'Saving…' : 'Save'}
      </button>

      {profile && (
        <p className="muted small account-email">Account: {profile.email}</p>
      )}
    </div>
  );
}
