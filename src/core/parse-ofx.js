import { ImportError } from './errors.js';
import { parseAmount, parseDate, joinLabels } from './parse-sg-csv.js';

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" };
const decodeEntities = (s) => s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (e) => ENTITIES[e]);

export function isOfx(text) {
  return /OFXHEADER|<OFX>/i.test(text.slice(0, 2000));
}

export function parseOfx(text) {
  const blocks = text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  const rows = [];
  let skipped = 0;
  for (const block of blocks) {
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
      return m ? decodeEntities(m[1].trim()) : '';
    };
    const dt = get('DTPOSTED').match(/^(\d{4})(\d{2})(\d{2})/);
    const date = dt ? parseDate(`${dt[1]}-${dt[2]}-${dt[3]}`) : null;
    const amountCents = parseAmount(get('TRNAMT'));
    const rawLabel = joinLabels([get('NAME'), get('MEMO')]);
    if (!date || amountCents == null || amountCents === 0 || !rawLabel) { skipped++; continue; }
    rows.push({ date, amountCents, rawLabel });
  }
  if (!rows.length) throw new ImportError('NO_ROWS', 'Aucune opération trouvée dans ce fichier.');
  return { rows, skipped };
}
