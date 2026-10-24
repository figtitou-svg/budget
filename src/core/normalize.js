const CITIES = new Set(['PARIS', 'LYON', 'MARSEILLE', 'TOULOUSE', 'NICE', 'NANTES', 'STRASBOURG', 'MONTPELLIER',
  'BORDEAUX', 'LILLE', 'RENNES', 'REIMS', 'GRENOBLE', 'VILLEURBANNE', 'ROUEN', 'TOURS', 'DIJON', 'ANGERS', 'METZ',
  'NANCY', 'CLERMONT', 'CAEN', 'BREST', 'LIMOGES', 'AMIENS', 'PERPIGNAN', 'BESANCON', 'ORLEANS', 'FR', 'FRA', 'FRANCE']);

export function foldUpper(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

const isNoise = (w) => /^\d{1,2}\/\d{2}(\/\d{2,4})?$/.test(w) || /^\d{1,2}H\d{2}$/.test(w) || /\d{4,}/.test(w) || /^\d+$/.test(w);

export function normalizeMerchant(rawLabel) {
  const original = foldUpper(rawLabel);
  let s = original.replace(/^\d{4,}\s+/, '');
  s = s.replace(/^(CARTE|CB)\s+X?\d{4}\s+(\d{2}\/\d{2}(\/\d{2,4})?\s+)?/, '');
  if (/^RETRAIT\b|\bRETRAIT DAB\b/.test(s)) return 'RETRAIT DAB';
  const party = s.match(/\b(?:DE|POUR):\s*(.+?)(?=\s+(?:MOTIF|REF|ID|DATE|DE|POUR|LIB)\s*[:/]|$)/);
  if (/^(VIR|VIREMENT|AVOIR)\b/.test(s) && party) s = party[1];
  s = s.replace(/^(PRLV SEPA|PRELEVEMENT(?: EUROPEEN)?|VIR(?:EMENT)?(?: EUROPEEN| SEPA| INST(?:ANTANE)?)*(?: RECU| EMIS| RE)?|AVOIR|REMISE CHEQUE|CHEQUE)\s+/, '');
  s = s.split(/\s+(?:ECH\/|ID EMETTEUR|MDT\/|REF[:/]|MOTIF:|DATE:|LIB:)/)[0];
  s = s.replace(/\*/g, ' ');
  let words = s.split(' ').filter((w) => w && !isNoise(w));
  words = words.filter((w, i) => w !== words[i - 1]);
  while (words.length > 1 && CITIES.has(words[words.length - 1])) words.pop();
  const out = words.slice(0, 4).join(' ').replace(/[^A-Z0-9&' -]+$/, '').trim();
  return out || original;
}
