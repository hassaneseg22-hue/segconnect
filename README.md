# SEG — Dashboard Directeur Général

Prototype fonctionnel Next.js pour le pilotage technique, commercial et recouvrement de la SEG.

## Architecture
- Next.js + TypeScript (Next.js 16, compilateur webpack)
- MySQL 8 (XAMPP) via `mysql2` — couche de données
- Recharts pour les graphiques · Framer Motion pour les animations
- Import Excel via `xlsx`

## Principe de données
Excel -> analyse/validation -> normalisation -> upsert MySQL (transactions) -> API -> Dashboard.
Les feuilles TCD ne sont pas lues ; les tables sources sont **BD_FAC**, **BD_TECH** et **BD_Recouv**.
Aucune donnée n'est inventée : un module sans source affiche « Source non connectée ».

## Normalisation
Agences : casse/variantes regroupées sous une agence canonique.
Clients : PARTICULIER -> Domestique, BORNE FONTAINE -> Bornes Fontaines, ADMNISTRATION -> Administration, etc.
Les valeurs originales doivent être conservées dans `source`.

## Règles de calcul
- Abonnés total = forfait + sur mesure
- Volume consommé total = forfait + sur mesure
- Volume facturé total = forfait + sur mesure
- Montant total facturé = forfait + sur mesure
- Reste à payer = facturé + pénalités - réglé
- Taux de recouvrement = réglé / (facturé + pénalités), avec garde-fou division par zéro
- Rendement réseau = volume consommé / volume produit
- Ratio facturation = volume facturé / volume produit
- Comparaison annuelle uniquement sur périodes comparables

## Qualité
Les valeurs techniques >100% sont signalées, pas supprimées. Les périodes partielles sont signalées. Les formules Excel cassées sont recalculées côté application.

## Lancer
1. Démarrer MySQL (XAMPP).
2. Copier `.env.example` vers `.env.local` et adapter les identifiants MySQL.
3. `npm install`
4. `npx next dev --webpack` (le compilateur Turbopack est indisponible sur win32/x64).

## Import automatique Excel → Dashboard
Voir `docs/EXCEL-IMPORT.md` (opérations), `docs/EXCEL-FORMAT.md` (format des feuilles)
et `docs/LIVRAISON.md` (récapitulatif §42).

## V0.2 — MySQL local (XAMPP)

1. Démarrer **MySQL** dans XAMPP.
2. Ouvrir phpMyAdmin et importer `mysql-schema.sql`, puis `mysql-seed.sql`.
3. Copier `.env.example` vers `.env.local` et adapter le mot de passe MySQL si nécessaire.
4. Installer la dépendance : `npm install` (ou `npm install mysql2` si `node_modules` existe déjà).
5. Lancer : `npm run dev`.

Le Dashboard appelle `/api/overview` et les filtres Année / Agence / Type client interrogent directement MySQL.
L'écran Import conserve le pipeline Excel et écrit les données dans MySQL via une transaction.

### Installation rapide Windows + XAMPP

Le projet contient `setup-xampp.bat`. Avec XAMPP démarré et MySQL sans mot de passe root par défaut, double-cliquez dessus. Il crée `seg_dashboard` et charge les données 2025/2026 fournies.

Si `C:\xampp` n'est pas le chemin d'installation de XAMPP, modifiez `MYSQL_EXE` dans le fichier BAT.
