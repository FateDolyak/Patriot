import { useEffect, useState } from 'react';
import { getLeaderboard } from '../api';

export default function LeaderboardPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getLeaderboard()
      .then(({ leaderboard }) => setRows(leaderboard))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted center">Tallying the scores…</p>;

  return (
    <div className="page-panel">
      <h2 className="page-title">Leaderboard</h2>
      {error && <div className="error-banner">{error}</div>}
      {rows.length === 0 ? (
        <p className="muted center">
          No completions yet. Be the first to blaze the Trail!
        </p>
      ) : (
        <table className="leaderboard">
          <thead>
            <tr>
              <th>#</th>
              <th>Patriot</th>
              <th>Done</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rank} className={r.rank <= 3 ? `top top-${r.rank}` : ''}>
                <td className="rank">
                  {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}
                </td>
                <td>{r.displayName}</td>
                <td>{r.completed}</td>
                <td className="pts">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
