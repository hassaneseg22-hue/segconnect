import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 Mo
export const AVATAR_SIZE = 256;

export const AVATAR_DIR = path.join(
  process.cwd(),
  'public',
  'uploads',
  'profiles'
);

export const AVATAR_URL_PREFIX =
  '/uploads/profiles/';

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

/**
 * Résout un utilisateur vers profiles.id.
 *
 * Compatible avec :
 * - UUID Supabase
 * - ancien legacy_user_id
 */
async function resolveProfileId(
  userId: number | string
): Promise<string | null> {
  const value = String(userId).trim();

  if (isUuid(value)) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', value)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.id ?? null;
  }

  const legacyUserId = Number(value);

  if (!Number.isInteger(legacyUserId)) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('legacy_user_id', legacyUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

export function isAllowedAvatarMime(
  mime: string | undefined
): boolean {
  return !!mime && mime in ALLOWED_MIME;
}

/**
 * Vérifie qu'une URL d'avatar appartient bien
 * au dossier prévu et respecte le format attendu.
 */
export function isAvatarUrlSafe(
  url: string | null | undefined
): boolean {
  if (!url) return false;

  if (typeof url !== 'string') {
    return false;
  }

  if (!url.startsWith(AVATAR_URL_PREFIX)) {
    return false;
  }

  if (!url.endsWith('.webp')) {
    return false;
  }

  /**
   * Accepte :
   * /uploads/profiles/user-123-abcdef.webp
   *
   * et également les UUID :
   * /uploads/profiles/user-a768f99c-...-abcdef.webp
   */
  return /^\/uploads\/profiles\/user-[a-zA-Z0-9-]+-[a-f0-9]+\.webp$/.test(
    url
  );
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(AVATAR_DIR, {
    recursive: true,
  });
}

function resolveAvatarPath(url: string): string {
  return path.join(
    process.cwd(),
    'public',
    url.replace(/^\//, '')
  );
}

async function removeFileIfAny(
  url: string | null | undefined
): Promise<void> {
  if (
    !isAvatarUrlSafe(url) ||
    typeof url !== 'string'
  ) {
    return;
  }

  try {
    await fs.unlink(
      resolveAvatarPath(url)
    );
  } catch {
    // Fichier déjà absent : ignoré.
  }
}

/**
 * Récupère l'avatar actuel d'un utilisateur.
 */
async function getCurrentAvatar(
  profileId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('avatar')
    .eq('id', profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.avatar ?? null;
}

/**
 * Sauvegarde un nouvel avatar.
 *
 * Le fichier est :
 * - vérifié
 * - décodé avec Sharp
 * - tourné selon EXIF
 * - recadré 256x256
 * - converti en WebP
 *
 * L'URL est ensuite enregistrée dans :
 *
 * profiles.avatar
 */
export async function saveAvatar(
  userId: number | string,
  buffer: Buffer,
  mime: string
): Promise<string> {
  if (!isAllowedAvatarMime(mime)) {
    throw new Error('INVALID_TYPE');
  }

  if (
    !buffer.length ||
    buffer.length > AVATAR_MAX_BYTES
  ) {
    throw new Error('INVALID_SIZE');
  }

  const profileId =
    await resolveProfileId(userId);

  if (!profileId) {
    throw new Error('USER_NOT_FOUND');
  }

  const currentAvatar =
    await getCurrentAvatar(profileId);

  await ensureDir();

  /**
   * Re-encodage sécurisé :
   *
   * - validation réelle du contenu image
   * - rotation EXIF
   * - recadrage
   * - conversion WebP
   */
  let processed: Buffer;

  try {
    processed = await sharp(buffer, {
      failOn: 'error',
    })
      .rotate()
      .resize(
        AVATAR_SIZE,
        AVATAR_SIZE,
        {
          fit: 'cover',
          position: 'centre',
        }
      )
      .webp({
        quality: 85,
      })
      .toBuffer();
  } catch {
    throw new Error('INVALID_IMAGE');
  }

  /**
   * Utilisation de l'UUID pour éviter les collisions
   * et ne pas dépendre du legacy_user_id.
   */
  const filename =
    `user-${profileId}-${crypto
      .randomBytes(8)
      .toString('hex')}.webp`;

  const filePath = path.join(
    AVATAR_DIR,
    filename
  );

  await fs.writeFile(
    filePath,
    processed
  );

  const url =
    `${AVATAR_URL_PREFIX}${filename}`;

  /**
   * Mise à jour Supabase.
   */
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      avatar: url,
      profile_updated_at:
        new Date().toISOString(),
      updated_at:
        new Date().toISOString(),
    })
    .eq('id', profileId);

  if (error) {
    /**
     * Si Supabase échoue, supprimer le nouveau
     * fichier pour éviter un fichier orphelin.
     */
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignoré.
    }

    throw error;
  }

  /**
   * Seulement après succès de la mise à jour DB,
   * supprimer l'ancien avatar.
   */
  await removeFileIfAny(
    currentAvatar
  );

  return url;
}

/**
 * Supprime l'avatar d'un utilisateur.
 */
export async function deleteAvatar(
  userId: number | string
): Promise<void> {
  const profileId =
    await resolveProfileId(userId);

  if (!profileId) {
    throw new Error('USER_NOT_FOUND');
  }

  const currentAvatar =
    await getCurrentAvatar(profileId);

  /**
   * Supabase d'abord.
   */
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      avatar: null,
      profile_updated_at:
        new Date().toISOString(),
      updated_at:
        new Date().toISOString(),
    })
    .eq('id', profileId);

  if (error) {
    throw error;
  }

  /**
   * Puis suppression du fichier.
   */
  await removeFileIfAny(
    currentAvatar
  );
}
