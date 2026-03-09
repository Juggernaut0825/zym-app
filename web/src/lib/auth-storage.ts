import { AuthPayload } from './types';

const TOKEN_KEY = 'token';
const USER_ID_KEY = 'userId';
const USERNAME_KEY = 'username';
const COACH_KEY = 'selectedCoach';

export function getAuth(): AuthPayload | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem(TOKEN_KEY);
  const userId = Number(localStorage.getItem(USER_ID_KEY));
  const username = localStorage.getItem(USERNAME_KEY) || '';
  const selectedCoach = (localStorage.getItem(COACH_KEY) || 'zj') as 'zj' | 'lc';

  if (!token || !Number.isInteger(userId) || userId <= 0) return null;
  return { token, userId, username, selectedCoach };
}

export function setAuth(payload: AuthPayload): void {
  localStorage.setItem(TOKEN_KEY, payload.token);
  localStorage.setItem(USER_ID_KEY, String(payload.userId));
  localStorage.setItem(USERNAME_KEY, payload.username);
  localStorage.setItem(COACH_KEY, payload.selectedCoach);
}

export function setCoach(coach: 'zj' | 'lc'): void {
  localStorage.setItem(COACH_KEY, coach);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(COACH_KEY);
}
