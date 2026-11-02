#!/usr/bin/env node
'use strict';

/*
 * Contrôles de cohérence du backlog, appelés par .githooks/pre-commit.
 *
 * Réutilise le parseur du kit : tools/backlog-lib.js et tools/notion-ref.js.
 * Aucune dépendance, aucun réseau.
 *
 * Contrôles, arrêt au premier échec :
 *   structure  le parseur du kit ne remonte aucune erreur (clé, statut, jalon, fiche) ;
 *   a.         identifiants uniques dans docs/BACKLOG.md et docs/BACKLOG_ARCHIVE.md ;
 *   b.         un seul statut valide par tâche ;
 *   c.         docs/tasks/inbox/*.md : nom ^[a-z0-9-]+\.md$ ;
 *   d.         un B-xxx présent sur main ne disparaît pas et ne change pas de titre.
 *
 * Le contrôle d. est ignoré, avec un message, si la ref main est absente ou si main
 * ne contient pas le fichier concerné.
 *
 * Code de sortie : 0 = conforme, 1 = échec (message sur stderr).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const lib = require('./backlog-lib.js');
const { parseBacklogText } = require('./notion-ref.js');

const ROOT = path.resolve(__dirname, '..');
const BACKLOG = 'docs/BACKLOG.md';
const ARCHIVE = 'docs/BACKLOG_ARCHIVE.md';
const INBOX = 'docs/tasks/inbox';
const INBOX_NAME = /^[a-z0-9-]+\.md$/;
const TASK_REF = /^B-\d{3}$/;
const STATUS_LABELS = Object.keys(lib.STATUS_KEY);

const fail = (where, line, message) => {
  console.error(`backlog-check : ${line ? `${where}:${line}` : where} : ${message}`);
  process.exit(1);
};

const note = (message) => console.log(`backlog-check : ${message}`);

const readText = (rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
};

const parse = (text, jalons) => parseBacklogText(text, { emitEpics: true, jalons: jalons || {} });

// message du parseur : "ligne 26 (E-01) : statut inconnu ..."
const errorLine = (message) => {
  const m = /^ligne (\d+)/.exec(message);
  return m ? Number(m[1]) : 0;
};
const errorText = (message) => message.replace(/^ligne \d+\s*/, '').replace(/^\([^)]*\)\s*:\s*/, '');
// le parseur renvoie l'index 0-base de la ligne de titre dans `start`
const lineOf = (t) => (typeof t.start === 'number' ? t.start + 1 : 0);

// Lecture des deux fichiers. Le parseur écarte les blocs invalides : ses erreurs passent avant.
const backlogText = readText(BACKLOG);
if (backlogText === null) fail(BACKLOG, 0, 'fichier introuvable');
const backlog = parse(backlogText, {});

const archiveText = readText(ARCHIVE);
const archive = archiveText === null ? null : parse(archiveText, backlog.jalons);

const files = [{ rel: BACKLOG, parsed: backlog }];
if (archive) files.push({ rel: ARCHIVE, parsed: archive });

for (const f of files) {
  if (!f.parsed.errors.length) continue;
  const first = f.parsed.errors[0];
  fail(f.rel, errorLine(first), errorText(first));
}

// a. identifiants uniques, tous fichiers confondus
const current = new Map();
for (const f of files) {
  for (const t of f.parsed.tasks) {
    const prev = current.get(t.ref);
    if (prev) fail(f.rel, lineOf(t), `identifiant ${t.ref} en double (déjà ligne ${prev.line} de ${prev.file})`);
    current.set(t.ref, { ...t, file: f.rel, line: lineOf(t) });
  }
}

// b. un seul statut valide par tâche, et aucune clé hors convention
for (const t of current.values()) {
  if (!STATUS_LABELS.includes(t.statut)) fail(t.file, t.line, `${t.ref} : statut invalide "${t.statut}"`);
  const unknown = Object.keys(t.keys).filter((k) => !lib.KEY_ORDER.includes(k));
  if (unknown.length) fail(t.file, t.line, `${t.ref} : clé hors convention "${unknown[0]}"`);
}

// c. fichiers inbox
const inboxDir = path.join(ROOT, INBOX);
if (fs.existsSync(inboxDir)) {
  for (const name of fs.readdirSync(inboxDir).sort()) {
    const abs = path.join(inboxDir, name);
    if (!fs.statSync(abs).isFile()) fail(`${INBOX}/${name}`, 0, 'sous-dossier non admis dans l\'inbox');
    if (!INBOX_NAME.test(name)) fail(`${INBOX}/${name}`, 0, 'nom invalide, attendu ^[a-z0-9-]+\\.md$');
  }
}

// d. comparaison avec main
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

let hasMain = true;
try {
  git(['rev-parse', '--verify', '--quiet', 'main']);
} catch (e) {
  hasMain = false;
}

if (!hasMain) {
  note('réf main absente : contrôle des B-xxx par rapport à main ignoré');
} else {
  let compared = 0;
  let mainJalons = {};
  for (const rel of [BACKLOG, ARCHIVE]) {
    let text = null;
    try {
      text = git(['show', `main:${rel}`]);
    } catch (e) {
      note(`main ne contient pas ${rel} : contrôle ignoré pour ce fichier`);
      continue;
    }
    const parsed = parse(text, rel === ARCHIVE ? mainJalons : {});
    if (rel === BACKLOG) mainJalons = parsed.jalons;
    if (parsed.errors.length) {
      note(`avertissement : ${rel} sur main ne passe pas le parseur (${parsed.errors.length} erreur(s)) : comparaison ignorée pour ce fichier`);
      continue;
    }
    for (const t of parsed.tasks) {
      if (!TASK_REF.test(t.ref)) continue;
      const now = current.get(t.ref);
      if (!now) fail(`${rel} (main)`, lineOf(t), `${t.ref} « ${t.titre} » présent sur main a disparu de la branche`);
      if (now.titre !== t.titre) fail(now.file, now.line, `${t.ref} : titre modifié par rapport à main (« ${t.titre} » -> « ${now.titre} »)`);
      compared += 1;
    }
  }
  note(`B-xxx comparés à main : ${compared}`);
}

const taskCount = [...current.values()].filter((t) => TASK_REF.test(t.ref)).length;
note(`OK : ${taskCount} tâches, ${current.size - taskCount} epics`);
