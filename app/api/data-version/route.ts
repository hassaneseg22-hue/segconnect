import { NextResponse } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/data-version
//
// Renvoie un identifiant de version des données (date de la dernière
// modification connue). Les pages l'interrogent régulièrement et ne
// rechargent leurs données que lorsque cette version change.
// Ne renvoie aucune donnée métier.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    await requireAuth();

    const [refreshRes, importRes] = await Promise.all([
      supabaseAdmin
        .from('seg_data_refresh')
        .select('dataset,refreshed_at')
        .order('refreshed_at', { ascending: false }),
      supabaseAdmin
        .from('data_imports')
        .select('imported_at')
        .order('imported_at', { ascending: false })
        .limit(1),
    ]);

    if (refreshRes.error) {
      console.error('[data-version]', refreshRes.error.message);
    }

    if (importRes.error) {
      console.error('[data-version/imports]', importRes.error.message);
    }

    const datasets = (refreshRes.data ?? []).map((row) => ({
      dataset: String(row.dataset),
      refreshedAt: String(row.refreshed_at),
    }));

    const candidates = [
      ...datasets.map((row) => row.refreshedAt),
      importRes.data?.[0]?.imported_at ? String(importRes.data[0].imported_at) : null,
    ].filter((value): value is string => Boolean(value));

    const version = candidates.length
      ? candidates.reduce((latest, value) =>
          new Date(value).getTime() > new Date(latest).getTime() ? value : latest
        )
      : '';

    return NextResponse.json(
      { ok: true, version, datasets },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
