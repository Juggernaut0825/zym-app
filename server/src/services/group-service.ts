import { getDB } from '../database/runtime-db.js';

const GROUP_MEMBER_LIMIT = 500;

export class GroupService {
  static async createGroup(name: string, ownerId: string, coachEnabled?: string) {
    const db = getDB();
    const result = db.prepare('INSERT INTO groups (name, owner_id, coach_enabled) VALUES (?, ?, ?)').run(
      name,
      ownerId,
      coachEnabled || 'none',
    );

    const groupId = Number(result.lastInsertRowid);
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')").run(groupId, ownerId);
    return groupId;
  }

  static async addMember(groupId: string, userId: string) {
    const db = getDB();
    const existing = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
    if (existing) {
      return;
    }

    const memberCountRow = db.prepare('SELECT COUNT(1) AS count FROM group_members WHERE group_id = ?').get(groupId) as { count?: number } | undefined;
    const memberCount = Number(memberCountRow?.count || 0);
    if (memberCount >= GROUP_MEMBER_LIMIT) {
      throw new Error(`This group already has the maximum ${GROUP_MEMBER_LIMIT} members.`);
    }

    db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, userId);
  }

  static async removeMember(groupId: string, userId: string) {
    const db = getDB();
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
  }

  static async getMembers(groupId: string) {
    const db = getDB();
    return db.prepare(`
      SELECT u.id,
        COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS username,
        u.username AS account_username,
        COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS display_name,
        u.avatar_url, gm.role
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY gm.joined_at ASC
    `).all(groupId);
  }

  static async getGroups(userId: string) {
    const db = getDB();
    return db.prepare(`
      SELECT g.id, g.name, g.coach_enabled,
        (SELECT MAX(created_at) FROM messages WHERE topic = 'grp_' || g.id) as last_message_at
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ?
      ORDER BY last_message_at DESC
    `).all(userId);
  }
}
