M={'#2B2340':'#14234D','#FFFDF7':'#FFFFFF','#D9CDB6':'#C9D5EA','#FFF3D6':'#F4F7FD','#F2DCA8':'#DCE6F5','#E2C27C':'#C9D5EA',
'#E9AE3E':'#E8A600','#FBE7B8':'#FFE29A','#F2BE4E':'#FFC233','#C98B1F':'#C98F00','#FFF8EA':'#FFFFFF','#7A8398':'#8E9BB8',
'#7CC98F':'#3BC9DB','#79AEEF':'#6FA2FF','#F5A462':'#FFA94D','#2A9D8F':'#2DB87D','#1F7A70':'#1F9463','#164F49':'#126846','#9AA3B5':'#9AA8C4',
'#F7A595':'#FF9DB0','#F28B7A':'#FF8FA3','#4B5BD0':'#7B61FF','#F07A5A':'#FF7A9A','#F5C451':'#FFC233','#E0A92E':'#E8A600','#B9C0CF':'#B7C2D8',
'#F29C9C':'#FF8FA3','#E4E7F0':'#DCE3F0','#9A4FB0':'#F25CA2','#DCE9F6':'#DCE6F5','#2C8AD4':'#F0524B','#BFE0F8':'#FFC9C4'}
import sys,re
for n in ['library','modules','notebook','forum','calendar']:
    s=open(f'../b/sections/{n}.svg').read()
    ks=list(M)
    for i,k in enumerate(ks): s=re.sub(re.escape(k),f'@{i}@',s,flags=re.I)
    for i,k in enumerate(ks): s=s.replace(f'@{i}@',M[k])
    left=set(re.findall(r'#[0-9A-Fa-f]{6}',s))-set(M.values())
    if left: print(n,'unmapped',left)
    open(f'sections/{n}.svg','w').write(s)
