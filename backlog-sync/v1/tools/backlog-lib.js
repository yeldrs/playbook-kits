'use strict';

// Logique pure de la synchro du backlog (aucun réseau, aucun accès disque) : empreintes,
// classement trois états dépôt / Notion, édition des fichiers markdown, archivage, vue compacte.
// Les commandes qui parlent à Notion sont dans notion-ref.js.

const crypto = require('crypto');

const STATUS_KEY = { 'À faire': 'todo', 'En cours': 'doing', 'Bloqué': 'blocked', 'À vérifier': 'verify', 'Fait': 'done' };
// `fiche` (chemin docs/tasks/B-xxx.md) n'est pas un champ synchronisé : le détail d'une tâche vit dans
// le dépôt, la description (courte) reste seule comparée avec Notion et entrée dans l'empreinte.
const KEY_ORDER = ['statut', 'prio', 'jalon', 'deps', 'description', 'fiche', 'fin'];
const FICHE_PATTERN = /^docs\/tasks\/B-\d{3}\.md$/;
const REQUIRED = ['statut', 'prio'];
// Champs comparés entre le dépôt et Notion (même forme des deux côtés).
const FIELDS = ['titre', 'type', 'statut', 'prio', 'epic', 'jalon', 'parent', 'deps', 'description', 'critere'];
const FIELD_KEY = { statut: 'statut', prio: 'prio', jalon: 'jalon', deps: 'deps', description: 'description', critere: 'fin' };

const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function fingerprint(t) {
  return crypto.createHash('sha1').update(FIELDS.map((k) => norm(t[k])).join('␟')).digest('hex').slice(0, 12);
}

const diffFields = (a, b) => FIELDS.filter((k) => norm(a[k]) !== norm(b[k]));

// Raison pour laquelle un changement venu de Notion doit être signalé au lieu d'être appliqué
// seul, ou null s'il est sûr. `jalonLabels` : étiquettes de jalon connues du dépôt.
function pullFlag(repo, notion, fields, jalonLabels) {
  if (fields.includes('type')) return 'type modifié';
  if (fields.includes('epic') || fields.includes('parent')) return 'epic ou parent modifié (déplacement à faire à la main)';
  if (repo.type === 'Epic' && fields.includes('titre')) return 'renommage d\'epic (aussi dans l\'archive)';
  if (fields.includes('statut')) {
    if (!(notion.statut in STATUS_KEY)) return `statut inconnu "${notion.statut}"`;
    if (repo.statut === 'Fait') return 'tâche terminée rouverte';
    if (notion.statut === 'Fait') return 'tâche close dans Notion sans passer par le dépôt';
    if (repo.statut === 'En cours') return 'tâche en cours modifiée';
  }
  if (fields.includes('prio') && notion.prio && !/^P[0-3]$/.test(notion.prio)) return `priorité inconnue "${notion.prio}"`;
  if (fields.includes('prio') && !notion.prio && repo.type !== 'Epic') return 'priorité effacée';
  if (fields.includes('jalon') && notion.jalon && !jalonLabels.includes(notion.jalon)) return `jalon inconnu "${notion.jalon}"`;
  if (fields.includes('titre') && !norm(notion.titre)) return 'titre effacé';
  return null;
}

// Classe chaque ligne en comparant dépôt, Notion et l'empreinte laissée par la dernière synchro.
//   tasks : tâches du dépôt (BACKLOG + archive) ; rows : lignes Notion `{ ref, empreinte, ...champs }`.
// Retourne { inSync, stamp, push, pull, conflicts, create, news }.
//   pull : { ref, fields, flag } ; conflicts : { ref, fields } ; news : lignes Notion absentes du dépôt.
function classify(tasks, rows, jalonLabels) {
  const byRef = new Map(rows.filter((r) => r.ref).map((r) => [r.ref, r]));
  const res = { inSync: [], stamp: [], push: [], pull: [], conflicts: [], create: [], news: [] };
  for (const t of tasks) {
    const row = byRef.get(t.ref);
    if (!row) { res.create.push(t.ref); continue; }
    const fields = diffFields(t, row);
    const rh = fingerprint(t);
    if (!fields.length) { (row.empreinte === rh ? res.inSync : res.stamp).push(t.ref); continue; }
    const nh = fingerprint(row);
    if (row.empreinte && row.empreinte === nh) res.push.push({ ref: t.ref, fields });
    else if (!row.empreinte || row.empreinte === rh) res.pull.push({ ref: t.ref, fields, flag: pullFlag(t, row, fields, jalonLabels) });
    else res.conflicts.push({ ref: t.ref, fields });
  }
  const known = new Set(tasks.map((t) => t.ref));
  res.news = rows.filter((r) => !known.has(r.ref) && (r.ref || norm(r.titre)));
  return res;
}

const words = (s) => new Set(norm(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2));

// Tâche du dépôt dont le titre ressemble à `titre` (égal, ou au moins 75 % de mots communs).
function findSimilar(tasks, titre) {
  const a = words(titre);
  if (!a.size) return null;
  for (const t of tasks) {
    if (t.type === 'Epic') continue;
    const b = words(t.titre);
    let common = 0;
    for (const w of a) if (b.has(w)) common++;
    if (common / Math.max(a.size, b.size) >= 0.75) return t;
  }
  return null;
}

function nextRef(refs) {
  let max = 0;
  for (const r of refs) { const m = /^B-(\d{3,})$/.exec(r || ''); if (m) max = Math.max(max, Number(m[1])); }
  return `B-${String(max + 1).padStart(3, '0')}`;
}

const splitLines = (text) => text.split(/\r?\n/);
const eol = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

function renderKeys(keys) {
  return KEY_ORDER.filter((k) => keys[k] !== undefined && keys[k] !== '').map((k) => `- ${k}: ${keys[k]}`);
}

// Modifie le titre et/ou des clés d'un bloc. `t` vient de parseBacklogText sur ce même `text`.
// `change` : { titre?, keys? } ; une clé à '' est retirée (sauf statut et prio).
function editTask(text, t, change) {
  const lines = splitLines(text);
  if (change.titre !== undefined) {
    const m = /^(#{2,4}\s+\S+\s+·\s+)/.exec(lines[t.start]);
    if (!m) throw new Error(`${t.ref} : titre illisible`);
    lines[t.start] = m[1] + norm(change.titre);
  }
  if (change.keys) {
    const keys = { ...t.keys };
    for (const [k, v] of Object.entries(change.keys)) {
      if (v === '' && !REQUIRED.includes(k)) delete keys[k]; else keys[k] = norm(v);
    }
    const idx = Object.values(t.keyLines);
    if (idx.length) {
      const from = Math.min(...idx);
      const to = Math.max(...idx);
      const stray = lines.slice(from, to + 1).filter((l, i) => !idx.includes(from + i) && l.trim() !== '');
      if (stray.length) throw new Error(`${t.ref} : bloc irrégulier, modifier à la main`);
      lines.splice(from, to - from + 1, ...renderKeys(keys));
    } else {
      lines.splice(t.start + 1, 0, '', ...renderKeys(keys));
    }
  }
  return lines.join(eol(text));
}

// Fin de la section commençant à la ligne `start` : jusqu'au prochain titre de niveau <= `level`.
function sectionEnd(lines, start, level) {
  for (let i = start + 1; i < lines.length; i++) {
    const h = /^(#{1,4})\s/.exec(lines[i]);
    if (h && h[1].length <= level) return i;
  }
  return lines.length;
}

// Dernière ligne non vide avant `end`, plus un.
function trimEnd(lines, from, end) {
  let e = end;
  while (e > from + 1 && lines[e - 1].trim() === '') e--;
  return e;
}

function blockLines(spec) {
  const level = spec.type === 'Sous-tâche' ? '####' : '###';
  return ['', `${level} ${spec.ref} · ${norm(spec.titre)}`, '', ...renderKeys(spec.keys)];
}

// Ajoute une tâche à la fin de son epic (ou de sa tâche parente pour une sous-tâche).
// `tasks` : analyse de ce même `text`. Retourne le texte, ou null si l'epic ou le parent manque.
function insertTask(text, tasks, spec) {
  const lines = splitLines(text);
  let at;
  if (spec.type === 'Sous-tâche') {
    const p = tasks.find((x) => x.ref === spec.parent && x.type === 'Tâche');
    if (!p) return null;
    at = trimEnd(lines, p.start, sectionEnd(lines, p.start, 3));
  } else {
    const e = tasks.find((x) => x.ref === spec.epic && x.type === 'Epic');
    if (!e) return null;
    at = trimEnd(lines, e.start, sectionEnd(lines, e.start, 2));
  }
  lines.splice(at, 0, ...blockLines(spec));
  return lines.join(eol(text));
}

// Déplace de BACKLOG.md vers l'archive les tâches `done` dont toutes les sous-tâches le sont aussi.
// Un epic n'est jamais déplacé. Retourne { backlog, archive, moved } ; texte inchangé si rien à faire.
function archiveDone(backlogText, archiveText, tasks, epicTitles) {
  const lines = splitLines(backlogText);
  const moved = [];
  const blocks = [];
  for (const t of tasks) {
    if (t.type !== 'Tâche' || t.statut !== 'Fait') continue;
    const kids = tasks.filter((x) => x.parent === t.ref);
    if (kids.some((k) => k.statut !== 'Fait')) continue;
    const end = trimEnd(lines, t.start, sectionEnd(lines, t.start, 3));
    blocks.push({ ref: t.ref, epic: t.epic.split(' ')[0], start: t.start, end });
    moved.push(t.ref, ...kids.map((k) => k.ref));
  }
  if (!blocks.length) return { backlog: backlogText, archive: archiveText, moved: [] };

  const e = eol(backlogText);
  let arch = splitLines(archiveText);
  for (const b of blocks) {
    const body = lines.slice(b.start, b.end);
    const head = arch.findIndex((l) => new RegExp(`^##\\s+${b.epic}\\s+·`).test(l));
    if (head < 0) {
      while (arch.length && arch[arch.length - 1].trim() === '') arch.pop();
      arch.push('', `## ${b.epic} · ${epicTitles[b.epic] || b.epic}`, '', ...body, '');
    } else {
      const at = trimEnd(arch, head, sectionEnd(arch, head, 2));
      arch.splice(at, 0, '', ...body);
    }
  }
  // Retrait du dépôt, du dernier bloc au premier, avec la ligne vide qui le précédait.
  for (const b of [...blocks].reverse()) {
    let s = b.start;
    while (s > 0 && lines[s - 1].trim() === '') s--;
    lines.splice(s, b.end - s);
  }
  return { backlog: lines.join(e).replace(/\n{3,}/g, '\n\n'), archive: arch.join(e).replace(/\n{3,}/g, '\n\n'), moved };
}

// Vue compacte : une ligne par tâche ouverte, sans description, regroupée par epic.
function listOpen(tasks, opts) {
  const o = opts || {};
  const out = [];
  let epic = '';
  for (const t of tasks) {
    if (t.type === 'Epic') continue;
    const st = STATUS_KEY[t.statut];
    if (!o.all && st === 'done') continue;
    if (o.statut && st !== o.statut) continue;
    if (o.jalon && !t.jalon.startsWith(o.jalon + ' ') && t.jalon !== o.jalon) continue;
    if (o.prio && t.prio !== o.prio) continue;
    if (t.epic !== epic) { epic = t.epic; out.push(`# ${epic}`); }
    const j = (t.jalon.split(' ')[0] || '-');
    out.push(`${t.type === 'Sous-tâche' ? '  ' : ''}${t.ref} ${st} ${t.prio} ${j} ${t.titre}${t.deps ? ` [${t.deps}]` : ''}`);
  }
  return out;
}

module.exports = {
  STATUS_KEY, KEY_ORDER, FICHE_PATTERN, FIELDS, FIELD_KEY, norm, fingerprint, diffFields, pullFlag, classify, findSimilar, nextRef,
  renderKeys, editTask, insertTask, archiveDone, listOpen, sectionEnd,
};
