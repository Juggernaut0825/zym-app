'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  acceptFriend,
  addFriend,
  getFriendConnectCode,
  getFriendRequests,
  getNearbyUsers,
  getPublicProfile,
  getStoredLocation,
  getUserPublic,
  openDM,
  resolveFriendConnectCode,
  reverseLocation,
  searchUsers,
  searchLocations,
  updateStoredLocation,
} from '@/lib/api';
import { getAuth } from '@/lib/auth-storage';
import { resolveApiAssetUrl } from '@/lib/config';
import { LocationSelection, NearbyUser, PublicProfileResponse, PublicUser, StoredUserLocation } from '@/lib/types';

interface User {
  id: number;
  username: string;
}

function formatNearbyDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.max(100, Math.round(distanceKm * 1000))} m`;
  }
  return distanceKm >= 10 ? `${Math.round(distanceKm)} km` : `${distanceKm.toFixed(1)} km`;
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
  const [sharedLocation, setSharedLocation] = useState<StoredUserLocation | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [nearbyUsersLoading, setNearbyUsersLoading] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [locationSearchResults, setLocationSearchResults] = useState<LocationSelection[]>([]);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [locationPickerPending, setLocationPickerPending] = useState(false);
  const [nearbyProfileOpen, setNearbyProfileOpen] = useState(false);
  const [nearbyProfileLoading, setNearbyProfileLoading] = useState(false);
  const [nearbyProfileActionPending, setNearbyProfileActionPending] = useState(false);
  const [nearbyProfile, setNearbyProfile] = useState<PublicProfileResponse | null>(null);
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

  async function loadSharedLocation(userId = authUserId) {
    if (!userId) return;
    try {
      const location = await getStoredLocation(userId);
      setSharedLocation(location);
    } catch (err: any) {
      setError(err?.message || 'Failed to load nearby settings.');
    }
  }

  async function loadNearby(userId = authUserId) {
    if (!userId) return;
    try {
      setNearbyUsersLoading(true);
      const users = await getNearbyUsers(userId);
      setNearbyUsers(users);
    } catch (err: any) {
      setError(err?.message || 'Failed to load nearby users.');
    } finally {
      setNearbyUsersLoading(false);
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
    void loadSharedLocation();
    void loadNearby();
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return undefined;
    const timer = window.setInterval(() => {
      void loadConnectInfo();
    }, 110_000);
    return () => window.clearInterval(timer);
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId || !sharedLocation?.shared) return undefined;
    const timer = window.setInterval(() => {
      void loadNearby(authUserId);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [authUserId, sharedLocation?.shared]);

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
    const query = locationSearchQuery.trim();
    if (query.length < 2) {
      setLocationSearchResults([]);
      setLocationSearchLoading(false);
      return;
    }

    let cancelled = false;
    setLocationSearchLoading(true);
    const timer = window.setTimeout(() => {
      void searchLocations(query)
        .then((results) => {
          if (!cancelled) setLocationSearchResults(results);
        })
        .catch((err: any) => {
          if (!cancelled) setError(err?.message || 'Failed to search locations.');
        })
        .finally(() => {
          if (!cancelled) setLocationSearchLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [locationSearchQuery]);

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

  async function applyLocationSelection(selection: LocationSelection) {
    if (!authUserId) return;
    try {
      setLocationPickerPending(true);
      const stored = await updateStoredLocation({
        userId: authUserId,
        location: selection,
        locationShared: true,
      });
      setSharedLocation(stored);
      setLocationPickerOpen(false);
      setLocationSearchQuery('');
      setLocationSearchResults([]);
      setNotice(`Nearby uses ${selection.label}.`);
      setTimeout(() => setNotice(''), 2500);
      await loadNearby(authUserId);
    } catch (err: any) {
      setError(err?.message || 'Failed to save nearby location.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLocationPickerPending(false);
    }
  }

  async function handleDisableNearby() {
    if (!authUserId) return;
    try {
      setLocationPickerPending(true);
      await updateStoredLocation({ userId: authUserId, location: null, locationShared: false });
      setSharedLocation(null);
      setNearbyUsers([]);
      setLocationPickerOpen(false);
      setNotice('Nearby turned off.');
      setTimeout(() => setNotice(''), 2500);
    } catch (err: any) {
      setError(err?.message || 'Failed to turn off nearby.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLocationPickerPending(false);
    }
  }

  async function handleUseBrowserLocation(precision: 'city' | 'precise') {
    if (!navigator.geolocation) {
      setError('Location is not available in this browser.');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setLocationPickerPending(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await reverseLocation(position.coords.latitude, position.coords.longitude);
          const selection = precision === 'precise' ? result.precise : result.city;
          if (!selection) {
            throw new Error('Could not resolve this location.');
          }
          await applyLocationSelection(selection);
        } catch (err: any) {
          setError(err?.message || 'Failed to use your location.');
          setTimeout(() => setError(''), 3000);
          setLocationPickerPending(false);
        }
      },
      (geoError) => {
        setLocationPickerPending(false);
        const message = geoError.code === geoError.PERMISSION_DENIED
          ? 'Location permission was denied.'
          : 'Failed to read your location.';
        setError(message);
        setTimeout(() => setError(''), 3000);
      },
      {
        enableHighAccuracy: precision === 'precise',
        timeout: 10_000,
      },
    );
  }

  async function openNearbyProfile(user: NearbyUser) {
    try {
      setNearbyProfileOpen(true);
      setNearbyProfileLoading(true);
      setNearbyProfileActionPending(false);
      setNearbyProfile(null);
      const profile = await getPublicProfile(user.id);
      setNearbyProfile(profile);
    } catch (err: any) {
      setNearbyProfileOpen(false);
      setError(err?.message || 'Failed to load profile.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setNearbyProfileLoading(false);
    }
  }

  function closeNearbyProfile() {
    setNearbyProfileOpen(false);
    setNearbyProfileLoading(false);
    setNearbyProfileActionPending(false);
    setNearbyProfile(null);
  }

  function nearbyProfilePrimaryActionLabel(): string | null {
    const status = nearbyProfile?.friendship_status;
    const targetUserId = nearbyProfile?.profile?.id || 0;
    if (!status || !targetUserId || targetUserId === authUserId) return null;
    if (status === 'accepted') return 'Send Message';
    if (status === 'none') return 'Add as Friend';
    if (status === 'pending') return 'Pending';
    return null;
  }

  function nearbyProfilePrimaryActionEnabled(): boolean {
    const status = nearbyProfile?.friendship_status;
    const targetUserId = nearbyProfile?.profile?.id || 0;
    if (!status || !targetUserId || targetUserId === authUserId || nearbyProfileActionPending) return false;
    return status === 'accepted' || status === 'none';
  }

  async function handleNearbyProfilePrimaryAction() {
    const targetUserId = nearbyProfile?.profile?.id || 0;
    const targetUsername = nearbyProfile?.profile?.username || 'that user';
    const status = nearbyProfile?.friendship_status;
    if (!authUserId || !targetUserId || !status || nearbyProfileActionPending) return;

    try {
      setNearbyProfileActionPending(true);
      if (status === 'accepted') {
        const topic = await openDM(authUserId, targetUserId);
        router.push(`/app?tab=messages&topic=${encodeURIComponent(topic)}`);
        return;
      }

      if (status === 'none') {
        await addFriend({ userId: authUserId, friendId: targetUserId });
        setNearbyUsers((prev) => prev.map((item) => (
          item.id === targetUserId ? { ...item, friendship_status: 'pending' } : item
        )));
        setNearbyProfile((prev) => (
          prev
            ? {
              ...prev,
              friendship_status: 'pending',
              isFriend: false,
            }
            : prev
        ));
        setNotice(`Friend request sent to ${targetUsername}.`);
        setTimeout(() => setNotice(''), 2500);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update this profile.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setNearbyProfileActionPending(false);
    }
  }

  return (
    <main className="min-h-dvh bg-white px-4 py-6">
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
          <section className="rounded-[28px] bg-slate-50/80 p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">Your Connect ID</h2>
            <div className="mt-4 rounded-[22px] bg-white px-4 py-4">
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

          <section className="rounded-[28px] bg-slate-50/80 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">Nearby</h2>
                <p className="mt-2 text-sm font-semibold text-slate-900">{sharedLocation?.label || 'Location off'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-full bg-white text-slate-500 transition hover:text-slate-900"
                  onClick={() => void loadNearby()}
                  disabled={nearbyUsersLoading || !sharedLocation?.shared}
                  aria-label="Refresh nearby users"
                >
                  <span className={`material-symbols-outlined ${nearbyUsersLoading ? 'animate-spin' : ''}`} style={{ fontSize: 18 }}>
                    autorenew
                  </span>
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setLocationPickerOpen(true)}>
                  {sharedLocation?.shared ? 'Manage' : 'Enable'}
                </button>
              </div>
            </div>

            <div className="mt-4">
              {!sharedLocation?.shared ? (
                <p className="text-sm text-slate-500">No nearby users</p>
              ) : null}
              {sharedLocation?.shared && nearbyUsersLoading && nearbyUsers.length === 0 ? (
                <p className="text-sm text-slate-500">Loading nearby users...</p>
              ) : null}
              {sharedLocation?.shared && !nearbyUsersLoading && nearbyUsers.length === 0 ? (
                <p className="text-sm text-slate-500">No nearby users</p>
              ) : null}
              {nearbyUsers.length > 0 ? (
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
                  {nearbyUsers.slice(0, 8).map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="group text-left"
                      onClick={() => void openNearbyProfile(user)}
                    >
                      <div className="overflow-hidden rounded-[20px] bg-white shadow-[0_14px_30px_rgba(15,23,42,0.06)] transition group-hover:-translate-y-0.5">
                        <div className="aspect-square w-full bg-slate-100">
                          {user.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveApiAssetUrl(user.avatar_url)}
                              alt={user.username}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-lg font-bold text-slate-700">
                              {user.username.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 truncate text-xs font-semibold text-slate-900">{user.username}</p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">{formatNearbyDistance(user.distance_km)}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[28px] bg-slate-50/80 p-5">
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
                <div className="mt-3 flex items-center justify-between gap-3 rounded-[20px] bg-white px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{connectLookupPreview.username}</p>
                    <p className="text-xs text-slate-500">
                      {connectLookupPreview.id === authUserId ? 'This is your account.' : 'Ready to add'}
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

          <section className="rounded-[28px] bg-slate-50/80 p-5">
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
                  <div key={user.id} className="flex items-center justify-between gap-3 rounded-[20px] bg-white px-3 py-3">
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

          <section className="rounded-[28px] bg-slate-50/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">Pending Requests</h2>
              <span className="text-xs font-semibold text-slate-400">{requests.length}</span>
            </div>
            <div className="mt-4 space-y-3">
              {requests.length === 0 ? <p className="text-sm text-slate-500">No pending requests.</p> : null}
              {requests.map((friend) => (
                <div key={friend.id} className="flex items-center justify-between gap-3 rounded-[20px] bg-white px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{friend.username}</p>
                    <p className="text-xs text-slate-500">Ready to accept</p>
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

      {nearbyProfileOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(15,23,42,0.18)] p-4 backdrop-blur-[2px] sm:items-center">
          <div className="w-full max-w-2xl overflow-hidden rounded-[32px] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.16)]">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Profile</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  {nearbyProfile?.profile.username || 'Nearby user'}
                </h3>
              </div>
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                onClick={closeNearbyProfile}
                aria-label="Close profile"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>

            {nearbyProfileLoading ? (
              <div className="px-5 pb-6 text-sm text-slate-500">Loading profile...</div>
            ) : nearbyProfile ? (
              <div className="px-5 pb-6">
                <div className="overflow-hidden rounded-[26px] bg-slate-50">
                  {nearbyProfile.profile.background_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveApiAssetUrl(nearbyProfile.profile.background_url)}
                      alt={`${nearbyProfile.profile.username} background`}
                      className="h-40 w-full object-cover"
                    />
                  ) : (
                    <div className="h-40 w-full bg-[linear-gradient(135deg,rgba(241,245,249,0.9),rgba(226,232,240,0.7))]" />
                  )}
                </div>

                <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex min-w-0 items-end gap-4">
                    <div className="size-20 overflow-hidden rounded-[24px] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
                      {nearbyProfile.profile.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveApiAssetUrl(nearbyProfile.profile.avatar_url)}
                          alt={nearbyProfile.profile.username}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-slate-700">
                          {nearbyProfile.profile.username.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 pb-1">
                      <h4 className="truncate text-[1.6rem] font-semibold tracking-tight text-slate-900">{nearbyProfile.profile.username}</h4>
                      <p className="mt-1 text-sm text-slate-500">
                        {nearbyUsers.find((item) => item.id === nearbyProfile.profile.id)?.location_city || 'Nearby'} · {formatNearbyDistance(nearbyUsers.find((item) => item.id === nearbyProfile.profile.id)?.distance_km || 0)}
                      </p>
                    </div>
                  </div>

                  {nearbyProfile.profile.id !== authUserId ? (
                    <button
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        nearbyProfilePrimaryActionEnabled()
                          ? 'bg-slate-900 text-white hover:bg-slate-800'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                      disabled={!nearbyProfilePrimaryActionEnabled()}
                      onClick={() => void handleNearbyProfilePrimaryAction()}
                    >
                      {nearbyProfileActionPending ? 'Working...' : nearbyProfilePrimaryActionLabel() || 'Profile'}
                    </button>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <section className="rounded-[24px] bg-slate-50/85 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">About</p>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <div>
                        <p className="font-semibold text-slate-900">Bio</p>
                        <p className="mt-1">{nearbyProfile.profile.bio || 'No bio yet.'}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">Fitness goal</p>
                        <p className="mt-1">{nearbyProfile.profile.fitness_goal || 'Not set.'}</p>
                      </div>
                    </div>
                  </section>
                  <section className="rounded-[24px] bg-slate-50/85 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Recent posts</p>
                    {nearbyProfile.recent_posts.length > 0 ? (
                      <div className="mt-3 space-y-3 text-sm text-slate-600">
                        {nearbyProfile.recent_posts.slice(0, 2).map((post) => (
                          <article key={post.id}>
                            <p className="line-clamp-3">{post.content || 'Media post'}</p>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">{post.reaction_count} likes</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500">No public posts yet.</p>
                    )}
                  </section>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {locationPickerOpen ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-[rgba(15,23,42,0.18)] p-4 backdrop-blur-[2px] sm:items-center">
          <div className="w-full max-w-lg rounded-[28px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Nearby</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">Choose a shared location</h3>
              </div>
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                onClick={() => setLocationPickerOpen(false)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-ghost" disabled={locationPickerPending} onClick={() => void handleUseBrowserLocation('city')}>
                Use current city
              </button>
              <button type="button" className="btn btn-ghost" disabled={locationPickerPending} onClick={() => void handleUseBrowserLocation('precise')}>
                Use precise location
              </button>
              {sharedLocation ? (
                <button type="button" className="btn btn-ghost" disabled={locationPickerPending} onClick={() => void applyLocationSelection(sharedLocation)}>
                  Use saved
                </button>
              ) : null}
            </div>

            <label className="relative mt-4 block">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{ fontSize: 16 }}>search</span>
              <input
                className="w-full rounded-full bg-slate-100 py-2.5 pl-9 pr-4 text-sm text-slate-700 outline-none transition focus:bg-slate-50"
                value={locationSearchQuery}
                onChange={(event) => setLocationSearchQuery(event.target.value)}
                placeholder="Search city or neighborhood"
              />
            </label>

            <div className="mt-4 flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
              {locationSearchLoading ? <p className="text-sm text-slate-500">Searching locations...</p> : null}
              {!locationSearchLoading && locationSearchQuery.trim().length >= 2 && locationSearchResults.length === 0 ? (
                <p className="text-sm text-slate-500">No matching locations.</p>
              ) : null}
              {locationSearchResults.map((result) => (
                <button
                  key={`${result.label}-${result.latitude}-${result.longitude}`}
                  type="button"
                  className="rounded-[18px] bg-slate-50 px-3 py-3 text-left transition hover:bg-slate-100"
                  disabled={locationPickerPending}
                  onClick={() => void applyLocationSelection(result)}
                >
                  <p className="text-sm font-semibold text-slate-900">{result.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{result.city} · {result.precision === 'city' ? 'City' : 'Precise'}</p>
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              {sharedLocation?.shared ? (
                <button type="button" className="text-sm font-semibold text-slate-400 transition hover:text-slate-700" disabled={locationPickerPending} onClick={() => void handleDisableNearby()}>
                  Turn off nearby
                </button>
              ) : (
                <span className="text-xs text-slate-400">{locationPickerPending ? 'Saving...' : 'Choose a result to continue.'}</span>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
