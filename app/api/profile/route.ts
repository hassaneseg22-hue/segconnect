import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/auth';
import { createAuditLog } from '@/lib/auth/audit';
import {
  getUserProfile,
  updateUserProfile,
} from '@/lib/users/userProfile';
import { isAvatarUrlSafe } from '@/lib/users/avatar';

// Champs administrateurs / sensibles qu'un utilisateur ne peut PAS modifier
// depuis son propre profil.
const IGNORED_KEYS = [
  'email',
  'role_id',
  'permissions',
  'status',
  'department_id',
  'region_id',
  'agency_id',
  'center_id',
];

// GET /api/profile
export async function GET() {
  try {
    const user = await requireAuth();
    const profile = await getUserProfile(user.id);

    if (!profile) {
      return NextResponse.json(
        {
          ok: false,
          error: 'NOT_FOUND',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: profile.id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        displayName: profile.display_name,
        email: profile.email,
        pendingEmail: profile.pending_email,
        emailVerifiedAt: profile.email_verified_at,
        phone:
          profile.phone &&
          profile.phone.trim() !== '' &&
          profile.phone !== 'null'
            ? profile.phone
            : null,
        jobTitle: profile.job_title,
        avatar: isAvatarUrlSafe(profile.avatar)
          ? profile.avatar
          : null,
        roleCode: profile.role_code,
        roleName: profile.role_name,
        agencyId: profile.agency_id,
        agencyName: profile.agency_name,
        departmentId: profile.department_id,
        regionId: profile.region_id,
        centerId: profile.center_id,
        status: profile.status,
        lastLoginAt: profile.last_login_at,
        createdAt: profile.created_at,
        profileUpdatedAt: profile.profile_updated_at,
      },
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}

// PUT /api/profile
export async function PUT(req: NextRequest) {
  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'VALIDATION_ERROR',
      },
      { status: 422 }
    );
  }

  let user: Awaited<ReturnType<typeof requireAuth>>;

  try {
    user = await requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }

  const ip =
    req.headers
      .get('x-forwarded-for')
      ?.split(',')[0]
      ?.trim() ||
    req.headers.get('x-real-ip') ||
    null;

  const userAgent = req.headers.get('user-agent');

  const result = await updateUserProfile(user.id, {
    first_name:
      body.first_name !== undefined
        ? body.first_name
        : undefined,

    last_name:
      body.last_name !== undefined
        ? body.last_name
        : undefined,

    phone:
      body.phone !== undefined
        ? body.phone
        : undefined,

    job_title:
      body.job_title !== undefined
        ? body.job_title
        : undefined,
  });

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') {
      return NextResponse.json(
        {
          ok: false,
          error: 'NOT_FOUND',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: result.reason,
      },
      { status: 422 }
    );
  }

  // Protection TypeScript : result.data peut être null.
  if (!result.data) {
    return NextResponse.json(
      {
        ok: false,
        error: 'PROFILE_UPDATE_FAILED',
      },
      { status: 500 }
    );
  }

  const changed = Object.keys(body).some(
    (key) => !IGNORED_KEYS.includes(key)
  );

  if (changed) {
    await createAuditLog({
      userId: user.id,
      action: 'PROFILE_UPDATED',
      targetType: 'USER',
      targetId: user.id,
      description:
        'Mise à jour des informations de contact du profil',
      metadata: {
        first_name: result.data.first_name,
        last_name: result.data.last_name,
        phone: result.data.phone,
        job_title: result.data.job_title,
      },
      ip,
      userAgent,
      result: 'SUCCESS',
    });
  }

  return NextResponse.json({
    ok: true,
    data: result.data,
  });
}
