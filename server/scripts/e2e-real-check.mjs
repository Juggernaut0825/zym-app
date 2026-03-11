#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket } from 'ws';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3001';
const wsUrl = process.env.E2E_WS_URL || 'ws://127.0.0.1:8080';
const scenarioId = Date.now().toString(36);
const password = 'Passw0rd!2026';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillDataRoot = path.join(serverDir, 'skills', 'z', 'data');

function logStep(message) {
  console.log(`\n[STEP] ${message}`);
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasCjk(text) {
  return /[\u4E00-\u9FFF]/.test(String(text || ''));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestJson(method, route, { token, body, formData } = {}) {
  const url = `${baseUrl}${route}`;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!formData) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });

  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = { raw };
  }

  if (!response.ok) {
    throw new Error(`${method} ${route} failed (${response.status}): ${raw}`);
  }

  return parsed;
}

async function waitFor(label, checker, timeoutMs = 120000, intervalMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await checker();
    if (result) {
      return result;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function createSampleVideoFile() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zym-e2e-video-'));
  const output = path.join(tempDir, 'sample.mp4');
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=320x240:rate=10',
        '-t',
        '1',
        '-pix_fmt',
        'yuv420p',
        output,
      ],
      {
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(`Unable to generate sample video with ffmpeg: ${String(error)}`);
  }
  return { tempDir, output };
}

function createWsClient() {
  const ws = new WebSocket(wsUrl);
  const events = [];

  ws.on('message', (data) => {
    try {
      events.push(JSON.parse(data.toString()));
    } catch {
      events.push({ type: 'invalid_json', raw: data.toString() });
    }
  });

  return { ws, events };
}

async function waitForWsEvent(client, matcher, label, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const hit = client.events.find(matcher);
    if (hit) return hit;
    await sleep(100);
  }
  throw new Error(`WebSocket timeout waiting for ${label}`);
}

async function setupWsClient(token, topic) {
  const client = createWsClient();
  await new Promise((resolve, reject) => {
    client.ws.once('open', resolve);
    client.ws.once('error', reject);
  });

  client.ws.send(JSON.stringify({ type: 'auth', token }));
  await waitForWsEvent(client, (event) => event.type === 'auth_success', 'auth_success');

  client.ws.send(JSON.stringify({ type: 'subscribe', topic }));
  await waitForWsEvent(client, (event) => event.type === 'subscribed' && event.topic === topic, 'subscribed');
  return client;
}

async function main() {
  const userA = { username: `e2e_a_${scenarioId}`, email: `e2e_a_${scenarioId}@test.local` };
  const userB = { username: `e2e_b_${scenarioId}`, email: `e2e_b_${scenarioId}@test.local` };

  logStep('Register + login two users');
  await requestJson('POST', '/auth/register', { body: { username: userA.username, email: userA.email, password } });
  await requestJson('POST', '/auth/register', { body: { username: userB.username, email: userB.email, password } });
  const loginA = await requestJson('POST', '/auth/login', { body: { username: userA.username, password } });
  const loginB = await requestJson('POST', '/auth/login', { body: { username: userB.username, password } });
  userA.userId = Number(loginA.userId);
  userA.token = String(loginA.token);
  userA.refreshToken = String(loginA.refreshToken || '');
  userB.userId = Number(loginB.userId);
  userB.token = String(loginB.token);
  userB.refreshToken = String(loginB.refreshToken || '');
  assertTrue(userA.userId > 0 && userB.userId > 0, 'Invalid login response');
  assertTrue(userA.refreshToken.length > 20 && userB.refreshToken.length > 20, 'Missing refresh token in login response');
  console.log(`  userA=${userA.userId}, userB=${userB.userId}`);

  logStep('Session management (list + revoke)');
  const refreshedSessionA = await requestJson('POST', '/auth/refresh', {
    body: { refreshToken: userA.refreshToken },
  });
  userA.token = String(refreshedSessionA.token);
  userA.refreshToken = String(refreshedSessionA.refreshToken || '');
  assertTrue(userA.token.length > 20 && userA.refreshToken.length > 20, 'Refresh flow did not return updated tokens');

  const secondLoginA = await requestJson('POST', '/auth/login', { body: { username: userA.username, password } });
  const secondTokenA = String(secondLoginA.token);
  const sessionsBefore = await requestJson('GET', '/auth/sessions', { token: userA.token });
  assertTrue(Array.isArray(sessionsBefore.sessions) && sessionsBefore.sessions.length >= 2, 'Expected at least two sessions for userA');
  const toRevoke = sessionsBefore.sessions.find((session) => session.current === false) || sessionsBefore.sessions[0];
  await requestJson('POST', '/auth/sessions/revoke', {
    token: userA.token,
    body: { sessionId: toRevoke.sessionId },
  });
  const sessionsAfter = await requestJson('GET', '/auth/sessions', { token: userA.token });
  const revokedRow = sessionsAfter.sessions.find((session) => String(session.sessionId) === String(toRevoke.sessionId));
  assertTrue(Boolean(revokedRow?.revokedAt), 'Revoked session should have revokedAt');

  const revokedTokenResp = await fetch(`${baseUrl}/auth/sessions`, {
    headers: { Authorization: `Bearer ${secondTokenA}` },
  });
  assertTrue(revokedTokenResp.status === 401, 'Revoked token should be unauthorized');

  const wsRevoked = createWsClient();
  await new Promise((resolve, reject) => {
    wsRevoked.ws.once('open', resolve);
    wsRevoked.ws.once('error', reject);
  });
  wsRevoked.ws.send(JSON.stringify({ type: 'auth', token: secondTokenA }));
  await waitForWsEvent(wsRevoked, (event) => event.type === 'auth_failed', 'ws auth_failed for revoked token');
  wsRevoked.ws.close();

  logStep('Select coach + friend flow + DM flow');
  await requestJson('POST', '/coach/select', {
    token: userA.token,
    body: { userId: userA.userId, coach: 'zj' },
  });
  await requestJson('POST', '/friends/add', {
    token: userA.token,
    body: { userId: userA.userId, friendId: userB.userId },
  });
  await requestJson('POST', '/friends/accept', {
    token: userB.token,
    body: { userId: userB.userId, friendId: userA.userId },
  });
  const friendsA = await requestJson('GET', `/friends/${userA.userId}`, { token: userA.token });
  assertTrue(Array.isArray(friendsA.friends) && friendsA.friends.some((x) => Number(x.id) === userB.userId), 'Friendship not established');

  const dm = await requestJson('POST', '/messages/open-dm', {
    token: userA.token,
    body: { userId: userA.userId, otherUserId: userB.userId },
  });
  const dmTopic = String(dm.topic);
  assertTrue(dmTopic.startsWith('p2p_'), 'DM topic invalid');

  await requestJson('POST', '/messages/send', {
    token: userA.token,
    body: { fromUserId: userA.userId, topic: dmTopic, content: 'DM sanity check' },
  });
  const dmMessages = await requestJson('GET', `/messages/${encodeURIComponent(dmTopic)}`, { token: userA.token });
  assertTrue(Array.isArray(dmMessages.messages) && dmMessages.messages.length > 0, 'DM message missing');

  const inboxBBeforeRead = await requestJson('GET', `/messages/inbox/${userB.userId}`, { token: userB.token });
  const dmInboxEntry = (inboxBBeforeRead.dms || []).find((item) => String(item.topic) === dmTopic);
  assertTrue(Number(dmInboxEntry?.unread_count || 0) >= 1, 'DM unread_count should be >= 1 before read');

  const latestDmMessageId = Number(dmMessages.messages[dmMessages.messages.length - 1]?.id || 0);
  await requestJson('POST', '/messages/read', {
    token: userB.token,
    body: { userId: userB.userId, topic: dmTopic, messageId: latestDmMessageId },
  });
  const inboxBAfterRead = await requestJson('GET', `/messages/inbox/${userB.userId}`, { token: userB.token });
  const dmInboxAfterRead = (inboxBAfterRead.dms || []).find((item) => String(item.topic) === dmTopic);
  assertTrue(Number(dmInboxAfterRead?.unread_count || 0) === 0, 'DM unread_count should be 0 after read');

  logStep('Community post + reaction + feed');
  const post = await requestJson('POST', '/community/post', {
    token: userA.token,
    body: { userId: userA.userId, type: 'text', content: `E2E post ${scenarioId}`, mediaUrls: [] },
  });
  const postId = Number(post.postId);
  assertTrue(postId > 0, 'Post creation failed');
  await requestJson('POST', '/community/react', {
    token: userB.token,
    body: { postId, userId: userB.userId, reactionType: 'like' },
  });
  await requestJson('POST', '/community/comment', {
    token: userB.token,
    body: { postId, userId: userB.userId, content: `@${userA.username} Nice work!` },
  });
  const postComments = await requestJson('GET', `/community/post/${postId}/comments`, { token: userA.token });
  assertTrue(Array.isArray(postComments.comments) && postComments.comments.length > 0, 'Post comments missing');
  const mentionsAAfterComment = await requestJson('GET', `/notifications/mentions/${userA.userId}`, { token: userA.token });
  assertTrue(
    Array.isArray(mentionsAAfterComment.mentions)
      && mentionsAAfterComment.mentions.some((item) => String(item.source_type) === 'post_comment' && Number(item.source_id) > 0),
    'Expected post comment mention notification for userA',
  );
  const feedA = await requestJson('GET', `/community/feed/${userA.userId}`, { token: userA.token });
  assertTrue(Array.isArray(feedA.feed) && feedA.feed.some((x) => Number(x.id) === postId), 'Feed missing created post');

  logStep('Moderation report flow');
  const report = await requestJson('POST', '/moderation/report', {
    token: userA.token,
    body: {
      userId: userA.userId,
      targetType: 'post',
      targetId: postId,
      reason: 'spam_or_harassment',
      details: 'e2e moderation verification',
    },
  });
  const reportId = Number(report.reportId || 0);
  assertTrue(reportId > 0, 'Report submission failed');
  const reports = await requestJson('GET', `/moderation/reports/${userA.userId}`, { token: userA.token });
  assertTrue(Array.isArray(reports.reports) && reports.reports.some((item) => Number(item.id) === reportId), 'Report should be visible in reporter inbox');

  logStep('Group + @coach async reply');
  const group = await requestJson('POST', '/groups/create', {
    token: userA.token,
    body: { ownerId: userA.userId, name: `E2E-${scenarioId}`, coachEnabled: 'zj' },
  });
  const groupId = Number(group.groupId);
  assertTrue(groupId > 0, 'Group creation failed');

  await requestJson('POST', '/groups/add-member', {
    token: userA.token,
    body: { groupId, userId: userB.userId },
  });

  const groupTopic = `grp_${groupId}`;
  await requestJson('POST', '/messages/send', {
    token: userA.token,
    body: {
      fromUserId: userA.userId,
      topic: groupTopic,
      content: `@coach @${userB.username} Reply with one concise sentence confirming this is a test message. Do not leave it empty.`,
    },
  });

  const mentionForUserB = await waitFor(
    'group mention notification',
    async () => {
      const payload = await requestJson('GET', `/notifications/mentions/${userB.userId}`, { token: userB.token });
      return (payload.mentions || []).find((item) => String(item.topic) === groupTopic && String(item.source_type) === 'message');
    },
    60000,
    2500,
  );
  assertTrue(Boolean(mentionForUserB), 'Expected group message mention notification for userB');

  const groupCoachReply = await waitFor(
    'group coach reply',
    async () => {
      const payload = await requestJson('GET', `/messages/${encodeURIComponent(groupTopic)}`, { token: userA.token });
      return (payload.messages || []).find((msg) => Number(msg.from_user_id) === 0 && String(msg.content || '').trim());
    },
    150000,
    4000,
  );
  assertTrue(!hasCjk(groupCoachReply.content), 'Group coach reply should be English-only');
  console.log(`  group coach replied: ${String(groupCoachReply.content).slice(0, 80)}`);

  logStep('Group explicit @lc mention override');
  const strictGroup = await requestJson('POST', '/groups/create', {
    token: userA.token,
    body: { ownerId: userA.userId, name: `E2E-LC-${scenarioId}`, coachEnabled: 'none' },
  });
  const strictGroupId = Number(strictGroup.groupId);
  assertTrue(strictGroupId > 0, 'Strict group creation failed');
  await requestJson('POST', '/groups/add-member', {
    token: userA.token,
    body: { groupId: strictGroupId, userId: userB.userId },
  });
  const strictGroupTopic = `grp_${strictGroupId}`;
  await requestJson('POST', '/messages/send', {
    token: userA.token,
    body: {
      fromUserId: userA.userId,
      topic: strictGroupTopic,
      content: '@lc Reply with one concise sentence confirming strict coach mention route.',
    },
  });
  const strictCoachReply = await waitFor(
    'group explicit lc coach reply',
    async () => {
      const payload = await requestJson('GET', `/messages/${encodeURIComponent(strictGroupTopic)}`, { token: userA.token });
      return (payload.messages || []).find((msg) => Number(msg.from_user_id) === 0 && String(msg.content || '').trim());
    },
    150000,
    4000,
  );
  assertTrue(!hasCjk(strictCoachReply.content), 'Group explicit @lc reply should be English-only');
  console.log(`  explicit @lc coach replied: ${String(strictCoachReply.content).slice(0, 80)}`);

  logStep('Direct /chat profile update (real AI + tool call chain)');
  const profileChat = await requestJson('POST', '/chat', {
    token: userA.token,
    body: {
      message: 'Please set my profile: height 180cm, weight 75kg, age 28, male, activity level moderate, goal cut. Confirm briefly.',
    },
  });
  assertTrue(typeof profileChat.response === 'string' && profileChat.response.trim().length > 0, '/chat returned empty');
  assertTrue(!hasCjk(profileChat.response), '/chat profile response should be English-only');

  const userDataDir = path.join(skillDataRoot, String(userA.userId));
  const profilePath = path.join(userDataDir, 'profile.json');
  const profileRaw = await fs.readFile(profilePath, 'utf8');
  const profile = JSON.parse(profileRaw);
  assertTrue(Number(profile.height_cm) === 180, 'profile.height_cm mismatch');
  assertTrue(Number(profile.weight_kg) === 75, 'profile.weight_kg mismatch');
  assertTrue(Number(profile.age) === 28, 'profile.age mismatch');
  assertTrue(String(profile.gender) === 'male', 'profile.gender mismatch');
  assertTrue(String(profile.goal) === 'cut', 'profile.goal mismatch');
  assertTrue(Number(profile.tdee) > 0 && Number(profile.daily_target) > 0, 'profile derived fields missing');
  console.log('  profile.json written and validated');

  logStep('Meal logging via /chat and daily.json verification');
  await requestJson('POST', '/chat', {
    token: userA.token,
    body: {
      message: 'Log my lunch: 200g chicken breast and 150g cooked rice.',
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const dailyPath = path.join(userDataDir, 'daily.json');
  const dailyRaw = await fs.readFile(dailyPath, 'utf8');
  const daily = JSON.parse(dailyRaw);
  assertTrue(daily[today] && Array.isArray(daily[today].meals) && daily[today].meals.length > 0, 'daily.json meal log missing');
  console.log(`  meals logged for ${today}: ${daily[today].meals.length}`);

  logStep('Media upload + media-aware /chat');
  const sampleImageResponse = await fetch('https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=640&q=80');
  assertTrue(sampleImageResponse.ok, 'Failed to download sample image for media test');
  const sampleImageBuffer = Buffer.from(await sampleImageResponse.arrayBuffer());
  const sampleMime = sampleImageResponse.headers.get('content-type') || 'image/jpeg';
  const sampleFileName = sampleMime.includes('png') ? 'sample.png' : 'sample.jpg';

  const form = new FormData();
  form.append('file', new Blob([sampleImageBuffer], { type: sampleMime }), sampleFileName);
  const upload = await requestJson('POST', '/media/upload', { token: userA.token, formData: form });
  assertTrue(typeof upload.url === 'string' && upload.url.length > 0, 'Upload URL missing');
  assertTrue(typeof upload.mediaId === 'string' && upload.mediaId.length > 0, 'Upload mediaId missing');

  const mediaChat = await requestJson('POST', '/chat', {
    token: userA.token,
    body: {
      message: 'Based on the uploaded food image, identify the main ingredients and explicitly state that your answer is image-based.',
      mediaUrls: [upload.url],
      mediaIds: [upload.mediaId],
    },
  });
  assertTrue(typeof mediaChat.response === 'string' && mediaChat.response.trim().length > 0, 'Media chat returned empty');
  assertTrue(!hasCjk(mediaChat.response), 'Media chat response should be English-only');

  const mediaIndexPath = path.join(userDataDir, 'media', 'index.json');
  const mediaIndexRaw = await fs.readFile(mediaIndexPath, 'utf8');
  const mediaIndex = JSON.parse(mediaIndexRaw);
  assertTrue(Array.isArray(mediaIndex.items) && mediaIndex.items.some((item) => item.id === upload.mediaId), 'Media not indexed');

  const analysesDir = path.join(userDataDir, 'analyses', upload.mediaId);
  const analysisFiles = await fs.readdir(analysesDir).catch(() => []);
  assertTrue(analysisFiles.some((file) => file.endsWith('.json')), 'Media analysis artifact missing (inspect-media not executed)');
  console.log(`  media indexed: ${upload.mediaId}`);

  logStep('Video upload + media-aware /chat');
  let sampleVideo;
  try {
    sampleVideo = await createSampleVideoFile();
    const videoBuffer = await fs.readFile(sampleVideo.output);
    const videoForm = new FormData();
    videoForm.append('file', new Blob([videoBuffer], { type: 'video/mp4' }), 'sample.mp4');
    const videoUpload = await requestJson('POST', '/media/upload', { token: userA.token, formData: videoForm });
    assertTrue(typeof videoUpload.url === 'string' && videoUpload.url.length > 0, 'Video upload URL missing');
    assertTrue(typeof videoUpload.mediaId === 'string' && videoUpload.mediaId.length > 0, 'Video upload mediaId missing');

    const videoChat = await requestJson('POST', '/chat', {
      token: userA.token,
      body: {
        message: 'Analyze the attached workout video and provide one concrete observation plus one uncertainty.',
        mediaUrls: [videoUpload.url],
        mediaIds: [videoUpload.mediaId],
      },
    });
    assertTrue(typeof videoChat.response === 'string' && videoChat.response.trim().length > 0, 'Video chat returned empty');
    assertTrue(!hasCjk(videoChat.response), 'Video chat response should be English-only');
    const videoAnalysisDir = path.join(userDataDir, 'analyses', videoUpload.mediaId);
    const videoAnalysisFiles = await fs.readdir(videoAnalysisDir).catch(() => []);
    assertTrue(videoAnalysisFiles.some((file) => file.endsWith('.json')), 'Video analysis artifact missing');
    console.log(`  video media indexed: ${videoUpload.mediaId}`);
  } finally {
    if (sampleVideo?.tempDir) {
      await fs.rm(sampleVideo.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  logStep('Coach thread async reply check');
  const coachTopic = `coach_${userA.userId}`;
  await requestJson('POST', '/messages/send', {
    token: userA.token,
    body: {
      fromUserId: userA.userId,
      topic: coachTopic,
      content: 'Reply with one sentence that includes exactly this token: REAL_AI_REPLY_TEST_PASSED',
    },
  });

  const coachReply = await waitFor(
    'coach thread reply',
    async () => {
      const payload = await requestJson('GET', `/messages/${encodeURIComponent(coachTopic)}`, { token: userA.token });
      return (payload.messages || []).find((msg) => Number(msg.from_user_id) === 0 && String(msg.content || '').trim());
    },
    150000,
    4000,
  );
  assertTrue(String(coachReply.content || '').includes('REAL_AI_REPLY_TEST_PASSED'), 'Coach reply missing verification token');
  assertTrue(!hasCjk(coachReply.content), 'Coach reply should be English-only');
  console.log(`  coach replied: ${String(coachReply.content).slice(0, 80)}`);

  logStep('Health sync + leaderboard');
  await requestJson('POST', '/health/sync', {
    token: userA.token,
    body: { userId: userA.userId, steps: 8888, calories: 432 },
  });
  const leaderboard = await requestJson('GET', `/health/leaderboard/${userA.userId}`, { token: userA.token });
  const me = (leaderboard.leaderboard || []).find((item) => Number(item.id) === userA.userId);
  assertTrue(me && Number(me.steps) === 8888, 'Leaderboard sync mismatch');

  logStep('Profile update/read API');
  await requestJson('POST', '/profile/update', {
    token: userA.token,
    body: {
      userId: userA.userId,
      bio: `bio-${scenarioId}`,
      fitness_goal: 'Lean + strength',
      hobbies: 'lifting, running',
    },
  });
  const profileApi = await requestJson('GET', `/profile/${userA.userId}`, { token: userA.token });
  assertTrue(String(profileApi.bio || '').includes(`bio-${scenarioId}`), 'Profile API update missing');

  logStep('WebSocket auth/subscribe/typing/message');
  const wsA = await setupWsClient(userA.token, dmTopic);
  const wsB = await setupWsClient(userB.token, dmTopic);

  wsA.ws.send(JSON.stringify({ type: 'typing', topic: dmTopic, isTyping: true }));
  await waitForWsEvent(
    wsB,
    (event) => event.type === 'typing' && event.topic === dmTopic && String(event.userId) === String(userA.userId) && event.isTyping === true,
    'typing event from userA',
  );

  wsA.ws.send(JSON.stringify({ type: 'send_message', topic: dmTopic, content: 'ws e2e ping' }));
  await waitForWsEvent(
    wsB,
    (event) => event.type === 'message_created'
      && event.topic === dmTopic
      && String(event.message?.content || '').includes('ws e2e ping'),
    'message_created event',
  );
  wsA.ws.close();
  wsB.ws.close();
  console.log('  websocket typing + message events ok');

  logStep('Inbox check');
  const inbox = await requestJson('GET', `/messages/inbox/${userA.userId}`, { token: userA.token });
  assertTrue(inbox && inbox.coach && Array.isArray(inbox.dms) && Array.isArray(inbox.groups), 'Inbox payload malformed');

  console.log('\n✅ E2E real check passed');
  console.log(JSON.stringify({
    scenarioId,
    userA: userA.userId,
    userB: userB.userId,
    groupId,
    strictGroupId,
    dmTopic,
    coachTopic,
    mediaId: upload.mediaId,
  }, null, 2));
}

main().catch((error) => {
  console.error('\n❌ E2E real check failed');
  console.error(error?.stack || String(error));
  process.exit(1);
});
