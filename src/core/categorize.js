import { foldUpper } from './normalize.js';

export const FALLBACK_CATEGORY = 'autre';

// Évalué dans l'ordre : la première règle qui correspond gagne.
const OUT = [
  ['retraits', /\bRETRAIT\b|\bDAB\b/],
  ['abonnements', /NETFLIX|SPOTIFY|DEEZER|DISNEY ?PLUS|DISNEY\+|\bCANAL|PRIME ?VIDEO|AMAZON PRIME|APPLE\.COM|ITUNES|GOOGLE ?PLAY|YOUTUBE|ICLOUD|CHATGPT|OPENAI|ANTHROPIC|BASIC ?FIT|FITNESS PARK|NEONESS|KEEP ?COOL|PLAYSTATION|XBOX|NINTENDO|TWITCH|AUDIBLE/],
  ['courses', /CARREFOUR|\bLIDL\b|AUCHAN|LECLERC|INTERMARCHE|MONOPRIX|FRANPRIX|\bCASINO\b|SUPER U\b|HYPER U\b|\bU EXPRESS|\bALDI\b|\bNETTO\b|PICARD|BIOCOOP|\bG20\b|\bSPAR\b|\bPROXI\b|NATURALIA|GRAND FRAIS|BOULANGERIE|PRIMEUR|BOUCHERIE/],
  ['resto', /UBER ?\*? ?EATS|DELIVEROO|JUST ?EAT|MC ?DO|BURGER KING|\bKFC\b|\bQUICK\b|DOMINO|PIZZ|SUSHI|STARBUCKS|RESTAU|BRASSERIE|\bCAFE\b|KEBAB|TACOS|CROUS RESTO|IZLY/],
  ['transports', /\bSNCF\b|OUIGO|\bTCL\b|\bRATP\b|NAVIGO|TISSEO|BLABLACAR|\bUBER\b|\bBOLT\b|HEETCH|TOTAL ?ENERGIES(?! ?(ELEC|GAZ))|\bESSO\b|\bSHELL\b|\bBP\b|\bAVIA\b|PEAGE|\bAPRR\b|\bSANEF\b|\bLIME\b|\bDOTT\b|VELO'?V|VELIB|FLIXBUS|AIR FRANCE|EASYJET|RYANAIR|TRANSAVIA|PARKING|INDIGO/],
  ['logement', /LOYER|FONCIA|NEXITY|CITYA|\bORPI\b|\bCROUS\b|STUDEFI|STUDEA|LOGITEL|AGENCE IMMO/],
  ['factures', /\bFREE\b|\bORANGE\b|\bSFR\b|BOUYGUES|\bSOSH\b|RED BY|\bEDF\b|ENGIE|\bEAU\b|VEOLIA|\bSUEZ\b|ASSURANCE|\bMAIF\b|\bMACIF\b|MATMUT|\bAXA\b|\bGMF\b|COTISATION|FRAIS BANCAIRE|COMMISSION|TOTAL ?ENERGIES ?(ELEC|GAZ)/],
  ['sante', /PHARMA|\bPHIE\b|DOCTOLIB|MEDECIN|DENTISTE|OPTIC|MUTUELLE|LABORATOIRE|HOPITAL|CLINIQUE|\bKINE\b/],
  ['etudes', /\bINSA\b|UNIVERSITE|\bCVEC\b|SCOLARITE|LIBRAIRIE|GIBERT|PAPETERIE|BUREAU VALLEE/],
  ['loisirs', /CINEMA|PATHE|\bUGC\b|GAUMONT|\bMK2\b|TICKETMASTER|\bBAR\b|\bPUB\b|BOWLING|STEAM|EPIC GAMES|THEATRE|CONCERT|MUSEE|SHOTGUN|WEEZEVENT|BILLETWEB|FNAC SPECTACLE|KINEPOLIS|DISNEYLAND/],
  ['shopping', /AMAZON|\bAMZN\b|\bFNAC\b|DARTY|DECATHLON|\bZARA\b|\bH ?& ?M\b|PRIMARK|KIABI|CELIO|UNIQLO|SHEIN|ZALANDO|VINTED|LEBONCOIN|\bIKEA\b|\bACTION\b|CDISCOUNT|\bBOULANGER\b|SEPHORA|NOCIBE|ALIEXPRESS|\bTEMU\b|LEROY MERLIN|CASTORAMA/],
  ['virements', /\bVIR\b|VIREMENT|LYDIA|PAYPAL|SUMERIA|\bWERO\b|PAYLIB/],
];

const IN = [
  ['remboursements', /REMBOURSEMENT|\bREMB\b|\bAVOIR\b|\bCPAM\b|\bAMELI\b|MUTUELLE|REFUND|ANNULATION/],
  ['remboursements', /^CARTE\b|\bCB\b/],
  ['revenus', /SALAIRE|\bPAIE\b|\bCAF\b|\bCROUS\b|BOURSE|\bAPL\b|POLE EMPLOI|FRANCE TRAVAIL|INDEMNIT|INTERETS|\bVIR\b|VIREMENT|LYDIA|PAYPAL|\bWERO\b|SUMERIA/],
];

export function defaultCategory({ rawLabel, merchant = '', amountCents }) {
  const text = `${foldUpper(rawLabel)} ${merchant}`;
  for (const [id, re] of amountCents < 0 ? OUT : IN) if (re.test(text)) return id;
  return FALLBACK_CATEGORY;
}

export function categorize(tx, rules) {
  if (tx.categorySource === 'manual') return { categoryId: tx.categoryId, categorySource: 'manual' };
  const ruled = rules.get(tx.merchant);
  if (ruled) return { categoryId: ruled, categorySource: 'rule' };
  return { categoryId: defaultCategory(tx), categorySource: 'default' };
}

export function applyRule(transactions, merchant, categoryId, { includeId } = {}) {
  return transactions.map((t) => {
    if (t.merchant !== merchant) return t;
    if (t.categorySource === 'manual' && t.id !== includeId) return t;
    if (t.categoryId === categoryId && t.categorySource === 'rule') return t;
    return { ...t, categoryId, categorySource: 'rule' };
  });
}

export function setManual(transactions, id, categoryId) {
  return transactions.map((t) => (t.id === id ? { ...t, categoryId, categorySource: 'manual' } : t));
}
