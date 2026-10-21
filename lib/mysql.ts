import mysql from 'mysql2/promise';

let pool: mysql.Pool | undefined;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante: ${name}`);
  return value;
}

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'seg_dashboard',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4'
    });
  }
  return pool;
}

export async function pingDatabase() {
  const db = getPool();
  const [rows] = await db.query('SELECT 1 AS ok');
  return rows;
}
