# Usage : python3 import_facturation.py <dossier_des_fichiers_xls>
# Lit les rapports DCC (Conakry) et centres (intérieur), recalcule depuis les lignes mensuelles,
# signale les anomalies de saisie et génère 02_facturation_donnees.sql (upsert, ré-exécutable).
import pandas as pd, unicodedata, re, json, math
import sys, os
U=(sys.argv[1].rstrip('/')+'/') if len(sys.argv)>1 else './'
MOIS={'janvier':1,'fevrier':2,'mars':3,'avril':4,'mai':5,'juin':6,'juillet':7,'aout':8,'septembre':9,'octobre':10,'novembre':11,'decembre':12}
CATS=['Domestique','Agent SEG','Installation SEG','Commerce','BF','Autre ADM','Industrie','ADM Gle']
def norm(s): return unicodedata.normalize('NFKD',str(s)).encode('ascii','ignore').decode().strip().lower()
def num(v):
    if v is None or (isinstance(v,float) and math.isnan(v)): return None
    if isinstance(v,str):
        v=v.replace(' ','').replace('\xa0','').replace(',','.')
        try: v=float(v)
        except: return None
    return float(v)
rows=[]; issues=[]
def parse(f,sheet,agence,zone,mcol,ccol,cols,ttc_only=False):
    d=pd.read_excel(U+f,sheet_name=sheet,header=None,engine='xlrd')
    cur=None
    for i in range(len(d)):
        m=d.iat[i,mcol]
        if isinstance(m,str):
            k=norm(m)
            if k in MOIS: cur=MOIS[k]
            elif 'semestre' in k or 'total' in k or 'general' in k: 
                if 'semestre' in k and 'total' not in k: cur=None
        c=d.iat[i,ccol]
        if cur and isinstance(c,str) and c.strip() in CATS:
            vals=[num(d.iat[i,j]) for j in cols]
            if all(v in (None,0) for v in vals): continue
            r=dict(annee=2026,mois=cur,zone=zone,agence=agence,categorie=c.strip(),
                   abonnes_listes=vals[0],abonnes_factures=vals[1],volume_consomme=vals[2],volume_facture=vals[3])
            if ttc_only: r['ca_ht']=None; r['ca_ttc']=vals[4]
            else: r['ca_ht']=vals[4]; r['ca_ttc']=vals[5]
            rows.append(r)
f1='Rapport_d_activité_1er_et_2eme_Semestre_2026_CONAKRY.xls'
for s in ['MATOTO','YIMBAYA','KOUNTIA','CIMENTERIE','WANIDARA','RATOMA','DIXINN','MATAM','KALOUM']:
    if s=='MATOTO': parse(f1,s,'Matoto','Conakry',1,2,[3,4,5,6,7],ttc_only=True)
    else: parse(f1,s,s.title(),'Conakry',1,2,[3,4,5,6,7,8])
f2='RAPPORT_DE_FACTURACTION_DES_CENTRES.xls'
NAMES={'FORECARIAH':'Forécariah','Télémélé':'Télimélé','Boké (2)':'Boké','Kindia':'Kindia','Boffa':'Boffa','Mamou (2)':'Mamou','Pita':'Pita','Labé (2)':'Labé','Dalaba (2)':'Dalaba','Koudara':'Koundara','Lélouma (2)':'Lélouma','Tougué':'Tougué','Gaoual (3)':'Gaoual','Mali':'Mali','Kankan':'Kankan','Dabola':'Dabola','Kouroussa':'Kouroussa','Siguri':'Siguiri','Kerouané':'Kérouané','Dinguiraye':'Dinguiraye','Mandiana (2)':'Mandiana','Faranah (2)':'Faranah','Kissidou (2)':'Kissidougou','Guékédou (2)':'Guéckédou','Macenta':'Macenta',"N'zérék (2)":"N'Zérékoré",'Yomou':'Yomou','Lola':'Lola'}
for s,n in NAMES.items(): parse(f2,s,n,'Intérieur',0,1,[2,3,4,5,6,7])
df=pd.DataFrame(rows)

# ---------- Contrôle qualité ----------
def alerte(r, med):
    a=[]
    ht,ttc,vol=r.ca_ht,r.ca_ttc,r.volume_facture
    if ht and ttc and ht>0 and not (1.0<=ttc/ht<=1.3):
        a.append(f"Écart HT/TTC anormal (TTC = {ttc/ht:.2f} × HT)")
    if vol and ttc and vol>0:
        k=(ttc/vol)/med.get(r.categorie,1)
        if k<0.33 or k>3:
            a.append(f"Prix moyen hors norme ({ttc/vol:,.0f} GNF/m³)".replace(',', ' '))
    return ' ; '.join(a) or None
x=df[(df.volume_facture>0)&(df.ca_ttc>0)]
med=(x.ca_ttc/x.volume_facture).groupby(x.categorie).median().to_dict()
df['alerte_qualite']=df.apply(lambda r: alerte(r,med),axis=1)

# ---------- Export SQL ----------
def q(v):
    if v is None or (isinstance(v,float) and math.isnan(v)): return 'null'
    if isinstance(v,str): return "'"+v.replace("'","''")+"'"
    return str(int(round(v)))
cols=['annee','mois','zone','agence','categorie','abonnes_listes','abonnes_factures','volume_consomme','volume_facture','ca_ht','ca_ttc','alerte_qualite']
upd=[c for c in cols if c not in ('annee','mois','agence','categorie')]
out=["-- Données facturation 2026 — rapports DCC Conakry + centres de l'intérieur (fichiers d'octobre 2026)",'begin;']
vals=['('+','.join(q(v) for v in r)+",'rapports DCC oct. 2026')" for r in df[cols].itertuples(index=False)]
for i in range(0,len(vals),300):
    out.append('insert into public.facturation_mensuelle ('+','.join(cols)+',source)\nvalues\n'+',\n'.join(vals[i:i+300])+
      '\non conflict (annee,mois,agence,categorie) do update set\n'+
      ',\n'.join(f'  {c}=excluded.{c}' for c in upd)+",\n  source=excluded.source,\n  updated_at=now();")
out.append('commit;')
open('02_facturation_donnees.sql','w').write('\n'.join(out)+'\n')
print(f'{len(df)} lignes, {df.alerte_qualite.notna().sum()} alertes qualité')
