import { getDB } from '../database/runtime-db.js';
import type { LocationSelection } from './location-service.js';

const GROUP_MEMBER_LIMIT = 500;

export interface CreateGroupOptions {
  name: string;
  ownerId: number;
  coachEnabled?: string;
  location?: LocationSelection | null;
}

export class GroupService {
  static async createGroup(name: string, ownerId: number, coachEnabled?: string, location?: LocationSelection | null) {
    const db = getDB();
    const result = db.prepare(
      'INSERT INTO groups (name, owner_id, coach_enabled, location_label, location_city, location_latitude, location_longitude, location_precision) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      name,
      ownerId,
      coachEnabled || 'none',
      location?.label || null,
      location?.city || null,
      location?.latitude ?? null,
      location?.longitude ?? null,
      location?.precision || null,
    );

    const groupId = Number(result.lastInsertRowid);
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')").run(groupId, ownerId);
    return groupId;
  }

  static async searchGroups(query: string, limit = 10) {
    const db = getDB();
    const pattern = `%${query.toLowerCase()}%`;
    return db.prepare(`
      SELECT g.id, g.name, g.coach_enabled, g.location_label, g.location_city,
        g.location_latitude, g.location_longitude, g.location_precision,
        (SELECT COUNT(1) FROM group_members WHERE group_id = g.id) AS member_count
      FROM groups g
      WHERE LOWER(g.name) LIKE ?
      ORDER BY g.name ASC
      LIMIT ?
    `).all(pattern, limit);
  }

  static async getGroupDetail(groupId: string) {
    const db = getDB();
    return db.prepare(`
      SELECT g.id, g.name, g.owner_id, g.coach_enabled,
        g.location_label, g.location_city, g.location_latitude, g.location_longitude, g.location_precision,
        g.created_at,
        (SELECT COUNT(1) FROM group_members WHERE group_id = g.id) AS member_count
      FROM groups g
      WHERE g.id = ?
    `).get(groupId);
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
        g.location_label, g.location_city, g.location_latitude, g.location_longitude, g.location_precision,
        (SELECT MAX(created_at) FROM messages WHERE topic = 'grp_' || g.id) as last_message_at
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ?
      ORDER BY last_message_at DESC
    `).all(userId);
  }

  static getNearbyGroups(userLatitude: number, userLongitude: number, limit = 10, maxDistanceKm = 80) {
    const db = getDB();
    const rows = db.prepare(`
      SELECT g.id, g.name, g.location_label, g.location_city,
        g.location_latitude, g.location_longitude, g.location_precision,
        (SELECT COUNT(1) FROM group_members WHERE group_id = g.id) AS member_count
      FROM groups g
      WHERE g.location_latitude IS NOT NULL
        AND g.location_longitude IS NOT NULL
      ORDER BY g.created_at DESC
      LIMIT 100
    `).all() as any[];

    const toRad = (deg: number) => deg * Math.PI / 180;
    const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    return rows
      .map((row) => {
        const dist = haversineKm(userLatitude, userLongitude, row.location_latitude, row.location_longitude);
        if (!Number.isFinite(dist) || dist > maxDistanceKm) return null;
        return { ...row, distance_km: Math.round(dist * 10) / 10 };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.distance_km - b.distance_km)
      .slice(0, limit);
  }
}
