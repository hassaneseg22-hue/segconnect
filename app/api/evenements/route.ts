import { NextResponse } from 'next/server';
import {
  requireAuth,
  hasPermission,
  getUserPermissionsSet,
  authErrorResponse,
} from '@/lib/auth/auth';
import { createAuditLog } from '@/lib/auth/audit';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  CATEGORIES,
  PERMISSIONS,
  isGravite,
  isNature,
  isStatut,
  type Evenement,
  type EvenementNature,
} from '@/lib/evenements';

/* =====================================================================
 * /api/evenements — registre des incidents et missions de terrain
 *
 * GET  ?year=2026&nature=incident|mission
 *      Lecture : incidents.view / missions.view (ou dashboard.view /
 *      map.view pour l'affichage sur la carte et le tableau de bord).
 * POST Déclaration : incidents.create / missions.create.
 *
 * Écriture uniquement côté serveur (supabaseAdmin) ; la table est en
 * lecture seule pour les comptes connectés (RLS).
 * ===================================================================== */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const COLUMNS =
  'id,nature,categorie,titre,description,centre_nom,agency_id,installation,latitude,longitude,gravite,statut,date_debut,date_fin,equipe,impact_m3,declare_par,created_at,updated_at';

const numOrNull = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const textOrNull = (v: unknown, max = 2000) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

async function permissionsFor(user: Awaited<ReturnType<typeof requireAuth>>) {
  const all = user.role_code === 'SUPER_ADMIN';
  const set = all ? new Set<string>() : await getUserPermissionsSet(user);
  const has = (code: string) => all || set.has(code);
  const general = has('dashboard.view') || has('map.view');
  return {
    view: { incident: has(PERMISSIONS.incident.view) || general, mission: has(PERMISSIONS.mission.view) || general },
    create: { incident: has(PERMISSIONS.incident.create), mission: has(PERMISSIONS.mission.create) },
    update: {
      incident: has(PERMISSIONS.incident.update) || has(PERMISSIONS.incident.create),
      mission: has(PERMISSIONS.mission.update) || has(PERMISSIONS.mission.create),
    },
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const perms = await permissionsFor(user);

    const url = new URL(request.url);
    const yearParam = url.searchParams.get('year');
    const year = yearParam ? Number(yearParam) : null;
    if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
      return NextResponse.json({ ok: false, error: 'Année invalide.' }, { status: 400 });
    }
    const natureParam = url.searchParams.get('nature');
    if (natureParam && !isNature(natureParam)) {
      return NextResponse.json({ ok: false, error: 'Nature invalide.' }, { status: 400 });
    }

    const natures = (natureParam ? [natureParam] : ['incident', 'mission']).filter(
      (n) => perms.view[n as EvenementNature]
    ) as EvenementNature[];
    if (natures.length === 0) {
      return NextResponse.json({ ok: false, error: 'Accès refusé.' }, { status: 403 });
    }

    let query = supabaseAdmin
      .from('seg_evenements_terrain')
      .select(COLUMNS)
      .in('nature', natures)
      .order('date_debut', { ascending: false })
      .limit(2000);
    if (year !== null) {
      query = query.gte('date_debut', `${year}-01-01T00:00:00Z`).lt('date_debut', `${year + 1}-01-01T00:00:00Z`);
    }

    const [eventsRes, agenciesRes, centresRes] = await Promise.all([
      query,
      supabaseAdmin.from('agencies').select('id,name').order('name'),
      supabaseAdmin
        .from('seg_technique_center_monthly')
        .select('center_name')
        .gte('period_month', `${(year ?? new Date().getFullYear()) - 1}-01-01`)
        .limit(5000),
    ]);
    const failed = [eventsRes, agenciesRes, centresRes].find((r) => r.error);
    if (failed?.error) {
      console.error('[evenements]', failed.error.message);
      return NextResponse.json({ ok: false, error: 'Erreur de lecture du registre.' }, { status: 500 });
    }

    const agencies = ((agenciesRes.data ?? []) as Array<{ id: unknown; name: unknown }>).map((a) => ({ id: Number(a.id), name: String(a.name) }));
    const agencyName = new Map<number, string>(agencies.map((a) => [a.id, a.name]));

    const rows = (eventsRes.data ?? []) as Array<Record<string, unknown>>;
    const authorIds = Array.from(new Set(rows.map((r) => r.declare_par).filter((v): v is string => typeof v === 'string')));
    const authorName = new Map<string, string>();
    if (authorIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id,first_name,last_name,display_name')
        .in('id', authorIds);
      for (const p of (profiles ?? []) as Array<{ id: unknown; first_name: unknown; last_name: unknown; display_name: unknown }>) {
        const name = String(p.display_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`).trim();
        if (name) authorName.set(String(p.id), name);
      }
    }

    const events: Evenement[] = rows.map((r) => ({
      id: Number(r.id),
      nature: r.nature as EvenementNature,
      categorie: String(r.categorie ?? ''),
      titre: String(r.titre ?? ''),
      description: (r.description as string | null) ?? null,
      centre_nom: (r.centre_nom as string | null) ?? null,
      agency_id: r.agency_id === null || r.agency_id === undefined ? null : Number(r.agency_id),
      agency_name: r.agency_id === null || r.agency_id === undefined ? null : agencyName.get(Number(r.agency_id)) ?? null,
      installation: (r.installation as string | null) ?? null,
      latitude: numOrNull(r.latitude),
      longitude: numOrNull(r.longitude),
      gravite: isGravite(r.gravite) ? r.gravite : null,
      statut: isStatut(r.statut) ? r.statut : 'ouvert',
      date_debut: String(r.date_debut),
      date_fin: (r.date_fin as string | null) ?? null,
      equipe: (r.equipe as string | null) ?? null,
      impact_m3: numOrNull(r.impact_m3),
      declare_par: (r.declare_par as string | null) ?? null,
      declare_par_nom: typeof r.declare_par === 'string' ? authorName.get(r.declare_par) ?? null : null,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
    }));

    const centres = Array.from(
      new Set(((centresRes.data ?? []) as Array<{ center_name: unknown }>).map((c) => String(c.center_name ?? '').trim()).filter(Boolean))
    ).sort((a: string, b: string) => a.localeCompare(b, 'fr'));

    return NextResponse.json(
      {
        ok: true,
        data: {
          year,
          events,
          agencies,
          centres,
          permissions: { create: perms.create, update: perms.update },
        },
      },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse.status !== 500) return authResponse;
    console.error('[evenements]', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: 'Erreur interne du registre.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, error: 'Requête invalide.' }, { status: 400 });

    const nature = body.nature;
    if (!isNature(nature)) return NextResponse.json({ ok: false, error: 'Nature invalide.' }, { status: 400 });
    if (!(await hasPermission(user, PERMISSIONS[nature].create))) {
      return NextResponse.json({ ok: false, error: `Permission requise : ${PERMISSIONS[nature].create}` }, { status: 403 });
    }

    const categorie = textOrNull(body.categorie, 120);
    const titre = textOrNull(body.titre, 200);
    const dateDebut = textOrNull(body.date_debut, 40);
    const errors: string[] = [];
    if (!categorie || !CATEGORIES[nature].includes(categorie)) errors.push('catégorie');
    if (!titre) errors.push('titre');
    if (!dateDebut || Number.isNaN(Date.parse(dateDebut))) errors.push('date de début');
    const centre = textOrNull(body.centre_nom, 120);
    const agencyId = numOrNull(body.agency_id);
    if (!centre && agencyId === null) errors.push('centre ou agence');
    const gravite = body.gravite ?? null;
    if (gravite !== null && gravite !== '' && !isGravite(gravite)) errors.push('gravité');
    if (nature === 'incident' && !isGravite(gravite)) errors.push('gravité');
    const statut = body.statut ?? 'ouvert';
    if (!isStatut(statut)) errors.push('statut');
    const dateFin = textOrNull(body.date_fin, 40);
    if (dateFin && (Number.isNaN(Date.parse(dateFin)) || (dateDebut && Date.parse(dateFin) < Date.parse(dateDebut)))) {
      errors.push('date de fin');
    }
    const lat = numOrNull(body.latitude);
    const lon = numOrNull(body.longitude);
    if ((lat !== null && (lat < 7 || lat > 13)) || (lon !== null && (lon < -15.5 || lon > -7.5))) {
      errors.push('coordonnées (hors Guinée)');
    }
    const impact = numOrNull(body.impact_m3);
    if (impact !== null && impact < 0) errors.push('volume perdu');
    if (errors.length) {
      return NextResponse.json({ ok: false, error: `Champs invalides : ${Array.from(new Set(errors)).join(', ')}.` }, { status: 400 });
    }

    const record = {
      nature,
      categorie,
      titre,
      description: textOrNull(body.description),
      centre_nom: centre,
      agency_id: agencyId,
      installation: textOrNull(body.installation, 200),
      latitude: lat,
      longitude: lon,
      gravite: isGravite(gravite) ? gravite : null,
      statut,
      date_debut: new Date(dateDebut as string).toISOString(),
      date_fin: dateFin ? new Date(dateFin).toISOString() : null,
      equipe: textOrNull(body.equipe, 200),
      impact_m3: impact,
      declare_par: user.id,
    };

    const { data, error } = await supabaseAdmin.from('seg_evenements_terrain').insert(record).select('id').single();
    if (error) {
      console.error('[evenements:create]', error.message);
      return NextResponse.json({ ok: false, error: 'Enregistrement impossible.' }, { status: 500 });
    }

    await createAuditLog({
      userId: user.id,
      action: nature === 'incident' ? 'INCIDENT_CREATED' : 'MISSION_CREATED',
      targetType: 'SEG_EVENEMENT',
      targetId: data?.id ?? null,
      description: `${nature === 'incident' ? 'Incident' : 'Mission'} déclaré(e) : ${titre}`,
      newValues: record,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: request.headers.get('user-agent'),
      result: 'SUCCESS',
    });

    return NextResponse.json({ ok: true, data: { id: data?.id ?? null } }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse.status !== 500) return authResponse;
    console.error('[evenements:create]', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: 'Erreur interne du registre.' }, { status: 500 });
  }
}
