import { createRequire } from 'module';
import { randomBytes, scryptSync } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plain, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${derived.toString('hex')}`;
}

const rl = readline.createInterface({ input, output });

async function ask(question, def) {
  const answer = await rl.question(question + (def ? ` (${def})` : '') + ': ');
  return answer.trim() || def || '';
}

async function main() {
  const env = { MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '3306', MYSQL_USER: 'root', MYSQL_PASSWORD: '', MYSQL_DATABASE: 'seg_dashboard', ...loadEnv() };

  const arg = (i) => process.argv[i + 2];
  let firstName = arg(0) || null;
  let lastName = arg(1) || null;
  let email = arg(2) || null;
  let password = arg(3) || null;

  if (!firstName) firstName = await ask('Prénom (Directeur Général)', 'Directeur');
  if (!lastName) lastName = await ask('Nom', 'Général');
  if (!email) email = await ask('Email du compte admin');
  if (!password) password = await ask('Mot de passe (min 8 caractères)');

  password = password.trim();
  if (password.length < 8) {
    console.error('Erreur : le mot de passe doit contenir au moins 8 caractères.');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: env.MYSQL_HOST,
    port: Number(env.MYSQL_PORT),
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE,
    charset: 'utf8mb4',
  });
  console.log('Connexion OK à', env.MYSQL_DATABASE);

  const [roles] = await conn.query(`SELECT id FROM roles WHERE code = 'SUPER_ADMIN' LIMIT 1`);
  if (!roles.length) {
    console.error('Erreur : rôle SUPER_ADMIN introuvable en base.');
    process.exit(1);
  }
  const roleId = roles[0].id;

  const [existingRole] = await conn.query(
    `SELECT COUNT(*) AS nb FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'SUPER_ADMIN'`
  );
  if (Number(existingRole[0].nb) > 0) {
    console.error('Erreur : un compte SUPER_ADMIN existe déjà. Création refusée (règle V0.2).');
    await conn.end();
    process.exit(1);
  }

  const [existingEmail] = await conn.query(`SELECT id FROM users WHERE LOWER(email) = LOWER(?)`, [email]);
  if (existingEmail.length) {
    console.error('Erreur : un compte existe déjà avec cet email.');
    await conn.end();
    process.exit(1);
  }

  const password_hash = hashPassword(password);
  const display = `${firstName} ${lastName}`.trim();
  const [res] = await conn.query(
    `INSERT INTO users (first_name, last_name, display_name, email, password_hash, role_id, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NULL)`,
    [firstName, lastName, display, email.toLowerCase(), password_hash, roleId]
  );
  const userId = res.insertId;

  try {
    await conn.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, description, metadata, result)
       VALUES (?, 'USER_CREATED', 'USER', ?, 'Création du compte administrateur principal (DG)', ?, 'SUCCESS')`,
      [userId, String(userId), JSON.stringify({ role: 'SUPER_ADMIN', via: 'create-super-admin' })]
    );
  } catch (e) {
    console.warn('Audit ignoré :', e.message);
  }

  try {
    await conn.query(
      `INSERT INTO notifications (type, category, title, message, source, target_url, metadata, is_read)
       VALUES ('info', 'SECURITY', 'Compte principal créé', 'Le compte administrateur principal vient d’être créé.', 'auth', '/users', ?, 0)`,
      [JSON.stringify({ email: email.toLowerCase(), userId })]
    );
  } catch (e) {
    console.warn('Notification ignorée :', e.message);
  }

  await conn.end();
  console.log('');
  console.log('SUPER_ADMIN créé avec succès :');
  console.log(`  Email : ${email.toLowerCase()}`);
  console.log(`  Nom   : ${display}`);
  console.log(`  Rôle  : SUPER_ADMIN`);
  console.log('Connectez-vous sur /login');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erreur :', err.message || err);
  process.exit(1);
});