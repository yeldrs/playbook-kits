#!/usr/bin/env node
'use strict';

/*
 * Accès au référentiel Notion : lecture du référentiel générique (et commentaires),
 * lecture et écriture bornée du référentiel du projet. Voir docs/NOTION_REF.md.
 *
 * Usage : node tools/notion-ref.js <commande> [arguments] [options]   (--help pour la liste)
 *
 * Les tokens se lisent dans les variables d'environnement nommées par "tokenEnv" dans
 * tools/notion-ref.config.json. Ils ne sont jamais écrits, affichés ni stockés dans le dépôt.
 * Toute écriture est un essai à blanc tant que --apply n'est pas passé (ou defaultApply).
 *
 * Code de sortie : 0 = succès, 1 = erreur (message sur stderr).
 */

const fs = require('fs');
const path = require('path');
const lib = require('./backlog-lib.js');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(__dirname, 'notion-ref.config.json');
const API = 'https://api.notion.com/v1';
const REQUEST_GAP_MS = 350; // environ 3 requêtes par seconde
const MAX_TEXT = 2000; // limite Notion par segment de texte
const MAX_APPEND = 100; // limite Notion de blocs par requête

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- identifiants

// Accepte un identifiant (avec ou sans tirets) ou une URL Notion. Retourne 8-4-4-4-12 ou ''.
function parseId(input) {
  const s = String(input || '').split('?')[0].replace(/-/g, '');
  const m = s.match(/([0-9a-fA-F]{32})(?![0-9a-fA-F])/);
  if (!m) return '';
  const h = m[1].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------------------------------------------------------------- config

function loadConfig(file = CONFIG_PATH) {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`config illisible (${file}) : ${e.message}`);
  }
  if (!cfg.notionVersion) throw new Error('config : champ "notionVersion" manquant');
  if (!cfg.profiles || typeof cfg.profiles !== 'object') throw new Error('config : champ "profiles" manquant');
  for (const [name, p] of Object.entries(cfg.profiles)) {
    if (!p.tokenEnv) throw new Error(`config : profil "${name}" sans "tokenEnv"`);
  }
  cfg.writeAllowlist = (cfg.writeAllowlist || []).map(parseId).filter(Boolean);
  cfg.writeDenylist = (cfg.writeDenylist || []).map(parseId).filter(Boolean);
  return cfg;
}

function resolveProfile(cfg, name) {
  const p = cfg.profiles[name];
  if (!p) throw new Error(`profil inconnu "${name}" (profils : ${Object.keys(cfg.profiles).join(', ')})`);
  return { name, ...p, rootId: parseId(p.rootId) };
}

// ---------------------------------------------------------------- client Notion

function createClient(token, version) {
  let last = 0;

  async function request(method, urlPath, body) {
    const maxAttempts = 4;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const wait = Math.max(0, last + REQUEST_GAP_MS - Date.now());
      if (wait) await sleep(wait);
      last = Date.now();

      let res;
      try {
        res = await fetch(API + urlPath, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Notion-Version': version,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(20000),
        });
      } catch (e) {
        lastError = new Error(`réseau : ${e.message}`);
        if (attempt < maxAttempts) await sleep(1000 * attempt);
        continue;
      }

      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`Notion ${res.status} (réessais épuisés)`);
        lastError.status = res.status;
        const retryAfter = Number(res.headers.get('retry-after'));
        if (attempt < maxAttempts) await sleep((retryAfter > 0 ? retryAfter : attempt * 2) * 1000);
        continue;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        let hint = '';
        if (res.status === 401) hint = ' (token invalide ou révoqué)';
        else if (res.status === 403) hint = ' (capacité manquante sur l\'intégration)';
        else if (res.status === 404) hint = ' (introuvable, ou page non partagée avec l\'intégration)';
        const err = new Error(`Notion ${res.status} ${data.code || ''} : ${data.message || 'erreur sans détail'}${hint}`);
        err.status = res.status;
        throw err;
      }
      return data;
    }
    throw lastError;
  }

  return { request };
}

async function paginate(client, method, urlPath, body) {
  const out = [];
  let cursor;
  do {
    let data;
    if (method === 'GET') {
      const sep = urlPath.includes('?') ? '&' : '?';
      data = await client.request('GET', urlPath + (cursor ? `${sep}start_cursor=${cursor}&page_size=100` : `${sep}page_size=100`));
    } else {
      data = await client.request(method, urlPath, { ...(body || {}), page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    }
    out.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

// ---------------------------------------------------------------- texte riche, propriétés

function richToMd(arr) {
  return (arr || []).map((t) => {
    let s = t.plain_text || '';
    if (!s) return '';
    const a = t.annotations || {};
    if (a.code) s = '`' + s + '`';
    if (a.bold) s = `**${s}**`;
    if (a.italic) s = `*${s}*`;
    if (a.strikethrough) s = `~~${s}~~`;
    if (t.href) s = `[${s}](${t.href})`;
    return s;
  }).join('');
}

const plain = (arr) => (arr || []).map((x) => x.plain_text || (x.text && x.text.content) || '').join('');

function pageTitle(page) {
  const props = page.properties || {};
  for (const p of Object.values(props)) if (p.type === 'title') return plain(p.title);
  return '';
}

function flattenProp(p) {
  switch (p.type) {
    case 'title': return plain(p.title);
    case 'rich_text': return plain(p.rich_text);
    case 'select': return p.select ? p.select.name : '';
    case 'status': return p.status ? p.status.name : '';
    case 'multi_select': return p.multi_select.map((x) => x.name);
    case 'number': return p.number;
    case 'checkbox': return p.checkbox;
    case 'date': return p.date ? (p.date.end ? `${p.date.start} -> ${p.date.end}` : p.date.start) : '';
    case 'url': case 'email': case 'phone_number': return p[p.type] || '';
    case 'relation': return p.relation.map((r) => r.id);
    case 'people': return p.people.map((u) => u.name || u.id);
    case 'files': return p.files.map((f) => f.name);
    case 'created_time': case 'last_edited_time': return p[p.type];
    case 'formula': return p.formula ? p.formula[p.formula.type] : '';
    case 'rollup': return p.rollup ? (p.rollup.array ? p.rollup.array.length + ' valeur(s)' : p.rollup[p.rollup.type]) : '';
    default: return `<${p.type}>`;
  }
}

function flattenProps(props) {
  const out = {};
  for (const [k, v] of Object.entries(props || {})) out[k] = flattenProp(v);
  return out;
}

const textChunks = (s) => {
  const out = [];
  for (let i = 0; i < s.length; i += MAX_TEXT) out.push(s.slice(i, i + MAX_TEXT));
  return out.length ? out : [''];
};
const rt = (s) => textChunks(String(s)).map((c) => ({ type: 'text', text: { content: c } }));

// Valeur simple (JSON de l'utilisateur) vers valeur Notion, selon le type du schéma.
function toNotionProp(type, v) {
  switch (type) {
    case 'title': return { title: rt(v) };
    case 'rich_text': return { rich_text: v === '' || v == null ? [] : rt(v) };
    case 'select': return { select: v ? { name: String(v) } : null };
    case 'status': return { status: { name: String(v) } };
    case 'multi_select': return { multi_select: (Array.isArray(v) ? v : String(v).split(',')).map((x) => ({ name: String(x).trim() })).filter((x) => x.name) };
    case 'number': return { number: v === '' || v == null ? null : Number(v) };
    case 'checkbox': return { checkbox: Boolean(v) };
    case 'date': return { date: v ? { start: String(v) } : null };
    case 'url': case 'email': case 'phone_number': return { [type]: v || null };
    case 'relation': return { relation: (Array.isArray(v) ? v : [v]).map(parseId).filter(Boolean).map((id) => ({ id })) };
    default: throw new Error(`type de propriété non modifiable par le script : ${type}`);
  }
}

function buildProps(schema, simple) {
  const out = {};
  for (const [k, v] of Object.entries(simple)) {
    const def = schema[k];
    if (!def) throw new Error(`propriété "${k}" absente du schéma (propriétés : ${Object.keys(schema).join(', ')})`);
    out[k] = toNotionProp(def.type, v);
  }
  return out;
}

// ---------------------------------------------------------------- blocs vers markdown

function renderBlocks(blocks, indent = '') {
  const lines = [];
  let num = 0;
  for (const b of blocks) {
    num = b.type === 'numbered_list_item' ? num + 1 : 0;
    const d = b[b.type] || {};
    const text = richToMd(d.rich_text);
    const kids = b.children && b.children.length ? renderBlocks(b.children, indent + '  ') : '';
    const withKids = (head) => lines.push(head + (kids ? '\n' + kids : ''));
    switch (b.type) {
      case 'paragraph': lines.push(indent + text + (kids ? '\n' + kids : '')); break;
      case 'heading_1': lines.push(`${indent}# ${text}`); break;
      case 'heading_2': lines.push(`${indent}## ${text}`); break;
      case 'heading_3': lines.push(`${indent}### ${text}`); break;
      case 'bulleted_list_item': withKids(`${indent}- ${text}`); break;
      case 'numbered_list_item': withKids(`${indent}${num}. ${text}`); break;
      case 'to_do': withKids(`${indent}- [${d.checked ? 'x' : ' '}] ${text}`); break;
      case 'toggle': withKids(`${indent}- ${text}`); break;
      case 'quote': withKids(`${indent}> ${text}`); break;
      case 'callout': withKids(`${indent}> ${d.icon && d.icon.emoji ? d.icon.emoji + ' ' : ''}${text}`); break;
      case 'code': lines.push(`${indent}\`\`\`${d.language && d.language !== 'plain text' ? d.language : ''}\n${plain(d.rich_text)}\n${indent}\`\`\``); break;
      case 'divider': lines.push(`${indent}---`); break;
      case 'child_page': lines.push(`${indent}[page : ${d.title}](${b.id})`); break;
      case 'child_database': lines.push(`${indent}[base : ${d.title}](${b.id})`); break;
      case 'link_to_page': lines.push(`${indent}[lien vers ${d.type} ${d[d.type]}]`); break;
      case 'bookmark': case 'embed': case 'link_preview': lines.push(`${indent}<${d.url}>`); break;
      case 'image': case 'file': case 'pdf': case 'video': {
        const src = d.type === 'external' ? d.external.url : (d.file ? d.file.url : '');
        lines.push(`${indent}[${b.type}](${src ? src.split('?')[0] : ''})`);
        break;
      }
      case 'equation': lines.push(`${indent}$$${d.expression}$$`); break;
      case 'table': lines.push(renderTable(b, indent)); break;
      case 'column_list': case 'column': case 'synced_block': if (kids) lines.push(kids); break;
      default: lines.push(`${indent}<!-- bloc ${b.type} non rendu -->`);
    }
  }
  return lines.join('\n');
}

function renderTable(b, indent) {
  const rows = (b.children || []).map((r) => (r.table_row.cells || []).map((c) => richToMd(c).replace(/\|/g, '\\|').replace(/\n/g, ' ')));
  if (!rows.length) return '';
  const w = rows[0].length;
  const fmt = (r) => `${indent}| ${r.concat(Array(Math.max(0, w - r.length)).fill('')).join(' | ')} |`;
  const out = [fmt(rows[0]), `${indent}|${' --- |'.repeat(w)}`, ...rows.slice(1).map(fmt)];
  return out.join('\n');
}

async function fetchBlocks(client, blockId, depth = 8) {
  const blocks = await paginate(client, 'GET', `/blocks/${blockId}/children`);
  if (depth <= 0) return blocks;
  for (const b of blocks) {
    // Une sous-page ou une sous-base est un autre noeud : on ne descend pas dedans.
    if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database') {
      b.children = await fetchBlocks(client, b.id, depth - 1);
    }
  }
  return blocks;
}

// ---------------------------------------------------------------- markdown vers blocs

function mdToRich(s) {
  const out = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m;
  const push = (content, extra) => {
    textChunks(content).forEach((c) => out.push({ type: 'text', text: { content: c, ...(extra && extra.link ? { link: { url: extra.link } } : {}) }, ...(extra && extra.annotations ? { annotations: extra.annotations } : {}) }));
  };
  while ((m = re.exec(s))) {
    if (m.index > last) push(s.slice(last, m.index));
    if (m[1]) push(m[1], { link: m[2] });
    else if (m[3]) push(m[3], { annotations: { bold: true } });
    else push(m[4], { annotations: { code: true } });
    last = re.lastIndex;
  }
  if (last < s.length) push(s.slice(last));
  return out;
}

function markdownToBlocks(md) {
  const blocks = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const block = (type, text, extra) => blocks.push({ object: 'block', type, [type]: { rich_text: mdToRich(text), ...(extra || {}) } });
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) { i++; continue; }
    if ((m = line.match(/^```(\w*)\s*$/))) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push({ object: 'block', type: 'code', code: { rich_text: rt(buf.join('\n')), language: m[1] || 'plain text' } });
    } else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      block(`heading_${m[1].length}`, m[2]);
      i++;
    } else if (/^---+\s*$/.test(line)) {
      blocks.push({ object: 'block', type: 'divider', divider: {} });
      i++;
    } else if ((m = line.match(/^\s*- \[([ xX])\]\s+(.*)$/))) {
      block('to_do', m[2], { checked: m[1] !== ' ' });
      i++;
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      block('bulleted_list_item', m[1]);
      i++;
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      block('numbered_list_item', m[1]);
      i++;
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      block('quote', m[1]);
      i++;
    } else {
      block('paragraph', line);
      i++;
    }
  }
  return blocks;
}

// ---------------------------------------------------------------- diff de lignes (plus longue sous-suite commune)

function lineDiff(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  const t = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) out.push(`- ${x[i++]}`);
    else out.push(`+ ${y[j++]}`);
  }
  while (i < x.length) out.push(`- ${x[i++]}`);
  while (j < y.length) out.push(`+ ${y[j++]}`);
  return out;
}

// ---------------------------------------------------------------- garde-fous d'écriture

// Remonte les parents d'un noeud jusqu'à trouver la racine. cache : Map id -> parent id ('' si workspace).
async function parentOf(client, id, cache) {
  if (cache.has(id)) return cache.get(id);
  let node;
  const tries = [`/pages/${id}`, `/databases/${id}`, `/blocks/${id}`];
  for (const p of tries) {
    try { node = await client.request('GET', p); break; } catch (e) {
      if (e.status !== 404 && e.status !== 400) throw e;
    }
  }
  if (!node) throw new Error(`noeud ${id} introuvable ou non partagé avec l'intégration`);
  const par = node.parent || {};
  const pid = par.page_id || par.database_id || par.block_id || par.data_source_id || '';
  const norm = pid ? parseId(pid) : '';
  cache.set(id, norm);
  return norm;
}

async function inSubtree(client, rootId, id, cache = new Map()) {
  let cur = parseId(id);
  for (let hops = 0; cur && hops < 30; hops++) {
    if (cur === rootId) return true;
    cur = await parentOf(client, cur, cache);
  }
  return false;
}

// Lève une erreur si le profil ou la cible n'autorise pas l'écriture.
async function assertWritable(client, cfg, profile, targetId, cache) {
  const id = parseId(targetId);
  if (!id) throw new Error(`identifiant de cible invalide : "${targetId}"`);
  if (!profile.canWrite) throw new Error(`écriture interdite : le profil "${profile.name}" est en lecture seule`);
  if (cfg.writeDenylist.includes(id)) throw new Error(`écriture interdite : ${id} est dans writeDenylist`);
  if (cfg.writeAllowlist.includes(id)) return;
  if (!profile.rootId) throw new Error(`profil "${profile.name}" sans rootId : écriture refusée`);
  if (!(await inSubtree(client, profile.rootId, id, cache))) {
    throw new Error(`écriture refusée : ${id} n'est pas sous la racine du profil "${profile.name}"`);
  }
}

// ---------------------------------------------------------------- commandes

function parseArgs(argv) {
  const flags = {};
  const pos = [];
  const valueFlags = new Set(['profile', 'depth', 'out', 'filter-json', 'props-json', 'md', 'parent-page', 'parent-db', 'title', 'icon', 'schema-json', 'after', 'file', 'find', 'replace', 'root', 'accept', 'keep', 'statut', 'jalon', 'prio']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (valueFlags.has(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { cmd: pos[0], pos: pos.slice(1), flags };
}

function clientFor(cfg, profile) {
  const token = process.env[profile.tokenEnv];
  if (!token) throw new Error(`variable d'environnement ${profile.tokenEnv} absente (token du profil "${profile.name}")`);
  return createClient(token, cfg.notionVersion);
}

const out = (flags, data, text) => console.log(flags.json ? JSON.stringify(data, null, 2) : text);

async function describeNode(client, id) {
  try {
    const page = await client.request('GET', `/pages/${id}`);
    return { kind: 'page', node: page };
  } catch (e) {
    if (e.status !== 404 && e.status !== 400) throw e;
  }
  const db = await client.request('GET', `/databases/${id}`);
  return { kind: 'database', node: db };
}

function schemaLines(db) {
  return Object.entries(db.properties || {}).map(([k, p]) => {
    let extra = '';
    if (p.select || p.multi_select || p.status) {
      const o = (p.select || p.multi_select || p.status).options || [];
      extra = ' : ' + o.map((x) => x.name).join(', ');
    }
    return `- ${k} (${p.type})${extra}`;
  });
}

async function readNode(client, id) {
  const { kind, node } = await describeNode(client, id);
  if (kind === 'database') {
    return { kind, id, title: plain(node.title), text: `# Base : ${plain(node.title)}\n\n${schemaLines(node).join('\n')}`, node };
  }
  const blocks = await fetchBlocks(client, id);
  const props = flattenProps(node.properties);
  const propLines = Object.entries(props).map(([k, v]) => `- ${k} : ${Array.isArray(v) ? v.join(', ') : v}`);
  const body = renderBlocks(blocks);
  return { kind, id, title: pageTitle(node), props, text: `# ${pageTitle(node)}\n\n${propLines.join('\n')}\n\n${body}`.trimEnd(), body, node };
}

async function listChildren(client, id) {
  const blocks = await paginate(client, 'GET', `/blocks/${id}/children`);
  const found = [];
  for (const b of blocks) {
    if (b.type === 'child_page') found.push({ id: b.id, type: 'page', title: b.child_page.title });
    else if (b.type === 'child_database') found.push({ id: b.id, type: 'database', title: b.child_database.title });
    else if (b.has_children && ['column_list', 'column', 'toggle', 'synced_block', 'callout'].includes(b.type)) {
      found.push(...(await listChildren(client, b.id)));
    }
  }
  return found;
}

async function walk(client, id, depth, visit, level = 0) {
  const children = await listChildren(client, id);
  for (const c of children) {
    await visit(c, level);
    if (c.type === 'page' && level + 1 < depth) await walk(client, c.id, depth, visit, level + 1);
  }
}

async function cmdTree(cfg, profile, client, flags) {
  if (!profile.rootId) throw new Error(`profil "${profile.name}" sans rootId dans la config`);
  const depth = Number(flags.depth) || 3;
  const items = [];
  const lines = [];
  await walk(client, profile.rootId, depth, async (c, level) => {
    items.push({ ...c, level });
    lines.push(`${'  '.repeat(level)}- ${c.type === 'database' ? '[base] ' : ''}${c.title}  (${c.id})`);
  });
  out(flags, items, lines.join('\n') || '(rien sous la racine)');
}

async function queryRows(client, dbId, filterJson) {
  const body = filterJson ? { filter: JSON.parse(filterJson) } : {};
  return paginate(client, 'POST', `/databases/${dbId}/query`, body);
}

async function cmdQuery(client, id, flags) {
  const rows = await queryRows(client, id, flags['filter-json']);
  const flat = rows.map((r) => ({ id: r.id, ...flattenProps(r.properties) }));
  out(flags, flat, flat.map((r) => JSON.stringify(r)).join('\n') || '(aucune ligne)');
}

const slug = (s) => (s || 'sans-titre').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'sans-titre';

async function cmdDump(cfg, profile, client, flags) {
  if (!profile.rootId) throw new Error(`profil "${profile.name}" sans rootId dans la config`);
  const base = path.resolve(ROOT, flags.out || cfg.dumpPath || '_local/notion-ref-dump');
  const dir = path.join(base, profile.name);
  fs.mkdirSync(dir, { recursive: true });
  const depth = Number(flags.depth) || 6;
  const index = [];

  async function dumpPage(id, target) {
    const r = await readNode(client, id);
    fs.writeFileSync(path.join(target, `${slug(r.title)}.md`), r.text + '\n');
    index.push({ id, kind: r.kind, title: r.title, file: path.relative(dir, path.join(target, `${slug(r.title)}.md`)).replace(/\\/g, '/') });
    return r;
  }

  await dumpPage(profile.rootId, dir);
  const stack = [{ id: profile.rootId, target: dir, level: 0 }];
  while (stack.length) {
    const { id, target, level } = stack.pop();
    if (level >= depth) continue;
    for (const c of await listChildren(client, id)) {
      if (c.type === 'page') {
        const sub = path.join(target, slug(c.title));
        fs.mkdirSync(sub, { recursive: true });
        await dumpPage(c.id, sub);
        stack.push({ id: c.id, target: sub, level: level + 1 });
      } else {
        const sub = path.join(target, `base-${slug(c.title)}`);
        let db;
        try {
          db = await client.request('GET', `/databases/${c.id}`);
        } catch (e) {
          // Une vue liée n'est pas lisible par l'API : on la note et on continue.
          if (e.status === 400 && /linked database/i.test(e.message)) {
            index.push({ id: c.id, kind: 'linked-view', title: c.title, file: '' });
            continue;
          }
          throw e;
        }
        fs.mkdirSync(sub, { recursive: true });
        fs.writeFileSync(path.join(sub, '_schema.json'), JSON.stringify(db.properties, null, 2) + '\n');
        const rows = await queryRows(client, c.id);
        fs.writeFileSync(path.join(sub, '_rows.json'), JSON.stringify(rows.map((r) => ({ id: r.id, ...flattenProps(r.properties) })), null, 2) + '\n');
        index.push({ id: c.id, kind: 'database', title: c.title, file: path.relative(dir, sub).replace(/\\/g, '/') });
        for (const r of rows) {
          const text = await dumpRow(client, r);
          fs.writeFileSync(path.join(sub, `${slug(pageTitle(r))}-${r.id.slice(0, 4)}.md`), text + '\n');
        }
      }
    }
  }
  fs.writeFileSync(path.join(dir, '_index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`dump : ${index.length} noeud(s) écrits dans ${path.relative(ROOT, dir).replace(/\\/g, '/')}`);
}

async function dumpRow(client, row) {
  const blocks = await fetchBlocks(client, row.id);
  const props = Object.entries(flattenProps(row.properties)).map(([k, v]) => `- ${k} : ${Array.isArray(v) ? v.join(', ') : v}`);
  return `# ${pageTitle(row)}\n\n${props.join('\n')}\n\n${renderBlocks(blocks)}`.trimEnd();
}

async function cmdComments(cfg, profile, client, pos, flags) {
  const sub = pos[0];
  const id = parseId(pos[1]);
  if (!id) throw new Error('usage : comments list <id> | comments add <id> "texte"');
  if (sub === 'list') {
    const list = await paginate(client, 'GET', `/comments?block_id=${id}`);
    const flat = list.map((c) => ({ id: c.id, created: c.created_time, text: plain(c.rich_text) }));
    out(flags, flat, flat.map((c) => `${c.created}  ${c.text}`).join('\n') || '(aucun commentaire)');
  } else if (sub === 'add') {
    if (!profile.canComment && !profile.canWrite) throw new Error(`commentaire interdit : profil "${profile.name}" sans canComment`);
    const text = pos.slice(2).join(' ');
    if (!text) throw new Error('commentaire vide');
    if (!applies(cfg, flags)) {
      console.log(`essai à blanc : commentaire sur ${id} :\n  ${text}\n(ajouter --apply pour envoyer)`);
      return;
    }
    await client.request('POST', '/comments', { parent: { page_id: id }, rich_text: rt(text) });
    logWrite({ profile: profile.name, action: 'comment', target: id, text });
    console.log('commentaire ajouté.');
  } else {
    throw new Error('usage : comments list <id> | comments add <id> "texte"');
  }
}

const applies = (cfg, flags) => Boolean(flags.apply) || (cfg.defaultApply === true && !flags['dry-run']);

// Dans un worktree git lié, `.git` est un fichier. Son backlog est intermédiaire : l'écrire dans
// Notion (ou y tirer Notion) écraserait la version de l'arbre principal. NOTION_ALLOW_WORKTREE=1 lève la garde.
function inLinkedWorktree(root = ROOT) {
  try { return fs.statSync(path.join(root, '.git')).isFile(); } catch (e) { return false; }
}
function blockedByWorktree(cfg, flags, name) {
  if (!applies(cfg, flags) || process.env.NOTION_ALLOW_WORKTREE === '1' || !inLinkedWorktree()) return false;
  console.log(`${name} ignoré : worktree git temporaire, lancer depuis l'arbre principal`);
  return true;
}

function logWrite(entry) {
  try {
    const file = path.join(ROOT, '_local', 'notion-ref-log.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
  } catch (e) {
    console.error(`journal local non écrit (${e.message})`);
  }
}

function readInput(flags) {
  if (!flags.md) return '';
  return fs.readFileSync(path.resolve(ROOT, flags.md), 'utf8');
}

const writeCache = new Map(); // parents déjà remontés, partagé entre les écritures d'un même lancement
const schemaCache = new Map();

async function schemaForParentDb(client, dbId) {
  if (!schemaCache.has(dbId)) {
    const db = await client.request('GET', `/databases/${dbId}`);
    schemaCache.set(dbId, db.properties || {});
  }
  return schemaCache.get(dbId);
}

// Remplace du texte dans chaque segment d'un texte riche en gardant les annotations.
function replaceInRich(arr, find, repl) {
  let count = 0;
  const next = (arr || []).map((t) => {
    const content = (t.text && t.text.content) || t.plain_text || '';
    const hit = content.split(find).length - 1;
    count += hit;
    const c = hit ? content.split(find).join(repl) : content;
    const seg = { type: 'text', text: { content: c } };
    const href = t.href || (t.text && t.text.link && t.text.link.url);
    if (href) seg.text.link = { url: href };
    if (t.annotations) seg.annotations = t.annotations;
    return seg;
  });
  return { rich: next, count };
}

// Calcule la modification d'un bloc texte ou d'une ligne de tableau. Retourne null si rien à changer.
function planBlockEdit(block, find, repl) {
  const d = block[block.type] || {};
  if (block.type === 'table_row') {
    let total = 0;
    const cells = (d.cells || []).map((c) => { const r = replaceInRich(c, find, repl); total += r.count; return r.rich; });
    if (!total) return null;
    return { count: total, patch: { table_row: { cells } }, before: (d.cells || []).map(richToMd).join(' | '), after: cells.map((c) => c.map((x) => x.text.content).join('')).join(' | ') };
  }
  if (!d.rich_text) return null;
  const r = replaceInRich(d.rich_text, find, repl);
  if (!r.count) return null;
  return { count: r.count, patch: { [block.type]: { rich_text: r.rich } }, before: richToMd(d.rich_text), after: r.rich.map((x) => x.text.content).join('') };
}

async function walkBlocks(blocks, visit) {
  for (const b of blocks) {
    await visit(b);
    if (b.children && b.children.length) await walkBlocks(b.children, visit);
  }
}

async function cmdFind(profile, client, text, flags) {
  if (!text) throw new Error('usage : find "texte"');
  const hits = [];
  const pages = [{ id: profile.rootId, title: '(racine)' }];
  await walk(client, profile.rootId, flags.depth ? Number(flags.depth) : 6, async (c) => { if (c.type === 'page') pages.push(c); });
  for (const pg of pages) {
    const blocks = await fetchBlocks(client, pg.id);
    await walkBlocks(blocks, async (b) => {
      const r = planBlockEdit(b, text, text);
      if (r) hits.push({ page: pg.title, pageId: pg.id, blockId: b.id, type: b.type, text: r.before });
    });
  }
  out(flags, hits, hits.map((h) => `${h.page} [${h.type}] ${h.blockId}\n    ${h.text.slice(0, 220)}`).join('\n') || '(aucune occurrence)');
}

async function cmdWrite(cfg, profile, client, sub, pos, flags) {
  const cache = writeCache;
  const go = applies(cfg, flags);
  const simple = flags['props-json'] ? JSON.parse(flags['props-json']) : null;
  const md = readInput(flags);
  const tag = go ? '' : 'essai à blanc : ';

  if (sub === 'create-page') {
    const parentId = parseId(flags['parent-page'] || flags['parent-db']);
    if (!parentId) throw new Error('usage : write create-page (--parent-page <id> | --parent-db <id>) --title "..." [--props-json ...] [--md fichier]');
    await assertWritable(client, cfg, profile, parentId, cache);
    let properties;
    let parent;
    if (flags['parent-db']) {
      const schema = await schemaForParentDb(client, parentId);
      const titleKey = Object.keys(schema).find((k) => schema[k].type === 'title');
      properties = buildProps(schema, { ...(flags.title ? { [titleKey]: flags.title } : {}), ...(simple || {}) });
      parent = { database_id: parentId };
    } else {
      if (!flags.title) throw new Error('--title requis pour une page sous une page');
      properties = { title: { title: rt(flags.title) } };
      parent = { page_id: parentId };
    }
    const children = md ? markdownToBlocks(md) : [];
    console.log(`${tag}création sous ${parentId} : ${JSON.stringify(flattenProps(Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, { type: Object.keys(v)[0], ...v }]))))} + ${children.length} bloc(s)`);
    if (!go) return console.log('(ajouter --apply pour écrire)');
    const page = await client.request('POST', '/pages', { parent, properties, children: children.slice(0, MAX_APPEND) });
    for (let i = MAX_APPEND; i < children.length; i += MAX_APPEND) {
      await client.request('PATCH', `/blocks/${page.id}/children`, { children: children.slice(i, i + MAX_APPEND) });
    }
    logWrite({ profile: profile.name, action: 'create-page', target: page.id, parent: parentId });
    console.log(`page créée : ${page.id}`);
    return;
  }

  if (sub === 'create-db') {
    const parentId = parseId(flags['parent-page']);
    if (!parentId || !flags.title || !flags['schema-json']) throw new Error('usage : write create-db --parent-page <id> --title "..." --schema-json <json|backlog> [--apply]');
    await assertWritable(client, cfg, profile, parentId, cache);
    const schema = flags['schema-json'] === 'backlog' ? BACKLOG_SCHEMA : JSON.parse(flags['schema-json']);
    console.log(`${tag}création de la base "${flags.title}" sous ${parentId} : ${Object.keys(schema).map((k) => `${k} (${Object.keys(schema[k])[0]})`).join(', ')}`);
    if (!go) return console.log('(ajouter --apply pour écrire)');
    const db = await client.request('POST', '/databases', { parent: { type: 'page_id', page_id: parentId }, title: rt(flags.title), properties: schema });
    logWrite({ profile: profile.name, action: 'create-db', target: db.id, parent: parentId, title: flags.title });
    console.log(`base créée : ${db.id}`);
    return;
  }

  if (sub === 'batch') {
    if (!flags.file) throw new Error('usage : write batch --file ops.json [--apply]  (ops : [{"sub":"update-props","id":"...","props":{...}}, ...])');
    const ops = JSON.parse(fs.readFileSync(path.resolve(ROOT, flags.file), 'utf8'));
    console.log(`${tag}lot de ${ops.length} opération(s) :`);
    for (const [i, op] of ops.entries()) {
      console.log(`[${i + 1}/${ops.length}] ${op.sub} ${op.id || op.title || ''}`);
      const f = { ...flags, file: undefined, title: op.title, md: op.md, 'parent-db': op.parentDb, 'parent-page': op.parentPage, 'props-json': op.props ? JSON.stringify(op.props) : undefined, find: op.find, replace: op.replace, 'schema-json': op.schema ? JSON.stringify(op.schema) : undefined };
      await cmdWrite(cfg, profile, client, op.sub, [op.id || ''], f); // la première erreur arrête le lot
    }
    return;
  }

  const id = parseId(pos[0]);
  if (!id) throw new Error(`usage : write ${sub} <id> ...`);
  await assertWritable(client, cfg, profile, id, cache);

  if (sub === 'schema') {
    if (!flags['schema-json']) throw new Error('--schema-json requis (null retire la propriété)');
    const patch = JSON.parse(flags['schema-json']);
    const db = await client.request('GET', `/databases/${id}`);
    const cur = db.properties || {};
    console.log(`${tag}schéma de la base ${plain(db.title)} (${id}) :`);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) console.log(`  - ${k} (${cur[k] ? cur[k].type : 'absente'}) : retirée${cur[k] ? '' : ', rien à faire'}`);
      else if (cur[k]) console.log(`  ! ${k} existe déjà (${cur[k].type}), sera modifiée : ${JSON.stringify(v)}`);
      else console.log(`  + ${k} : ${JSON.stringify(v)}`);
    }
    if (!go) return console.log('(ajouter --apply pour écrire)');
    await client.request('PATCH', `/databases/${id}`, { properties: patch });
    schemaCache.delete(id);
    logWrite({ profile: profile.name, action: 'schema', target: id, before: Object.fromEntries(Object.keys(patch).map((k) => [k, cur[k] ? cur[k].type : null])), after: patch });
    console.log('schéma mis à jour.');
  } else if (sub === 'update-block') {
    if (flags.find == null || flags.replace == null) throw new Error('--find et --replace requis');
    const block = await client.request('GET', `/blocks/${id}`);
    const plan = planBlockEdit(block, flags.find, flags.replace);
    if (!plan) throw new Error(`texte "${flags.find}" introuvable dans le bloc ${id} (type ${block.type}) ; il peut être coupé entre deux segments de mise en forme`);
    console.log(`${tag}bloc ${id} (${block.type}) :\n  - ${plan.before}\n  + ${plan.after}`);
    if (!go) return console.log('(ajouter --apply pour écrire)');
    await client.request('PATCH', `/blocks/${id}`, plan.patch);
    logWrite({ profile: profile.name, action: 'update-block', target: id, before: plan.before, after: plan.after });
    console.log('bloc mis à jour.');
  } else if (sub === 'update-props') {
    if (!simple) throw new Error('--props-json requis');
    const page = await client.request('GET', `/pages/${id}`);
    const par = page.parent || {};
    if (!par.database_id) throw new Error('update-props ne vise que les lignes de base ; pour le titre d\'une page, utiliser --props-json {"title":"..."} sur une ligne de base');
    const schema = await schemaForParentDb(client, parseId(par.database_id));
    const properties = buildProps(schema, simple);
    const before = flattenProps(page.properties);
    console.log(`${tag}mise à jour de ${id} :`);
    for (const k of Object.keys(simple)) console.log(`  ${k} : ${JSON.stringify(before[k])} -> ${JSON.stringify(simple[k])}`);
    if (!go) return console.log('(ajouter --apply pour écrire)');
    await client.request('PATCH', `/pages/${id}`, { properties });
    logWrite({ profile: profile.name, action: 'update-props', target: id, before: Object.fromEntries(Object.keys(simple).map((k) => [k, before[k]])), after: simple });
    console.log('propriétés mises à jour.');
  } else if (sub === 'append-blocks') {
    if (!md) throw new Error('--md <fichier> requis');
    const children = markdownToBlocks(md);
    const after = flags.after ? parseId(flags.after) : '';
    if (flags.after && !after) throw new Error('--after : identifiant de bloc invalide');
    if (after && children.length > MAX_APPEND) throw new Error(`--after : ${MAX_APPEND} blocs au plus`);
    console.log(`${tag}ajout de ${children.length} bloc(s) ${after ? 'après le bloc ' + after : 'à la fin'} de ${id} :`);
    console.log(md.split('\n').map((l) => `+ ${l}`).join('\n'));
    if (!go) return console.log('(ajouter --apply pour écrire)');
    for (let i = 0; i < children.length; i += MAX_APPEND) {
      await client.request('PATCH', `/blocks/${id}/children`, { children: children.slice(i, i + MAX_APPEND), ...(after ? { after } : {}) });
    }
    logWrite({ profile: profile.name, action: 'append-blocks', target: id, blocks: children.length, after: after || null });
    console.log('blocs ajoutés.');
  } else if (sub === 'archive') {
    const { kind, node } = await describeNode(client, id);
    const label = kind === 'database' ? plain(node.title) : pageTitle(node);
    const rows = kind === 'database' ? (await queryRows(client, id)).length : null;
    console.log(`${tag}archivage de ${kind === 'database' ? 'la base' : 'la page'} "${label}" (${id})${rows != null ? `, ${rows} ligne(s)` : ''}, récupérable depuis la corbeille Notion`);
    if (!go) return console.log('(ajouter --apply pour écrire)');
    await client.request('PATCH', `${kind === 'database' ? '/databases' : '/pages'}/${id}`, { archived: true });
    logWrite({ profile: profile.name, action: 'archive', target: id, kind, label, rows });
    console.log('archivé.');
  } else {
    throw new Error('sous-commandes : create-page, update-props, update-block, schema, append-blocks, archive, batch');
  }
}

const BACKLOG_STATUS = { todo: 'À faire', doing: 'En cours', blocked: 'Bloqué', verify: 'À vérifier', done: 'Fait' };
const BACKLOG_PRIO = ['P0', 'P1', 'P2', 'P3'];
const BACKLOG_TYPES = { 2: 'Epic', 3: 'Tâche', 4: 'Sous-tâche' };
const BACKLOG_PROPS = ['Titre', 'Réf', 'Type', 'Statut', 'Priorité', 'Epic', 'Jalon', 'Parent', 'Dépendances', 'Description', 'Critère de fin', 'Empreinte', 'Dernière synchro', 'Source'];

const BACKLOG_SCHEMA = {
  Titre: { title: {} },
  'Réf': { rich_text: {} },
  Type: { select: { options: [{ name: 'Epic', color: 'purple' }, { name: 'Tâche', color: 'default' }, { name: 'Sous-tâche', color: 'gray' }] } },
  Statut: { select: { options: [{ name: 'À faire', color: 'gray' }, { name: 'En cours', color: 'blue' }, { name: 'Bloqué', color: 'red' }, { name: 'À vérifier', color: 'yellow' }, { name: 'Fait', color: 'green' }] } },
  'Priorité': { select: { options: [{ name: 'P0', color: 'red' }, { name: 'P1', color: 'orange' }, { name: 'P2', color: 'yellow' }, { name: 'P3', color: 'gray' }] } },
  Epic: { select: {} },
  Jalon: { select: {} },
  'Dépendances': { rich_text: {} },
  Description: { rich_text: {} },
  'Critère de fin': { rich_text: {} },
  Empreinte: { rich_text: {} },
  'Dernière synchro': { date: {} },
  Source: { select: { options: [{ name: 'Humain', color: 'green' }, { name: 'CLI', color: 'blue' }, { name: 'Desktop', color: 'purple' }] } },
};

// Fichier de backlog en blocs : `##` epic, `###` tâche, `####` sous-tâche, puis des lignes
// `- clé: valeur`. Un tableau `| S1 | nom | objectif |` sous `## Jalons` nomme les jalons.
// `emitEpics` faux (archive) : les titres d'epic donnent le contexte sans créer de ligne.
function parseBacklogText(text, opts) {
  const o = opts || {};
  const tasks = [];
  const errors = [];
  const jalons = { ...(o.jalons || {}) }; // l'archive n'a pas de tableau : elle reprend celui de BACKLOG.md
  const KEYS = lib.KEY_ORDER;
  let epic = null;
  let parent = null;
  let cur = null;
  let inJalons = false;
  const close = (end) => {
    if (!cur) return;
    const t = cur;
    t.end = end;
    cur = null;
    if (!t.skip) tasks.push(t);
  };
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const n = i + 1;
    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) {
      close(i);
      const level = h[1].length;
      const m = /^(E-\d{2}|B-\d{3})\s+·\s+(.+)$/.exec(h[2].trim());
      inJalons = level === 2 && /^Jalons\s*$/.test(h[2]);
      if (!m) { if (level === 2) { epic = null; parent = null; } return; }
      const ref = m[1];
      const wantE = level === 2;
      if (wantE !== (ref[0] === 'E')) { errors.push(`ligne ${n} : ${ref} ne correspond pas au niveau de titre`); return; }
      if (level === 2) { epic = { ref, titre: m[2].trim() }; parent = null; }
      else if (level === 3) parent = ref;
      else if (level === 4 && !parent) { errors.push(`ligne ${n} (${ref}) : sous-tâche sans tâche parente`); return; }
      if (level > 2 && !epic) { errors.push(`ligne ${n} (${ref}) : tâche hors d'un epic`); return; }
      cur = {
        ref, titre: m[2].trim(), type: BACKLOG_TYPES[level], line: n, start: i, keyLines: {}, epic: epic.ref + ' ' + epic.titre,
        parent: level === 4 ? parent : (level === 3 ? epic.ref : ''), keys: {}, skip: level === 2 && o.emitEpics === false,
      };
      return;
    }
    if (inJalons) {
      const c = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
      if (/^(S\d+|Hors)$/.test(c[0]) && c.length >= 2) jalons[c[0]] = c[0] === 'Hors' ? 'Hors jalon' : c[0] + ' · ' + c[1];
      return;
    }
    const kv = /^-\s+([a-zé]+)\s*:\s*(.*)$/.exec(line);
    if (kv && cur) {
      if (!KEYS.includes(kv[1])) { errors.push(`ligne ${n} (${cur.ref}) : clé inconnue "${kv[1]}"`); return; }
      if (kv[1] in cur.keys) { errors.push(`ligne ${n} (${cur.ref}) : clé "${kv[1]}" en double`); return; }
      cur.keys[kv[1]] = kv[2].trim();
      cur.keyLines[kv[1]] = i;
    }
  });
  close(lines.length);
  const out = [];
  for (const t of tasks) {
    const k = t.keys;
    const where = `ligne ${t.line} (${t.ref})`;
    if (!(k.statut in BACKLOG_STATUS)) { errors.push(`${where} : statut inconnu "${k.statut || ''}"`); continue; }
    if (k.prio && !BACKLOG_PRIO.includes(k.prio)) { errors.push(`${where} : priorité inconnue "${k.prio}"`); continue; }
    if (k.fiche && !lib.FICHE_PATTERN.test(k.fiche)) { errors.push(`${where} : fiche "${k.fiche}" hors du format docs/tasks/B-000.md`); continue; }
    if (t.type !== 'Epic' && !k.prio) { errors.push(`${where} : priorité absente`); continue; }
    let jalon = '';
    if (k.jalon) {
      jalon = jalons[k.jalon];
      if (!jalon) { errors.push(`${where} : jalon inconnu "${k.jalon}"`); continue; }
    }
    if (/,/.test(t.epic) || /,/.test(jalon)) { errors.push(`${where} : pas de virgule dans le nom d'un epic ou d'un jalon (refusé par Notion)`); continue; }
    out.push({
      ref: t.ref, titre: t.titre, type: t.type, statut: BACKLOG_STATUS[k.statut], prio: k.prio || '', epic: t.type === 'Epic' ? '' : t.epic, jalon,
      parent: t.parent, deps: k.deps || '', description: k.description || '', critere: k.fin || '',
      start: t.start, end: t.end, keyLines: t.keyLines, keys: k,
    });
  }
  return { tasks: out, errors, jalons };
}

async function findDatabaseByTitle(client, rootId, title) {
  let found = null;
  await walk(client, rootId, 4, async (c) => { if (!found && c.type === 'database' && c.title === title) found = c; });
  if (!found) for (const c of await listChildren(client, rootId)) if (c.type === 'database' && c.title === title) found = c;
  return found;
}

function hookIsForOtherFile(raw, files) {
  if (!raw || !raw.trim()) return false;
  let d;
  try { d = JSON.parse(raw); } catch (e) { return false; }
  const fp = d && d.tool_input && (d.tool_input.file_path || d.tool_input.path);
  if (!fp || typeof fp !== 'string') return false;
  const n = fp.replace(/\\/g, '/').toLowerCase();
  return !files.some((f) => n.endsWith('/' + f.toLowerCase()));
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let buf = '';
    let done = false;
    const end = () => { if (done) return; done = true; clearTimeout(t); try { process.stdin.destroy(); } catch (e) { /* rien */ } resolve(buf); };
    const t = setTimeout(end, 400);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', end);
    process.stdin.on('error', end);
  });
}

const BL_STATUS_CODE = lib.STATUS_KEY;
const jalonCode = (label) => (!label ? '' : label === 'Hors jalon' ? 'Hors' : label.split(' · ')[0]);
const listArg = (v) => new Set(String(v === true ? '' : v || '').split(',').map((x) => x.trim()).filter(Boolean));

// Lit BACKLOG.md et l'archive. `errors` non vide : rien ne doit partir vers Notion.
function loadBacklog(cfg) {
  const files = (cfg.backlog || {}).files || ['docs/BACKLOG.md', 'docs/BACKLOG_ARCHIVE.md'];
  const texts = {};
  const tasks = [];
  const errors = [];
  let jalons = {};
  files.forEach((f, i) => {
    let text = '';
    try { text = fs.readFileSync(path.resolve(ROOT, f), 'utf8'); } catch (e) { if (i === 0) throw new Error(`backlog illisible (${f})`); }
    texts[f] = text;
    const r = parseBacklogText(text, { emitEpics: i === 0, jalons });
    r.tasks.forEach((t) => { t.file = f; });
    tasks.push(...r.tasks);
    errors.push(...r.errors.map((m) => `${f} : ${m}`));
    if (i === 0) jalons = r.jalons;
  });
  const seen = new Set();
  for (const t of tasks) { if (seen.has(t.ref)) errors.push(`identifiant ${t.ref} présent deux fois`); seen.add(t.ref); }
  for (const t of tasks) {
    if (t.keys.fiche && !fs.existsSync(path.resolve(ROOT, t.keys.fiche))) errors.push(`${t.ref} : fiche ${t.keys.fiche} introuvable`);
    if (t.parent && !seen.has(t.parent)) errors.push(`${t.ref} : parent ${t.parent} introuvable`);
    if (t.type !== 'Epic' && !seen.has(t.epic.split(' ')[0])) errors.push(`${t.ref} : epic ${t.epic.split(' ')[0]} absent de BACKLOG.md`);
  }
  return { files, texts, tasks, errors, jalons, jalonLabels: Object.values(jalons) };
}

function reportErrors(errors) {
  console.error(`backlog : ${errors.length} erreur(s), rien n'a été envoyé :`);
  errors.slice(0, 10).forEach((m) => console.error(`  - ${m}`));
  process.exitCode = 1;
}

async function openBacklogDb(cfg, profile, client) {
  const title = (cfg.backlog || {}).databaseTitle || 'Backlog';
  const found = await findDatabaseByTitle(client, profile.rootId, title);
  if (!found) throw new Error(`base "${title}" introuvable sous la racine. La créer : write create-db --parent-page <id> --title ${title} --schema-json backlog`);
  const dbId = parseId(found.id);
  await assertWritable(client, cfg, profile, dbId, writeCache);
  const db = await client.request('GET', `/databases/${dbId}`);
  const miss = BACKLOG_PROPS.filter((k) => !(db.properties || {})[k]);
  if (miss.length) throw new Error(`propriétés absentes de la base ${title} : ${miss.join(', ')}. Ajouter : write schema ${dbId} --schema-json '{"Empreinte":{"rich_text":{}}}' --apply`);
  return dbId;
}

// Lignes de la base sous la forme des tâches du dépôt, plus `id`, `empreinte` et `parentId`.
// `dup` : références présentes sur plusieurs lignes (la première seule est gardée).
async function loadRows(client, dbId) {
  const rows = [];
  const dup = [];
  const seen = new Set();
  for (const page of await paginate(client, 'POST', `/databases/${dbId}/query`, {})) {
    const p = page.properties;
    const r = {
      id: page.id, ref: plain(p['Réf'].rich_text).trim(), titre: plain(p.Titre.title), type: (p.Type.select || {}).name || '',
      statut: (p.Statut.select || {}).name || '', prio: (p['Priorité'].select || {}).name || '', epic: (p.Epic.select || {}).name || '',
      jalon: (p.Jalon.select || {}).name || '', parentId: ((p.Parent.relation || [])[0] || {}).id || '',
      deps: plain(p['Dépendances'].rich_text), description: plain(p.Description.rich_text), critere: plain(p['Critère de fin'].rich_text),
      empreinte: plain(p.Empreinte.rich_text).trim(),
    };
    if (!r.ref && !lib.norm(r.titre)) continue; // ligne vide créée par un clic
    if (r.ref && seen.has(r.ref)) { dup.push(r.ref); continue; }
    if (r.ref) seen.add(r.ref);
    rows.push(r);
  }
  const idToRef = new Map(rows.map((r) => [r.id, r.ref]));
  for (const r of rows) {
    r.parent = idToRef.get(r.parentId) || '';
    if (!r.type && !r.ref) r.type = r.parent && /^B-/.test(r.parent) ? 'Sous-tâche' : 'Tâche';
  }
  return { rows, dup };
}

const rowProps = (t, refToId, now) => ({
  Titre: { title: rt(t.titre) }, 'Réf': { rich_text: rt(t.ref) }, Type: { select: { name: t.type } }, Statut: { select: { name: t.statut } },
  'Priorité': { select: t.prio ? { name: t.prio } : null }, Epic: { select: t.type === 'Epic' ? null : { name: t.epic } }, Jalon: { select: t.jalon ? { name: t.jalon } : null },
  Parent: { relation: t.parent && refToId.get(t.parent) ? [{ id: refToId.get(t.parent) }] : [] },
  'Dépendances': { rich_text: t.deps ? rt(t.deps) : [] }, Description: { rich_text: t.description ? rt(t.description) : [] },
  'Critère de fin': { rich_text: t.critere ? rt(t.critere) : [] }, Empreinte: { rich_text: rt(lib.fingerprint(t)) },
  'Dernière synchro': { date: { start: now } }, Source: { select: { name: 'CLI' } },
});

const clip = (s, n = 38) => { const x = lib.norm(s); return x.length > n ? x.slice(0, n - 1) + '…' : (x || '(vide)'); };
const FIELD_LABEL = { titre: 'titre', type: 'type', statut: 'statut', prio: 'prio', epic: 'epic', jalon: 'jalon', parent: 'parent', deps: 'deps', description: 'description', critere: 'fin' };
// Décrit les champs qui diffèrent : `a` est la version du dépôt, `b` celle de Notion.
const changeText = (a, b, fields) => fields.map((f) => (['description', 'critere', 'titre'].includes(f) ? `${FIELD_LABEL[f]} modifié` : `${FIELD_LABEL[f]} ${clip(a[f], 18)} -> ${clip(b[f], 18)}`)).join(', ');

// Partie dépôt vers Notion : crée les lignes absentes, met à jour celles que seul le dépôt a changées,
// pose l'empreinte sur celles déjà identiques. Les lignes changées côté Notion ne sont jamais écrasées
// (sauf celles de `force`, choisies par l'utilisateur).
async function pushPhase(cfg, profile, client, dbId, repo, data, force, go, quiet) {
  const plan = lib.classify(repo.tasks, data.rows, repo.jalonLabels);
  const byRef = new Map(data.rows.filter((r) => r.ref).map((r) => [r.ref, r]));
  const taskOf = new Map(repo.tasks.map((t) => [t.ref, t]));
  const full = [...plan.push.map((x) => x.ref), ...plan.pull.filter((x) => force.has(x.ref)).map((x) => x.ref), ...plan.conflicts.filter((x) => force.has(x.ref)).map((x) => x.ref)];
  const toCreate = plan.create.map((r) => taskOf.get(r));
  const held = plan.pull.filter((x) => !force.has(x.ref)).length + plan.conflicts.filter((x) => !force.has(x.ref)).length;
  const msg = `${go ? '' : 'essai à blanc : '}backlog : ${toCreate.length} à créer, ${full.length} à mettre à jour, ${plan.stamp.length} à marquer, ${plan.inSync.length} inchangée(s)`;
  if (!quiet) console.log(msg);
  for (const ref of quiet ? [] : full.slice(0, 15)) {
    const c = byRef.get(ref);
    console.log(`  ~ ${ref} : ${changeText(c, taskOf.get(ref), lib.diffFields(taskOf.get(ref), c))}`);
  }
  if (held && !quiet) console.log(`${held} ligne(s) modifiée(s) dans Notion, non écrasée(s) : lancer backlog-pull`);
  if (!go) return { plan, held };

  const now = new Date().toISOString();
  const refToId = new Map([...byRef].map(([r, c]) => [r, c.id]));
  // Ordre des fichiers : un parent est toujours créé avant ses enfants.
  for (const t of toCreate) {
    const page = await client.request('POST', '/pages', { parent: { database_id: dbId }, properties: rowProps(t, refToId, now) });
    refToId.set(t.ref, page.id);
  }
  for (const ref of full) await client.request('PATCH', `/pages/${byRef.get(ref).id}`, { properties: rowProps(taskOf.get(ref), refToId, now) });
  for (const ref of plan.stamp) await client.request('PATCH', `/pages/${byRef.get(ref).id}`, { properties: { Empreinte: { rich_text: rt(lib.fingerprint(taskOf.get(ref))) } } });
  if (toCreate.length || full.length || plan.stamp.length) logWrite({ profile: profile.name, action: 'backlog-sync', target: dbId, created: toCreate.length, updated: full.length, stamped: plan.stamp.length });
  return { plan, held };
}

async function cmdBacklogSync(cfg, profile, client, flags) {
  const files = (cfg.backlog || {}).files || ['docs/BACKLOG.md', 'docs/BACKLOG_ARCHIVE.md'];
  if (flags.hook && hookIsForOtherFile(await readStdin(), files)) return;
  if (blockedByWorktree(cfg, flags, 'backlog-sync')) return;
  if (!profile.canWrite) throw new Error(`backlog-sync : le profil "${profile.name}" est en lecture seule`);
  const repo = loadBacklog(cfg);
  if (repo.errors.length) return reportErrors(repo.errors);
  const dbId = await openBacklogDb(cfg, profile, client);
  const data = await loadRows(client, dbId);
  if (data.dup.length) console.error(`références en double dans Notion (ignorées) : ${data.dup.join(', ')}`);
  const go = applies(cfg, flags);
  await pushPhase(cfg, profile, client, dbId, repo, data, listArg(flags.keep), go, false);
  console.log(go ? 'backlog synchronisé.' : '(ajouter --apply pour écrire)');
}

// Valeurs du dépôt (clés de fichier) à écrire pour des champs venus de Notion.
function keysFromRow(row, fields) {
  const keys = {};
  for (const f of fields) {
    if (!lib.FIELD_KEY[f]) continue;
    keys[lib.FIELD_KEY[f]] = f === 'statut' ? BL_STATUS_CODE[row.statut] : f === 'jalon' ? jalonCode(row.jalon) : lib.norm(row[f]);
  }
  return keys;
}

// Notion vers dépôt. Changements sûrs et nouvelles tâches : appliqués. Le reste : signalé.
async function cmdBacklogPull(cfg, profile, client, flags) {
  if (blockedByWorktree(cfg, flags, 'backlog-pull')) return;
  if (!profile.canWrite) throw new Error(`backlog-pull : le profil "${profile.name}" est en lecture seule`);
  const bl = cfg.backlog || {};
  let repo = loadBacklog(cfg);
  if (repo.errors.length) return reportErrors(repo.errors);
  const dbId = await openBacklogDb(cfg, profile, client);
  const data = await loadRows(client, dbId);
  const go = applies(cfg, flags);
  const accept = listArg(flags.accept);
  const keep = listArg(flags.keep);
  const acceptAll = accept.has('all');
  const accepted = (ref) => acceptAll || accept.has(ref);
  const plan = lib.classify(repo.tasks, data.rows, repo.jalonLabels);
  const rowOf = new Map(data.rows.filter((r) => r.ref).map((r) => [r.ref, r]));
  const epics = repo.tasks.filter((t) => t.type === 'Epic').map((t) => t.ref);
  const texts = { ...repo.texts };
  const [mainFile] = repo.files;
  const parse = (f) => parseBacklogText(texts[f], { emitEpics: f === mainFile, jalons: repo.jalons }).tasks;
  const edit = (t, fields, row) => {
    const cur = parse(t.file).find((x) => x.ref === t.ref);
    texts[t.file] = lib.editTask(texts[t.file], cur, { keys: keysFromRow(row, fields), ...(fields.includes('titre') ? { titre: row.titre } : {}) });
  };
  const lines = [];
  const flagged = [];
  const forced = new Set(keep);
  let applied = 0;
  if (data.dup.length) lines.push(`! références en double dans Notion (ignorées) : ${data.dup.join(', ')}`);

  for (const p of plan.pull) {
    if (keep.has(p.ref)) continue;
    const t = repo.tasks.find((x) => x.ref === p.ref);
    const row = rowOf.get(p.ref);
    const manual = p.fields.some((f) => ['epic', 'parent', 'type'].includes(f)) || (t.type === 'Epic' && p.fields.includes('titre'));
    if (p.flag && (manual || !accepted(p.ref))) { flagged.push({ ...p, manual, t, row }); continue; }
    lines.push(`~ ${p.ref} : ${changeText(t, row, p.fields)}`);
    applied++;
    if (go) edit(t, p.fields, row);
  }

  const refsTaken = new Set([...repo.tasks.map((t) => t.ref), ...data.rows.map((r) => r.ref)]);
  const created = [];
  for (const row of plan.news) {
    const label = row.ref || row.titre;
    if (row.type === 'Epic') { flagged.push({ ref: label, flag: 'epic créé dans Notion : à créer dans BACKLOG.md', manual: true }); continue; }
    const twin = lib.findSimilar(repo.tasks, row.titre);
    if (twin) { flagged.push({ ref: label, flag: `doublon possible de ${twin.ref} (${clip(twin.titre)}) : supprimer la ligne Notion ou la renommer`, manual: true }); continue; }
    const parentIsTask = Boolean(row.parent) && /^B-/.test(row.parent);
    const epicRef = row.epic ? row.epic.split(' ')[0] : (row.parent && /^E-/.test(row.parent) ? row.parent : bl.inboxEpic || '');
    if (!epics.includes(epicRef) && !parentIsTask) { flagged.push({ ref: label, flag: `epic "${row.epic || '(aucun)'}" absent de BACKLOG.md`, manual: true }); continue; }
    const valid = /^B-\d{3,}$/.test(row.ref) && !repo.tasks.some((t) => t.ref === row.ref);
    const ref = valid ? row.ref : lib.nextRef(refsTaken);
    refsTaken.add(ref);
    const spec = {
      ref, titre: row.titre, type: parentIsTask ? 'Sous-tâche' : 'Tâche', epic: epicRef, parent: parentIsTask ? row.parent : '',
      keys: {
        statut: BL_STATUS_CODE[row.statut] || 'todo', prio: /^P[0-3]$/.test(row.prio) ? row.prio : 'P2',
        jalon: repo.jalonLabels.includes(row.jalon) ? jalonCode(row.jalon) : '', deps: lib.norm(row.deps), description: lib.norm(row.description), fin: lib.norm(row.critere),
      },
    };
    if (go) {
      const next = lib.insertTask(texts[mainFile], parse(mainFile), spec);
      if (!next) { flagged.push({ ref: label, flag: `parent ${spec.parent} introuvable dans BACKLOG.md`, manual: true }); continue; }
      texts[mainFile] = next;
    }
    lines.push(`+ ${ref} : ${clip(row.titre, 60)} (${spec.type === 'Sous-tâche' ? spec.parent : epicRef})`);
    created.push({ row, ref });
    forced.add(ref);
  }

  for (const f of flagged) {
    const how = f.manual ? '' : `; --accept ${f.ref} pour suivre Notion, --keep ${f.ref} pour garder le dépôt`;
    lines.push(`! ${f.ref} : ${f.flag}${f.t ? ` (${changeText(f.t, f.row, f.fields)})` : ''}${how ? ' ' + how : ''}`);
  }
  for (const c of plan.conflicts) lines.push(`! ${c.ref} : modifié des deux côtés (${c.fields.join(', ')}) ; --accept ${c.ref} pour suivre Notion, --keep ${c.ref} pour garder le dépôt`);

  const nFlag = flagged.length + plan.conflicts.filter((c) => !accepted(c.ref) && !keep.has(c.ref)).length;
  if (!(flags.hook && !lines.length)) console.log(`${go ? '' : 'essai à blanc : '}backlog-pull : ${applied} modification(s) sûre(s), ${created.length} nouvelle(s) tâche(s), ${nFlag} à signaler`);
  lines.forEach((l) => console.log('  ' + l));
  if (!go) { if (lines.length) console.log('(ajouter --apply pour écrire)'); return; }

  // Conflits : --accept applique la version Notion, --keep (déjà dans `forced`) garde le dépôt.
  for (const c of plan.conflicts) {
    if (!accepted(c.ref) || keep.has(c.ref)) continue;
    edit(repo.tasks.find((x) => x.ref === c.ref), c.fields, rowOf.get(c.ref));
  }
  for (const f of repo.files) if (texts[f] !== repo.texts[f]) fs.writeFileSync(path.resolve(ROOT, f), texts[f]);
  // Les nouvelles lignes reçoivent leur référence ; la poussée qui suit les complète et pose les empreintes.
  for (const c of created) c.row.ref = c.ref;
  repo = loadBacklog(cfg);
  if (repo.errors.length) return reportErrors(repo.errors);
  await pushPhase(cfg, profile, client, dbId, repo, data, forced, true, true);
}

// Archivage local : déplace les tâches `done` de BACKLOG.md vers l'archive. Aucun accès Notion.
function cmdBacklogArchive(cfg, flags) {
  const repo = loadBacklog(cfg);
  if (repo.errors.length) return reportErrors(repo.errors);
  const [mainFile, archiveFile] = repo.files;
  const main = parseBacklogText(repo.texts[mainFile], { emitEpics: true }).tasks;
  const titles = Object.fromEntries(main.filter((t) => t.type === 'Epic').map((t) => [t.ref, t.titre]));
  const r = lib.archiveDone(repo.texts[mainFile], repo.texts[archiveFile], main, titles);
  if (!r.moved.length) return console.log('archive : rien à déplacer');
  const go = applies(cfg, flags);
  console.log(`${go ? '' : 'essai à blanc : '}archive : ${r.moved.length} élément(s) déplacé(s) : ${r.moved.join(', ')}`);
  if (!go) return console.log('(ajouter --apply pour écrire)');
  fs.writeFileSync(path.resolve(ROOT, mainFile), r.backlog);
  fs.writeFileSync(path.resolve(ROOT, archiveFile), r.archive);
}

// Vue compacte du backlog ouvert, pour lire l'état sans ouvrir les fichiers.
function cmdBacklogList(cfg, flags) {
  const repo = loadBacklog(cfg);
  if (repo.errors.length) return reportErrors(repo.errors);
  const tasks = flags.all ? repo.tasks : repo.tasks.filter((t) => t.file === repo.files[0]);
  lib.listOpen(tasks, { all: Boolean(flags.all), statut: flags.statut, jalon: flags.jalon, prio: flags.prio }).forEach((l) => console.log(l));
}

// Une seule tâche : son bloc du backlog (ou de l'archive), ses sous-tâches en une ligne chacune,
// et avec --fiche le contenu de sa fiche. Évite d'ouvrir tout BACKLOG.md pour lire une tâche.
function cmdBacklogShow(cfg, ref, flags) {
  if (!/^[BE]-\d{2,3}$/.test(ref || '')) throw new Error('usage : backlog-show <B-001> [--fiche]');
  const repo = loadBacklog(cfg);
  if (repo.errors.length) return reportErrors(repo.errors);
  const t = repo.tasks.find((x) => x.ref === ref);
  if (!t) throw new Error(`${ref} introuvable dans le backlog ni dans l'archive`);
  const lines = repo.texts[t.file].split(/\r?\n/);
  const end = t.end != null ? t.end : lines.length;
  console.log(`# ${t.file}, ligne ${t.start + 1}`);
  console.log(lines.slice(t.start, end).join('\n').replace(/\n+$/, ''));
  const kids = repo.tasks.filter((x) => x.parent === ref);
  if (kids.length) console.log('\nSous-tâches :\n' + kids.map((k) => `  ${k.ref} ${lib.STATUS_KEY[k.statut]} ${k.titre}`).join('\n'));
  if (flags.fiche && t.keys.fiche) console.log(`\n# ${t.keys.fiche}\n` + fs.readFileSync(path.resolve(ROOT, t.keys.fiche), 'utf8').trimEnd());
  else if (t.keys.fiche) console.log(`\n(fiche : ${t.keys.fiche}, ajouter --fiche pour la lire)`);
}

async function cmdDiff(client, id, flags) {
  if (!flags.md) throw new Error('usage : diff <id> --md <fichier>');
  const remote = (await readNode(client, id)).body || '';
  const local = readInput(flags).trimEnd();
  const d = lineDiff(remote, local).filter((l) => !/^[-+] $/.test(l));
  console.log(d.length ? d.join('\n') : 'aucune différence.');
}

const HELP = `notion-ref : lecture et écriture bornée du référentiel Notion

Commandes (--profile generic|project, défaut generic ; --json pour une sortie JSON) :
  check                                   valide la config et la présence des tokens, sans réseau
  whoami                                  identité de l'intégration (teste le token)
  tree [--depth n]                        arbre des pages et bases sous la racine du profil
  read <id|url>                           page en markdown, ou schéma d'une base
  query <db-id> [--filter-json '{...}']   lignes d'une base, propriétés aplaties
  dump [--out dossier] [--depth n]        export markdown et JSON sous _local/ (analyse hors ligne)
  comments list <id>                      commentaires d'une page
  comments add <id> "texte" [--apply]     ajoute un commentaire
  diff <id> --md fichier                  compare une page et un fichier markdown
  write create-page (--parent-page|--parent-db <id>) --title "..." [--props-json] [--md f] [--apply]
  write update-props <id> --props-json '{"Statut":"En cours"}' [--apply]
  write append-blocks <id> --md fichier [--apply]
  write archive <id> [--apply]                 page ou base
  write schema <db-id> --schema-json '{"Retenu":{"checkbox":{}}}' [--apply]   ajoute, modifie ou retire (null) des propriétés
  write update-block <block-id> --find a --replace b [--apply]   remplace du texte en gardant la mise en forme
  write append-blocks <id> --md fichier [--after <block-id>] [--apply]
  write batch --file ops.json [--apply]        enchaîne des opérations, arrêt à la première erreur
  find "texte"                            blocs contenant le texte, sous la racine du profil
  backlog-sync [--apply] [--hook]         dépôt vers Notion (docs/BACKLOG.md et archive) ; n'écrase jamais une ligne modifiée dans Notion
  backlog-pull [--apply] [--accept B-001,all] [--keep B-001] [--hook]   Notion vers dépôt : applique les changements sûrs et les nouvelles tâches, signale le reste
  backlog-archive [--apply]               déplace les tâches done de BACKLOG.md vers l'archive (local)
  backlog-list [--all] [--statut s] [--jalon S1] [--prio P1]   vue compacte du backlog ouvert (local)
  backlog-show <B-001> [--fiche]          une seule tâche : son bloc, ses sous-tâches, sa fiche avec --fiche (local)
  write create-db --parent-page <id> --title "..." --schema-json <json|backlog> [--apply]
  (tree, read, dump, find, query) --root <id>   lit une page partagée avec l'intégration, hors de la racine du profil

Toute écriture est un essai à blanc sans --apply. Profil en lecture seule ou cible hors
de la racine du profil : refus. Config : tools/notion-ref.config.json.`;

async function main() {
  const { cmd, pos, flags } = parseArgs(process.argv.slice(2));
  if (!cmd || cmd === 'help' || flags.help) return console.log(HELP);

  const cfg = loadConfig();
  const profile = resolveProfile(cfg, flags.profile || 'generic');

  if (cmd === 'check') {
    for (const name of Object.keys(cfg.profiles)) {
      const p = resolveProfile(cfg, name);
      console.log(`${name} : rootId ${p.rootId || 'VIDE'}, token ${process.env[p.tokenEnv] ? 'présent' : 'absent'} (${p.tokenEnv}), écriture ${p.canWrite ? 'oui' : 'non'}, commentaires ${p.canComment ? 'oui' : 'non'}`);
    }
    return;
  }

  if (cmd === 'backlog-archive') return cmdBacklogArchive(cfg, flags);
  if (cmd === 'backlog-list') return cmdBacklogList(cfg, flags);
  if (cmd === 'backlog-show') return cmdBacklogShow(cfg, pos[0], flags);

  if (typeof fetch !== 'function' || typeof AbortSignal.timeout !== 'function') {
    throw new Error('Node trop ancien (il faut Node 18 ou plus)');
  }
  const client = clientFor(cfg, profile);
  const READS = ['tree', 'read', 'dump', 'find', 'query'];
  if (flags.root && READS.includes(cmd)) profile.rootId = parseId(flags.root); // lecture d'une page partagée hors racine ; jamais pour écrire

  switch (cmd) {
    case 'whoami': {
      const me = await client.request('GET', '/users/me');
      return out(flags, me, `${me.name || '(sans nom)'} (${me.type}) ${me.bot && me.bot.workspace_name ? 'espace : ' + me.bot.workspace_name : ''}`);
    }
    case 'tree': return cmdTree(cfg, profile, client, flags);
    case 'read': {
      const id = parseId(pos[0]) || profile.rootId;
      if (!id) throw new Error('usage : read <id|url>');
      const r = await readNode(client, id);
      return out(flags, { kind: r.kind, id: r.id, title: r.title, props: r.props, markdown: r.body }, r.text);
    }
    case 'query': {
      const id = parseId(pos[0]);
      if (!id) throw new Error('usage : query <db-id>');
      return cmdQuery(client, id, flags);
    }
    case 'dump': return cmdDump(cfg, profile, client, flags);
    case 'comments': return cmdComments(cfg, profile, client, pos, flags);
    case 'diff': {
      const id = parseId(pos[0]);
      if (!id) throw new Error('usage : diff <id> --md fichier');
      return cmdDiff(client, id, flags);
    }
    case 'backlog-sync': return cmdBacklogSync(cfg, profile, client, flags);
    case 'backlog-pull': return cmdBacklogPull(cfg, profile, client, flags);
    case 'find': return cmdFind(profile, client, pos.join(' '), flags);
    case 'write': return cmdWrite(cfg, profile, client, pos[0], pos.slice(1), flags);
    default: throw new Error(`commande inconnue "${cmd}" (voir --help)`);
  }
}

module.exports = {
  parseId, loadConfig, resolveProfile, renderBlocks, markdownToBlocks, lineDiff,
  buildProps, flattenProps, planBlockEdit, replaceInRich, parseBacklogText, hookIsForOtherFile, inLinkedWorktree, assertWritable, inSubtree, richToMd, mdToRich,
};

if (require.main === module) {
  main().catch((e) => {
    // Lancée au démarrage de session, la lecture ne doit jamais bloquer : un message, code 0.
    if (process.argv.includes('--hook') && process.argv.includes('backlog-pull')) { console.log(`backlog-pull ignoré : ${e.message}`); process.exit(0); }
    console.error(`notion-ref : ${e.message}`);
    process.exit(1);
  });
}
