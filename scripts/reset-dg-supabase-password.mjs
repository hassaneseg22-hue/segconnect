import fs from 'fs';
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(path) {
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
  console.error('❌ Configuration Supabase manquante');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const userId = 'a768f99c-9484-4948-9f2a-da6c1f6f4bb0';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Nouveau mot de passe Supabase du DG : ', async (password) => {
  rl.close();

  if (!password || password.length < 8) {
    console.error('❌ Le mot de passe doit contenir au moins 8 caractères.');
    process.exit(1);
  }

  const { data, error } = await supabase.auth.admin.updateUserById(
    userId,
    { password }
  );

  if (error) {
    console.error('❌ Échec de modification du mot de passe');
    console.error(error.message);
    process.exit(1);
  }

  console.log('✅ Mot de passe Supabase du DG modifié');
  console.log(`UUID : ${data.user.id}`);
  console.log(`Email : ${data.user.email}`);
});
