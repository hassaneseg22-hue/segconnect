import { supabaseAdmin } from '@/lib/supabase/admin';
import { insertNotificationDedup } from '@/lib/notifications-db';

type Settings = { [key: string]: number };

const DEFAULTS: Settings = {
  'recouvrement.critical': 0.78,
  'recouvrement.warning': 0.82,
  'recouvrement.variation': 0.05,
  'technique.yield_max': 1.0,
  'technique.yield_anomaly': 0.15,
  'commercial.revenue_delta': 0.05,
  'commercial.impayes_delta': 0.08,
};

type Agency = {
  id: number;
  name: string;
};

type ClientType = {
  id: number;
  name: string;
};

function pctPts(v: number) {
  return Math.round(v * 1000) / 10;
}

function money(v: number | null): string {
  const n = Number(v || 0);
  const abs = Math.abs(n);

  if (abs >= 1e9) {
    return `${(n / 1e9).toLocaleString('fr-FR', {
      maximumFractionDigits: 2,
    })} Md GNF`;
  }

  if (abs >= 1e6) {
    return `${(n / 1e6).toLocaleString('fr-FR', {
      maximumFractionDigits: 1,
    })} M GNF`;
  }

  return `${n.toLocaleString('fr-FR', {
    maximumFractionDigits: 0,
  })} GNF`;
}

function monthLabel(period: Date | string): string {
  const d = typeof period === 'string' ? new Date(period) : period;

  return d.toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

async function loadSettings(): Promise<Settings> {
  try {
    const { data, error } = await supabaseAdmin
      .from('notification_settings')
      .select('key_name, value')
      .not('value', 'is', null);

    if (error) throw error;

    const map: Settings = { ...DEFAULTS };

    for (const row of data ?? []) {
      map[row.key_name] = Number(row.value);
    }

    return map;
  } catch (error) {
    console.error('AlertEngine settings:', error);
    return DEFAULTS;
  }
}

async function loadAgencies(): Promise<Map<number, Agency>> {
  const { data, error } = await supabaseAdmin
    .from('agencies')
    .select('id, name');

  if (error) throw error;

  return new Map(
    (data ?? []).map((row) => [
      Number(row.id),
      {
        id: Number(row.id),
        name: row.name,
      },
    ])
  );
}

async function loadClientTypes(): Promise<Map<number, ClientType>> {
  const { data, error } = await supabaseAdmin
    .from('client_types')
    .select('id, name');

  if (error) throw error;

  return new Map(
    (data ?? []).map((row) => [
      Number(row.id),
      {
        id: Number(row.id),
        name: row.name,
      },
    ])
  );
}

export async function runAlertEngine(): Promise<{
  generated: number;
  skipped: number;
}> {
  const S = await loadSettings();

  const agencies = await loadAgencies();
  const clientTypes = await loadClientTypes();

  let generated = 0;
  let skipped = 0;

  // ---------------------------------------------------------------------------
  // A. FINANCIÈRES — recouvrement_monthly
  // variation mois / mois + seuils
  // ---------------------------------------------------------------------------
  try {
    const { data, error } = await supabaseAdmin
      .from('recouvrement_monthly')
      .select(`
        id,
        period_month,
        agency_id,
        client_type_id,
        recovery_rate,
        recovery_rate_updated,
        balance_due,
        amount_paid
      `)
      .not('recovery_rate', 'is', null)
      .order('agency_id', { ascending: true })
      .order('client_type_id', { ascending: true })
      .order('period_month', { ascending: true });

    if (error) throw error;

    const rows = data ?? [];

    const recCritical = S['recouvrement.critical'];
    const recWarning = S['recouvrement.warning'];
    const variationPts = S['recouvrement.variation'];

    const previousRates = new Map<string, number>();

    for (const r of rows) {
      const agency = agencies.get(Number(r.agency_id))?.name ?? `Agence #${r.agency_id}`;
      const clientType =
        clientTypes.get(Number(r.client_type_id))?.name ?? `Client #${r.client_type_id}`;

      const rate = Number(r.recovery_rate);
      const periodMonth = String(r.period_month);
      const period = monthLabel(periodMonth);

      const previousKey = `${r.agency_id}:${r.client_type_id}`;
      const prev = previousRates.get(previousKey) ?? null;

      const variation = prev != null ? rate - prev : 0;

      const scope =
        clientType && clientType !== 'Tous'
          ? ` (${clientType})`
          : '';

      if (rate < recCritical) {
        const key = `rec:critical:${agency}:${clientType}:${periodMonth.slice(0, 7)}`;

        const id = await insertNotificationDedup({
          type: 'critical',
          category: 'Recouvrement',
          title: `Recouvrement critique à ${agency}${scope}`,
          message:
            `Agence : ${agency} · Période : ${period}\n` +
            `Taux de recouvrement : ${(rate * 100).toFixed(1)} %` +
            `${
              prev != null && variation !== 0
                ? `\nVariation : ${
                    variation > 0 ? '+' : ''
                  }${pctPts(variation)} pt`
                : ''
            }\n` +
            `Impact estimé : ${money(Number(r.balance_due))}`,
          source: `recouvrement_monthly · ${agency}`,
          severity_score: Math.round((recCritical - rate) * 1000),
          target_url:
            `/recouvrement?${new URLSearchParams({
              year: String(new Date(periodMonth).getFullYear()),
              agency,
            }).toString()}`,
          metadata: {
            agency,
            period_month: periodMonth,
            recovery_rate: rate,
            balance_due: Number(r.balance_due),
          },
          dedupKey: key,
        });

        if (id) generated++;
      } else if (
        prev != null &&
        variation <= -variationPts &&
        rate < recWarning + 0.03
      ) {
        const key = `rec:drop:${agency}:${clientType}:${periodMonth.slice(0, 7)}`;

        const id = await insertNotificationDedup({
          type: 'warning',
          category: 'Recouvrement',
          title: `Baisse du recouvrement à ${agency}${scope}`,
          message:
            `Agence : ${agency} · Période : ${period}\n` +
            `Taux : ${(rate * 100).toFixed(1)} % ` +
            `(${(prev * 100).toFixed(1)} % le mois précédent)\n` +
            `Variation : ${pctPts(variation)} pt`,
          source: `recouvrement_monthly · ${agency}`,
          severity_score: Math.abs(Math.round(variation * 1000)),
          target_url:
            `/recouvrement?${new URLSearchParams({
              year: String(new Date(periodMonth).getFullYear()),
              agency,
            }).toString()}`,
          metadata: {
            agency,
            period_month: periodMonth,
            recovery_rate: rate,
            prev_rate: prev,
          },
          dedupKey: key,
        });

        if (id) generated++;
      } else {
        skipped++;
      }

      previousRates.set(previousKey, rate);
    }
  } catch (e) {
    console.error('AlertEngine recouvrement:', e);
  }

  // ---------------------------------------------------------------------------
  // B. TECHNIQUES — technique_monthly
  // rendement hors bornes
  // ---------------------------------------------------------------------------
  try {
    const yieldMax = S['technique.yield_max'];

    const { data, error } = await supabaseAdmin
      .from('technique_monthly')
      .select(`
        period_month,
        agency_id,
        volume_produced,
        volume_consumed,
        network_yield,
        billing_ratio
      `)
      .not('network_yield', 'is', null)
      .order('period_month', { ascending: false })
      .limit(1000);

    if (error) throw error;

    for (const r of data ?? []) {
      const agency =
        agencies.get(Number(r.agency_id))?.name ??
        `Agence #${r.agency_id}`;

      const y = Number(r.network_yield);
      const periodMonth = String(r.period_month);
      const period = monthLabel(periodMonth);

      if (y > yieldMax || y < 0) {
        const key = `tech:yield:${agency}:${periodMonth.slice(0, 7)}`;

        const id = await insertNotificationDedup({
          type: 'warning',
          category: 'Technique',
          title: `Anomalie technique à ${agency}`,
          message:
            `Agence : ${agency} · Période : ${period}\n` +
            `Rendement réseau : ${(y * 100).toFixed(0)} %\n` +
            `La valeur dépasse le seuil de contrôle. ` +
            `Valeur à vérifier (volume consommé vs produit).`,
          source: `technique_monthly · ${agency}`,
          severity_score: Math.abs(Math.round((y - 1) * 1000)),
          target_url:
            `/exploitation?${new URLSearchParams({
              year: String(new Date(periodMonth).getFullYear()),
              agency,
            }).toString()}`,
          metadata: {
            agency,
            period_month: periodMonth,
            network_yield: y,
          },
          dedupKey: key,
        });

        if (id) generated++;
      } else {
        skipped++;
      }
    }
  } catch (e) {
    console.error('AlertEngine technique:', e);
  }

  // ---------------------------------------------------------------------------
  // C. COMMERCIALES
  // progression CA + hausse des impayés
  // ---------------------------------------------------------------------------
  try {
    const revDelta = S['commercial.revenue_delta'];
    const impDelta = S['commercial.impayes_delta'];

    const { data: facturationData, error: facturationError } =
      await supabaseAdmin
        .from('facturation_monthly')
        .select(`
          period_month,
          client_type_id,
          amount_total,
          balance_due
        `)
        .not('amount_total', 'is', null);

    if (facturationError) throw facturationError;

    const facturation = facturationData ?? [];

    // -------------------------------------------------------------------------
    // Progression CA par année
    // -------------------------------------------------------------------------
    const revenueByYear = new Map<number, number>();

    for (const row of facturation) {
      const year = new Date(String(row.period_month)).getFullYear();

      if (year <= 2000) continue;

      const amount = Number(row.amount_total) || 0;

      revenueByYear.set(
        year,
        (revenueByYear.get(year) ?? 0) + amount
      );
    }

    const years = Array.from(revenueByYear.keys()).sort((a, b) => a - b);

    const latestYear = years[years.length - 1];
    const prevYear = years[years.length - 2];

    if (latestYear && prevYear) {
      const caCurrent = revenueByYear.get(latestYear) ?? 0;
      const caPrev = revenueByYear.get(prevYear) ?? 0;

      if (caPrev > 0) {
        const growth =
          (caCurrent - caPrev) / caPrev;

        if (
          Math.abs(growth) >= revDelta &&
          growth !== 0
        ) {
          const key =
            `com:ca:${latestYear}vs${prevYear}`;

          const id = await insertNotificationDedup({
            type: growth > 0 ? 'info' : 'warning',
            category: 'Commercial',
            title:
              growth > 0
                ? `Le chiffre d'affaires national progresse`
                : `Le chiffre d'affaires national est en baisse`,
            message:
              growth > 0
                ? `Le chiffre d'affaires national a progressé de ` +
                  `${(growth * 100).toFixed(1)} % par rapport à ` +
                  `la période comparable de ${prevYear} ` +
                  `(${money(caCurrent)} vs ${money(caPrev)}).`
                : `Le chiffre d'affaires national a reculé de ` +
                  `${(Math.abs(growth) * 100).toFixed(1)} % par rapport à ` +
                  `la période comparable de ${prevYear}.`,
            source:
              `facturation_monthly · ${latestYear} vs ${prevYear}`,
            severity_score:
              Math.abs(Math.round(growth * 1000)),
            target_url: '/commercial',
            metadata: {
              ca_current: caCurrent,
              ca_prev: caPrev,
              growth,
            },
            dedupKey: key,
          });

          if (id) generated++;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    // -------------------------------------------------------------------------
    // Hausse des impayés par catégorie
    // -------------------------------------------------------------------------
    const impByCat: Record<
      string,
      { yr: number; balance: number }[]
    > = {};

    for (const row of facturation) {
      if (row.balance_due == null) continue;

      const clientType =
        clientTypes.get(Number(row.client_type_id))?.name ??
        `Client #${row.client_type_id}`;

      const year =
        new Date(String(row.period_month)).getFullYear();

      if (year <= 2000) continue;

      const balance =
        Number(row.balance_due) || 0;

      if (!impByCat[clientType]) {
        impByCat[clientType] = [];
      }

      const existing =
        impByCat[clientType].find(
          (item) => item.yr === year
        );

      if (existing) {
        existing.balance += balance;
      } else {
        impByCat[clientType].push({
          yr: year,
          balance,
        });
      }
    }

    for (const [cat, list] of Object.entries(impByCat)) {
      list.sort((a, b) => a.yr - b.yr);

      const last = list[list.length - 1];
      const prev = list[list.length - 2];

      if (
        last &&
        prev &&
        prev.balance > 0
      ) {
        const growth =
          (last.balance - prev.balance) /
          prev.balance;

        if (growth >= impDelta) {
          const key =
            `com:impayes:${cat}:${last.yr}vs${prev.yr}`;

          const id = await insertNotificationDedup({
            type: 'warning',
            category: 'Commercial',
            title:
              `Les impayés augmentent pour la catégorie ${cat}`,
            message:
              `Le montant des impayés (${last.yr}) a augmenté de ` +
              `${(growth * 100).toFixed(1)} % par rapport à ` +
              `${prev.yr} pour la catégorie « ${cat} » ` +
              `(${money(last.balance)}).`,
            source:
              `facturation_monthly · ${cat}`,
            severity_score:
              Math.round(growth * 1000),
            target_url:
              `/commercial?${new URLSearchParams({
                year: String(last.yr),
                clientType: cat,
              }).toString()}`,
            metadata: {
              category: cat,
              balance: last.balance,
              growth,
            },
            dedupKey: key,
          });

          if (id) generated++;
        } else {
          skipped++;
        }
      }
    }
  } catch (e) {
    console.error('AlertEngine commercial:', e);
  }

  // ---------------------------------------------------------------------------
  // D. QUALITÉ DES DONNÉES
  // data_quality_issues non résolues
  // ---------------------------------------------------------------------------
  try {
    const { data: issueData, error: issueError } =
      await supabaseAdmin
        .from('data_quality_issues')
        .select(`
          id,
          import_id,
          severity,
          category,
          message,
          sheet_name,
          excel_row,
          created_at
        `)
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(60);

    if (issueError) throw issueError;

    const issues = issueData ?? [];

    const importIds = Array.from(
      new Set(
        issues
          .map((q) => q.import_id)
          .filter((id): id is number => id != null)
      )
    );

    const importNames = new Map<number, string>();

    if (importIds.length > 0) {
      const { data: importRows, error: importError } =
        await supabaseAdmin
          .from('data_imports')
          .select('id, file_name')
          .in('id', importIds);

      if (importError) throw importError;

      for (const row of importRows ?? []) {
        importNames.set(
          Number(row.id),
          row.file_name
        );
      }
    }

    for (const q of issues) {
      const type =
        q.severity === 'critical'
          ? 'critical'
          : q.severity === 'warning'
            ? 'warning'
            : 'info';

      const key = `quality:issue:${q.id}`;

      const id = await insertNotificationDedup({
        type,
        category: 'Qualité des données',
        title:
          q.severity === 'critical'
            ? 'Qualité des données — point critique'
            : `Qualité des données — ${q.category}`,
        message:
          `${q.message}\n` +
          `Source : ${
            q.import_id
              ? importNames.get(Number(q.import_id)) ?? 'inconnu'
              : 'inconnu'
          }` +
          `${q.sheet_name ? ` · ${q.sheet_name}` : ''}` +
          `${q.excel_row ? ` · ligne ${q.excel_row}` : ''}`,
        source:
          q.import_id
            ? importNames.get(Number(q.import_id)) ??
              'data_quality_issues'
            : 'data_quality_issues',
        severity_score:
          q.severity === 'critical'
            ? 100
            : q.severity === 'warning'
              ? 60
              : 30,
        target_url: '/qualite',
        metadata: {
          issue_id: q.id,
          sheet_name: q.sheet_name,
          excel_row: q.excel_row,
        },
        dedupKey: key,
      });

      if (id) {
        generated++;
      } else {
        skipped++;
      }
    }
  } catch (e) {
    console.error('AlertEngine qualité:', e);
  }

  // ---------------------------------------------------------------------------
  // E. SYSTÈME — imports récents
  // ---------------------------------------------------------------------------
  try {
    const { data, error } = await supabaseAdmin
      .from('data_imports')
      .select(`
        id,
        file_name,
        source_year,
        status,
        rows_count,
        anomalies_count,
        imported_at
      `)
      .order('id', { ascending: false })
      .limit(5);

    if (error) throw error;

    for (const imp of data ?? []) {
      const anomaliesN =
        Number(imp.anomalies_count) || 0;

      const key = `sys:import:${imp.id}`;

      const ok = imp.status !== 'failed';

      const id = await insertNotificationDedup({
        type: ok
          ? anomaliesN
            ? 'warning'
            : 'success'
          : 'critical',

        category: 'Système',

        title: ok
          ? anomaliesN
            ? `Import terminé avec anomalies`
            : `Import terminé avec succès`
          : `Échec de l'import`,

        message:
          `${imp.file_name}\n` +
          `${Number(imp.rows_count) || 0} ligne(s) traitées, ` +
          `${anomaliesN} anomalie(s) détectée(s) ` +
          `(statut : ${imp.status}).`,

        source: 'data_imports',

        severity_score: ok
          ? anomaliesN
            ? 40
            : 5
          : 100,

        target_url: '/import',

        metadata: {
          import_id: imp.id,
          status: imp.status,
          anomalies: anomaliesN,
        },

        dedupKey: key,
      });

      if (id) {
        generated++;
      } else {
        skipped++;
      }
    }
  } catch (e) {
    console.error('AlertEngine système:', e);
  }

  return {
    generated,
    skipped,
  };
}
