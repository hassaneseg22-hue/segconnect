import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('❌ Variables Supabase manquantes dans l’environnement');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data, error } = await supabase
  .from('roles')
  .select('id, code, name')
  .order('id');

if (error) {
  console.error('❌ Connexion Supabase échouée');
  console.error(error.message);
  process.exit(1);
}

console.log('✅ Connexion Supabase réussie');
console.log(`✅ ${data.length} rôles trouvés`);

for (const role of data) {
  console.log(`${role.id} | ${role.code} | ${role.name}`);
}
