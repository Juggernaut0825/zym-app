import { AuthPayload } from './types';

const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_ID_KEY = 'userId';
const USERNAME_KEY = 'username';
const COACH_KEY = 'selectedCoach';

export function getAuth(): AuthPayload | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem(TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  const userId = Number(localStorage.getItem(USER_ID_KEY));
  const username = localStorage.getItem(USERNAME_KEY) || '';
  const rawCoach = String(localStorage.getItem(COACH_KEY) || '').trim().toLowerCase();
  const selectedCoach = rawCoach === 'zj' || rawCoach === 'lc' ? rawCoach : null;

  if (!token || !refreshToken || !Number.isInteger(userId) || userId <= 0) return null;
  return { token, refreshToken, userId, username, selectedCoach };
}

export function setAuth(payload: AuthPayload): void {
  const existingCoach = String(localStorage.getItem(COACH_KEY) || '').trim().toLowerCase();
  const fallbackCoach = existingCoach === 'zj' || existingCoach === 'lc' ? existingCoach : null;
  localStorage.setItem(TOKEN_KEY, payload.token);
  localStorage.setItem(REFRESH_TOKEN_KEY, payload.refreshToken);
  localStorage.setItem(USER_ID_KEY, String(payload.userId));
  localStorage.setItem(USERNAME_KEY, payload.username);
  if (payload.selectedCoach === 'zj' || payload.selectedCoach === 'lc') {
    localStorage.setItem(COACH_KEY, payload.selectedCoach);
  } else if (fallbackCoach) {
    localStorage.setItem(COACH_KEY, fallbackCoach);
  } else {
    localStorage.removeItem(COACH_KEY);
  }
}

export function setAuthTokens(token: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function setCoach(coach: 'zj' | 'lc'): void {
  localStorage.setItem(COACH_KEY, coach);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(COACH_KEY);
}
