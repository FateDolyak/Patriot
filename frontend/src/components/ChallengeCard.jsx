import { useEffect, useState } from 'react';
import {
  completeChallenge,
  unmarkComplete,
  getPending,
  verifyUser,
} from '../api';

const TYPE_LABELS = {
  honor: 'Honor',
  trivia: 'Trivia',
  peer: 'Witness',
};

function StatusBadge({ status }) {
  if (status === 'complete') return <span className="status-badge complete">✓ Complete</span>;
  if (status === 'pending') return <span className="status-badge pending">⏳ Awaiting witness</span>;
  return <span className="status-badge none">Not started</span>;
}

export default function ChallengeCard({
  challenge,
  status,
  loggedIn,
  expanded,
  onToggle,
  onStatusChange,
  onError,
}) {
  const { challengeId, title, description, points, order, type, history } = challenge;
  const [busy, setBusy] = useState(false);

  // trivia state
  const [answer, setAnswer] = useState('');
  const [triviaMsg, setTriviaMsg] = useState('');

  // peer verification state
  const [pending, setPending] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const loadPending = async () => {
    setLoadingPending(true);
    try {
      const { pending } = await getPending(challengeId);
      setPending(pending);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoadingPending(false);
    }
  };

  // Load the verify-a-friend list when a peer card is opened.
  useEffect(() => {
    if (expanded && loggedIn && type === 'peer') loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, loggedIn, type, status]);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- Honor ----
  const toggleHonor = () =>
    run(async () => {
      if (status === 'complete') {
        await unmarkComplete(challengeId);
        onStatusChange(challengeId, undefined);
      } else {
        const res = await completeChallenge(challengeId);
        onStatusChange(challengeId, res.status);
      }
    });

  // ---- Trivia ----
  const submitTrivia = () =>
    run(async () => {
      setTriviaMsg('');
      const res = await completeChallenge(challengeId, { answer });
      if (res.status === 'complete') {
        onStatusChange(challengeId, 'complete');
        setAnswer('');
      } else {
        setTriviaMsg('Not quite — give it another try.');
      }
    });

  const resetTrivia = () =>
    run(async () => {
      await unmarkComplete(challengeId);
      onStatusChange(challengeId, undefined);
      setTriviaMsg('');
    });

  // ---- Peer ----
  const requestWitness = () =>
    run(async () => {
      const res = await completeChallenge(challengeId);
      onStatusChange(challengeId, res.status); // 'pending'
    });

  const cancelRequest = () =>
    run(async () => {
      await unmarkComplete(challengeId);
      onStatusChange(challengeId, undefined);
    });

  const confirmFriend = (userId) =>
    run(async () => {
      await verifyUser(challengeId, userId);
      await loadPending();
    });

  function renderControl() {
    if (!loggedIn) {
      return <p className="muted small">Sign in to take on this challenge.</p>;
    }

    if (type === 'trivia') {
      if (status === 'complete') {
        return (
          <div className="control-row">
            <span className="solved">Solved ✓</span>
            <button className="link-btn" disabled={busy} onClick={resetTrivia}>
              Reset
            </button>
          </div>
        );
      }
      return (
        <div className="trivia-control">
          <input
            className="field"
            placeholder="Type your answer…"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && answer.trim() && submitTrivia()}
          />
          <button className="btn primary slim" disabled={busy || !answer.trim()} onClick={submitTrivia}>
            {busy ? 'Checking…' : 'Submit answer'}
          </button>
          {triviaMsg && <p className="trivia-msg">{triviaMsg}</p>}
        </div>
      );
    }

    if (type === 'peer') {
      return (
        <div className="peer-control">
          {status === 'complete' && (
            <div className="control-row">
              <span className="solved">Verified ✓</span>
              <button className="link-btn" disabled={busy} onClick={cancelRequest}>
                Undo
              </button>
            </div>
          )}
          {status === 'pending' && (
            <div className="control-row">
              <span className="muted">⏳ Waiting for a fellow guest to verify you…</span>
              <button className="link-btn" disabled={busy} onClick={cancelRequest}>
                Cancel
              </button>
            </div>
          )}
          {!status && (
            <button className="btn primary slim" disabled={busy} onClick={requestWitness}>
              {busy ? 'Requesting…' : 'Request a witness'}
            </button>
          )}

          <div className="verify-box">
            <div className="verify-title">Verify a friend</div>
            {loadingPending ? (
              <p className="muted small">Looking for guests who need a witness…</p>
            ) : pending.length === 0 ? (
              <p className="muted small">No one is waiting for verification right now.</p>
            ) : (
              <ul className="verify-list">
                {pending.map((p) => (
                  <li key={p.userId}>
                    <span>{p.displayName}</span>
                    <button
                      className="btn confirm"
                      disabled={busy}
                      onClick={() => confirmFriend(p.userId)}
                    >
                      Confirm
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    }

    // honor (default)
    return (
      <button
        className={`btn toggle ${status === 'complete' ? 'done' : ''}`}
        disabled={busy}
        onClick={toggleHonor}
      >
        {status === 'complete' ? '✓ Completed' : 'Mark complete'}
      </button>
    );
  }

  const done = status === 'complete';

  return (
    <li className={`acc-item ${done ? 'done' : ''} ${status === 'pending' ? 'pending' : ''}`}>
      <button className="acc-header" onClick={onToggle} aria-expanded={expanded}>
        <span className="challenge-num">{order}</span>
        <span className="acc-title">{title}</span>
        <span className={`type-tag ${type}`}>{TYPE_LABELS[type] || 'Honor'}</span>
        <span className="challenge-points">{points} pts</span>
        <StatusBadge status={status} />
        <span className={`chevron ${expanded ? 'open' : ''}`}>⌄</span>
      </button>

      {expanded && (
        <div className="acc-body">
          <p className="challenge-desc">{description}</p>

          {history && (
            <div className="history-callout">
              <div className="history-head">
                <span className="history-icon">🏛️</span>
                <span className="history-event">{history.event}</span>
                {history.year && <span className="history-year">{history.year}</span>}
              </div>
              <p className="history-summary">{history.summary}</p>
            </div>
          )}

          <div className="control-area">{renderControl()}</div>
        </div>
      )}
    </li>
  );
}
