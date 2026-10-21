# Format des fichiers Excel SEG (source des données)

Un classeur.`xlsx` attendu doit contenir une ou plusieurs des **feuilles `BD_*`**
ci-dessous. Les feuilles de synthèse / tableaux croisés dynamiques (TCD) **ne sont jamais
lues**. Chaque feuille contient des lignes d'en-tête (ignorées) puis des lignes de données.

## Feuilles reconnues

| Feuille        | Lignes d'en-tête ignorées | Domaine                    |
| -------------- | :-----------------------: | -------------------------- |
| `BD_FAC`       |            3              | Facturation (lignes)       |
| `BD_TECH`      |            1              | Technique (production, réseau) |
| `BD_Recouv`    |            1              | Recouvrement / encaissement  |

> La détection est insensible à la casse (`bd_fac`, `BD_FAC`, `BD-FAC`… sont reconnus).

---

## BD_FAC — Facturation

### Colonnes (index 0-based)

| # | Champ                         | Traitement                          |
|---|-------------------------------|-------------------------------------|
| 0 | Période (date)                | `YYYY-MM-DD`, nombre Excel, ou date |
| 1 | Agence                        | normalisée                          |
| 2 | Type de client                | normalisé                           |
| 3 | Abonnés forfait               | nombre                              |
| 4 | Abonnés mesure                | nombre                              |
| 5 | Abonnés total (opt.)          | sinon 3+4                           |
| 6 | Vol. consommé forfait         | nombre                              |
| 7 | Vol. facturé forfait          | nombre                              |
| 8 | Vol. consommé mesure          | nombre                              |
| 9 | Vol. facturé mesure           | nombre                              |
| 10| Vol. consommé total (opt.)    | sinon 6+8                           |
| 11| Vol. facturé total (opt.)     | sinon 7+9                           |
| 12| Montant forfait               | nombre                              |
| 13| Montant mesure                | nombre                              |
| 14| Montant total (opt.)          | sinon 12+13                         |
| 15| Pénalités                     | nombre                              |
| 16| Montant réglé                 | nombre                              |
| 17| Solde / reste à payer (opt.)  | 15 – 16 sinon                       |
| 18| Taux de recouvrement (opt.)   | réglé / pénalités sinon             |

### Exemple (après les 3 lignes d'en-tête)

```
2026-01-01 | Yimbaya  | Particulier | 120 | 80  |   | 900  | 900  | 600 | 600 | | | 600000 | 400000 | | 700000 | 650000 | | 0.93
2026-01-01 | Matoto   | Commerce    |  40 | 30  |   | 400  | 400  | 250 | 250 | | | 300000 | 200000 | | 350000 | 320000 | | 0.91
```

---

## BD_TECH — Technique

### Colonnes (index 0-based)

| # | Champ              | Traitement                |
|---|--------------------|---------------------------|
| 0 | Période (date)     | `YYYY-MM-DD`, nombre, date|
| 1 | Agence             | normalisée                |
| 2 | Vol. produit       | nombre                    |
| 3 | Vol. consommé      | nombre                    |
| 4 | Vol. facturé       | nombre                    |
| 5 | Rendement réseau (opt.) | sinon 3/2            |
| 6 | Ratio facturation (opt.)| sinon 4/2            |

### Exemple (après 1 ligne d'en-tête)

```
2026-01-01 | Yimbaya | 181000 | 138000 | 130000 | 0.76 | 0.72
2026-01-01 | Matoto  |  90000 |  70000 |  66000 | 0.78 | 0.73
```

---

## BD_Recouv — Recouvrement

### Colonnes (index 0-based)

| # | Champ                         | Traitement                         |
|---|-------------------------------|------------------------------------|
| 0 | Période (date)                | `YYYY-MM-DD`, nombre, date         |
| 1 | Agence                        | normalisée                         |
| 2 | Type de client                | normalisé                          |
| 3 | Montant forfait               | nombre                             |
| 4 | Montant mesure                | nombre                             |
| 5 | Montant total (opt.)          | sinon 3+4                          |
| 6 | Pénalités                     | nombre                             |
| 7 | Montant réglé                 | nombre                             |
| 8 | Solde (opt.)                  | 6 – 7 sinon                        |
| 9 | Montant réglé mis à jour      | nombre                             |
| 10| Solde mis à jour (opt.)       | 6 – 9 sinon                        |
| 11| Taux recouvrement (opt.)      | réglé / pénalités sinon            |
| 12| Taux recouvrement mis à jour (opt.) | 9 / 6 sinon                    |
| 13| Évolution (opt.)              | 12 – 11 sinon                      |

### Exemple (après 1 ligne d'en-tête)

```
2026-01-01 | Yimbaya | Particulier | 600000 | 400000 | | 700000 | 650000 | | 680000 | | 0.93 | 0.97 | 0.04
```

---

## Tolérance sur les valeurs

- **Formules cassées Excel** (`#REF!`, `#DIV/0!`, `#N/A`, `#VALEUR!`, `#NULL!`) → traitée
  comme « valeur absente » et recalculée si possible.
- **Textes non numériques** dans une colonne numérique → ignorés (considérés absents).
- **Rendement réseau > 100 %** → anomalie `warning` (valeur *conservée*, jamais inventée).
- **Valeurs négatives** (montants / volumes) → anomalie `warning`.
- **Agence ou type de client inconnu** → l'enregistrement est **écarté** et une anomalie
  `warning` est créée (aucune donnée fabriquée).
- Un classeur sans aucune donnée exploitable est **refusé** (HTTP 422).
