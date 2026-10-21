import { NextResponse } from 'next/server';
import {
  requireAuth,
  hasPermission,
  authErrorResponse,
} from '@/lib/auth/auth';
import { createAuditLog } from '@/lib/auth/audit';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PERMISSIONS, isGravite, isNature, isStatut } from '@/lib/evenements';

/* =====================================================================
 * PATCH /api/evenements/:id — suivi d'un incident ou d'une mission
 * (statut, date de fin, gravité, équipe, volume perdu, description).
 * Permission : incidents.update ou incidents.create (idem missions).
 * Aucune suppression : un événement erroné passe au statut « annulé ».
 * ===================================================================== */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return NextResponse.json({ ok: false, error: 'Identifiant invalide.' }, { status: 400 });
    }

    const { data: current, error: readError } = await supabaseAdmin
      .from('seg_evenements_terrain')
      .select('id,nature,statut,date_debut,date_fin,gravite,equipe,impact_m3,description')
      .eq('id', eventId)
      .maybeSingle();
    if (readError) {
      console.error('[evenements:update]', readError.message);
      return NextResponse.json({ ok: false, error: 'Lecture impossible.' }, { status: 500 });
    }
    const nature = current?.nature;
    if (!current || !isNature(nature)) {
      return NextResponse.json({ ok: false, error: 'Événement introuvable.' }, { status: 404 });
    }

    const perm = PERMISSIONS[nature];
    const allowed = (await hasPermission(user, perm.update)) || (await hasPermission(user, perm.create));
    if (!allowed) {
      return NextResponse.json({ ok: false, error: `Permission requise : ${perm.update}` }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, error: 'Requête invalide.' }, { status: 400 });

    const update: Record<string, unknown> = {};
    if ('statut' in body) {
      if (!isStatut(body.statut)) return NextResponse.json({ ok: false, error: 'Statut invalide.' }, { status: 400 });
      update.statut = body.statut;
      // Clôture : date de fin = maintenant si elle n'est pas fournie.
      if ((body.statut === 'resolu' || body.statut === 'annule') && !current.date_fin && !('date_fin' in body)) {
        update.date_fin = new Date().toISOString();
      }
    }
    if ('date_fin' in body) {
      if (body.date_fin === null || body.date_fin === '') update.date_fin = null;
      else if (typeof body.date_fin === 'string' && !Number.isNaN(Date.parse(body.date_fin))) {
        if (Date.parse(body.date_fin) < Date.parse(String(current.date_debut))) {
          return NextResponse.json({ ok: false, error: 'La date de fin précède la date de début.' }, { status: 400 });
        }
        update.date_fin = new Date(body.date_fin).toISOString();
      } else return NextResponse.json({ ok: false, error: 'Date de fin invalide.' }, { status: 400 });
    }
    if ('gravite' in body) {
      if (body.gravite !== null && !isGravite(body.gravite)) {
        return NextResponse.json({ ok: false, error: 'Gravité invalide.' }, { status: 400 });
      }
      update.gravite = body.gravite;
    }
    if ('equipe' in body) update.equipe = typeof body.equipe === 'string' && body.equipe.trim() ? body.equipe.trim().slice(0, 200) : null;
    if ('description' in body) {
      update.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 2000) : null;
    }
    if ('impact_m3' in body) {
      const v = body.impact_m3 === null || body.impact_m3 === '' ? null : Number(body.impact_m3);
      if (v !== null && (!Number.isFinite(v) || v < 0)) {
        return NextResponse.json({ ok: false, error: 'Volume perdu invalide.' }, { status: 400 });
      }
      update.impact_m3 = v;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: 'Aucune modification.' }, { status: 400 });
    }
    update.updated_at = new Date().toISOString();

    const { error } = await supabaseAdmin.from('seg_evenements_terrain').update(update).eq('id', eventId);
    if (error) {
      console.error('[evenements:update]', error.message);
      return NextResponse.json({ ok: false, error: 'Mise à jour impossible.' }, { status: 500 });
    }

    await createAuditLog({
      userId: user.id,
      action: nature === 'incident' ? 'INCIDENT_UPDATED' : 'MISSION_UPDATED',
      targetType: 'SEG_EVENEMENT',
      targetId: eventId,
      description: `Mise à jour ${nature === 'incident' ? "de l'incident" : 'de la mission'} n° ${eventId}`,
      oldValues: current,
      newValues: update,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: request.headers.get('user-agent'),
      result: 'SUCCESS',
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse.status !== 500) return authResponse;
    console.error('[evenements:update]', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: 'Erreur interne du registre.' }, { status: 500 });
  }
}
