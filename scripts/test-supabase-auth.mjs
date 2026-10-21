import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;

  const content = fs.readFileSync(path, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('❌ Variables Supabase manquantes dans .env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data, error } = await supabase.auth.admin.getUserById(
  'a768f99c-9484-4948-9f2a-da6c1f6f4bb0'
);

if (error) {
  console.error('❌ Erreur Supabase Auth');
  console.error(error.message);
  process.exit(1);
}

if (!data.user) {
  console.error('❌ Utilisateur DG introuvable');
  process.exit(1);
}

console.log('✅ Utilisateur Supabase Auth trouvé');
console.log(`UUID    : ${data.user.id}`);
console.log(`Email   : ${data.user.email}`);
console.log(`Confirmé: ${data.user.email_confirmed_at ? 'OUI' : 'NON'}`);
console.log(`Provider: ${data.user.app_metadata?.provider || 'inconnu'}`);
