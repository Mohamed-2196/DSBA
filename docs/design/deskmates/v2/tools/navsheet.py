import sys; sys.path.insert(0,'tools')
from icons import g, PAL, SECTION, ICONS
names=['home','modules','library','notebook','forum','calendar','boards','grades','career','newsletter','daily','search','more']
labels={'home':'Home','modules':'Modules','library':'Library','notebook':'Notebook','forum':'Forum','calendar':'Calendar','boards':'Boards','grades':'Grades','career':'Career Navigator','newsletter':'Newsletter','daily':'Daily puzzles','search':'Search','more':'More'}
O=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1520 760" width="1520" height="760"><title>Deskmates v2 nav icons</title>',
"<style>@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400..800&amp;display=block');text{font-family:Figtree,sans-serif}</style>"]
for col,theme in ((0,'light'),(1,'dark')):
    P=PAL[theme]; X=col*760
    bg='#FFFFFF' if theme=='light' else '#111E3E'; ink='#0A1F44' if theme=='light' else '#EAF0FF'; ink2='#3E4E6E' if theme=='light' else '#A9B8D9'
    O.append(f'<rect x="{X}" y="0" width="760" height="760" fill="{bg}"/>')
    O.append(f'<text x="{X+24}" y="34" font-size="16" font-weight="800" fill="{ink}">{theme.title()}</text>')
    for i,h in enumerate(['24 px','active','20 px','active','Sidebar item: default, then active']):
        O.append(f'<text x="{X+[170,226,300,350,410][i]}" y="34" font-size="11" font-weight="700" fill="{ink2}">{h}</text>')
    for r,n in enumerate(names):
        y=52+r*54; sec=SECTION[n]
        O.append(f'<text x="{X+24}" y="{y+22}" font-size="13" font-weight="600" fill="{ink2}">{labels[n]}</text>')
        O.append(g(n,X+170,y+6,24,theme))
        O.append(f'<rect x="{X+218}" y="{y+2}" width="48" height="32" rx="16" fill="{P["pill"][sec]}"/>'); O.append(g(n,X+230,y+6,24,theme,True,P['pill'][sec]))
        O.append(g(n,X+302,y+8,20,theme))
        O.append(f'<rect x="{X+342}" y="{y+4}" width="44" height="28" rx="14" fill="{P["pill"][sec]}"/>'); O.append(g(n,X+354,y+8,20,theme,True,P['pill'][sec]))
        # sidebar items
        O.append(g(n,X+412,y+8,20,theme)); O.append(f'<text x="{X+440}" y="{y+23}" font-size="14" font-weight="500" fill="{ink2}">{labels[n]}</text>')
        if n!='more':
            O.append(f'<rect x="{X+572}" y="{y}" width="172" height="36" rx="12" fill="{P["pill"][sec]}"/>')
            O.append(g(n,X+584,y+8,20,theme,True,P['pill'][sec])); O.append(f'<text x="{X+612}" y="{y+23}" font-size="13" font-weight="700" fill="{P["label"][sec]}">{labels[n]}</text>')
O.append('</svg>')
open('nav-icons.svg','w').write('\n'.join(O))
