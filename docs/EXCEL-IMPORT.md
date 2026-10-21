# Import automatique des données Excel → MySQL → Dashboard

Pipeline complet : **Excel SEG → analyse → validation → upsert MySQL → notifications →
dashboard**. Aucune donnée n'est inventée : les modules sans source affichent
« Source non connectée ».

## Architecture

```
Fichier .xlsx (BD_FAC / BD_TECH / BD_Recouv)
   │  POST /api/import?action=analyze   (sécurité + lecture + validation)
   ▼
Analyse en mémoire (aucune écriture) : feuilles détectées, périodes,
agences sleep, comptes, anomalies (warning/critical)
   │  POST /api/import?action=import&confirm=true
   ▼
Upsert transactionnel (ON DUPLICATE KEY) :
   - facturation_monthly  (clé année-mois-agence-type_client)
   - technique_monthly    (clé année-mois-agence)
   - recouvrement_monthly (clé année-mois-agence-type_client)
   - data_quality_issues  (anomalies)
   - data_imports         (trace : id, fichier, utilisateur, comptes, statut)
   ▼
revalidatePath('/') + notification système → Dashboard à jour
```

## Utilisation (interface web)

1. Menu **Import des Données** (sidebar) → onglet « Import ».
2. Glisser/déposer le fichier `.xlsx` (max 20 Mo). Seule l'extension `.xlsx`/`.xls`
   est acceptée ; un format texte est refusé.
3. **Analyser** : aperçu des feuilles, périodes, agences, comptes et du détail des
   anomalies avant toute écriture.
4. Importer :
   - si la période existe déjà → confirmation explicite pour **mettre à jour** ;
   - si le fichier a déjà été importé (même empreinte SHA-256) → refus (HTTP 409)
     tant que l'import correspondant n'a pas été annulé.

## Historique, qualité, annulation

- **/import/history** : liste de tous les imports (date, fichier, période, type,
  lignes, nouvelles, mises à jour, anomalies, statut) avec actions Voir / Anomalies /
  **Rollback**.
- **/import/[id]** : détail d'un import + liste de ses anomalies + annulation.
- **/import/quality** (`GET /api/quality`) : score de qualité, compteurs
  critiques/avertissements/informations et liste des anomalies non résolues.
- **Rollback** (`POST /api/import/[id]/rollback`) : supprime *exactement* les lignes
  et anomalies écrites par cet import (`WHERE import_id=id`) et marque l'import
  `rolled_back`. Les données des autres imports ne sont pas touchées.
  > Limite documentée : un fichier corrigé réimporté se rattache au *nouvel* import ;
  > annuler cet import retire la correction.

## Règles importantes

- Les données sont **réelles**, issues des feuilles BD_*. Aucune génération artificielle
  de valeurs / de score /100.
- Une ligne dont l'agence ou le type de client est inconnu est **écartée** (anomalie),
  jamais remplacée par une valeur inventée.
- Le rendement réseau > 100 % est **conservé** mais signalé (anomalie warning).
- Les formules Excel cassées sont recalculées côté application quand possible.

## API REST

| Méthode | Route                              | Rôle |
|---------|------------------------------------|------|
| POST    | `/api/import?action=analyze`       | Analyse sans écriture (FormData `file`) |
| POST    | `/api/import?action=import`        | Import transactionnel (`action`,`confirm`,`userName`) |
| GET     | `/api/import?limit=N`              | Historique des imports |
| GET     | `/api/import/[id]`                 | Détail + anomalies d'un import |
| POST    | `/api/import/[id]/rollback`        | Annuler un import |
| GET     | `/api/quality?resolved=0`          | État général + liste des anomalies |

## Fichiers de test (synthétiques)

`node scripts/generate-test-excel.mjs` génère des fichiers réalistes dans
`scripts/sample-excel/` couvrant : fichier valide, contenu dupliqué (hash), période
existante, fichier corrigé, casse/alias, rendement >100 %, valeurs manquantes /
formules cassées, feuille absente, feuille vide, multi-périodes, fichier non-Excel
(refusé).

`node scripts/e2e-import-check.mjs` envoie chaque fichier à
`/api/import?action=analyze` et affiche les comptes/périodes/anomalies.

## Base de données

La migration `mysql-migration-v0.2.1.sql` ajoute à `data_imports` :
`file_hash` (UNIQUE `uq_import_hash`), `file_size`, `import_type`, `period_start`,
`period_end`, `rows_new`, `rows_updated`, `user_name`, `error_message` ; l'énumération
`status` devient `('pending','analyzing','validated','partial','failed','rolled_back')`.
Elle précise aussi `data_quality_issues` (`severity`, `field`, `issue_type`,
`source_value`).

Connexion : MySQL 8 (XAMPP) ; dans un terminal PowerShell utiliser
`& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -proot seg_dashboard`
(le `mysql.exe` XAMPP échoue : plugin d'authentification non supporté).
Identifiants dans `.env` (jamais en dur dans le code).
