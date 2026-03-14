CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  selected_coach ENUM('zj', 'lc') DEFAULT 'zj',
  apple_health_enabled BOOLEAN DEFAULT FALSE,
  avatar_url VARCHAR(500),
  background_url VARCHAR(500),
  bio TEXT,
  fitness_goal VARCHAR(100),
  hobbies TEXT,
  timezone VARCHAR(80),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS friendships (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  friend_id BIGINT NOT NULL,
  status ENUM('pending', 'accepted', 'blocked') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_friendship (user_id, friend_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (friend_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS groups (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  owner_id BIGINT NOT NULL,
  coach_enabled ENUM('none', 'zj', 'lc') DEFAULT 'none',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  role ENUM('owner', 'admin', 'member') DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  topic VARCHAR(100) NOT NULL,
  from_user_id BIGINT NOT NULL,
  content TEXT,
  media_urls JSON,
  mentions JSON,
  reply_to BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_topic_time (topic, created_at),
  FOREIGN KEY (from_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activity_posts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  content TEXT,
  post_type ENUM('workout', 'meal', 'text', 'progress') NOT NULL,
  visibility ENUM('private', 'friends', 'public') NOT NULL DEFAULT 'friends',
  media_urls JSON,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_posts_visibility_created (visibility, created_at),
  INDEX idx_user_time (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS post_reactions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  post_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  reaction_type ENUM('like', 'fire', 'strong', 'clap') DEFAULT 'like',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_reaction (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES activity_posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS post_comments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  post_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_post_time (post_id, created_at),
  FOREIGN KEY (post_id) REFERENCES activity_posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS health_data (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  date DATE NOT NULL,
  steps INT,
  calories_burned INT,
  active_minutes INT,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_date (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS media_assets (
  id VARCHAR(64) PRIMARY KEY,
  owner_user_id BIGINT NOT NULL,
  storage_provider VARCHAR(32) NOT NULL DEFAULT 'local',
  storage_bucket VARCHAR(255),
  object_key VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL UNIQUE,
  mime_type VARCHAR(120) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  kind ENUM('image', 'video', 'file') NOT NULL DEFAULT 'file',
  visibility ENUM('private', 'friends', 'public', 'authenticated') NOT NULL DEFAULT 'private',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  sha256 VARCHAR(128),
  source VARCHAR(40) NOT NULL DEFAULT 'upload',
  metadata JSON,
  status ENUM('pending', 'ready', 'deleted') NOT NULL DEFAULT 'ready',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_media_assets_owner_created (owner_user_id, created_at),
  INDEX idx_media_assets_status_created (status, created_at),
  INDEX idx_media_assets_object_key (object_key),
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS media_asset_attachments (
  media_asset_id VARCHAR(64) NOT NULL,
  owner_user_id BIGINT NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id BIGINT NULL,
  entity_key VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (media_asset_id, entity_type, entity_id, entity_key),
  INDEX idx_media_asset_attachments_entity (entity_type, entity_id, entity_key),
  INDEX idx_media_asset_attachments_owner (owner_user_id, created_at),
  FOREIGN KEY (media_asset_id) REFERENCES media_assets(id),
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);
