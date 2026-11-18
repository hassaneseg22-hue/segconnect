import { NextResponse } from 'next/server';
import { utilisateurAutorise, repondre } from '@/lib/journal-assistant';

// Assistant du Journal du DG : répond à partir des données du dashboard (lecture seule).
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const acces = await utilisateurAutorise('journal.view');
  if (!acces.ok) return NextResponse.json({ ok: false, error: acces.error }, { status: acces.status });
  try {
    const body = await req.json().catch(() => ({}));
    const question = String(body?.question ?? '').slice(0, 500);
    const r = await repondre(acces.db, acces.userId, question);
    return NextResponse.json({ ok: true, reponse: r.texte, carte: r.carte ?? null, liens: r.liens ?? [], naviguer: r.naviguer ?? null, suivantes: r.suivantes ?? [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erreur assistant';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
