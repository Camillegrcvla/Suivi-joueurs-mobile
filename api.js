import { API_URL } from './config';

let currentRole = '';
export function setCurrentRole(role) {
  currentRole = role || '';
}

async function request(path, pin, options = {}) {
  const res = await fetch(API_URL + '/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-app-pin': pin, 'x-app-role': currentRole, ...(options.headers || {}) },
  });
  if (res.status === 401) throw new Error('PIN invalide');
  if (!res.ok) throw new Error('Erreur serveur');
  return res.status === 204 ? null : res.json();
}

export async function login(email, motDePasse) {
  const res = await fetch(API_URL + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, motDePasse }),
  });
  if (res.status === 401) throw new Error('Identifiants incorrects');
  if (!res.ok) throw new Error('Erreur serveur');
  return res.json();
}

export const api = {
  checkPin: (pin) => request('/check-pin', pin, { method: 'POST' }),
  getPlayers: (pin) => request('/players', pin),
  addPlayer: (pin, name, poste) => request('/players', pin, { method: 'POST', body: JSON.stringify({ name, poste }) }),
  updatePlayer: (pin, id, fields) => request(`/players/${id}`, pin, { method: 'PATCH', body: JSON.stringify(fields) }),
  deletePlayer: (pin, id) => request(`/players/${id}`, pin, { method: 'DELETE' }),
  addSoin: (pin, playerId, texte, date) => request(`/players/${playerId}/soins`, pin, { method: 'POST', body: JSON.stringify({ texte, date }) }),
  resolveSoin: (pin, id) => request(`/soins/${id}`, pin, { method: 'PATCH', body: JSON.stringify({ actif: false }) }),
  deleteSoin: (pin, id) => request(`/soins/${id}`, pin, { method: 'DELETE' }),
  addHistorique: (pin, playerId, texte, date) => request(`/players/${playerId}/historique`, pin, { method: 'POST', body: JSON.stringify({ texte, date }) }),
  deleteHistorique: (pin, id) => request(`/historique/${id}`, pin, { method: 'DELETE' }),
  addClub: (pin, playerId, nom) => request(`/players/${playerId}/clubs`, pin, { method: 'POST', body: JSON.stringify({ nom }) }),
  deleteClub: (pin, id) => request(`/clubs/${id}`, pin, { method: 'DELETE' }),
  addBlessure: (pin, playerId, data) => request(`/players/${playerId}/blessures`, pin, { method: 'POST', body: JSON.stringify(data) }),
  updateBlessure: (pin, id, data) => request(`/blessures/${id}`, pin, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBlessure: (pin, id) => request(`/blessures/${id}`, pin, { method: 'DELETE' }),
  getMatches: (pin) => request('/matches', pin),
  addMatch: (pin, data) => request('/matches', pin, { method: 'POST', body: JSON.stringify(data) }),
  updateMatch: (pin, id, data) => request(`/matches/${id}`, pin, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteMatch: (pin, id) => request(`/matches/${id}`, pin, { method: 'DELETE' }),
  getCreneaux: (pin, matchId) => request(`/matches/${matchId}/creneaux`, pin),
  addCreneau: (pin, matchId, data) => request(`/matches/${matchId}/creneaux`, pin, { method: 'POST', body: JSON.stringify(data) }),
  deleteCreneau: (pin, id) => request(`/creneaux/${id}`, pin, { method: 'DELETE' }),
  getUtilisateurs: (pin) => request('/utilisateurs', pin),
  addUtilisateur: (pin, nom, email, motDePasse, roles) => request('/utilisateurs', pin, { method: 'POST', body: JSON.stringify({ nom, email, motDePasse, roles }) }),
  deleteUtilisateur: (pin, id) => request(`/utilisateurs/${id}`, pin, { method: 'DELETE' }),
  getActivites: (pin, since) => request(`/activites${since ? `?since=${encodeURIComponent(since)}` : ''}`, pin),
};

export const today = () => new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });

// birthdate attendu au format JJ/MM/AAAA
export function calcAge(birthdate) {
  if (!birthdate) return null;
  const m = birthdate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const b = new Date(Number(y), Number(mo) - 1, Number(d));
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const beforeBirthday = now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
  if (beforeBirthday) age--;
  return age >= 0 && age < 100 ? age : null;
}
