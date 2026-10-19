import sys; sys.path.insert(0,'tools')
from theme import T,FONTS,defs,mate,doc
from icons import g,PAL
for theme,out,pre in (('light','library-screen.svg',''),('dark','library-screen-dark.svg','')):
    c=T[theme]; P=PAL[theme]; O=[]; a=O.append
    def t(x,y,s,size=14,w=400,fill=None,cls='ui',anchor='start',extra=''):
        a(f'<text x="{x}" y="{y}" class="{cls}" font-size="{size}" font-weight="{w}" fill="{fill or c["ink"]}" text-anchor="{anchor}" {extra}>{s}</text>')
    def card(x,y,w,h): a(f'<g filter="url(#lift)"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="{c["surface"]}" stroke="{c["line"]}" stroke-width="1.5"/></g>')
    a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 844" width="390" height="844"><title>Library on a phone, Deskmates v2 ({theme})</title><style>{FONTS}</style>')
    a(defs(c,'<clipPath id="nc"><circle cx="338" cy="704" r="27"/></clipPath>'))
    a(f'<rect width="390" height="844" fill="{c["canvas"]}"/>')
    t(28,32,'9:41',15,700)
    a(f'<g fill="{c["ink"]}"><rect x="306" y="22" width="3" height="8" rx="1"/><rect x="311" y="19" width="3" height="11" rx="1"/><rect x="316" y="16" width="3" height="14" rx="1"/><rect x="330" y="17" width="26" height="13" rx="4" fill="none" stroke="{c["ink"]}" stroke-width="1.5"/><rect x="332.5" y="19.5" width="18" height="8" rx="2"/></g>')
    # app bar with the real lockup
    a(f'<image href="{c["lockup"]}" x="16" y="56" width="148.5" height="21"/>')
    a(f'<circle cx="352" cy="66" r="18" fill="{c["y2soft"]}"/>'); t(352,71,'S',14,800,c['y2'],anchor='middle')
    # section header
    a(f'<rect x="16" y="96" width="358" height="86" rx="22" fill="{c["libSoft"]}"/>')
    a(mate(c,'library',282,86,98))
    t(34,132,'Library',28,750,c['ink'],'disp',extra='letter-spacing="-0.6"')
    t(34,156,'1,240 papers, reports and notes',14,500,c['ink2'])
    t(34,174,'12 new this week',13,700,c['libText'])
    # search
    a(f'<rect x="16" y="194" width="358" height="46" rx="14" fill="{c["surface"]}" stroke="{c["line2"]}" stroke-width="1.5"/>')
    a(g('search',30,205,24,theme)); t(62,222,'Search a code, year or topic',15,400,c['ink3'])
    # filters
    y=250
    a(f'<rect x="16" y="{y}" width="118" height="44" rx="22" fill="{c["pillBg"]}"/>')
    a(f'<path d="M34 {y+16}h16M34 {y+22}h12M34 {y+28}h8" stroke="{c["pillText"]}" stroke-width="2" stroke-linecap="round"/>')
    t(56,y+27,'Filters',14,700,c['pillText'])
    a(f'<circle cx="114" cy="{y+22}" r="10" fill="{c["badge"]}"/>'); t(114,y+26.5,'2',12,800,c['badgeText'],anchor='middle')
    for x0,w0,lab in ((142,100,'ST2133'),(250,124,'May 2019')):
        a(f'<rect x="{x0}" y="{y}" width="{w0}" height="44" rx="22" fill="{c["surface"]}" stroke="{c["line2"]}" stroke-width="1.5"/>')
        t(x0+16,y+27,lab,14,600)
        xx=x0+w0-27; a(f'<path d="M{xx} {y+17}l10 10M{xx+10} {y+17}l-10 10" stroke="{c["ink2"]}" stroke-width="2" stroke-linecap="round"/>')
    t(16,318,'ST2133 Advanced Statistics: Distribution Theory',13,600,c['ink2']); t(374,318,'4 items',13,400,c['ink2'],anchor='end')
    # card 1
    card(16,328,358,110); a(doc(c,30,342,'paper'))
    t(84,356,'ST2133 · May 2019 · Zone A',16,700); t(84,376,'Past paper · 6 pages · solutions inside',13,400,c['ink2'])
    a(f'<rect x="84" y="390" width="104" height="36" rx="12" fill="{c["accentEdge"]}"/><rect x="84" y="390" width="104" height="33" rx="12" fill="{c["accent"]}"/>')
    oa=c['onAccent']
    a(f'<circle cx="103" cy="406" r="7" fill="none" stroke="{oa}" stroke-width="2"/><path d="M103 402v4l3 2M101 396h4" stroke="{oa}" stroke-width="2" stroke-linecap="round"/>')
    t(117,411,'Time me',14,700,oa)
    a(f'<rect x="196" y="390" width="72" height="36" rx="12" fill="{c["surface"]}" stroke="{c["line2"]}" stroke-width="1.5"/>'); t(232,413,'Open',14,600,anchor='middle')
    a(f'<rect x="330" y="342" width="30" height="30" rx="10" fill="{c["inset"]}"/><path d="M340 350h10v15l-5-4-5 4z" fill="none" stroke="{c["ink2"]}" stroke-width="2" stroke-linejoin="round"/>')
    # card 2
    card(16,446,358,76); a(doc(c,30,459,'report'))
    t(84,477,"ST2133 · May 2019 · Examiners' report",16,700); t(84,498,'Report · 14 pages · what markers wanted',13,400,c['ink2'])
    # card 3
    card(16,530,358,76); a(doc(c,30,543,'paper'))
    t(84,561,'ST2133 · May 2019 · Zone B',16,700); t(84,582,f'Past paper · 6 pages · <tspan fill="{c["success"]}" font-weight="700">you finished it, 71%</tspan>',13,400,c['ink2'])
    # card 4
    card(16,614,358,96); a(doc(c,30,628,'note'))
    t(84,646,'MGFs, worked from scratch',16,700); t(84,667,'Shared by Fatima · Year 3',13,400,c['ink2'])
    a(f'<rect x="84" y="678" width="56" height="22" rx="11" fill="{c["y3soft"]}"/>'); t(112,693,'Year 3',12,700,c['y3'],anchor='middle')
    t(150,693,"Students' note · 18 useful",12,400,c['ink2'])
    # Noora launcher
    a(f'<g filter="url(#float)"><circle cx="338" cy="704" r="31" fill="{c["surface"]}" stroke="{c["accentText"]}" stroke-width="3"/></g>')
    a(f'<circle cx="338" cy="704" r="27" fill="{c["noora"]}"/><image href="../bust-neutral.png" x="306" y="674" width="64" height="64" clip-path="url(#nc)"/>')
    a(f'<circle cx="361" cy="681" r="6" fill="{c["success"]}" stroke="{c["surface"]}" stroke-width="2.5"/>')
    # tab bar
    a(f'<rect x="0" y="738" width="390" height="106" fill="{c["surface"]}"/><path d="M0 738.75h390" stroke="{c["line"]}" stroke-width="1.5"/>')
    tabs=[('home','Home',39),('modules','Modules',117),('library','Library',195),('forum','Forum',273),('more','More',351)]
    for key,lab,cx in tabs:
        act= key=='library'
        if act:
            a(f'<rect x="{cx-30}" y="746" width="60" height="34" rx="17" fill="{P["pill"]["library"]}"/>')
            a(g(key,cx-12,751,24,theme,True,P['pill']['library'])); t(cx,798,lab,12,800,c['libText'],anchor='middle')
        else:
            a(g(key,cx-12,751,24,theme)); t(cx,798,lab,12,600,c['ink2'],anchor='middle')
    a(f'<rect x="128" y="826" width="134" height="5" rx="2.5" fill="{c["ink"]}"/>')
    a('</svg>')
    open(out,'w').write('\n'.join(O))
