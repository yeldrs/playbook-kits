#!/usr/bin/env node
'use strict';
// Audit anti-attribution : messages, metadonnees et code des commits d'une plage.
// Usage : node tools/audit-attribution.js [base] [--history]
//   base      : reference exclue de la plage (defaut : pre-playbook). Plage = base..HEAD.
//   --history : compte seulement les signatures de l'historique jusqu'a base (jamais de reecriture).
// Sortie : code 0 si aucun constat, 1 sinon, 2 si la reference est introuvable.
// Exceptions (2 motifs ancres, aucune pour les trailers ni pour le code) :
//   nom de branche  ^agent/[a-z0-9]+-[a-z0-9-]+$
//   sujet de merge  ^Merge branch 'agent/[a-z0-9-]+'$
//                   ^Merge pull request #[0-9]+ from [A-Za-z0-9_.-]+/agent/[a-z0-9-]+$
const { execFileSync } = require('node:child_process');

const args = process.argv.slice(2);
const history = args.includes('--history');
const base = args.find((a) => !a.startsWith('--')) || 'pre-playbook';

const git = (a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

try {
  git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
} catch (e) {
  console.error(`Reference introuvable : ${base}. Passer le tag ou le commit de depart en argument.`);
  process.exit(2);
}

const RE_BRANCH = /^agent\/[a-z0-9]+-[a-z0-9-]+$/;
const RE_MERGE = [
  /^Merge branch 'agent\/[a-z0-9-]+'$/,
  /^Merge pull request #[0-9]+ from [A-Za-z0-9_.-]+\/agent\/[a-z0-9-]+$/,
];
// Signatures : partout, sans exception.
const SIGNATURES = [
  [/^\s*co-authored-by\s*:/im, 'trailer Co-Authored-By'],
  [/^\s*claude-session\s*:/im, 'trailer Claude-Session'],
  [/generated (with|by)/i, 'mention de generation automatique'],
  [/noreply@anthropic\.com/i, 'adresse noreply de fournisseur'],
];
// Noms generiques : messages, metadonnees et code (hors chemins et fichiers d'instructions).
const NAMES = /(^|[^a-z0-9])(claude|anthropic|opencode|openai|chatgpt|copilot|gemini|codex|sonnet|opus|haiku|fable|gpt-?[0-9])([^a-z0-9]|$)/i;
const stripProject = (s) =>
  s.replace(/\.claude\/\S*/gi, '').replace(/CLAUDE\.md/gi, '');
// Fichiers qui decrivent legitimement les outils du projet : exclus du balayage du code.
const CODE_SKIP = /^(\.claude\/|\.githooks\/|CLAUDE\.md$|AGENTS\.md$|opencode\.json$|docs\/|tools\/audit-attribution\.js$|package-lock\.json$)/;

const findings = [];
const add = (where, what) => findings.push(`${where} : ${what}`);

function parseLog(range) {
  const SEP = '\u001e';
  const out = git(['log', range, `--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B${SEP}`]);
  return out
    .split(SEP)
    .map((s) => s.replace(/^\n/, ''))
    .filter((s) => s.trim())
    .map((r) => {
      const [hash, an, ae, cn, ce, msg] = r.split('\u001f');
      return { hash, an, ae, cn, ce, msg: msg || '' };
    });
}

if (history) {
  const commits = parseLog(base);
  const count = (re) => commits.filter((c) => re.test(c.msg)).length;
  console.log(`Historique jusqu'a ${base} : ${commits.length} commits`);
  console.log(`  Co-Authored-By : ${count(/^\s*co-authored-by\s*:/im)}`);
  console.log(`  Claude-Session : ${count(/^\s*claude-session\s*:/im)}`);
  console.log('  (compte seulement, jamais reecrit)');
  process.exit(0);
}

// Messages et metadonnees.
const commits = parseLog(`${base}..HEAD`);
for (const c of commits) {
  const id = c.hash.slice(0, 7);
  const subject = c.msg.split('\n')[0];
  const mergeOk = RE_MERGE.some((r) => r.test(subject));
  for (const [re, label] of SIGNATURES) if (re.test(c.msg)) add(`${id} message`, label);
  const text = mergeOk ? c.msg.split('\n').slice(1).join('\n') : c.msg;
  if (NAMES.test(stripProject(text))) add(`${id} message`, 'nom d\'outil ou de modele');
  for (const [k, v] of [['auteur', `${c.an} <${c.ae}>`], ['committer', `${c.cn} <${c.ce}>`]]) {
    if (NAMES.test(v) || /noreply@anthropic\.com/i.test(v)) add(`${id} ${k}`, `metadonnee suspecte (${v})`);
  }
}

// Noms de branches (locales et distantes).
for (const b of git(['branch', '-a', '--format=%(refname:short)']).split('\n').filter(Boolean)) {
  const name = b.replace(/^origin\//, '');
  if (RE_BRANCH.test(name)) continue;
  if (NAMES.test(name)) add(`branche ${b}`, 'nom d\'outil ou de modele');
}

// Code : lignes ajoutees entre base et HEAD (diff net), hors fichiers d'instructions et de documentation.
const diff = git(['diff', base, 'HEAD', '--unified=0', '--no-color']);
let file = '';
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ b/')) { file = line.slice(6); continue; }
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  const text = line.slice(1);
  for (const [re, label] of SIGNATURES) if (re.test(text)) add(`code ${file}`, label);
  if (!CODE_SKIP.test(file) && NAMES.test(stripProject(text))) add(`code ${file}`, `nom d'outil ou de modele : ${text.trim().slice(0, 80)}`);
}

console.log(`Plage ${base}..HEAD : ${commits.length} commits audites`);
if (findings.length) {
  for (const f of findings) console.log(`  ! ${f}`);
  console.log(`${findings.length} constat(s)`);
  process.exit(1);
}
console.log('Aucun constat.');
