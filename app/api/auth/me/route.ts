import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAppUser } from '@/lib/supabase/profile';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { ok: false, error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const appUser = await getSupabaseAppUser(user.id);

    if (!appUser) {
      return NextResponse.json(
        { ok: false, error: 'PROFILE_NOT_FOUND' },
        { status: 403 }
      );
    }

    if (appUser.status !== 'ACTIVE') {
      return NextResponse.json(
        { ok: false, error: 'ACCOUNT_INACTIVE' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: appUser.legacyUserId,
        authId: appUser.id,
        firstName: appUser.firstName,
        lastName: appUser.lastName,
        displayName: appUser.displayName,
        email: appUser.email,
        role: appUser.roleCode,
        roleCode: appUser.roleCode,
        roleName: appUser.roleName,
        status: appUser.status,
        departmentId: appUser.departmentId,
        agencyId: appUser.agencyId,
        agencyName: appUser.agencyName,
        jobTitle: appUser.jobTitle,
        phone: appUser.phone,
        avatar: appUser.avatar,
        permissions: appUser.permissions,
      },
    });
  } catch (err) {
    console.error(
      '[AUTH ME] ERREUR INTERNE:',
      err instanceof Error ? err.message : err
    );

    return NextResponse.json(
      { ok: false, error: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    );
  }
}
