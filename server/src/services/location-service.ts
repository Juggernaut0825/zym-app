import { getDB } from '../database/runtime-db.js';
import { FriendService, type FriendshipRelationshipStatus } from './friend-service.js';

export type LocationPrecision = 'city' | 'precise';

export interface LocationSelection {
  label: string;
  city: string;
  latitude: number;
  longitude: number;
  precision: LocationPrecision;
}

export interface StoredUserLocation extends LocationSelection {
  shared: boolean;
  updated_at: string | null;
}

export interface NearbyUserSummary {
  id: number;
  public_uuid: string | null;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  fitness_goal: string | null;
  friendship_status: FriendshipRelationshipStatus;
  location_label: string;
  location_city: string;
  distance_km: number;
}

interface NominatimSearchItem {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
}

interface NominatimReverseItem {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
}

function normalizeText(value: unknown, max = 160): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizePrecision(value: unknown): LocationPrecision {
  return String(value || '').trim().toLowerCase() === 'city' ? 'city' : 'precise';
}

function clampCoordinate(value: unknown, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error('Invalid location coordinates');
  }
  return Math.min(max, Math.max(min, numeric));
}

function addressCity(address?: Record<string, string>): string {
  return normalizeText(
    address?.city
    || address?.town
    || address?.village
    || address?.municipality
    || address?.county
    || address?.state
    || '',
    120,
  );
}

function addressRegion(address?: Record<string, string>): string {
  return normalizeText(address?.state || address?.region || address?.country || '', 120);
}

function uniqueJoined(parts: Array<string | undefined>): string {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const part of parts) {
    const normalized = normalizeText(part, 120);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(normalized);
  }
  return next.join(', ').slice(0, 160);
}

function buildSelection(
  latitude: number,
  longitude: number,
  address: Record<string, string> | undefined,
  displayName: string | undefined,
  precision: LocationPrecision,
): LocationSelection {
  const city = addressCity(address);
  const region = addressRegion(address);
  const preciseLabel = uniqueJoined([
    address?.neighbourhood,
    address?.suburb,
    address?.road,
    city,
    region,
  ]) || normalizeText(displayName, 160);
  const cityLabel = uniqueJoined([city, region]) || preciseLabel;

  const label = precision === 'city' ? cityLabel : preciseLabel;
  return {
    label: label || cityLabel || preciseLabel || normalizeText(displayName, 160) || 'Shared location',
    city: city || cityLabel || preciseLabel || 'Unknown area',
    latitude,
    longitude,
    precision,
  };
}

function toSelection(row: any): StoredUserLocation | null {
  if (!row) return null;
  const latitude = Number(row.location_latitude);
  const longitude = Number(row.location_longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    label: normalizeText(row.location_label, 160),
    city: normalizeText(row.location_city, 120),
    latitude,
    longitude,
    precision: normalizePrecision(row.location_precision),
    shared: Number(row.location_shared || 0) === 1,
    updated_at: row.location_updated_at ? String(row.location_updated_at) : null,
  };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchNominatim(pathname: string, params: Record<string, string>): Promise<any> {
  const url = new URL(pathname, 'https://nominatim.openstreetmap.org');
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.8',
      'User-Agent': 'zym-app-location-service/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Location lookup failed (${response.status})`);
  }

  return response.json();
}

export class LocationService {
  static sanitizeSelection(input: {
    label?: unknown;
    city?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    precision?: unknown;
  }): LocationSelection {
    const latitude = clampCoordinate(input.latitude, -90, 90);
    const longitude = clampCoordinate(input.longitude, -180, 180);
    const precision = normalizePrecision(input.precision);
    const city = normalizeText(input.city, 120);
    const label = normalizeText(input.label, 160);
    if (!label || !city) {
      throw new Error('Location label and city are required');
    }
    return { label, city, latitude, longitude, precision };
  }

  static async searchLocations(query: string): Promise<LocationSelection[]> {
    const normalized = normalizeText(query, 120);
    if (normalized.length < 2) return [];

    try {
      const payload = await fetchNominatim('/search', {
        q: normalized,
        format: 'jsonv2',
        addressdetails: '1',
        limit: '8',
      }) as NominatimSearchItem[];

      const seen = new Set<string>();
      const results: LocationSelection[] = [];
      for (const item of payload || []) {
        const latitude = Number(item.lat);
        const longitude = Number(item.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
        const city = addressCity(item.address);
        const suggestion = buildSelection(latitude, longitude, item.address, item.display_name, city ? 'precise' : 'city');
        const key = `${suggestion.label.toLowerCase()}::${suggestion.city.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(suggestion);
      }
      if (results.length > 0) return results;
    } catch {
      // Fall back to local known locations below.
    }

    const dbRows = getDB()
      .prepare(`
        SELECT location_label, location_city, location_latitude, location_longitude, location_precision
        FROM users
        WHERE (
          lower(COALESCE(location_label, '')) LIKE lower(?)
          OR lower(COALESCE(location_city, '')) LIKE lower(?)
        )
          AND location_latitude IS NOT NULL
          AND location_longitude IS NOT NULL
        UNION
        SELECT location_label, location_city, location_latitude, location_longitude, location_precision
        FROM posts
        WHERE (
          lower(COALESCE(location_label, '')) LIKE lower(?)
          OR lower(COALESCE(location_city, '')) LIKE lower(?)
        )
          AND location_latitude IS NOT NULL
          AND location_longitude IS NOT NULL
        LIMIT 8
      `)
      .all(`%${normalized}%`, `%${normalized}%`, `%${normalized}%`, `%${normalized}%`) as any[];

    return dbRows
      .map((row) => {
        try {
          return this.sanitizeSelection({
            label: row.location_label,
            city: row.location_city,
            latitude: row.location_latitude,
            longitude: row.location_longitude,
            precision: row.location_precision,
          });
        } catch {
          return null;
        }
      })
      .filter((row): row is LocationSelection => Boolean(row));
  }

  static async reverseLookup(latitude: number, longitude: number): Promise<{
    city: LocationSelection | null;
    precise: LocationSelection | null;
  }> {
    const safeLatitude = clampCoordinate(latitude, -90, 90);
    const safeLongitude = clampCoordinate(longitude, -180, 180);
    const payload = await fetchNominatim('/reverse', {
      lat: String(safeLatitude),
      lon: String(safeLongitude),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '16',
    }) as NominatimReverseItem;

    return {
      city: buildSelection(safeLatitude, safeLongitude, payload.address, payload.display_name, 'city'),
      precise: buildSelection(safeLatitude, safeLongitude, payload.address, payload.display_name, 'precise'),
    };
  }

  static getUserLocation(userId: number): StoredUserLocation | null {
    const row = getDB()
      .prepare(`
        SELECT location_label, location_city, location_latitude, location_longitude, location_precision, location_shared, location_updated_at
        FROM users
        WHERE id = ?
      `)
      .get(userId) as any;
    return toSelection(row);
  }

  static setUserLocation(userId: number, location: LocationSelection | null, shared = true): StoredUserLocation | null {
    if (!location || !shared) {
      getDB()
        .prepare(`
          UPDATE users
          SET location_label = NULL,
              location_city = NULL,
              location_latitude = NULL,
              location_longitude = NULL,
              location_precision = NULL,
              location_shared = 0,
              location_updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .run(userId);
      return null;
    }

    const safe = this.sanitizeSelection(location);
    getDB()
      .prepare(`
        UPDATE users
        SET location_label = ?,
            location_city = ?,
            location_latitude = ?,
            location_longitude = ?,
            location_precision = ?,
            location_shared = 1,
            location_updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(
        safe.label,
        safe.city,
        safe.latitude,
        safe.longitude,
        safe.precision,
        userId,
      );

    return this.getUserLocation(userId);
  }

  static getNearbyUsers(userId: number, limit = 8, maxDistanceKm = 80): NearbyUserSummary[] {
    const viewerLocation = this.getUserLocation(userId);
    if (!viewerLocation) return [];

    const rows = getDB()
      .prepare(`
        SELECT id, public_uuid, username, avatar_url, bio, fitness_goal,
               location_label, location_city, location_latitude, location_longitude,
               location_precision, location_shared, location_updated_at
        FROM users
        WHERE id != ?
          AND location_shared = 1
          AND location_latitude IS NOT NULL
          AND location_longitude IS NOT NULL
        ORDER BY location_updated_at DESC, created_at DESC
        LIMIT 80
      `)
      .all(userId) as any[];

    const nearby = rows
      .map((row): NearbyUserSummary | null => {
        const targetLocation = toSelection(row);
        if (!targetLocation) return null;
        const distanceKm = haversineKm(
          viewerLocation.latitude,
          viewerLocation.longitude,
          targetLocation.latitude,
          targetLocation.longitude,
        );
        if (!Number.isFinite(distanceKm) || distanceKm > maxDistanceKm) return null;
        return {
          id: Number(row.id),
          public_uuid: normalizeText(row.public_uuid, 80) || null,
          username: normalizeText(row.username, 80) || `User ${Number(row.id)}`,
          avatar_url: normalizeText(row.avatar_url, 2048) || null,
          bio: normalizeText(row.bio, 240) || null,
          fitness_goal: normalizeText(row.fitness_goal, 160) || null,
          friendship_status: FriendService.getRelationshipStatus(userId, Number(row.id)),
          location_label: targetLocation.label,
          location_city: targetLocation.city,
          distance_km: Math.round(distanceKm * 10) / 10,
        };
      })
      .filter((row): row is NearbyUserSummary => Boolean(row))
      .sort((left, right) => left.distance_km - right.distance_km || left.username.localeCompare(right.username));

    return nearby.slice(0, Math.max(1, Math.min(20, Math.floor(Number(limit) || 8))));
  }
}
