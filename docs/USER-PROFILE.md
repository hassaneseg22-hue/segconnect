# Profil Utilisateur (USER-PROFILE)

Module « Mon profil » de SEG CONNECT : gestion du profil personnel de l'utilisateur
authentifié. La mission ne touche **aucun** module métier (facturation, technique,
recouvrement, imports, qualité) ni les pages existantes (Vue Nationale, Agences,
Production, Réseau, Facturation, Recouvrement, Rapports, Import, Notifications,
Journal d'Audit). Elle ne fait que **lire** les rôles/permissions pour l'affichage.

---

## 1. Principe général

- Un utilisateur ne peut voir et modifier que **son propre** profil (sinon 401).
- Toutes les données proviennent de l'utilisateur **authentifié via session**.
- Le champ `email` n'est **jamais** modifiable par `PUT /api/profile` : il passe
  exclusivement par le flux `change-email` → `confirm-email`.
- Champs administrateurs **inaccessibles** depuis le profil personnel, ignorés
  silencieusement par le backend : `role_id`, `permissions`, `status`,
  `department_id`, `region_id`, `agency_id`, `center_id`.
- `display_name` est **recalculé automatiquement** = `first_name + " " + last_name`.
- `/api/profile` ne retourne **jamais** : `password_hash`, token de session,
  token de changement d'email, token de reset, ni secrets.

---

## 2. Tables concernées

Table `users` (colonnes utilisées ou gérées par le module) :

| Colonne            | Rôle                                                        |
|--------------------|-------------------------------------------------------------|
| `first_name`       | Prénom (modifiable)                                         |
| `last_name`        | Nom (modifiable)                                            |
| `display_name`     | Recalculé automatiquement                                   |
| `phone`            | Téléphone (modifiable, validation 6–20 car. `+`/`-`/`()`/espaces) |
| `job_title`        | Fonction / poste (modifiable)                               |
| `avatar`           | URL fichier avatar (jamais BLOB)                            |
| `pending_email`    | Email en attente de confirmation                            |
| `email_verified_at`| Horodatage de vérification de l'email                       |
| `profile_updated_at`| Horodatage de la dernière modification de profil            |

Table `email_change_tokens` (créée par la migration si absente) :

| Colonne       | Rôle                                                |
|---------------|-----------------------------------------------------|
| `user_id`     | Utilisateur concerné (FK `users.id`, CASCADE)       |
| `new_email`   | Adresse cible                                       |
| `token_hash`  | SHA-256 du token brut (jamais le token en clair)    |
| `expires_at`  | Expiration (24 h)                                   |
| `used_at`     | Consommation (1 seul usage)                         |

> La base `seg_dashboard` contient déjà toutes ces colonnes (vérifié). Le fichier
> `mysql-profile-migration.sql` est fourni comme référence pour une **base neuve**.

---

## 3. API

### `GET /api/profile`
Renvoie le profil de l'utilisateur connecté (sans secrets).

### `PUT /api/profile`
Modifie **uniquement** `first_name`, `last_name`, `phone`, `job_title`.
`display_name` recalculé. Écrit `profile_updated_at` + audit `PROFILE_UPDATED`.
Les clés admin (email, role_id, permissions, status, …) sont ignorées.

### `POST /api/profile/avatar` (multipart, champ `file`)
- Formats acceptés : JPG / JPEG / PNG / WEBP (validation MIME + re-encodage réel via sharp).
- Taille max : **5 Mo** (`413 INVALID_SIZE`).
- Traitement : `sharp` → recadrage centre 256×256, compression WebP (85 %), stockage
  fichier dans `public/uploads/profiles/user-{id}-{random}.webp`.
- L'ancien fichier n'est supprimé qu'**après** succès d'écriture du nouveau.
- Renvoie l'URL publique ; audit `PROFILE_AVATAR_UPDATED`.

### `DELETE /api/profile/avatar`
Supprime le fichier présent et met `avatar = NULL` ; audit `PROFILE_AVATAR_REMOVED`.

### `POST /api/profile/change-email`  `{ email }`
- Refus si l'email est déjà utilisé par un autre compte (email **ou** pending_email) → `409 EMAIL_IN_USE`.
- Invalide les demandes antérieures non consommées, stocke `pending_email`,
  crée un token (SHA-256) valable 24 h.
- Renvoie `confirmToken` au client (contexte sans mailer).
- Audit `EMAIL_CHANGE_REQUESTED`.

### `DELETE /api/profile/change-email`
Annule une demande en attente ; audit `EMAIL_CHANGE_CANCELLED`.

### `POST /api/profile/confirm-email`  `{ token }` (connecté)
Valide le token, bascule `pending_email → email`, pose `email_verified_at` ; audit `EMAIL_CHANGED`.
Vérifie que le token appartient à l'utilisateur connecté (sinon 403).

### `POST /api/profile/confirm-email/public`  `{ token }`
Même validation mais accessible **sans session** (pour un lien cliqué depuis la
nouvelle boîte mail). Audit `EMAIL_CHANGED`.

### `POST /api/profile/change-password`  `{ currentPassword, newPassword }`
- Vérifie le mot de passe actuel (sinon `401 BAD_CURRENT`).
- Nouveau mot de passe ≥ 8 caractères et différent (`422` sinon).
- Met à jour le hash scrypt et **révoque les autres sessions** (la session courante
  est conservée). Audit `PASSWORD_CHANGED`.

---

## 4. Événements d'audit ajoutés

| Action                      | Déclencheur                              |
|-----------------------------|------------------------------------------|
| `PROFILE_UPDATED`           | Mise à jour des infos de contact         |
| `PROFILE_AVATAR_UPDATED`    | Upload d'une photo de profil             |
| `PROFILE_AVATAR_REMOVED`    | Suppression de la photo de profil        |
| `EMAIL_CHANGE_REQUESTED`    | Demande de changement d'email            |
| `EMAIL_CHANGE_CANCELLED`    | Annulation d'une demande                 |
| `EMAIL_CHANGED`             | Email effectivement changé               |
| `PASSWORD_CHANGED`          | Mot de passe modifié                     |

Le DG / SUPER_ADMIN **n'est pas exempt** de ces traces.

---

## 5. Page `/profile` (UI)

Page client `app/profile/page.tsx` avec sections :
1. **Carte identité** : avatar (upload / suppression), nom complet, email (+ statut
   « en attente »), poste, badges rôle/agence, dates.
2. **Informations de contact** : prénom, nom, téléphone, fonction.
3. **Adresse email** : demande de changement + confirmation + annulation.
4. **Sécurité** : changement de mot de passe + déconnexion.

Après chaque mise à jour, l'appel `refresh()` de l'`AuthProvider` synchronise le
Header (avatar image, prénom+nom, poste). Le Header (`components/Header.tsx`) affiche
désormais l'image d'avatar quand elle existe (sinon initiales) et le `jobTitle`.

---

## 6. Fichiers créés / modifiés

**Créés**
- `app/api/profile/route.ts`
- `app/api/profile/avatar/route.ts`
- `app/api/profile/change-email/route.ts`
- `app/api/profile/confirm-email/route.ts`
- `app/api/profile/confirm-email/public/route.ts`
- `app/api/profile/change-password/route.ts`
- `app/confirm-email/page.tsx`
- `lib/users/userProfile.ts`
- `lib/users/avatar.ts`
- `mysql-profile-migration.sql`
- `docs/USER-PROFILE.md`

**Modifiés**
- `app/profile/page.tsx` (réécriture complète)
- `components/Header.tsx` (avatar image + poste)
- `app/api/auth/me/route.ts` (avatar sécurisé)
- `proxy.ts` (`/confirm-email` publique)
- `package.json` (+ `sharp` déclaré en dépendance directe)

---

## 7. Tests effectués (dev server, base MySQL)

Vérifiés via des requêtes réelles sur `/api/...` :
- PUT profil : maj prénom/nom/téléphone/poste OK, `display_name` recalculé,
  `email` et `role_id` **ignorés**.
- Upload avatar (PNG réel) → 200, `.webp` écrit dans `public/uploads/profiles/`,
  servi en `image/webp`, reflété par GET ; DELETE supprime le fichier.
  MIME invalide → `422 INVALID_TYPE` ; image corrompue → 500 (sans plantage).
- Change-email → confirm-email (connecté) OK : `email_verified_at` posé,
  `pending_email` vidé ; réutilisation du token refusée ; email déjà pris → `409`.
- Confirm public sans session OK ; cancel efface `pending_email`.
- Change-password : mauvais mdp → `401` ; court → `422` ; identique → `422` ;
  valide → `200` puis connexion avec le nouveau mot de passe OK.
- Sans authentification → `401`.
- Audit : toutes les actions `PROFILE_*`, `EMAIL_*`, `PASSWORD_CHANGED` enregistrées.

`npx tsc --noEmit` : OK. `npx next build` : OK.

---

## 8. Notes / limites connues

- **Pas de mailer** : l'envoi réel du lien de confirmation par email n'est pas
  branché ; le token est renvoyé au client et la confirmation se fait en page.
  Le branchement d'un service d'email (SMTP/API) devra transmettre
  `/confirm-email?token=<raw>` à la nouvelle adresse.
- L'avatar est supprimé du disque uniquement après succès de l'écriture du nouveau
  (ou lors de sa suppression explicite). Un échec réseau/DB peut laisser une image
  orpheline mineure ; un nettoyage périodique du dossier est possible.
