# Deskmates v2 nav icons: 24 px grid, 1.75 stroke, duotone. kinds: f = section fill + line, w = paper + line, l = line only, d = solid line colour
R=lambda x,y,w,h,r: f'M{x+r} {y}h{w-2*r}a{r} {r} 0 0 1 {r} {r}v{h-2*r}a{r} {r} 0 0 1-{r} {r}h-{w-2*r}a{r} {r} 0 0 1-{r}-{r}v-{h-2*r}a{r} {r} 0 0 1 {r}-{r}z'
C=lambda cx,cy,r: f'M{cx-r} {cy}a{r} {r} 0 1 0 {2*r} 0a{r} {r} 0 1 0-{2*r} 0z'
ICONS={
 'home':[('l','M10.2 19.2L6.4 13.2L10.6 9.6'),('w',R(5,18.8,10,2.7,1.35)),('f','M9.4 9.9C9.4 5.6 11.6 3 15 3s5.6 2.6 5.6 6.9z'),('l','M8.6 9.9h12.8'),('d',C(6.4,13.2,1.25)),('f','M13.4 10.4a1.6 1.4 0 0 0 3.2 0z')],
 'modules':[('f',R(4,3,14,18,2.2)),('l','M7.6 3.4v17.2'),('w',R(10.2,6,5,3.2,.8)),('l','M18 6h1.4a1.1 1.1 0 0 1 1.1 1.1v2.2a1.1 1.1 0 0 1-1.1 1.1H18M18 12.2h1.4a1.1 1.1 0 0 1 1.1 1.1v2.2a1.1 1.1 0 0 1-1.1 1.1H18')],
 'library':[('f',R(3,17.4,18,3.6,1.2)),('f',R(4.6,13.8,16,3.6,1.2)),('w','M7 3h7.4L18 6.6v7.2H7z'),('l','M14.4 3v3.6H18M9.6 8.6h3.6M9.6 11.2h5.4')],
 'notebook':[('f',R(3.5,4.6,12.5,16.4,2.2)),('w',R(6.4,8.6,6.6,3.2,.8)),('l','M6.6 3v3.4M9.75 3v3.4M12.9 3v3.4'),('w','M18.6 4.6h2.6v11.6l-1.3 3.2-1.3-3.2z'),('l','M18.6 16.2h2.6')],
 'forum':[('f','M5.6 3h7.8a3.1 3.1 0 0 1 3.1 3.1v3.7a3.1 3.1 0 0 1-3.1 3.1H9.6L6 15.8v-2.95A3.1 3.1 0 0 1 2.5 9.8V6.1A3.1 3.1 0 0 1 5.6 3z'),('w','M12.3 11.4h5.9a2.8 2.8 0 0 1 2.8 2.8v1.8a2.8 2.8 0 0 1-2.4 2.77V21l-2.9-2.4h-3.4a2.8 2.8 0 0 1-2.8-2.8v-1.6a2.8 2.8 0 0 1 2.8-2.8z')],
 'calendar':[('w',R(3.5,5,17,16,2.6)),('f','M3.5 7.6A2.6 2.6 0 0 1 6.1 5h11.8a2.6 2.6 0 0 1 2.6 2.6v2.9h-17z'),('l','M8.5 3v4M15.5 3v4'),('d',C(12,15.6,1.7))],
 'boards':[('w',R(2.5,4,19,16,2.6)),('f','M5.7 7.6l5.6-.6.6 5.6-5.6.6z'),('f','M13.2 8.4l5 .5-.7 7.6-5-.5z'),('d',C(8.6,7.4,1)),('d',C(15.8,8.7,1))],
 'grades':[('w',R(5,2.5,14,19,2.6)),('f',R(7.5,5,9,4,1)),('d',C(9.2,12.8,1)),('d',C(12,12.8,1)),('d',C(14.8,12.8,1)),('d',C(9.2,15.9,1)),('d',C(12,15.9,1)),('d',C(14.8,15.9,1)),('d',C(9.2,19,1)),('d',C(12,19,1)),('d',C(14.8,19,1))],
 'career':[('w',C(12,12,9)),('f','M12 5.4l2.4 6.6H9.6z'),('l','M9.6 12h4.8L12 18.6z'),('d',C(12,12,1.1))],
 'newsletter':[('w','M16.8 8h2.6a1.6 1.6 0 0 1 1.6 1.6V18a2.5 2.5 0 0 1-2.5 2.5'),('w','M3.5 5.6A1.6 1.6 0 0 1 5.1 4h10.1a1.6 1.6 0 0 1 1.6 1.6V18a2.5 2.5 0 0 0 2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5z'),('f',R(6.4,7,7.6,4.6,.8)),('l','M6.4 14.6h7.6M6.4 17.4h5')],
 'daily':[('w',R(3.5,3.5,17,17,3)),('f','M9.2 9.2h5.6v5.6H9.2z'),('f','M14.8 14.8h5.7v2.7a3 3 0 0 1-3 3h-2.7z'),('l','M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17')],
 'search':[('L','M15.4 15.4l5.2 5.2'),('f',C(10.5,10.5,6.6)),('l','M7.4 9.4a3.3 3.3 0 0 1 2.4-2.5')],
 'more':[('f',C(5.5,12,2.2)),('f',C(12,12,2.2)),('f',C(18.5,12,2.2))],
}
SECTION={'home':'home','modules':'modules','library':'library','notebook':'notebook','forum':'forum','calendar':'calendar','search':'search',
 'boards':'tools','grades':'tools','career':'tools','newsletter':'tools','daily':'tools','more':'tools'}
# per theme: line default, line active, paper, tint (default fill), full (active fill), pill (active bg), label (active text)
PAL={
 'light':dict(line='#3E4E6E',lineA='#14234D',paper='#FFFFFF',
   tint=dict(home='#C9D4FF',library='#FFE29A',modules='#B9EBD2',notebook='#D9D0FF',forum='#FFC7E1',calendar='#FFCBC6',search='#D5DCEA',tools='#C9D4FF'),
   full=dict(home='#4C6EF5',library='#FFC233',modules='#2DB87D',notebook='#7B61FF',forum='#F25CA2',calendar='#F0524B',search='#8E9BB8',tools='#4C6EF5'),
   pill=dict(home='#E3E9FF',library='#FFF1C7',modules='#DDF5E9',notebook='#ECE7FF',forum='#FFE3F0',calendar='#FFE4E1',search='#E6EBF4',tools='#E3E9FF'),
   label=dict(home='#1F3A93',library='#865C00',modules='#15744A',notebook='#5B3FD9',forum='#B0246B',calendar='#C2332B',search='#4A5878',tools='#1F3A93')),
 'dark':dict(line='#A9B8D9',lineA='#EAF0FF',paper='#111E3E',
   tint=dict(home='#33438F',library='#6E5A22',modules='#1E5C45',notebook='#433889',forum='#6E2D55',calendar='#6E3036',search='#3A4870',tools='#33438F'),
   full=dict(home='#4C6EF5',library='#FFC233',modules='#2DB87D',notebook='#7B61FF',forum='#F25CA2',calendar='#F0524B',search='#8E9BB8',tools='#4C6EF5'),
   pill=dict(home='#1E2C66',library='#3A3218',modules='#15382C',notebook='#2A2560',forum='#42213A',calendar='#42222A',search='#24304F',tools='#1E2C66'),
   label=dict(home='#8DA6FF',library='#FFC94D',modules='#5BD49A',notebook='#AD9DFF',forum='#FF8CC6',calendar='#FF8A80',search='#AAB8D6',tools='#8DA6FF')),
}
def g(name,x,y,size=24,theme='light',active=False,paper=None):
    P=PAL[theme]; sec=SECTION[name]
    line=P['lineA'] if active else P['line']; fill=(P['full'] if active else P['tint'])[sec]; pap=paper or P['paper']
    sw=1.75 if not active else 1.85
    out=[f'<g transform="translate({x} {y}) scale({size/24})" stroke="{line}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">']
    for k,d in ICONS[name]:
        if k=='f': out.append(f'<path d="{d}" fill="{fill}"/>')
        elif k=='w': out.append(f'<path d="{d}" fill="{pap}"/>')
        elif k=='l': out.append(f'<path d="{d}" fill="none"/>')
        elif k=='L': out.append(f'<path d="{d}" fill="none" stroke-width="{sw+1}"/>')
        elif k=='d': out.append(f'<path d="{d}" fill="{line}" stroke="none"/>')
    out.append('</g>'); return ''.join(out)
def standalone(name):
    parts=[]
    for k,d in ICONS[name]:
        if k=='f': parts.append(f'<path d="{d}" fill="var(--icon-fill, currentColor)" fill-opacity="var(--icon-fill-opacity, 1)"/>')
        elif k=='w': parts.append(f'<path d="{d}" fill="var(--icon-paper, #FFFFFF)"/>')
        elif k=='l': parts.append(f'<path d="{d}" fill="none"/>')
        elif k=='L': parts.append(f'<path d="{d}" fill="none" stroke-width="2.75"/>')
        elif k=='d': parts.append(f'<path d="{d}" fill="currentColor" stroke="none"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'
            f'<title>{name}</title>'+''.join(parts)+'</svg>\n')
if __name__=='__main__':
    for n in ICONS: open(f'icons/{n}.svg','w').write(standalone(n))
