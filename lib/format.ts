export const gnf=(n:number)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(n)+' GNF';
export const num=(n:number)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(n);
export const pct=(n:number)=>new Intl.NumberFormat('fr-FR',{style:'percent',maximumFractionDigits:1}).format(n);
