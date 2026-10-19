# Measure pending strings with the real fonts in headless Chrome; writes tools/widths.json.
import json, os, subprocess, html, re
HERE = os.path.dirname(os.path.abspath(__file__))
pf = os.path.join(HERE, 'pending.json'); cf = os.path.join(HERE, 'widths.json')
keys = json.load(open(pf)) if os.path.exists(pf) else []
cache = json.load(open(cf)) if os.path.exists(cf) else {}
keys = [k for k in keys if k not in cache]
if keys:
    FAM = {'ui': "Figtree, 'IBM Plex Sans Arabic'", 'disp': "'Bricolage Grotesque', 'IBM Plex Sans Arabic', Figtree", 'mono': "'JetBrains Mono'", 'ar': "'IBM Plex Sans Arabic'"}
    GF = ('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Figtree:ital,wght@0,400..800;1,400..700'
          '&family=JetBrains+Mono:wght@500;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=block')
    spans = []
    for i, k in enumerate(keys):
        font, w, size, text = k.split('|', 3)
        ls = f'letter-spacing:{round(-0.022*float(size),2)}px;' if font == 'disp' else ''
        spans.append(f'<span id="s{i}" style="font-family:{FAM[font]};font-weight:{w};font-size:{size}px;{ls}white-space:pre;position:absolute">{html.escape(text)}</span>')
    page = (f'<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="{GF}"></head><body>' + ''.join(spans) +
            '<pre id="out"></pre><script>document.fonts.ready.then(()=>{const o={};document.querySelectorAll("span").forEach(s=>o[s.id]=s.getBoundingClientRect().width);'
            'document.getElementById("out").textContent="@@"+JSON.stringify(o)+"@@";});</script></body></html>')
    tmp = '/private/tmp/claude-501/-Users-mohamed-dsba-hub/5411a11a-0ba5-46f6-8270-b4d416f58375/scratchpad/measure.html'
    open(tmp, 'w').write(page)
    out = subprocess.run(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '--headless=new', '--disable-gpu', '--virtual-time-budget=8000', '--dump-dom', 'file://' + tmp],
                         capture_output=True, text=True).stdout
    m = re.search(r'@@(.*?)@@', out)
    res = json.loads(html.unescape(m.group(1)))
    for i, k in enumerate(keys): cache[k] = round(res[f's{i}'], 1)
    json.dump(cache, open(cf, 'w'), ensure_ascii=False, indent=0)
os.path.exists(pf) and os.remove(pf)
print('measured', len(keys), 'cache', len(cache))
