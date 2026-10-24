export const DEFAULT_CATEGORIES = [
  { id: 'courses', name: 'Courses', color: '#2e9e5b', icon: '🛒' },
  { id: 'resto', name: 'Resto & livraison', color: '#e8833a', icon: '🍔' },
  { id: 'transports', name: 'Transports', color: '#3a7be8', icon: '🚆' },
  { id: 'logement', name: 'Logement', color: '#8a5cd6', icon: '🏠' },
  { id: 'factures', name: 'Factures & télécom', color: '#5c6bc0', icon: '📱' },
  { id: 'sante', name: 'Santé', color: '#e05a7a', icon: '💊' },
  { id: 'shopping', name: 'Shopping', color: '#d6a03a', icon: '🛍️' },
  { id: 'loisirs', name: 'Loisirs & sorties', color: '#c94fc9', icon: '🎉' },
  { id: 'abonnements', name: 'Abonnements', color: '#26a6a6', icon: '🔁' },
  { id: 'etudes', name: 'Études', color: '#7a8c2e', icon: '🎓' },
  { id: 'retraits', name: 'Retraits', color: '#8d8d8d', icon: '💶' },
  { id: 'virements', name: 'Virements émis', color: '#6d7f99', icon: '↗️' },
  { id: 'revenus', name: 'Revenus', color: '#1f8a70', icon: '💰' },
  { id: 'remboursements', name: 'Remboursements', color: '#4caf8a', icon: '↩️' },
  { id: 'autre', name: 'Autre', color: '#a0a0a0', icon: '❔' },
].map((c, order) => ({ ...c, order }));

export const INCOME_CATEGORY_IDS = ['revenus', 'remboursements'];
