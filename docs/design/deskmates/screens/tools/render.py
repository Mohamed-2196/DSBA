# Render screens/*.svg to renders/*.png with headless Chrome. Usage: python3 tools/render.py [name.svg ...]
import os, re, subprocess, sys, glob
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
TMP = os.environ.get('RENDER_TMP', '/private/tmp/claude-501/-Users-mohamed-dsba-hub/5411a11a-0ba5-46f6-8270-b4d416f58375/scratchpad/screens-wrap')
os.makedirs(TMP, exist_ok=True); os.makedirs(os.path.join(ROOT, 'renders'), exist_ok=True)
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
GF = ('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Figtree:ital,wght@0,400..800;1,400..700'
      '&family=JetBrains+Mono:wght@500;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=block')
names = sys.argv[1:] or sorted(os.path.basename(p) for p in glob.glob(os.path.join(ROOT, '*.svg')))
for n in names:
    svg = open(os.path.join(ROOT, n)).read()
    w, h = re.search(r'width="(\d+)" height="(\d+)"', svg).groups()
    html = os.path.join(TMP, n.replace('.svg', '.html'))
    open(html, 'w').write(f'<!doctype html><html><head><meta charset=utf-8><base href="file://{ROOT}/"><link rel=stylesheet href="{GF}">'
                          f'<style>html,body{{margin:0}}svg{{display:block}}</style></head><body>{svg}</body></html>')
    out = os.path.join(ROOT, 'renders', n.replace('.svg', '.png'))
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--window-size={w},{h}', '--virtual-time-budget=5000',
                    f'--screenshot={out}', 'file://' + html], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('rendered', out)
