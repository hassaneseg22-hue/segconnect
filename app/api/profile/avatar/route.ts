import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/auth';
import { createAuditLog } from '@/lib/auth/audit';
import { saveAvatar, deleteAvatar, isAllowedAvatarMime, AVATAR_MAX_BYTES } from '@/lib/users/avatar';

async function readMultipartAvatar(req: NextRequest): Promise<{ buffer: Buffer; mime: string }> {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    throw { code: 'INVALID_TYPE' };
  }
  const form = await req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string' || !('arrayBuffer' in file)) {
    throw { code: 'INVALID_TYPE' };
  }
  const mime = (file as File).type || '';
  if (!isAllowedAvatarMime(mime)) {
    throw { code: 'INVALID_TYPE' };
  }
  const buffer = Buffer.from(await (file as File).arrayBuffer());
  if (!buffer.length || buffer.length > AVATAR_MAX_BYTES) {
    throw { code: 'INVALID_SIZE' };
  }
  return { buffer, mime };
}

// POST /api/profile/avatar — upload (multipart, champ « file »).
export async function POST(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const userAgent = req.headers.get('user-agent');

  let avatarUrl: string;
  try {
    const { buffer, mime } = await readMultipartAvatar(req);
    avatarUrl = await saveAvatar(user.id, buffer, mime);
  } catch (err: any) {
    const code = err?.code;
    if (code === 'INVALID_TYPE') return NextResponse.json({ ok: false, error: 'INVALID_TYPE' }, { status: 422 });
    if (code === 'INVALID_SIZE') return NextResponse.json({ ok: false, error: 'INVALID_SIZE' }, { status: 413 });
    return NextResponse.json({ ok: false, error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }

  await createAuditLog({
    userId: user.id,
    action: 'PROFILE_AVATAR_UPDATED',
    targetType: 'USER',
    targetId: user.id,
    description: "Changement de la photo de profil",
    metadata: { avatar: avatarUrl },
    ip,
    userAgent,
    result: 'SUCCESS',
  });

  return NextResponse.json({ ok: true, data: { avatar: avatarUrl } });
}

// DELETE /api/profile/avatar — suppression de la photo actuelle.
export async function DELETE(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const userAgent = req.headers.get('user-agent');

  try {
    await deleteAvatar(user.id);
  } catch {
    return NextResponse.json({ ok: false, error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }

  await createAuditLog({
    userId: user.id,
    action: 'PROFILE_AVATAR_REMOVED',
    targetType: 'USER',
    targetId: user.id,
    description: 'Suppression de la photo de profil',
    ip,
    userAgent,
    result: 'SUCCESS',
  });

  return NextResponse.json({ ok: true, data: { avatar: null } });
}