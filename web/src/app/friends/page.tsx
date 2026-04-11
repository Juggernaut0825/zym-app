'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  acceptFriend,
  addFriend,
  getFriendConnectCode,
  getFriendRequests,
  getUserPublic,
  resolveFriendConnectCode,
  searchUsers,
} from '@/lib/api';
import { getAuth } from '@/lib/auth-storage';
import { PublicUser } from '@/lib/types';

interface User {
  id: number;
  username: string;
}

export default function FriendsPage() {
  const router = useRouter();
  const returnToCommunityUrl = '/app?tab=community&welcome=done';
  const [authUserId, setAuthUserId] = useState(0);
  const [connectCode, setConnectCode] = useState('');
  const [connectId, setConnectId] = useState('');
  const [connectExpiresAt, setConnectExpiresAt] = useState('');
  const [friendQuery, setFriendQuery] = useState('');
  const [friendSearchResult, setFriendSearchResult] = useState<User[]>([]);
  const [requests, setRequests] = useState<User[]>([]);
  const [connectLookupInput, setConnectLookupInput] = useState('');
  const [connectLookupPending, setConnectLookupPending] = useState(false);
  const [connectLookupPreview, setConnectLookupPreview] = useState<PublicUser | null>(null);
  const [connectLookupError, setConnectLookupError] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const connectCodeMeta = useMemo(() => {
    if (!connectExpiresAt) {
      return 'Share this rotating code with a friend. It refreshes every 2 minutes.';
    }
    const formatted = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(connectExpiresAt));
    return `Share this rotating code with a friend. It refreshes every 2 minutes and is valid until ${formatted}.`;
  }, [connectExpiresAt]);

  async function loadConnectInfo() {
    if (!authUserId) return;
    try {
      const info = await getFriendConnectCode(authUserId);
      setConnectCode(info.connectCode);
      setConnectId(info.connectId);
      setConnectExpiresAt(info.expiresAt || '');
    } catch (err: any) {
      setError(err?.message || 'Failed to load connect info.');
    }
  }

  async function loadRequests() {
    if (!authUserId) return;
    try {
      const result = await getFriendRequests(authUserId);
      setRequests(result.requests);
    } catch (err: any) {
      setError(err?.message || 'Failed to load friend requests.');
    }
  }

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace('/login');
      return;
    }
    setAuthUserId(auth.userId);
  }, [router]);

  useEffect(() => {
    if (!authUserId) return;
    void loadConnectInfo();
    void loadRequests();
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return undefined;
    const timer = window.setInterval(() => {
      void loadConnectInfo();
    }, 110_000);
    return () => window.clearInterval(timer);
  }, [authUserId]);

  useEffect(() => {
    const query = friendQuery.trim();
    if (!query) {
      setFriendSearchResult([]);
      return;
    }
    let cancelled = false;
    void searchUsers(query).then((result) => {
      if (!cancelled) setFriendSearchResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [friendQuery]);

  useEffect(() => {
    const code = connectLookupInput.trim();
    if (!code) {
      setConnectLookupPreview(null);
      setConnectLookupError('');
      setConnectLookupPending(false);
      return;
    }
    if (code.length < 6) {
      setConnectLookupPreview(null);
      setConnectLookupError('');
      setConnectLookupPending(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setConnectLookupPending(true);
          setConnectLookupError('');
          const resolved = await resolveFriendConnectCode(code);
          const user = await getUserPublic(resolved.userId);
          if (cancelled) return;
          setConnectLookupPreview(user);
          if (Number(user.id) === authUserId) {
            setConnectLookupError('That is your own connect code.');
          }
        } catch (err: any) {
          if (cancelled) return;
          setConnectLookupPreview(null);
          setConnectLookupError(err?.message || 'Connect code not found.');
        } finally {
          if (!cancelled) {
            setConnectLookupPending(false);
          }
        }
      })();
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [connectLookupInput, authUserId]);

  async function handleAddFriend(user: User) {
    if (!authUserId) return;
    try {
      await addFriend({ userId: authUserId, friendId: user.id });
      setNotice(`Friend request sent to ${user.username}.`);
      setTimeout(() => setNotice(''), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to send friend request.');
      setTimeout(() => setError(''), 3000);
    }
  }

  async function handleAddByConnectCode() {
    const code = connectLookupInput.trim();
    if (!authUserId || !code) return;
    if (connectLookupPreview?.id === authUserId) {
      setConnectLookupError('You cannot add yourself.');
      return;
    }

    try {
      setConnectLookupPending(true);
      await addFriend({ userId: authUserId, connectCode: code });
      setNotice(`Friend request sent to ${connectLookupPreview?.username || 'that user'}.`);
      setConnectLookupInput('');
      setConnectLookupPreview(null);
      setConnectLookupError('');
      setTimeout(() => setNotice(''), 3000);
    } catch (err: any) {
      setConnectLookupError(err?.message || 'Failed to send friend request.');
      setTimeout(() => setConnectLookupError(''), 3000);
    } finally {
      setConnectLookupPending(false);
    }
  }

  async function handleAcceptFriend(friendId: number) {
    if (!authUserId) return;
    try {
      await acceptFriend(authUserId, friendId);
      setNotice('Friend request accepted.');
      setTimeout(() => setNotice(''), 3000);
      await loadRequests();
    } catch (err: any) {
      setError(err?.message || 'Failed to accept friend request.');
      setTimeout(() => setError(''), 3000);
    }
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-slate-50 via-blue-50/30 to-orange-50/20 px-4 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-4">
          <button className="btn btn-ghost" type="button" onClick={() => router.replace(returnToCommunityUrl)}>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-2xl font-bold text-slate-900">Friends</h1>
        </div>

        {notice && <div className="mb-4 rounded-2xl bg-green-50 p-4 text-sm text-green-700">{notice}</div>}
        {error && <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <div className="grid gap-5">
          <section className="rounded-[28px] border border-white/70 bg-white/45 p-5 backdrop-blur-xl">
            <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">Your Connect ID</h2>
            <div className="mt-4 rounded-[22px] border border-[rgba(105,121,247,0.12)] bg-[rgba(105,121,247,0.06)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--coach-zj)]">Connect Code</p>
              <p className="mt-2 text-2xl font-bold tracking-[0.18em] text-slate-900">{connectId || '--------'}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{connectCodeMeta}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (!connectId) return;
                    void navigator.clipboard.writeText(connectId);
                    setNotice('Connect code copied.');
                    setTimeout(() => setNotice(''), 3000);
                  }}
                >
                  Copy code
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (!connectCode) return;
                    void navigator.clipboard.writeText(connectCode);
                    setNotice('Invite link copied.');
                    setTimeout(() => setNotice(''), 3000);
                  }}
                >
                  Copy link
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void loadConnectInfo()}>
                  Refresh
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/70 bg-white/45 p-5 backdrop-blur-xl">
            <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">Add By Connect Code</h2>
            <div className="mt-4">
              <input
                className="input-shell"
                value={connectLookupInput}
                onChange={(event) => setConnectLookupInput(event.target.value)}
                placeholder="Paste a friend's connect code"
              />
              {connectLookupError ? <p className="mt-3 text-sm text-red-600">{connectLookupError}</p> : null}
              {connectLookupPending ? <p className="mt-3 text-sm text-slate-500">Looking up connect code...</p> : null}
              {connectLookupPreview ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/65 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{connectLookupPreview.username}</p>
                    <p className="text-xs text-slate-500">
                      {connectLookupPreview.id === authUserId
                        ? 'This is your own account.'
                        : 'Ready to send a friend request'}
                    </p>
                  </div>
                  <button
                    className="btn btn-zj"
                    type="button"
                    disabled={connectLookupPreview.id === authUserId || connectLookupPending}
                    onClick={() => void handleAddByConnectCode()}
                  >
                    {connectLookupPending ? 'Sending...' : 'Add'}
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/70 bg-white/45 p-5 backdrop-blur-xl">
            <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">Search People</h2>
            <div className="mt-4">
              <input
                className="input-shell"
                value={friendQuery}
                onChange={(event) => setFriendQuery(event.target.value)}
                placeholder="Search people by username"
              />
              <div className="mt-3 space-y-2">
                {friendSearchResult.slice(0, 10).map((user) => (
                  <div key={user.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/65 px-3 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{user.username}</p>
                      <p className="text-xs text-slate-500">ID: {user.id}</p>
                    </div>
                    <button className="btn btn-zj" type="button" onClick={() => void handleAddFriend(user)}>
                      Add
                    </button>
                  </div>
                ))}
                {friendQuery.trim() && friendSearchResult.length === 0 ? (
                  <p className="text-sm text-slate-500">No matching users.</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/70 bg-white/45 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">Pending Requests</h2>
              <span className="text-xs font-semibold text-slate-400">{requests.length}</span>
            </div>
            <div className="mt-4 space-y-3">
              {requests.length === 0 ? <p className="text-sm text-slate-500">No pending requests right now.</p> : null}
              {requests.map((friend) => (
                <div key={friend.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/65 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{friend.username}</p>
                    <p className="text-xs text-slate-500">Unlock DM and profile sharing</p>
                  </div>
                  <button className="btn btn-zj" type="button" onClick={() => void handleAcceptFriend(friend.id)}>
                    Accept
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
