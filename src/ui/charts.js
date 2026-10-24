import { escapeHtml } from './format.js';

export function donutSvg(slices, { size = 200, thickness = 30, label = '', sublabel = '' } = {}) {
  const c = size / 2;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.value, 0);
  let offset = 0;
  const arcs = total > 0
    ? slices.filter((s) => s.value > 0).map((s) => {
      const len = (s.value / total) * C;
      const arc = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${escapeHtml(s.color)}" stroke-width="${thickness}" stroke-dasharray="${len.toFixed(3)} ${(C - len).toFixed(3)}" stroke-dashoffset="${(-offset).toFixed(3)}"><title>${escapeHtml(s.label)}</title></circle>`;
      offset += len;
      return arc;
    }).join('')
    : '';
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeHtml(`${label} ${sublabel}`.trim())}">`
    + `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${thickness}"/>`
    + `<g transform="rotate(-90 ${c} ${c})">${arcs}</g>`
    + `<text x="${c}" y="${c - 2}" text-anchor="middle" class="donut-label">${escapeHtml(label)}</text>`
    + `<text x="${c}" y="${c + 20}" text-anchor="middle" class="donut-sublabel">${escapeHtml(sublabel)}</text></svg>`;
}

export function stackedBarsSvg({ labels, series, averageCents = null, width = 340, height = 200 }) {
  const padTop = 10;
  const padBottom = 24;
  const padX = 4;
  const plotH = height - padTop - padBottom;
  const totals = labels.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const max = Math.max(1, ...totals, averageCents ?? 0);
  const slot = (width - padX * 2) / Math.max(1, labels.length);
  const barW = Math.max(4, slot * 0.6);
  let body = '';
  labels.forEach((label, i) => {
    const x = padX + i * slot + (slot - barW) / 2;
    let y = padTop + plotH;
    for (const s of series) {
      const v = s.values[i];
      if (!v) continue;
      const h = (v / max) * plotH;
      y -= h;
      body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${escapeHtml(s.color)}"><title>${escapeHtml(s.title ?? '')}</title></rect>`;
    }
    body += `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" class="bar-label">${escapeHtml(label)}</text>`;
  });
  if (averageCents != null) {
    const y = padTop + plotH - (averageCents / max) * plotH;
    body += `<line x1="${padX}" x2="${width - padX}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="avg-line"/>`;
  }
  return `<svg class="bars" viewBox="0 0 ${width} ${height}" role="img" aria-label="Dépenses par mois">${body}</svg>`;
}
