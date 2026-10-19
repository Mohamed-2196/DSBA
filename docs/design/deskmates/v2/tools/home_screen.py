import sys; sys.path.insert(0,'tools')
from theme import T,FONTS,defs,mate,doc
from icons import g,PAL,SECTION
theme='light'; c=T[theme]; P=PAL[theme]; O=[]; a=O.append
INK,INK2,INK3,LINE,SURF,CAN,INSET,ACC=c['ink'],c['ink2'],c['ink3'],c['line'],c['surface'],c['canvas'],c['inset'],c['accent']
def t(x,y,s,size=14,w=400,fill=INK,cls='ui',anchor='start',extra=''):
    a(f'<text x="{x}" y="{y}" class="{cls}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{anchor}" {extra}>{s}</text>')
def card(x,y,w,h): a(f'<g filter="url(#lift)"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="20" fill="{SURF}" stroke="{LINE}" stroke-width="1.5"/></g>')
a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900" width="1440" height="900"><title>Home on a laptop, Deskmates v2</title><style>{FONTS}</style>')
a(defs(c,'<clipPath id="nc"><circle cx="1364" cy="836" r="31"/></clipPath>'))
a(f'<rect width="1440" height="900" fill="{CAN}"/>')
# sidebar
a(f'<rect width="248" height="900" fill="{SURF}"/><path d="M248.75 0v900" stroke="{LINE}" stroke-width="1.5"/>')
a(f'<image href="{c["lockup"]}" x="24" y="30" width="190.9" height="27"/>')
nav=[('home','Home'),('modules','Modules'),('library','Library'),('notebook','Notebook'),('forum','Forum'),('calendar','Calendar'),None,('boards','Boards'),('grades','Grades'),('career','Career Navigator'),('newsletter','Newsletter'),('daily','Daily puzzles')]
y=88
for item in nav:
    if item is None:
        a(f'<path d="M24 {y+6}h200" stroke="{LINE}" stroke-width="1.5"/>'); t(28,y+30,'TOOLS',11,800,INK3,extra='letter-spacing="1"'); y+=42; continue
    key,lab=item; act= key=='home'; sec=SECTION[key]
    if act:
        a(f'<rect x="12" y="{y}" width="224" height="44" rx="14" fill="{P["pill"][sec]}"/>')
        a(g(key,26,y+11,22,theme,True,P['pill'][sec])); t(60,y+27,lab,15,700,P['label'][sec])
    else:
        a(g(key,26,y+11,22,theme)); t(60,y+27,lab,15,500,INK2)
    y+=48
a(f'<rect x="16" y="824" width="216" height="52" rx="16" fill="{INSET}"/>')
a(f'<circle cx="44" cy="850" r="16" fill="{c["y2soft"]}"/>'); t(44,855,'S',14,800,c['y2'],anchor='middle')
t(70,846,'Sara',14,700); t(70,864,'Year 2',12,700,c['y2'])
# top bar
a(f'<rect x="280" y="24" width="520" height="44" rx="14" fill="{SURF}" stroke="{c["line2"]}" stroke-width="1.5"/>')
a(g('search',292,34,24,theme)); t(326,51,'Search papers, lessons, threads',15,400,INK3)
a(f'<rect x="748" y="34" width="40" height="24" rx="7" fill="{INSET}"/>'); t(768,51,'⌘K',12,700,INK2,anchor='middle')
a(f'<rect x="1312" y="24" width="44" height="44" rx="14" fill="{SURF}" stroke="{c["line2"]}" stroke-width="1.5"/><path d="M1326 52h16M1328 52v-8a6 6 0 0 1 12 0v8M1331 56h6" fill="none" stroke="{INK2}" stroke-width="2" stroke-linecap="round"/><circle cx="1347" cy="33" r="5" fill="#F0524B"/>')
a(f'<rect x="1364" y="24" width="44" height="44" rx="14" fill="{SURF}" stroke="{c["line2"]}" stroke-width="1.5"/><path d="M1392 50a10 10 0 1 1-8-14 8 8 0 0 0 8 14z" fill="none" stroke="{INK2}" stroke-width="2" stroke-linejoin="round"/>')
# greeting band with Lumen and the desk shelf
a(f'<rect x="280" y="92" width="1128" height="124" rx="24" fill="{c["accentSoft"]}"/>')
a(mate(c,'home',286,96,116))
t(404,146,'Good evening, Sara',34,750,INK,'disp',extra='letter-spacing="-0.8"')
t(404,176,'Exam in 4 days. Your Zone A timer is still running.',15,500,INK2)
t(404,198,'Wednesday 19 October · Week 6',13,700,c['accentText'])
mates=[('library','Library','12 new'),('modules','Modules','4 this term'),('notebook','Notebook','2 drafts'),('forum','Forum','3 replies'),('calendar','Calendar','Exam Thu')]
x=820
for key,label,badge in mates:
    a(f'<rect x="{x}" y="104" width="108" height="100" rx="18" fill="{SURF}" stroke="{LINE}" stroke-width="1.5"/>')
    a(mate(c,key,x+26,106,56)); t(x+54,180,label,13,700,INK,anchor='middle'); t(x+54,196,badge,12,600,P['label'][SECTION[key]],anchor='middle')
    x+=118
# Up next
card(280,240,368,214)
t(304,274,'UP NEXT',12,800,c['exam'],extra='letter-spacing="1.2"')
a(mate(c,'calendar',556,248,80))
a(f'<rect x="304" y="292" width="56" height="64" rx="12" fill="{SURF}" stroke="#14234D" stroke-width="2"/><path d="M305 304a11 11 0 0 1 11-11h32a11 11 0 0 1 11 11v8h-54z" fill="{c["exam"]}"/>')
t(332,308,'OCT',11,800,c['onExam'],anchor='middle'); t(332,344,'23',24,800,INK,'disp',anchor='middle')
t(376,316,'ST2134 Statistical',17,700); t(376,338,'Inference',17,700)
t(304,384,'Thu 23 Oct, 9:00 · Exam',15,700,c['exam']); t(304,404,'Hall B · bring a calculator',14,400,INK2)
a(f'<rect x="304" y="414" width="164" height="30" rx="10" fill="{INSET}"/>'); t(386,434,'Revise the 2022 paper',13,700,INK,anchor='middle')
# Carry on
card(672,240,368,214)
t(696,274,'CARRY ON',12,800,c['accentText'],extra='letter-spacing="1.2"')
a(doc(c,696,292,'paper',44,55))
t(754,312,'ST2133 · May 2019 · Zone A',16,700); t(754,334,'Timed attempt · question 4 of 6',14,400,INK2)
t(696,394,'42:10',40,700,INK,'mono',extra='letter-spacing="-1"'); t(824,392,'left of 3:00:00',14,600,INK2)
a(f'<rect x="696" y="408" width="200" height="8" rx="4" fill="{INSET}"/><rect x="696" y="408" width="153" height="8" rx="4" fill="{ACC}"/>')
a(f'<rect x="914" y="396" width="102" height="40" rx="13" fill="{c["accentEdge"]}"/><rect x="914" y="396" width="102" height="37" rx="13" fill="{ACC}"/>'); t(965,420,'Resume',15,700,c['onAccent'],anchor='middle')
# My modules: each module has its own binder cover
t(280,494,'My modules',22,750,INK,'disp',extra='letter-spacing="-0.4"'); t(1040,494,'All 16 modules',14,700,c['accentText'],anchor='end')
mods=[('ST2134','Statistical Inference','Lesson 7 of 12','#4C6EF5',0.58),('ST2133','Distribution Theory','Lesson 9 of 11','#2DB87D',0.8),('EC2066','Microeconomics','Lesson 3 of 10','#FFA94D',0.3),('IS2184','Information Systems','Lesson 5 of 9','#7B61FF',0.55)]
x=280
for code,name,prog,col,p in mods:
    card(x,512,178,170)
    a(f'<g transform="translate({x+18} 528)"><rect width="38" height="46" rx="7" fill="{col}" stroke="#14234D" stroke-width="2"/><path d="M9 1v44" stroke="#14234D" stroke-width="2"/><rect x="15" y="8" width="18" height="9" rx="3" fill="#FFFFFF" stroke="#14234D" stroke-width="1.5"/></g>')
    t(x+18,598,name,15,700); t(x+18,618,code,13,600,INK2,'mono'); t(x+18,646,prog,13,500,INK2)
    a(f'<rect x="{x+18}" y="658" width="142" height="6" rx="3" fill="{INSET}"/><rect x="{x+18}" y="658" width="{142*p:.0f}" height="6" rx="3" fill="{col}"/>')
    x+=194
# New files
card(280,706,760,170)
t(304,740,'New files',18,750,INK,'disp'); t(1016,740,'Open the library',14,700,c['accentText'],anchor='end')
files=[('ST2134 · Oct 2025 · Zone A',None,'Past paper · added today','paper'),('ST2134 · Oct 2025 ·',"Examiners' report",'Report · added today','report'),('Hypothesis tests on one page',None,'Shared by Ali · Year 2','note')]
x=304
for l1,l2,meta,kind in files:
    a(doc(c,x,764,kind,34,42.5)); t(x+48,780,l1,14,700)
    if l2: t(x+48,798,l2,14,700)
    t(x+48,822 if l2 else 800,meta,13,400,INK2); x+=240
# To-do
card(1064,240,344,388)
t(1088,274,'TO-DO',12,800,c['accentText'],extra='letter-spacing="1.2"'); t(1384,274,'3 of 6 done',13,600,INK2,anchor='end')
todos=[('Finish ST2133 Zone A, timed',False,'Today',c['calText']),("Read ST2134 examiners' report",False,'Tomorrow',INK2),('Reply to Ali on MGF question',False,'Fri',INK2),('Upload week 5 notes',True,'',INK2),('Book a revision room',True,'',INK2),('Week 5 quiz',True,'',INK2)]
y=296
for txt,done,due,dc in todos:
    if done:
        a(f'<rect x="1088" y="{y}" width="24" height="24" rx="8" fill="{c["success"]}"/><path d="M1094 {y+12}l4 4 8-8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>')
        t(1124,y+17,txt,14,500,INK3,extra='text-decoration="line-through"')
    else:
        a(f'<rect x="1088" y="{y}" width="24" height="24" rx="8" fill="{SURF}" stroke="{c["line2"]}" stroke-width="2"/>'); t(1124,y+17,txt,14,600)
        if due: t(1384,y+17,due,12,700,dc,anchor='end')
    a(f'<path d="M1088 {y+36}h296" stroke="{LINE}" stroke-width="1"/>'); y+=46
a(f'<rect x="1088" y="{y+2}" width="296" height="36" rx="12" fill="{INSET}"/>'); t(1112,y+26,'+  Add a to-do',14,700,INK2)
# replies
card(1064,652,344,224)
a(mate(c,'forum',1318,652,84))
t(1088,686,'REPLIES TO YOU',12,800,c['forumText'],extra='letter-spacing="1.2"')
t(1088,716,'Ali answered your question',15,700); t(1088,736,'“Why does the MGF identify the',14,400,INK2); t(1088,754,'distribution?” · ST2133 · 2h',14,400,INK2)
t(1088,794,'Fatima and 2 more liked it',13,500,INK2)
a(f'<rect x="1088" y="812" width="128" height="40" rx="13" fill="{SURF}" stroke="{c["line2"]}" stroke-width="1.5"/>'); t(1152,837,'Read thread',14,700,anchor='middle')
# Noora launcher
a(f'<g filter="url(#float)"><circle cx="1364" cy="836" r="35" fill="{SURF}" stroke="{c["accentText"]}" stroke-width="3"/></g>')
a(f'<circle cx="1364" cy="836" r="31" fill="{c["noora"]}"/><image href="../bust-neutral.png" x="1327" y="802" width="74" height="74" clip-path="url(#nc)"/>')
a(f'<circle cx="1390" cy="810" r="6.5" fill="{c["success"]}" stroke="{SURF}" stroke-width="2.5"/>')
a('</svg>')
open('home-screen.svg','w').write('\n'.join(O))
