exec(open('tools/c.py').read())
LB=dict(canvas='#F2F5FB',surface='#FFFFFF',inset='#E7EDF7')
DB=dict(canvas='#0B1530',surface='#111E3E',inset='#1A2B54')
lt=dict(ink='#0A1F44',ink2='#3E4E6E',ink3='#5F6F92',accent='#2445C2',brand='#1F3A93',success='#18794A',warning='#8F5A00',error='#C0262D',exam='#C21D5C',y1='#0B7A85',y2='#1A5FCC',y3='#A3570A',home='#1F3A93',library='#865C00',modules='#167A4E',notebook='#5B3FD9',forum='#B0246B',calendar='#C2332B',search='#4A5878')
dk=dict(ink='#EAF0FF',ink2='#A9B8D9',ink3='#8798BE',accent='#8DA6FF',success='#5BD49A',warning='#FFC233',error='#FF7A7A',exam='#FF7EB0',y1='#3BC9DB',y2='#6FA2FF',y3='#FFA94D',home='#8DA6FF',library='#FFC94D',modules='#5BD49A',notebook='#AD9DFF',forum='#FF8CC6',calendar='#FF8A80',search='#AAB8D6')
for n,B,F in (('L',LB,lt),('D',DB,dk)):
  for k,v in F.items(): print(n,f"{k:9s}{v}","  ".join(f"{b}:{r(v,c):.2f}" for b,c in B.items()))
print('white/accent',r('#FFFFFF','#2445C2'),'dark on accent',r('#0B1530','#8DA6FF'))
