export interface PostgresFoundationTable {
  name: string;
  orderBy: string;
  identityColumn?: string;
  jsonColumns?: string[];
  booleanColumns?: string[];
}

export const POSTGRES_FOUNDATION_TABLES: PostgresFoundationTable[] = [
  {
    name: 'users',
    orderBy: 'id ASC',
    identityColumn: 'id',
    booleanColumns: ['apple_health_enabled'],
  },
  {
    name: 'friendships',
    orderBy: 'id ASC',
    identityColumn: 'id',
  },
  {
    name: 'groups',
    orderBy: 'id ASC',
    identityColumn: 'id',
  },
  {
    name: 'group_members',
    orderBy: 'group_id ASC, user_id ASC',
  },
  {
    name: 'messages',
    orderBy: 'id ASC',
    identityColumn: 'id',
    jsonColumns: ['media_urls', 'mentions'],
  },
  {
    name: 'posts',
    orderBy: 'id ASC',
    identityColumn: 'id',
    jsonColumns: ['media_urls', 'metadata'],
  },
  {
    name: 'post_reactions',
    orderBy: 'id ASC',
    identityColumn: 'id',
  },
  {
    name: 'health_data',
    orderBy: 'id ASC',
    identityColumn: 'id',
  },
  {
    name: 'user_sessions',
    orderBy: 'id ASC',
    identityColumn: 'id',
  },
  {
    name: 'message_reads',
    orderBy: 'user_id ASC, topic ASC',
  },
  {
    name: 'post_comments',
    orderBy: 'id ASC',
    identityColumn: 'id',
  },
  {
    name: 'mention_notifications',
    orderBy: 'id ASC',
    identityColumn: 'id',
    booleanColumns: ['is_read'],
  },
  {
    name: 'abuse_reports',
    orderBy: 'id ASC',
    identityColumn: 'id',
  },
  {
    name: 'security_events',
    orderBy: 'id ASC',
    identityColumn: 'id',
    jsonColumns: ['metadata'],
  },
  {
    name: 'knowledge_ingestion_requests',
    orderBy: 'id ASC',
    identityColumn: 'id',
    jsonColumns: ['risk_flags'],
  },
  {
    name: 'knowledge_ingestion_audit',
    orderBy: 'id ASC',
    identityColumn: 'id',
    jsonColumns: ['metadata'],
  },
  {
    name: 'media_assets',
    orderBy: 'created_at ASC, id ASC',
    jsonColumns: ['metadata'],
  },
  {
    name: 'media_asset_attachments',
    orderBy: "media_asset_id ASC, entity_type ASC, COALESCE(entity_id, 0) ASC, COALESCE(entity_key, '') ASC",
  },
];

export const POSTGRES_FOUNDATION_TABLE_NAMES = POSTGRES_FOUNDATION_TABLES.map((table) => table.name);

export function getFoundationTable(name: string): PostgresFoundationTable {
  const table = POSTGRES_FOUNDATION_TABLES.find((item) => item.name === name);
  if (!table) {
    throw new Error(`Unknown Postgres foundation table: ${name}`);
  }
  return table;
}
