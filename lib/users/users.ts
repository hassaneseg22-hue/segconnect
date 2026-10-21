import { supabaseAdmin } from '@/lib/supabase/admin';

export interface CreateUserInput {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  job_title?: string | null;
  role_id: number;
  agency_id?: number | null;
  department_id?: number | null;
  status?: 'INVITED' | 'ACTIVE';
  created_by?: number | string | null;
}

export interface UpdateUserInput {
  first_name?: string;
  last_name?: string;
  display_name?: string;
  email?: string;
  phone?: string | null;
  job_title?: string | null;
  role_id?: number;
  agency_id?: number | null;
  department_id?: number | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s().]{6,20}$/;

/**
 * Détermine si une valeur est un UUID Supabase.
 */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

/**
 * Résout un profil à partir :
 * - de profiles.id (UUID Supabase)
 * - ou de profiles.legacy_user_id
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

/**
 * Convertit un profil Supabase vers la forme attendue
 * par l'ancien système.
 */
async function formatProfile(profile: any) {
  let role_code: string | null = null;
  let role_name: string | null = null;

  if (profile.role_id != null) {
    const { data: role, error: roleError } = await supabaseAdmin
      .from('roles')
      .select('code, name')
      .eq('id', profile.role_id)
      .maybeSingle();

    if (roleError) {
      throw roleError;
    }

    role_code = role?.code ?? null;
    role_name = role?.name ?? null;
  }

  let agency_name: string | null = null;

  if (profile.agency_id != null) {
    const { data: agency, error: agencyError } = await supabaseAdmin
      .from('agencies')
      .select('name')
      .eq('id', profile.agency_id)
      .maybeSingle();

    if (agencyError) {
      throw agencyError;
    }

    agency_name = agency?.name ?? null;
  }

  const role_label =
    role_code === 'SUPER_ADMIN'
      ? 'Principal — Directeur Général'
      : role_name;

  return {
    id: profile.id,

    legacy_user_id:
      profile.legacy_user_id == null
        ? null
        : Number(profile.legacy_user_id),

    first_name: profile.first_name,
    last_name: profile.last_name,
    display_name: profile.display_name,

    email: profile.email,
    pending_email: profile.pending_email ?? null,

    phone: profile.phone,
    job_title: profile.job_title,

    role_id:
      profile.role_id == null
        ? null
        : Number(profile.role_id),

    role_code,
    role_name,
    role_label,

    department_id:
      profile.department_id == null
        ? null
        : Number(profile.department_id),

    region_id:
      profile.region_id == null
        ? null
        : Number(profile.region_id),

    center_id:
      profile.center_id == null
        ? null
        : Number(profile.center_id),

    agency_id:
      profile.agency_id == null
        ? null
        : Number(profile.agency_id),

    agency_name,

    status: profile.status,
    avatar: profile.avatar,

    last_login_at: profile.last_login_at,
    last_login_ip: profile.last_login_ip ?? null,

    created_at: profile.created_at,
    updated_at: profile.updated_at,

    created_by: profile.created_by ?? null,
  };
}

/**
 * Liste les utilisateurs.
 */
export async function listUsers(
  opts: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
    agency?: string;
  } = {}
) {
  const page = Math.max(
    1,
    Number(opts.page) || 1
  );

  const limit = Math.min(
    100,
    Math.max(1, Number(opts.limit) || 20)
  );

  const search = opts.search?.trim().toLowerCase();

  /**
   * On récupère les profils.
   *
   * Les filtres sont appliqués côté serveur après récupération
   * des données Supabase.
   */
  let query = supabaseAdmin
    .from('profiles')
    .select(`
      id,
      legacy_user_id,
      first_name,
      last_name,
      display_name,
      email,
      pending_email,
      phone,
      job_title,
      role_id,
      department_id,
      region_id,
      center_id,
      agency_id,
      status,
      avatar,
      last_login_at,
      created_at,
      updated_at,
      created_by
    `);

  if (opts.status) {
    query = query.eq('status', opts.status);
  }

  const {
    data: profiles,
    error: profilesError,
  } = await query;

  if (profilesError) {
    throw profilesError;
  }

  let filtered = profiles ?? [];

  /**
   * Récupération des rôles.
   */
  const { data: roles, error: rolesError } =
    await supabaseAdmin
      .from('roles')
      .select('id, code, name');

  if (rolesError) {
    throw rolesError;
  }

  const roleMap = new Map(
    (roles ?? []).map((role) => [
      Number(role.id),
      role,
    ])
  );

  /**
   * Récupération des agences.
   */
  const { data: agencies, error: agenciesError } =
    await supabaseAdmin
      .from('agencies')
      .select('id, name');

  if (agenciesError) {
    throw agenciesError;
  }

  const agencyMap = new Map(
    (agencies ?? []).map((agency) => [
      Number(agency.id),
      agency,
    ])
  );

  /**
   * Recherche texte.
   */
  if (search) {
    filtered = filtered.filter((profile) => {
      const values = [
        profile.first_name,
        profile.last_name,
        profile.display_name,
        profile.email,
        profile.phone,
        profile.job_title,
      ];

      return values.some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(search)
      );
    });
  }

  /**
   * Filtre rôle.
   */
  if (opts.role) {
    filtered = filtered.filter((profile) => {
      const role = roleMap.get(
        Number(profile.role_id)
      );

      return role?.code === opts.role;
    });
  }

  /**
   * Filtre agence.
   */
  if (opts.agency) {
    filtered = filtered.filter((profile) => {
      const agency = agencyMap.get(
        Number(profile.agency_id)
      );

      return agency?.name === opts.agency;
    });
  }

  /**
   * Tri par date de création décroissante.
   */
  filtered.sort((a, b) => {
    const dateA = new Date(
      a.created_at ?? 0
    ).getTime();

    const dateB = new Date(
      b.created_at ?? 0
    ).getTime();

    return dateB - dateA;
  });

  const total = filtered.length;

  const offset = (page - 1) * limit;

  const pageItems = filtered.slice(
    offset,
    offset + limit
  );

  const items = await Promise.all(
    pageItems.map((profile) =>
      formatProfile(profile)
    )
  );

  return {
    items,
    total,
    page,
    limit,
  };
}

/**
 * Récupère un utilisateur par UUID ou legacy_user_id.
 */
export async function getUserById(
  id: number | string
) {
  const profileId = await resolveProfileId(id);

  if (!profileId) {
    return null;
  }

  const { data: profile, error } =
    await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        legacy_user_id,
        first_name,
        last_name,
        display_name,
        email,
        pending_email,
        phone,
        job_title,
        role_id,
        department_id,
        region_id,
        center_id,
        agency_id,
        status,
        avatar,
        last_login_at,
        last_login_ip,
        created_at,
        updated_at,
        created_by
      `)
      .eq('id', profileId)
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!profile) {
    return null;
  }

  return formatProfile(profile);
}

/**
 * Recherche un utilisateur par email.
 *
 * Le mot de passe n'est volontairement jamais retourné.
 * Supabase Auth gère les credentials.
 */
export async function findUserByEmail(
  email: string
) {
  const normalizedEmail = String(email)
    .trim()
    .toLowerCase();

  const { data: profile, error } =
    await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        legacy_user_id,
        first_name,
        last_name,
        email,
        role_id,
        status,
        agency_id,
        department_id
      `)
      .ilike('email', normalizedEmail)
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!profile) {
    return null;
  }

  let role_code: string | null = null;

  if (profile.role_id != null) {
    const { data: role, error: roleError } =
      await supabaseAdmin
        .from('roles')
        .select('code')
        .eq('id', profile.role_id)
        .maybeSingle();

    if (roleError) {
      throw roleError;
    }

    role_code = role?.code ?? null;
  }

  return {
    id: profile.id,

    legacy_user_id:
      profile.legacy_user_id == null
        ? null
        : Number(profile.legacy_user_id),

    first_name: profile.first_name,
    last_name: profile.last_name,
    email: profile.email,

    /**
     * Conservé uniquement pour compatibilité de type.
     *
     * Le mot de passe réel est désormais géré
     * exclusivement par Supabase Auth.
     */
    password_hash: null,

    role_id:
      profile.role_id == null
        ? null
        : Number(profile.role_id),

    role_code,

    status: profile.status,

    agency_id:
      profile.agency_id == null
        ? null
        : Number(profile.agency_id),

    department_id:
      profile.department_id == null
        ? null
        : Number(profile.department_id),
  };
}

/**
 * Création d'un utilisateur.
 *
 * 1. Création du compte dans Supabase Auth.
 * 2. Création du profil dans profiles.
 */
export async function createUser(
  input: CreateUserInput
) {
  const firstName = String(
    input.first_name
  ).trim();

  const lastName = String(
    input.last_name
  ).trim();

  const email = String(input.email)
    .trim()
    .toLowerCase();

  if (!firstName || !lastName) {
    throw new Error(
      'Le prénom et le nom sont obligatoires.'
    );
  }

  if (!EMAIL_RE.test(email)) {
    throw new Error(
      'Adresse email invalide.'
    );
  }

  if (
    input.phone &&
    !PHONE_RE.test(
      String(input.phone).trim()
    )
  ) {
    throw new Error(
      'Numéro de téléphone invalide.'
    );
  }

  /**
   * Vérifier que l'email n'existe pas déjà
   * dans profiles.
   */
  const { data: existingProfile, error: existingError } =
    await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingProfile) {
    throw new Error(
      'Cette adresse email est déjà utilisée.'
    );
  }

  /**
   * Vérifier le rôle.
   */
  const { data: role, error: roleError } =
    await supabaseAdmin
      .from('roles')
      .select('id, code, name')
      .eq('id', input.role_id)
      .maybeSingle();

  if (roleError) {
    throw roleError;
  }

  if (!role) {
    throw new Error(
      `Rôle introuvable : ${input.role_id}`
    );
  }

  /**
   * Vérifier l'agence si fournie.
   */
  if (input.agency_id != null) {
    const { data: agency, error: agencyError } =
      await supabaseAdmin
        .from('agencies')
        .select('id')
        .eq('id', input.agency_id)
        .maybeSingle();

    if (agencyError) {
      throw agencyError;
    }

    if (!agency) {
      throw new Error(
        `Agence introuvable : ${input.agency_id}`
      );
    }
  }

  /**
   * Création Auth.
   *
   * Pour INVITED :
   * le compte est créé sans mot de passe local.
   *
   * L'invitation est ensuite envoyée via
   * Supabase Auth.
   */
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm:
        input.status === 'ACTIVE',
    });

  if (authError) {
    throw authError;
  }

  if (!authData.user) {
    throw new Error(
      'Supabase Auth n’a pas créé l’utilisateur.'
    );
  }

  const authUserId = authData.user.id;

  const display_name =
    `${firstName} ${lastName}`.trim();

  let createdById: string | null = null;

  if (input.created_by != null) {
    createdById =
      await resolveProfileId(
        input.created_by
      );
  }

  /**
   * Création du profil applicatif.
   */
  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from('profiles')
      .insert({
        id: authUserId,
        first_name: firstName,
        last_name: lastName,
        display_name,
        email,
        phone: input.phone ?? null,
        job_title: input.job_title ?? null,
        role_id: input.role_id,
        agency_id: input.agency_id ?? null,
        department_id:
          input.department_id ?? null,
        status: input.status ?? 'INVITED',
        created_by: createdById,
        profile_updated_at:
          new Date().toISOString(),
      })
      .select('id, legacy_user_id')
      .single();

  if (profileError) {
    /**
     * Rollback Auth si la création du profil échoue.
     */
    await supabaseAdmin.auth.admin.deleteUser(
      authUserId
    );

    throw profileError;
  }

  return (
    profile.legacy_user_id != null
      ? Number(profile.legacy_user_id)
      : profile.id
  );
}

/**
 * Met à jour un utilisateur.
 */
export async function updateUser(
  id: number | string,
  input: UpdateUserInput
) {
  const profileId = await resolveProfileId(id);

  if (!profileId) {
    return false;
  }

  const current = await getUserById(
    profileId
  );

  if (!current) {
    return false;
  }

  const update: Record<string, unknown> = {};

  if (input.first_name !== undefined) {
    const value = String(
      input.first_name
    ).trim();

    if (!value) {
      throw new Error(
        'Le prénom ne peut pas être vide.'
      );
    }

    update.first_name = value;
  }

  if (input.last_name !== undefined) {
    const value = String(
      input.last_name
    ).trim();

    if (!value) {
      throw new Error(
        'Le nom ne peut pas être vide.'
      );
    }

    update.last_name = value;
  }

  if (
    input.display_name !== undefined
  ) {
    update.display_name =
      input.display_name == null
        ? null
        : String(input.display_name).trim();
  } else if (
    input.first_name !== undefined ||
    input.last_name !== undefined
  ) {
    const firstName =
      input.first_name !== undefined
        ? String(
            input.first_name
          ).trim()
        : current.first_name;

    const lastName =
      input.last_name !== undefined
        ? String(
            input.last_name
          ).trim()
        : current.last_name;

    update.display_name =
      `${firstName} ${lastName}`.trim();
  }

  if (input.email !== undefined) {
    const email = String(
      input.email
    )
      .trim()
      .toLowerCase();

    if (!EMAIL_RE.test(email)) {
      throw new Error(
        'Adresse email invalide.'
      );
    }

    if (
      email !==
      String(current.email)
        .trim()
        .toLowerCase()
    ) {
      /**
       * Le changement d'email doit passer par
       * le flux Supabase Auth.
       */
      const { error: authError } =
        await supabaseAdmin.auth.admin.updateUserById(
          profileId,
          {
            email,
            email_confirm: false,
          }
        );

      if (authError) {
        throw authError;
      }

      update.pending_email = email;
    }
  }

  if (input.phone !== undefined) {
    const phone =
      input.phone === null
        ? null
        : String(input.phone).trim();

    if (
      phone &&
      !PHONE_RE.test(phone)
    ) {
      throw new Error(
        'Numéro de téléphone invalide.'
      );
    }

    update.phone = phone;
  }

  if (input.job_title !== undefined) {
    update.job_title =
      input.job_title === null
        ? null
        : String(
            input.job_title
          )
            .trim()
            .slice(0, 150);
  }

  if (input.role_id !== undefined) {
    const { data: role, error } =
      await supabaseAdmin
        .from('roles')
        .select('id')
        .eq('id', input.role_id)
        .maybeSingle();

    if (error) {
      throw error;
    }

    if (!role) {
      throw new Error(
        `Rôle introuvable : ${input.role_id}`
      );
    }

    update.role_id = input.role_id;
  }

  if (input.agency_id !== undefined) {
    if (input.agency_id !== null) {
      const { data: agency, error } =
        await supabaseAdmin
          .from('agencies')
          .select('id')
          .eq('id', input.agency_id)
          .maybeSingle();

      if (error) {
        throw error;
      }

      if (!agency) {
        throw new Error(
          `Agence introuvable : ${input.agency_id}`
        );
      }
    }

    update.agency_id =
      input.agency_id;
  }

  if (
    input.department_id !== undefined
  ) {
    update.department_id =
      input.department_id;
  }

  if (!Object.keys(update).length) {
    return true;
  }

  update.updated_at =
    new Date().toISOString();

  update.profile_updated_at =
    new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(update)
    .eq('id', profileId);

  if (error) {
    throw error;
  }

  /**
   * Si le rôle change, les anciennes sessions
   * applicatives ne sont plus concernées :
   * Supabase Auth gère maintenant les sessions.
   */
  return true;
}

/**
 * Modifie le statut d'un utilisateur.
 */
export async function setUserStatus(
  userId: number | string,
  status: string
) {
  const profileId =
    await resolveProfileId(userId);

  if (!profileId) {
    throw new Error(
      `Utilisateur introuvable : ${String(userId)}`
    );
  }

  const allowedStatuses = [
    'INVITED',
    'ACTIVE',
    'SUSPENDED',
    'DISABLED',
    'INACTIVE',
  ];

  if (!allowedStatuses.includes(status)) {
    throw new Error(
      `Statut utilisateur invalide : ${status}`
    );
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      status,
      updated_at:
        new Date().toISOString(),
      profile_updated_at:
        new Date().toISOString(),
    })
    .eq('id', profileId);

  if (error) {
    throw error;
  }

  /**
   * Bloquer l'accès Auth pour les comptes
   * SUSPENDED / DISABLED.
   *
   * Supabase Admin ne possède pas de champ
   * "status" standard dans auth.users.
   *
   * La protection réelle doit donc également
   * être appliquée dans /api/auth/login et
   * /api/auth/me via profiles.status.
   */
}

/**
 * Vérifie si l'utilisateur est SUPER_ADMIN.
 */
export async function isSuperAdmin(
  userId: number | string
): Promise<boolean> {
  const profileId =
    await resolveProfileId(userId);

  if (!profileId) {
    return false;
  }

  const { data: profile, error } =
    await supabaseAdmin
      .from('profiles')
      .select('role_id')
      .eq('id', profileId)
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!profile?.role_id) {
    return false;
  }

  const { data: role, error: roleError } =
    await supabaseAdmin
      .from('roles')
      .select('code')
      .eq('id', profile.role_id)
      .maybeSingle();

  if (roleError) {
    throw roleError;
  }

  return role?.code === 'SUPER_ADMIN';
}

/**
 * Création du compte SUPER_ADMIN.
 *
 * Utilise exclusivement Supabase Auth pour
 * le mot de passe.
 */
export async function createSuperAdmin(
  input: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
  }
) {
  const firstName = String(
    input.first_name
  ).trim();

  const lastName = String(
    input.last_name
  ).trim();

  const email = String(input.email)
    .trim()
    .toLowerCase();

  const password = String(
    input.password
  );

  if (!firstName || !lastName) {
    throw new Error(
      'Le prénom et le nom sont obligatoires.'
    );
  }

  if (!EMAIL_RE.test(email)) {
    throw new Error(
      'Adresse email invalide.'
    );
  }

  if (password.length < 8) {
    throw new Error(
      'Le mot de passe doit contenir au moins 8 caractères.'
    );
  }

  /**
   * Récupérer le rôle SUPER_ADMIN.
   */
  const { data: role, error: roleError } =
    await supabaseAdmin
      .from('roles')
      .select('id')
      .eq('code', 'SUPER_ADMIN')
      .maybeSingle();

  if (roleError) {
    throw roleError;
  }

  if (!role) {
    throw new Error(
      'Rôle SUPER_ADMIN introuvable.'
    );
  }

  /**
   * Vérifier si l'email existe déjà.
   */
  const { data: existing, error: existingError } =
    await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    throw new Error(
      'Un utilisateur existe déjà avec cette adresse email.'
    );
  }

  /**
   * Créer le compte Supabase Auth.
   */
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    throw authError;
  }

  if (!authData.user) {
    throw new Error(
      'Impossible de créer le compte Supabase Auth.'
    );
  }

  const authUserId =
    authData.user.id;

  /**
   * Créer le profil applicatif.
   */
  const display_name =
    `${firstName} ${lastName}`.trim();

  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from('profiles')
      .insert({
        id: authUserId,
        first_name: firstName,
        last_name: lastName,
        display_name,
        email,
        role_id: role.id,
        status: 'ACTIVE',
        profile_updated_at:
          new Date().toISOString(),
      })
      .select('id, legacy_user_id')
      .single();

  if (profileError) {
    /**
     * Rollback du compte Auth si le profil
     * n'a pas pu être créé.
     */
    await supabaseAdmin.auth.admin.deleteUser(
      authUserId
    );

    throw profileError;
  }

  /**
   * Audit facultatif.
   *
   * On ne dépend volontairement plus de l'ancien
   * createAuditLog MySQL.
   */
  try {
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: authUserId,
        action: 'USER_CREATED',
        target_type: 'USER',
        target_id: authUserId,
        description:
          `Création du compte administrateur principal ${firstName} ${lastName}`,
        metadata: {
          role: 'SUPER_ADMIN',
          via: 'create-super-admin',
        },
      });
  } catch {
    /**
     * L'échec de l'audit ne doit pas annuler
     * la création du compte.
     */
  }

  return profile.legacy_user_id != null
    ? Number(profile.legacy_user_id)
    : profile.id;
}

/**
 * Compatibilité avec l'ancien code.
 *
 * Les sessions sont maintenant gérées par Supabase Auth.
 *
 * Cette fonction ne doit plus manipuler de table
 * user_sessions MySQL.
 */
export async function revokeUserSessions(
  _userId: number | string
) {
  /**
   * Supabase Auth gère les sessions.
   *
   * Le contrôle d'accès applicatif doit principalement
   * s'appuyer sur profiles.status et les permissions.
   */
  return;
}
