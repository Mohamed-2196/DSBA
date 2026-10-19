T={
'light':dict(canvas='#F2F5FB',surface='#FFFFFF',inset='#ECF1F9',line='#DCE4F1',line2='#C5D2E6',ink='#0A1F44',ink2='#3E4E6E',ink3='#5A6A8C',
  accent='#2445C2',accentEdge='#1F3A93',onAccent='#FFFFFF',accentSoft='#E3E9FF',accentText='#1F3A93',success='#18794A',exam='#C21D5C',onExam='#FFFFFF',
  y1='#0A727C',y2='#1A5FCC',y3='#9A5209',y3soft='#FFE8D1',y2soft='#DCE8FF',libSoft='#FFF1C7',libText='#865C00',forumText='#B0246B',calText='#C2332B',toolsText='#1F3A93',
  noora='#E6E0FA',outline='#14234D',paper='#FFFFFF',docline='#C9D5EA',pillBg='#0A1F44',pillText='#F2F5FB',badge='#FFC233',badgeText='#0A1F44',
  lockup='hub-lockup-horizontal.png',shadow=.07,halo=False),
'dark':dict(canvas='#0B1530',surface='#111E3E',inset='#1A2B54',line='#22355F',line2='#2F4677',ink='#EAF0FF',ink2='#A9B8D9',ink3='#8798BE',
  accent='#8DA6FF',accentEdge='#5F7BE0',onAccent='#0B1530',accentSoft='#1E2C66',accentText='#8DA6FF',success='#5BD49A',exam='#FF7EB0',onExam='#0B1530',
  y1='#3BC9DB',y2='#6FA2FF',y3='#FFA94D',y3soft='#3A2A1C',y2soft='#1B2D55',libSoft='#3A3218',libText='#FFC94D',forumText='#FF8CC6',calText='#FF8A80',toolsText='#8DA6FF',
  noora='#2A2F5E',outline='#14234D',paper='#F4F7FD',docline='#C9D5EA',pillBg='#EAF0FF',pillText='#0B1530',badge='#FFC233',badgeText='#0A1F44',
  lockup='hub-lockup-horizontal-white.png',shadow=.35,halo=True),
}
FONTS="@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&amp;family=Figtree:wght@400..800&amp;family=JetBrains+Mono:wght@500;700&amp;display=block');.ui{font-family:Figtree,system-ui,sans-serif}.disp{font-family:'Bricolage Grotesque',Figtree,sans-serif}.mono{font-family:'JetBrains Mono',monospace}"
def defs(c,extra=''):
    h=('<filter id="halo" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="2" result="d"/><feFlood flood-color="#EAF0FF" flood-opacity=".9"/><feComposite in2="d" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>' if c['halo'] else '')
    return (f'<defs><filter id="lift" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0A1F44" flood-opacity="{c["shadow"]}"/></filter>'
            f'<filter id="float" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#0A1F44" flood-opacity="{c["shadow"]*3:.2f}"/></filter>{h}{extra}</defs>')
def mate(c,name,x,y,s):
    f=' filter="url(#halo)"' if c['halo'] else ''
    return f'<image{f} href="sections/{name}.svg" x="{x}" y="{y}" width="{s}" height="{s}"/>'
def doc(c,x,y,kind,w=40,h=50):
    band={'paper':'#FFC233','report':'#2DB87D','note':'#7B61FF','exam':'#F25C8F'}[kind]
    o=[f'<g transform="translate({x} {y}) scale({w/40})"><rect width="40" height="50" rx="6" fill="{c["paper"]}" stroke="#14234D" stroke-width="2"/><rect width="40" height="14" rx="6" fill="{band}" stroke="#14234D" stroke-width="2"/>']
    if kind=='paper': o.append('<path d="M8 26h24M8 33h18M8 40h22" stroke="#C9D5EA" stroke-width="2.5" stroke-linecap="round"/>')
    if kind=='report': o.append('<path d="M10 30l6 6 12-12" fill="none" stroke="#18794A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>')
    if kind=='note': o.append('<path d="M8 30q6-6 12 0t12 0M8 40q6-5 12 0" fill="none" stroke="#7B61FF" stroke-width="2.5" stroke-linecap="round"/>')
    o.append('</g>'); return ''.join(o)
