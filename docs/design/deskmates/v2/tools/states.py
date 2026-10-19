import re
B='sections/'
for n in ['home','library','modules','notebook','forum','calendar','search']:
    s=open(B+n+'.svg').read()
    eyes=re.findall(r'<ellipse cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)" fill="#14234D"/>',s)
    for state in ('happy','sleepy'):
        t=s
        t=re.sub(r'<circle cx="[\d.]+" cy="[\d.]+" r="2(\.\d)?" fill="#fff"/>','',t)
        for cx,cy,rx,ry in eyes:
            cx,cy,rx=float(cx),float(cy),float(rx)
            old=f'<ellipse cx="{cx:g}" cy="{cy:g}" rx="{rx:g}"'
            if state=='happy':
                new=f'<path d="M{cx-rx-1:g} {cy+2:g}q{rx+1:g} -{rx*2:g} {2*rx+2:g} 0" fill="none" stroke="#14234D" stroke-width="4.5" stroke-linecap="round"/>'
            else:
                new=f'<path d="M{cx-rx-1:g} {cy:g}q{rx+1:g} {rx:g} {2*rx+2:g} 0" fill="none" stroke="#14234D" stroke-width="4.5" stroke-linecap="round"/>'
            t=re.sub(re.escape(old)+r' ry="[\d.]+" fill="#14234D"/>',new,t)
        # mouths: q-curve smiles become open smiles (happy) or a small o (sleepy)
        def mouth(m):
            x,y,dx=float(m.group(1)),float(m.group(2)),float(m.group(3))
            if state=='happy':
                return f'<path d="M{x-2:g} {y-1:g}q{dx/2+2:g} {dx+2:g} {dx+4:g} 0z" fill="#B23A3A" stroke="#14234D" stroke-width="3.5" stroke-linejoin="round"/>'
            return f'<ellipse cx="{x+dx/2:g}" cy="{y+3:g}" rx="3" ry="2.5" fill="#14234D"/>'
        t=re.sub(r'<path d="M([\d.]+) ([\d.]+)q[\d.]+ [\d.]+ ([\d.]+) 0" fill="none" stroke="#14234D" stroke-width="4" stroke-linecap="round"/>',mouth,t)
        extra=''
        if state=='happy':
            extra='<g fill="#FFC233" stroke="#14234D" stroke-width="2.5" stroke-linejoin="round"><path d="M22 40l4 9 9 4-9 4-4 9-4-9-9-4 9-4z"/><path d="M178 26l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/></g>'
        else:
            extra='<g fill="none" stroke="#5F6F92" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M160 22h14l-14 16h14"/><path d="M180 50h9l-9 10h9"/></g>'
        t=t.replace('</svg>',extra+'</svg>').replace('(idle)',f'({state})')
        open(f'{B}states/{n}-{state}.svg','w').write(t)
