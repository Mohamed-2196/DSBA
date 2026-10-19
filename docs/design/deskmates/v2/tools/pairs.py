exec(open('tools/c.py').read())
PAIRS=[('ink #0A1F44',['canvas #F2F5FB','surface #FFFFFF','inset #ECF1F9']),('ink-2 #3E4E6E',['canvas #F2F5FB','surface #FFFFFF','inset #ECF1F9']),('ink-3 #5A6A8C',['canvas #F2F5FB','surface #FFFFFF','inset #ECF1F9']),
('accent #2445C2',['canvas #F2F5FB','surface #FFFFFF']),('white #FFFFFF',['accent #2445C2']),('accent-text #1F3A93',['surface #FFFFFF','accent-soft #E3E9FF']),('ink #0A1F44',['accent-soft #E3E9FF']),('ink-2 #3E4E6E',['accent-soft #E3E9FF']),
('success #18794A',['surface #FFFFFF']),('warning #8F5A00',['surface #FFFFFF']),('error #C0262D',['surface #FFFFFF']),('exam #C21D5C',['surface #FFFFFF']),('white #FFFFFF',['exam #C21D5C']),
('Y1 #0A727C',['surface #FFFFFF','inset #ECF1F9']),('Y2 #1A5FCC',['surface #FFFFFF','inset #ECF1F9','Y2 soft #DCE8FF']),('Y3 #9A5209',['surface #FFFFFF','Y3 soft #FFE8D1']),
('home #1F3A93',['surface #FFFFFF','home pill #E3E9FF']),('library #865C00',['surface #FFFFFF','library pill #FFF1C7']),('modules #15744A',['surface #FFFFFF','modules pill #DDF5E9']),('notebook #5B3FD9',['surface #FFFFFF','notebook pill #ECE7FF']),
('forum #B0246B',['surface #FFFFFF','forum pill #FFE3F0']),('calendar #C2332B',['surface #FFFFFF','calendar pill #FFE4E1']),('search #4A5878',['surface #FFFFFF','search pill #E6EBF4']),
('ink #0A1F44',['library soft #FFF1C7','badge #FFC233']),('ink-2 #3E4E6E',['library soft #FFF1C7']),('canvas #F2F5FB',['Filters pill #0A1F44']),
('D ink #EAF0FF',['canvas #0B1530','surface #111E3E','inset #1A2B54']),('D ink-2 #A9B8D9',['canvas #0B1530','surface #111E3E','inset #1A2B54']),('D ink-3 #8798BE',['canvas #0B1530','surface #111E3E']),
('D accent #8DA6FF',['canvas #0B1530','surface #111E3E','accent-soft #1E2C66']),('D on-accent #0B1530',['accent #8DA6FF']),
('D success #5BD49A',['surface #111E3E']),('D warning #FFC233',['surface #111E3E']),('D error #FF7A7A',['surface #111E3E']),('D exam #FF7EB0',['surface #111E3E']),('D on-exam #0B1530',['exam #FF7EB0']),
('D Y1 #3BC9DB',['surface #111E3E']),('D Y2 #6FA2FF',['surface #111E3E','Y2 soft #1B2D55']),('D Y3 #FFA94D',['surface #111E3E','Y3 soft #3A2A1C']),
('D home #8DA6FF',['surface #111E3E','pill #1E2C66']),('D library #FFC94D',['surface #111E3E','pill #3A3218']),('D modules #5BD49A',['surface #111E3E','pill #15382C']),('D notebook #AD9DFF',['surface #111E3E','pill #2A2560']),
('D forum #FF8CC6',['surface #111E3E','pill #42213A']),('D calendar #FF8A80',['surface #111E3E','pill #42222A']),('D search #AAB8D6',['surface #111E3E','pill #24304F']),
('D ink-2 #A9B8D9',['library soft #3A3218']),('D Filters text #0B1530',['pill #EAF0FF'])]
for f,bs in PAIRS:
    print(f"| {f} | "+" · ".join(f"{b}: **{r(f.split()[-1],b.split()[-1]):.2f}**" for b in bs)+" |")
