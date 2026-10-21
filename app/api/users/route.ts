import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requirePermission, ApiAuthError, authErrorResponse } from '@/lib/auth/auth';
import { createAuditLog } from '@/lib/auth/audit';
import { listUsers, createUser, findUserByEmail } from '@/lib/users/users';
import { createInvitation } from '@/lib/users/invitations';
import { getRoleByCode } from '@/lib/users/roles';
import { insertNotification } from '@/lib/notifications-db';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'users.view');

    const url = new URL(req.url);
    const data = await listUsers({
      page: Number(url.searchParams.get('page') || 1),
      limit: Number(url.searchParams.get('limit') || 20),
      search: url.searchParams.get('search') || undefined,
      role: url.searchParams.get('role') || undefined,
      status: url.searchParams.get('status') || undefined,
      agency: url.searchParams.get('agency') || undefined,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAuth();
    await requirePermission(actor, 'users.create');

    const body = await req.json();
    const first_name = String(body.first_name || '').trim();
    const last_name = String(body.last_name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const role_id = Number(body.role_id);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const userAgent = req.headers.get('user-agent');

    if (!first_name || !last_name || !email || !role_id) {
      return NextResponse.json({ ok: false, error: 'VALIDATION_ERROR' }, { status: 422 });
    }

    if (await findUserByEmail(email)) {
      return NextResponse.json({ ok: false, error: 'CONFLICT', message: 'Un compte existe déjà avec cet email.' }, { status: 409 });
    }

    // Interdiction : création d'un second SUPER_ADMIN via l'interface (règle absolue V0.2)
    const role = await getRoleByCode('SUPER_ADMIN');
    if (role && Number(role.id) === role_id) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN', message: 'La création d’un second SUPER_ADMIN est impossible.' }, { status: 403 });
    }

    const userId = await createUser({
      first_name,
      last_name,
      email,
      phone: body.phone ? String(body.phone) : null,
      job_title: body.job_title ? String(body.job_title) : null,
      role_id,
      agency_id: body.agency_id ? Number(body.agency_id) : null,
      department_id: body.department_id ? Number(body.department_id) : null,
      status: 'INVITED',
      created_by: actor.id,
    });

    const invitationToken = await createInvitation(userId);
    await createAuditLog({
      userId: actor.id, action: 'USER_CREATED', targetType: 'USER', targetId: userId,
      description: `Création de l'utilisateur ${first_name} ${last_name}`,
      metadata: { role_id, email }, newValues: { first_name, last_name, email, role_id },
      ip, userAgent, result: 'SUCCESS',
    });
    await insertNotification({
      type: 'info', category: 'USERS', title: 'Nouvel utilisateur créé',
      message: `${first_name} ${last_name} a été créé avec une invitation.`,
      source: 'users', target_url: `/users/${userId}`, severity_score: 3,
      metadata: { userId, invitationToken },
    });

    return NextResponse.json({ ok: true, data: { id: userId, invitationToken } }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err);
  }
}