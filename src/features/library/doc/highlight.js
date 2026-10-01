// A tiny syntax highlighter for the mock notebooks, R scripts and cheat sheets.
// tokenize(src, lang) → [{ t: 'plain'|'com'|'str'|'num'|'kw'|'fn'|'op', v }]

const KEYWORDS = {
  python: new Set('import from as def return for in if elif else while class with lambda None True False and or not pass break continue try except print'.split(' ')),
  r: new Set('function if else for while in return repeat next break TRUE FALSE NULL NA library'.split(' ')),
  sql: new Set('SELECT FROM WHERE GROUP BY ORDER AS COUNT AVG SUM MIN MAX AND OR JOIN ON LEFT INNER HAVING DESC ASC LIMIT IS NOT NULL IN DISTINCT'.split(' ')),
  shell: new Set(['git']),
};

const COMMENT = { sql: /--[^\n]*/.source, default: /#[^\n]*/.source };
const STRING = /"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/.source;
const NUMBER = /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/.source;
const OPERATOR = /\|>|<-|%>%|==|!=|<=|>=|\*\*/.source;
const IDENT = /[A-Za-z_][\w.]*/.source;

const CACHE = new Map();
function regexFor(lang) {
  if (!CACHE.has(lang)) {
    const com = lang === 'sql' ? COMMENT.sql : COMMENT.default;
    CACHE.set(lang, new RegExp(`(${com})|(${STRING})|(${NUMBER})|(${OPERATOR})|(${IDENT})`, 'g'));
  }
  return CACHE.get(lang);
}

export function tokenize(src = '', lang = 'python') {
  const kw = KEYWORDS[lang] || KEYWORDS.python;
  const re = regexFor(lang);
  const out = [];
  let last = 0;
  re.lastIndex = 0;
  for (const m of String(src).matchAll(re)) {
    if (m.index > last) out.push({ t: 'plain', v: src.slice(last, m.index) });
    const [all, com, str, num, op, id] = m;
    if (com) out.push({ t: 'com', v: all });
    else if (str) out.push({ t: 'str', v: all });
    else if (num) out.push({ t: 'num', v: all });
    else if (op) out.push({ t: 'op', v: all });
    else if (id) {
      const next = src.slice(m.index + all.length).match(/^\s*\(/);
      if (kw.has(id)) out.push({ t: 'kw', v: all });
      else if (next) out.push({ t: 'fn', v: all });
      else out.push({ t: 'plain', v: all });
    }
    last = m.index + all.length;
  }
  if (last < src.length) out.push({ t: 'plain', v: src.slice(last) });
  return out;
}
