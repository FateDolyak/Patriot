import { fetchAuthSession } from 'aws-amplify/auth';

const BASE = import.meta.env.VITE_API_URL;

async function authHeader() {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return token ? { Authorization: token } : {};
  } catch {
    return {};
  }
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) Object.assign(headers, await authHeader());

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.message) message = data.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Public
export const getChallenges = () => request('/challenges');
export const getLeaderboard = () => request('/leaderboard');

// Authenticated
export const getMe = () => request('/me', { auth: true });
export const updateDisplayName = (displayName) =>
  request('/me', { method: 'PUT', auth: true, body: { displayName } });
export const getMyCompletions = () => request('/me/completions', { auth: true });

// Complete a challenge. `payload` carries type-specific data, e.g. { answer }
// for trivia. Honor and peer challenges send an empty body.
export const completeChallenge = (challengeId, payload = {}) =>
  request(`/me/completions/${encodeURIComponent(challengeId)}`, {
    method: 'POST',
    auth: true,
    body: payload,
  });
export const unmarkComplete = (challengeId) =>
  request(`/me/completions/${encodeURIComponent(challengeId)}`, { method: 'DELETE', auth: true });

// Peer verification
export const getPending = (challengeId) =>
  request(`/challenges/${encodeURIComponent(challengeId)}/pending`, { auth: true });
export const verifyUser = (challengeId, userId) =>
  request(
    `/challenges/${encodeURIComponent(challengeId)}/verify/${encodeURIComponent(userId)}`,
    { method: 'POST', auth: true }
  );
