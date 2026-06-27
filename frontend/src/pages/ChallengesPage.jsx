import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth';
import Login from '../components/Login';
import ChallengeCard from '../components/ChallengeCard';
import { getChallenges, getMyCompletions } from '../api';

export default function ChallengesPage() {
  const { user, loading: authLoading } = useAuth();
  const [challenges, setChallenges] = useState([]);
  const [statusMap, setStatusMap] = useState({}); // challengeId -> 'complete' | 'pending'
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const { challenges } = await getChallenges();
      setChallenges(challenges);
      if (user) {
        const { completed } = await getMyCompletions();
        const map = {};
        completed.forEach((c) => {
          map[c.challengeId] = c.status;
        });
        setStatusMap(map);
      } else {
        setStatusMap({});
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const handleStatusChange = (challengeId, status) => {
    setStatusMap((prev) => {
      const next = { ...prev };
      if (status) next[challengeId] = status;
      else delete next[challengeId];
      return next;
    });
  };

  if (loading || authLoading) return <p className="muted center">Loading the Trail...</p>;

  const completeCount = Object.values(statusMap).filter((s) => s === 'complete').length;
  const total = challenges.length;
  const pct = total ? Math.round((completeCount / total) * 100) : 0;
  const earnedPoints = challenges
    .filter((c) => statusMap[c.challengeId] === 'complete')
    .reduce((s, c) => s + (c.points || 0), 0);

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      {!user && (
        <section className="signin-prompt">
          <p className="muted">
            Sign in to take on the challenges and join the leaderboard. You can expand any
            challenge below to read its history first.
          </p>
          <Login />
        </section>
      )}

      {user && (
        <section className="progress-card">
          <div className="progress-top">
            <span>
              <strong>{completeCount}</strong> / {total} complete
            </span>
            <span className="points-pill">{earnedPoints} pts</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          {completeCount === total && total > 0 && (
            <p className="finale">🎆 You finished the Freedom Trail! 🎆</p>
          )}
        </section>
      )}

      <ul className="accordion">
        {challenges.map((c) => (
          <ChallengeCard
            key={c.challengeId}
            challenge={c}
            status={statusMap[c.challengeId]}
            loggedIn={Boolean(user)}
            expanded={expandedId === c.challengeId}
            onToggle={() =>
              setExpandedId((prev) => (prev === c.challengeId ? null : c.challengeId))
            }
            onStatusChange={handleStatusChange}
            onError={setError}
          />
        ))}
      </ul>
    </div>
  );
}
