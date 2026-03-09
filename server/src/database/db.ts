import mysql from 'mysql2/promise';

let pool: mysql.Pool;

export function initDB() {
  pool = mysql.createPool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'zym',
    waitForConnections: true,
    connectionLimit: 10
  });
}

export function getDB() {
  if (!pool) initDB();
  return pool;
}
