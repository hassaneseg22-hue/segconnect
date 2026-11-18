// app/api/situation-dr/route.ts
// GET /api/situation-dr — situations des directions régionales transmises à la DCCCI.
import { NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET() {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'centres.view');
  } catch {
    return NextResponse.json({ ok: false, error: 'Accès refusé.' }, { status: 403, headers: NO_STORE });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('seg_situation_dr')
      .select('dr,date_rapport,rubrique,centre,ordre,donnees,source_document')
      .order('date_rapport', { ascending: false })
      .limit(5000);
    if (error) throw error;
    return NextResponse.json({ ok: true, lignes: data ?? [] }, { headers: NO_STORE });
  } catch (e) {
    console.error('[api/situation-dr]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Chargement impossible.' }, { status: 500, headers: NO_STORE });
  }
}
