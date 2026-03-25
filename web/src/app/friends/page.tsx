'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptFriend, addFriend, getFriendConnectCode, getFriendRequests, searchUsers } from '@/lib/api';
import { getAuth } from '@/lib/auth-storage';

interface User {
  id: number;
  username: string;
}

export default function FriendsPage() {
  const router = useRouter();
  const [authUserId, setAuthUserId] = useState(0);
  const [connectCode, setConnectCode] = useState('');
  const [connectId, setConnectId] = useState('');
  const [connectCodeMeta, setConnectCodeMeta] = useState('Share this code with friends to connect.');
  const [friendQuery, setFriendQuery] = useState('');
  const [friendSearchResult, setFriendSearchResult] = useState<User[]>([]);
  const [requests, setRequests] = useState<User[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function loadConnectInfo() {
    if (!authUserId) return;
    try {
      const info = await getFriendConnectCode(authUserId);
      setConnectCode(info.connectCode);
      setConnectId(info.connectId);
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
          <button className="btn btn-ghost" type="button" onClick={() => router.back()}>
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
              <p className="mt-2 text-2xl font-bold tracking-[0.18em] text-slate-900">{connectId || '------'}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{connectCodeMeta}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (!connectCode) return;
                    void navigator.clipboard.writeText(connectCode);
                    setNotice('Connect code copied.');
                    setTimeout(() => setNotice(''), 3000);
                  }}
                >
                  Copy code
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void loadConnectInfo()}>
                  Refresh
                </button>
              </div>
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
