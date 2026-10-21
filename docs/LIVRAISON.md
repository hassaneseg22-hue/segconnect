# Livraison — Système de mise à jour automatique Excel SEG (§ 42)

## Fichiers créés / modifiés

**Pipeline d'import (nouveaux)**
- `lib/excel/types.ts` — types des enregistrements normalisés (fac/tech/rec), anomalies.
- `lib/excel/normalizer.ts` — alias agences & types de clients, `toNum`, `toMonth`.
- `lib/excel/security.ts` — extension/MIME/taille (≤20 Mo), empreinte SHA-256.
- `lib/excel/parser.ts` — lecture feuilles `BD_*` (BD_FAC/3, BD_TECH/1, BD_Recouv/1 sautées).
- `lib/excel/validator.ts` — 3 validateurs de feuille + ratios dérivés + anomalies.
- `lib/excel/importer.ts` — `importValidated` (upsert transactionnel), `rollbackImport`,
  `findImportByHash`, `periodsExist`.

**API (nouveaux / modifiés)**
- `app/api/import/route.ts` : `POST analyze|import` + `GET` historique. Gère
  `already_imported` (409), `existing_period` (confirmation), `revalidatePath('/')`,
  notification post-import, `userName`.
- `app/api/import/[id]/route.ts` : détail + anomalies.
- `app/api/import/[id]/rollback/route.ts` : annulation.
- `app/api/quality/route.ts` : état général + liste des anomalies.

**Pages (nouveaux / modifiés)**
- `app/import/page.tsx` (réécrit) : assistant multi-étapes (choix/analyse/aperçu/import/résultat),
  zone drag & drop, détection feuilles, contrôleur d'anomalies, avertissement période existante.
- `app/import/history/page.tsx` : historique + actions Voir / Anomalies / Rollback.
- `app/import/[id]/page.tsx` : détail + anomalies + annulation.
- `app/import/quality/page.tsx` : score + compteurs + liste.
- `components/Sidebar.tsx` : liens « Import des Données » et « Qualité des Données ».

**Données / outils**
- `mysql-migration-v0.2.1.sql` : extension schéma (hash unique, comptes, statuts,
  précisions `data_quality_issues`).
- `scripts/generate-test-excel.mjs` + `scripts/e2e-import-check.mjs` : jeux de test
  synthétiques (§35-36).
- `docs/EXCEL-FORMAT.md`, `docs/EXCEL-IMPORT.md`, `docs/LIVRAISON.md`.

## Installation / démarrage

1. `npm install` (Next.js 16.3.4 — utiliser le compilateur webpack :
   `npx next build --webpack` / `npx next dev --webpack -p 3000`).
2. Démarrer MySQL (XAMPP). Appliquer `mysql-migration-v0.2.1.sql` sur `seg_dashboard`.
3. Configurer les identifiants dans `.env` (host, port, user, password, database).
4. `npx next dev --webpack` puis ouvrir l'interface.

## Import d'un fichier Excel SEG

1. Menu **Import des Données** → glisser/déposer un `.xlsx` (BD_FAC / BD_TECH / BD_Recouv).
2. **Analyser** (aucune écriture) : périodes, agences, comptes, anomalies.
3. **Importer** :
   - période présente → confirmer pour **mettre à jour** ;
   - même fichier déjà importé → refus 409 (jusqu'à annulation) ;
   - feuilles auditeurs absentes / aucune donnée → refus 422.
4. Le dashboard est revalidé et une notification système est émise.

Annulation : `/import/history` puis **Rollback** (ou `POST /api/import/[id]/rollback`).
Qualité : `/import/quality`.

## Exemple de fichier Excel accepté

Feuille `BD_TECH` (1 ligne d'en-tête à sauter) :
```
EN-TÊTE TECHNIQUE
2026-01-01 | Yimbaya | 181000 | 138000 | 130000 | 0.76 | 0.72
```
Feuille `BD_FAC` (3 lignes d'en-tête à sauter) :
```
EN-TÊTE (1/3)   / EN-TÊTE (2/3) / EN-TÊTE (3/3)
2026-01-01 | Yimbaya | Particulier | 120 | 80 | | 900 | 900 | 600 | 600 | | | 600000 | 400000 | | 700000 | 650000 | | 0.93
```
Feuille `BD_Recouv` (1 ligne d'en-tête à sauter) :
```
EN-TÊTE RECOUVREMENT
2026-01-01 | Yimbaya | Particulier | 600000 | 400000 | | 700000 | 650000 | | 680000 | | 0.93 | 0.97 | 0.04
```
> Un jeu complet est généré par `node scripts/generate-test-excel.mjs`.

## API (résumé)

| Méthode | Route | Rôle |
|---------|-------|------|
| POST | `/api/import?action=analyze` | analyse sans écriture |
| POST | `/api/import?action=import` | import transactionnel |
| GET  | `/api/import?limit=N` | historique |
| GET  | `/api/import/[id]` | détail + anomalies |
| POST | `/api/import/[id]/rollback` | annulation |
| GET  | `/api/quality?resolved=0` | qualité |

## Architecture

`Excel → analyse/validation → upsert MySQL (transactions) → API → Dashboard`,
avec traçabilité complète (historique, qualité, annulation) et notification.
Les modules sans source affichent « Source non connectée » — aucune donnée inventée.
