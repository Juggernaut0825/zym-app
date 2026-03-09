import express, { Request } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AuthService } from '../services/auth-service.js';
import { CommunityService } from '../services/community-service.js';
import { MediaService } from '../services/media-service.js';
import { MessageService, buildP2PTopic } from '../services/message-service.js';
import { FriendService } from '../services/friend-service.js';
import { GroupService } from '../services/group-service.js';
import { getDB } from '../database/sqlite-db.js';
import { FitnessSkills } from '../services/fitness-skills.js';
import { CoachService } from '../services/coach-service.js';
import { APIGateway } from '../security/api-gateway.js';
import { requireAuth, requireSameUserIdFromBody, requireSameUserIdFromParam } from '../security/auth-middleware.js';
import { WSServer } from '../websocket/ws-server.js';
import { MediaStore } from '../context/media-store.js';

const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_UPLOAD_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    const fileName = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}${ext}`;
    cb(null, fileName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (_, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_UPLOAD_MIME.has(mime)) {
      cb(null, true);
      return;
    }

    const fallbackByExt = /\.(jpe?g|png|webp|heic|heif|mp4|mov|webm)$/i.test(file.originalname || '');
    cb(null, fallbackByExt);
  },
});

const mediaStore = new MediaStore();
const app = express();
app.use(cors());
app.use(express.json({ limit: '6mb' }));
app.use(APIGateway.rateLimit(300, 60_000));
app.use('/uploads', express.static(uploadsDir));

function toUserId(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Invalid user id');
  }
  return parsed;
}

function toOptionalInt(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseStringArrayJson(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
}

function generateUniqueConnectCode(): string {
  const db = getDB();
  const existsStmt = db.prepare('SELECT id FROM users WHERE connect_code = ?');
  for (let attempts = 0; attempts < 60; attempts += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const exists = existsStmt.get(code);
    if (!exists) return code;
  }
  throw new Error('Failed to generate unique connect code');
}

function ensureUserConnectCode(userId: number): string {
  const db = getDB();
  const user = db.prepare('SELECT connect_code FROM users WHERE id = ?').get(userId) as { connect_code?: string | null } | undefined;
  if (!user) {
    throw new Error('User not found');
  }

  const existing = String(user.connect_code || '').trim();
  if (/^\d{6}$/.test(existing)) {
    return existing;
  }

  const connectCode = generateUniqueConnectCode();
  db.prepare('UPDATE users SET connect_code = ? WHERE id = ?').run(connectCode, userId);
  return connectCode;
}

function findUserIdByConnectId(code: string): number | undefined {
  const row = getDB().prepare('SELECT id FROM users WHERE connect_code = ?').get(code) as { id?: number } | undefined;
  const userId = Number(row?.id);
  if (!Number.isInteger(userId) || userId <= 0) return undefined;
  return userId;
}

function extractUserIdFromConnectCode(raw: unknown): number | undefined {
  const value = String(raw || '').trim();
  if (!value) return undefined;

  if (/^\d{6}$/.test(value)) {
    return findUserIdByConnectId(value);
  }

  if (/^\d+$/.test(value)) {
    return toOptionalInt(value);
  }

  try {
    const url = new URL(value);
    const token = url.searchParams.get('token');
    const tokenUserId = token ? AuthService.verifyFriendConnectToken(token) : null;
    if (token && !tokenUserId) {
      throw new Error('Connect code expired or invalid. Please refresh QR.');
    }

    const connectId = String(url.searchParams.get('connectId') || '').trim();
    const fromConnectId = /^\d{6}$/.test(connectId) ? findUserIdByConnectId(connectId) : undefined;
    const fromUid = toOptionalInt(url.searchParams.get('uid'));
    const fromUserId = toOptionalInt(url.searchParams.get('userId'));
    const resolvedUserId = fromConnectId || fromUid || fromUserId;

    if (tokenUserId && resolvedUserId && tokenUserId !== resolvedUserId) {
      throw new Error('Connect code payload mismatch. Please refresh QR.');
    }

    return tokenUserId || resolvedUserId;
  } catch (error) {
    if (error instanceof Error && /connect code|payload mismatch/i.test(error.message)) {
      throw error;
    }
    // Fallback to regex parsing for custom strings.
  }

  const tokenMatch = value.match(/token\s*[:=]\s*([A-Za-z0-9_\-.]+)/i);
  if (tokenMatch?.[1]) {
    const tokenUserId = AuthService.verifyFriendConnectToken(tokenMatch[1]);
    if (!tokenUserId) {
      throw new Error('Connect code expired or invalid. Please refresh QR.');
    }
    return tokenUserId;
  }

  const connectIdMatch = value.match(/connectId\s*[:=]\s*(\d{6})/i);
  if (connectIdMatch?.[1]) {
    return findUserIdByConnectId(connectIdMatch[1]);
  }

  const direct = value.match(/(?:uid|userId)\s*[:=]\s*(\d+)/i);
  if (direct?.[1]) {
    return toOptionalInt(direct[1]);
  }

  const scheme = value.match(/add-friend[:/](\d+)/i);
  if (scheme?.[1]) {
    return toOptionalInt(scheme[1]);
  }

  return undefined;
}

function parseGroupId(topic: string): number | null {
  if (!topic.startsWith('grp_')) return null;
  const groupId = Number(topic.replace('grp_', ''));
  return Number.isInteger(groupId) ? groupId : null;
}

function resolveUploadedFilePathFromInput(raw: unknown): string {
  const input = String(raw || '').trim();
  if (!input) {
    throw new Error('imagePath is required');
  }

  let fileName: string;
  if (input.startsWith('http://') || input.startsWith('https://')) {
    try {
      fileName = path.basename(new URL(input).pathname);
    } catch {
      throw new Error('Invalid image URL');
    }
  } else {
    fileName = path.basename(input);
  }

  if (!fileName || fileName === '.' || fileName === '..') {
    throw new Error('Invalid image path');
  }

  const absoluteUploadRoot = path.resolve(uploadsDir);
  const resolved = path.resolve(path.join(absoluteUploadRoot, fileName));
  if (!resolved.startsWith(`${absoluteUploadRoot}${path.sep}`)) {
    throw new Error('Invalid image path');
  }

  if (!fs.existsSync(resolved)) {
    throw new Error('Uploaded file not found');
  }

  return resolved;
}

function buildMediaUrl(req: Request, fileName: string): string {
  return `${req.protocol}://${req.get('host')}/uploads/${fileName}`;
}

function inferUploadMimeType(fileName: string, fallback: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const byExt: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };

  return byExt[ext] || fallback || 'application/octet-stream';
}

function assertAuthUser(req: Request): number {
  const authUserId = req.authUserId;
  if (!authUserId) {
    throw new Error('Unauthenticated request');
  }
  return authUserId;
}

function isFriend(userA: number, userB: number): boolean {
  if (userA === userB) return true;

  const row = getDB().prepare(`
    SELECT 1 FROM friendships
    WHERE status = 'accepted' AND (
      (user_id = ? AND friend_id = ?) OR
      (user_id = ? AND friend_id = ?)
    )
    LIMIT 1
  `).get(userA, userB, userB, userA);

  return Boolean(row);
}

function isGroupMember(groupId: number, userId: number): boolean {
  const row = getDB().prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  return Boolean(row);
}

function isGroupOwner(groupId: number, userId: number): boolean {
  const row = getDB().prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = ?').get(groupId, userId, 'owner');
  return Boolean(row);
}

app.get('/health', (_, res) => {
  res.json({ ok: true, service: 'zym-server', time: new Date().toISOString() });
});

app.get('/', (_, res) => {
  res.json({
    service: 'zym-server',
    ok: true,
    requiresAuth: true,
    publicEndpoints: ['/health', '/auth/register', '/auth/login'],
    note: 'Use Authorization: Bearer <token> for protected endpoints.',
  });
});

app.post('/auth/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');

    if (!username || password.length < 6) {
      return res.status(400).json({ error: 'Username and password(>=6) are required' });
    }

    const userId = await AuthService.register(username, email, password);
    res.json({ userId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const result = await AuthService.login(username, password);

    if (!result) return res.status(401).json({ error: 'Invalid credentials' });

    const db = getDB();
    const user = db.prepare('SELECT id, username, selected_coach FROM users WHERE id = ?').get(result.userId) as any;

    res.json({
      ...result,
      username: user?.username,
      selectedCoach: user?.selected_coach || 'zj',
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.use(requireAuth);

app.get('/users/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.json({ users: [] });
  }

  const users = getDB().prepare(
    'SELECT id, username, avatar_url FROM users WHERE username LIKE ? ORDER BY username ASC LIMIT 12',
  ).all(`%${q}%`);
  res.json({ users });
});

app.get('/users/public/:id', (req, res) => {
  const authUserId = assertAuthUser(req);
  const targetUserId = toUserId(req.params.id);
  const db = getDB();

  const user = db
    .prepare('SELECT id, username, avatar_url, bio, fitness_goal FROM users WHERE id = ?')
    .get(targetUserId) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });

  const relation = db.prepare(`
    SELECT status
    FROM friendships
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    ORDER BY id DESC
    LIMIT 1
  `).get(authUserId, targetUserId, targetUserId, authUserId) as any;

  const friendshipStatus = authUserId === targetUserId ? 'self' : (relation?.status || 'none');
  res.json({
    id: user.id,
    username: user.username,
    avatar_url: user.avatar_url,
    bio: user.bio,
    fitness_goal: user.fitness_goal,
    friendship_status: friendshipStatus,
  });
});

app.get('/users/:id', (req, res) => {
  const authUserId = assertAuthUser(req);
  const targetUserId = toUserId(req.params.id);

  if (!isFriend(authUserId, targetUserId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const user = getDB().prepare('SELECT id, username, avatar_url, bio, fitness_goal FROM users WHERE id = ?').get(targetUserId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.post('/coach/select', requireSameUserIdFromBody('userId'), async (req, res) => {
  try {
    const userId = toUserId(req.body.userId);
    const coach = req.body.coach === 'lc' ? 'lc' : 'zj';
    getDB().prepare('UPDATE users SET selected_coach = ? WHERE id = ?').run(coach, userId);
    res.json({ success: true, selectedCoach: coach });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/community/post', requireSameUserIdFromBody('userId'), async (req, res) => {
  try {
    const userId = toUserId(req.body.userId);
    const type = String(req.body.type || 'text').slice(0, 40);
    const content = String(req.body.content || '').slice(0, 8000);
    const mediaUrls = Array.isArray(req.body.mediaUrls)
      ? req.body.mediaUrls.map((url: unknown) => String(url).slice(0, 2048))
      : [];

    const postId = CommunityService.createPost(userId, type, content, mediaUrls);
    res.json({ postId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/community/react', requireSameUserIdFromBody('userId'), async (req, res) => {
  try {
    CommunityService.reactToPost(toUserId(req.body.postId), toUserId(req.body.userId), String(req.body.reactionType || 'like'));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/community/feed/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const feed = CommunityService.getFeed(toUserId(req.params.userId));
  res.json({ feed });
});

app.post('/media/upload', upload.single('file'), async (req: Request, res) => {
  try {
    const authUserId = assertAuthUser(req);
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No file' });

    let processedPath = file.path as string;
    let finalName = path.basename(processedPath);

    const lowerName = String(file.originalname || '').toLowerCase();
    const lowerMime = String(file.mimetype || '').toLowerCase();
    const isHeic = lowerMime.includes('heic')
      || lowerMime.includes('heif')
      || lowerName.endsWith('.heic')
      || lowerName.endsWith('.heif');
    if (isHeic) {
      processedPath = await MediaService.convertHEIC(file.path);
      finalName = path.basename(processedPath);
    }

    const url = buildMediaUrl(req, finalName);
    let mediaId: string | null = null;

    try {
      const refs = await mediaStore.ingestAttachments(String(authUserId), [{
        url,
        contentType: inferUploadMimeType(finalName, String(file.mimetype || '').toLowerCase()),
        name: finalName,
        platform: 'web',
      }]);
      mediaId = refs[0]?.id || null;
    } catch (ingestErr) {
      console.error('Failed to index uploaded media:', ingestErr);
    }

    res.json({ path: url, url, fileName: finalName, mediaId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/media/analyze-food', async (req, res) => {
  try {
    const localImagePath = resolveUploadedFilePathFromInput(req.body.imagePath || req.body.path || req.body.url);
    const result = await MediaService.analyzeFood(localImagePath);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/messages/inbox/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const inbox = await MessageService.getInbox(req.params.userId);
  res.json(inbox);
});

app.get('/messages/:topic', async (req, res) => {
  const authUserId = assertAuthUser(req);
  const topic = String(req.params.topic || '').trim();
  const allowed = await MessageService.canAccessTopic(authUserId, topic);
  if (!allowed) {
    return res.status(403).json({ error: 'Forbidden topic' });
  }

  const messages = await MessageService.getMessages(topic);
  res.json({ messages: messages.reverse() });
});

app.post('/messages/send', requireSameUserIdFromBody('fromUserId'), APIGateway.validateSchema({ fromUserId: { required: true }, topic: { required: true } }), async (req, res) => {
  try {
    const fromUserId = toUserId(req.body.fromUserId);
    const topic = String(req.body.topic || '').trim();
    const content = String(req.body.content || '').trim().slice(0, 8000);
    const mediaUrls = Array.isArray(req.body.mediaUrls)
      ? req.body.mediaUrls.map((url: unknown) => String(url).slice(0, 2048)).slice(0, 5)
      : [];
    const mediaIds = Array.isArray(req.body.mediaIds)
      ? req.body.mediaIds.map((id: unknown) => String(id).slice(0, 128)).slice(0, 5)
      : [];

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    if (!content && mediaUrls.length === 0) {
      return res.status(400).json({ error: 'Message content or media is required' });
    }

    const allowed = await MessageService.canAccessTopic(fromUserId, topic);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden topic' });
    }

    const participants = await MessageService.getTopicParticipants(topic);
    const groupId = parseGroupId(topic);

    const mentions = Array.from(content.matchAll(/@([a-zA-Z0-9_]+)/g)).map(match => match[1].toLowerCase());
    const messageId = await MessageService.sendMessage(fromUserId, topic, content, mediaUrls, mentions, toOptionalInt(req.body.replyTo));
    const [newMessage] = (await MessageService.getMessages(topic, 1));

    const ws = WSServer.getInstance();
    ws?.broadcastMessage(topic, newMessage || {
      id: messageId,
      topic,
      from_user_id: fromUserId,
      content,
      media_urls: mediaUrls,
      mentions,
      reply_to: null,
      created_at: new Date().toISOString(),
      username: req.body.username || `User ${fromUserId}`,
      avatar_url: null,
      is_coach: false,
    });
    ws?.notifyInboxUpdated(participants.length > 0 ? participants : [fromUserId]);

    const shouldCoachReplyInCoachThread = topic === `coach_${fromUserId}`;
    const shouldCoachReplyInGroup = Boolean(groupId) && mentions.includes('coach');

    if (shouldCoachReplyInCoachThread || shouldCoachReplyInGroup) {
      const groupCoachEnabled = shouldCoachReplyInGroup
        ? (getDB().prepare('SELECT coach_enabled FROM groups WHERE id = ?').get(groupId) as any)?.coach_enabled
        : 'zj';

      if (!shouldCoachReplyInGroup || groupCoachEnabled !== 'none') {
        ws?.broadcastTyping(topic, 'coach', true);

        void (async () => {
          try {
            const prompt = shouldCoachReplyInGroup
              ? `Group message (topic ${topic})\n${content}`
              : content;

            const aiResponse = await CoachService.chat(String(fromUserId), prompt, {
              mediaUrls,
              mediaIds,
              platform: 'web',
            });
            await MessageService.sendMessage(0, topic, aiResponse, []);
            const [coachMessage] = await MessageService.getMessages(topic, 1);
            ws?.broadcastMessage(topic, coachMessage);
            ws?.notifyInboxUpdated(participants.length > 0 ? participants : [fromUserId]);
          } catch (error) {
            console.error('Coach async reply failed:', error);
          } finally {
            ws?.broadcastTyping(topic, 'coach', false);
          }
        })();
      }
    }

    res.json({ success: true, messageId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/friends/add', requireSameUserIdFromBody('userId'), async (req, res) => {
  try {
    const userId = toUserId(req.body.userId);
    let friendId = toOptionalInt(req.body.friendId);
    if (!friendId && req.body.connectCode) {
      friendId = extractUserIdFromConnectCode(req.body.connectCode);
    }

    if (!friendId && req.body.username) {
      const user = getDB().prepare('SELECT id FROM users WHERE username = ?').get(String(req.body.username).trim()) as any;
      friendId = user?.id;
    }

    if (!friendId) {
      return res.status(400).json({ error: 'friendId, username, or connectCode is required' });
    }

    const targetUser = getDB().prepare('SELECT id FROM users WHERE id = ?').get(friendId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Friend user not found' });
    }

    await FriendService.addFriend(String(userId), String(friendId));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/friends/connect/:userId', requireSameUserIdFromParam('userId'), (req, res) => {
  const userId = toUserId(req.params.userId);
  const connectId = ensureUserConnectCode(userId);
  const ttlSeconds = 60;
  const token = AuthService.createFriendConnectToken(userId, ttlSeconds);
  const connectCode = `zym://add-friend?uid=${userId}&connectId=${connectId}&token=${encodeURIComponent(token)}`;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  res.json({ userId, connectId, connectCode, token, ttlSeconds, expiresAt });
});

app.post('/friends/resolve-connect', (req, res) => {
  try {
    const connectCode = String(req.body?.connectCode || '').trim();
    if (!connectCode) {
      return res.status(400).json({ error: 'connectCode is required' });
    }
    const userId = extractUserIdFromConnectCode(connectCode);
    if (!userId) {
      return res.status(404).json({ error: 'Connect code not found' });
    }
    const user = getDB().prepare('SELECT id, username FROM users WHERE id = ?').get(userId) as { id?: number; username?: string } | undefined;
    if (!user?.id) {
      return res.status(404).json({ error: 'Connect code user not found' });
    }
    res.json({ userId: Number(user.id), username: user.username || '' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid connect code' });
  }
});

app.post('/friends/accept', requireSameUserIdFromBody('userId'), async (req, res) => {
  await FriendService.acceptFriend(String(toUserId(req.body.userId)), String(toUserId(req.body.friendId)));
  res.json({ success: true });
});

app.get('/friends/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const friends = await FriendService.getFriends(req.params.userId);
  res.json({ friends });
});

app.get('/friends/requests/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const requests = await FriendService.getPendingRequests(req.params.userId);
  res.json({ requests });
});

app.post('/groups/create', async (req, res) => {
  const authUserId = assertAuthUser(req);
  const ownerId = toUserId(req.body.ownerId);
  if (authUserId !== ownerId) {
    return res.status(403).json({ error: 'Forbidden owner scope' });
  }

  const groupId = await GroupService.createGroup(
    String(req.body.name || '').trim() || 'New Group',
    String(ownerId),
    String(req.body.coachEnabled || 'none'),
  );
  res.json({ groupId });
});

app.post('/groups/add-member', async (req, res) => {
  const authUserId = assertAuthUser(req);
  const groupId = toUserId(req.body.groupId);

  if (!isGroupOwner(groupId, authUserId)) {
    return res.status(403).json({ error: 'Only group owner can add members' });
  }

  let userId = toOptionalInt(req.body.userId);
  if (!userId && req.body.username) {
    const user = getDB().prepare('SELECT id FROM users WHERE username = ?').get(String(req.body.username).trim()) as any;
    userId = user?.id;
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId or username is required' });
  }

  await GroupService.addMember(String(groupId), String(userId));
  res.json({ success: true });
});

app.post('/groups/remove-member', async (req, res) => {
  const authUserId = assertAuthUser(req);
  const groupId = toUserId(req.body.groupId);

  if (!isGroupMember(groupId, authUserId)) {
    return res.status(403).json({ error: 'Forbidden group scope' });
  }

  let userId = toOptionalInt(req.body.userId);
  if (!userId && req.body.username) {
    const user = getDB().prepare('SELECT id FROM users WHERE username = ?').get(String(req.body.username).trim()) as any;
    userId = user?.id;
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId or username is required' });
  }

  const memberRow = getDB().prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as any;
  if (!memberRow) {
    return res.status(404).json({ error: 'Member not found in this group' });
  }

  const authIsOwner = isGroupOwner(groupId, authUserId);
  const removingSelf = authUserId === userId;
  if (!authIsOwner && !removingSelf) {
    return res.status(403).json({ error: 'Only owner can remove other members' });
  }

  if (memberRow.role === 'owner') {
    return res.status(400).json({ error: 'Owner membership cannot be removed' });
  }

  await GroupService.removeMember(String(groupId), String(userId));
  res.json({ success: true });
});

app.get('/groups/:groupId/members', async (req, res) => {
  const authUserId = assertAuthUser(req);
  const groupId = toUserId(req.params.groupId);

  if (!isGroupMember(groupId, authUserId)) {
    return res.status(403).json({ error: 'Forbidden group scope' });
  }

  const members = await GroupService.getMembers(req.params.groupId);
  res.json({ members });
});

app.get('/groups/user/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const groups = await GroupService.getGroups(req.params.userId);
  res.json({ groups });
});

app.get('/profile/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const db = getDB();
  const user = db
    .prepare('SELECT id, username, avatar_url, background_url, bio, fitness_goal, hobbies, selected_coach FROM users WHERE id = ?')
    .get(req.params.userId);

  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.get('/profile/public/:userId', async (req, res) => {
  const authUserId = assertAuthUser(req);
  const targetUserId = toUserId(req.params.userId);
  const db = getDB();

  const user = db
    .prepare('SELECT id, username, avatar_url, background_url, bio, fitness_goal, hobbies, selected_coach FROM users WHERE id = ?')
    .get(targetUserId) as any;

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const fullAccess = authUserId === targetUserId || isFriend(authUserId, targetUserId);
  if (!fullAccess) {
    return res.json({
      visibility: 'limited',
      isFriend: false,
      profile: {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        background_url: null,
        bio: null,
        fitness_goal: null,
        hobbies: null,
        selected_coach: user.selected_coach || 'zj',
      },
      today_health: null,
      recent_posts: [],
    });
  }

  const today = new Date().toISOString().split('T')[0];
  const todayHealth = db
    .prepare('SELECT steps, calories_burned, active_minutes, synced_at FROM health_data WHERE user_id = ? AND date = ?')
    .get(targetUserId, today) as any;

  const recentPosts = db.prepare(`
    SELECT p.id, p.user_id, p.type, p.content, p.media_urls, p.created_at,
      (SELECT COUNT(1) FROM post_reactions pr WHERE pr.post_id = p.id) AS reaction_count
    FROM posts p
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT 16
  `).all(targetUserId).map((post: any) => ({
    id: Number(post.id),
    user_id: Number(post.user_id),
    type: String(post.type || 'text'),
    content: post.content || null,
    media_urls: parseStringArrayJson(post.media_urls),
    reaction_count: Number(post.reaction_count || 0),
    created_at: String(post.created_at),
  }));

  res.json({
    visibility: 'full',
    isFriend: authUserId === targetUserId ? true : isFriend(authUserId, targetUserId),
    profile: user,
    today_health: todayHealth
      ? {
          date: today,
          steps: Number(todayHealth.steps || 0),
          calories_burned: Number(todayHealth.calories_burned || 0),
          active_minutes: Number(todayHealth.active_minutes || 0),
          synced_at: String(todayHealth.synced_at || ''),
        }
      : null,
    recent_posts: recentPosts,
  });
});

app.post('/profile/update', requireSameUserIdFromBody('userId'), async (req, res) => {
  const db = getDB();
  const userId = toUserId(req.body.userId);
  const { avatar_url, background_url, bio, fitness_goal, hobbies } = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (avatar_url !== undefined) { updates.push('avatar_url = ?'); values.push(String(avatar_url).slice(0, 2048)); }
  if (background_url !== undefined) { updates.push('background_url = ?'); values.push(String(background_url).slice(0, 2048)); }
  if (bio !== undefined) { updates.push('bio = ?'); values.push(String(bio).slice(0, 1000)); }
  if (fitness_goal !== undefined) { updates.push('fitness_goal = ?'); values.push(String(fitness_goal).slice(0, 200)); }
  if (hobbies !== undefined) { updates.push('hobbies = ?'); values.push(String(hobbies).slice(0, 400)); }

  if (updates.length > 0) {
    values.push(userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  res.json({ success: true });
});

app.post('/health/sync', requireSameUserIdFromBody('userId'), async (req, res) => {
  const db = getDB();
  const userId = toUserId(req.body.userId);
  const steps = toOptionalInt(req.body.steps) || 0;
  const calories = toOptionalInt(req.body.calories) || 0;
  const today = new Date().toISOString().split('T')[0];

  db.prepare('INSERT OR REPLACE INTO health_data (user_id, date, steps, calories_burned) VALUES (?, ?, ?, ?)').run(
    userId,
    today,
    steps,
    calories,
  );
  res.json({ success: true });
});

app.get('/health/leaderboard/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const db = getDB();
  const userId = toUserId(req.params.userId);
  const friends = db.prepare(`
    SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'accepted'
    UNION
    SELECT user_id FROM friendships WHERE friend_id = ? AND status = 'accepted'
  `).all(userId, userId).map((r: any) => Number(r.friend_id || r.user_id));

  const allUsers = Array.from(new Set([userId, ...friends]));
  const today = new Date().toISOString().split('T')[0];

  if (allUsers.length === 0) {
    return res.json({ leaderboard: [] });
  }

  const placeholders = allUsers.map(() => '?').join(',');
  const leaderboard = db.prepare(`
    SELECT u.id, u.username, u.avatar_url, h.steps, h.calories_burned
    FROM users u
    LEFT JOIN health_data h ON u.id = h.user_id AND h.date = ?
    WHERE u.id IN (${placeholders})
    ORDER BY COALESCE(h.steps, 0) DESC
  `).all(today, ...allUsers);

  res.json({ leaderboard });
});

app.post('/fitness/analyze-food', async (req, res) => {
  try {
    const result = await FitnessSkills.analyzeFood(String(req.body.imagePath || ''));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/fitness/workout-plan', requireSameUserIdFromBody('userId'), async (req, res) => {
  try {
    const result = await FitnessSkills.generateWorkoutPlan(toUserId(req.body.userId), String(req.body.goal || 'maintain'));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/chat', async (req, res) => {
  try {
    const userId = String(assertAuthUser(req));
    const message = String(req.body.message || '').trim().slice(0, 8000);
    const mediaUrls = Array.isArray(req.body.mediaUrls)
      ? req.body.mediaUrls.map((url: unknown) => String(url).slice(0, 2048)).slice(0, 5)
      : [];
    const mediaIds = Array.isArray(req.body.mediaIds)
      ? req.body.mediaIds.map((id: unknown) => String(id).slice(0, 128)).slice(0, 5)
      : [];

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await CoachService.chat(userId, message, {
      mediaUrls,
      mediaIds,
      platform: 'web',
    });
    res.json({ response });
  } catch (err: any) {
    console.error('Chat error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.post('/messages/open-dm', requireSameUserIdFromBody('userId'), (req, res) => {
  try {
    const userId = toUserId(req.body.userId);
    const otherUserId = toUserId(req.body.otherUserId);

    if (userId === otherUserId) {
      return res.status(400).json({ error: 'Cannot DM yourself' });
    }

    const otherUser = getDB().prepare('SELECT id FROM users WHERE id = ?').get(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const topic = buildP2PTopic(userId, otherUserId);
    res.json({ topic });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export function startAPI(port: number) {
  app.listen(port, () => console.log(`API on ${port}`));
}
