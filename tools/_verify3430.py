import io, json
s=io.open('index.js',encoding='utf-8').read()
L=s.split('\n')
for k in ['function _testimonyBoardLib','testimonyBoard(opts)','testimonyRevoke(dropped','_testimonyBoardLine()']:
    for i,l in enumerate(L,1):
        if k in l:
            print('%-26s line %d' % (k, i)); break
print('--- selfcheck rows 区 ---')
for i,l in enumerate(L,1):
    if "'\u8bc1\u8bcd\u9762'" in l and i>12300 and i<12560:
        print(i, json.dumps(l[:110],ensure_ascii=True))
print('--- exit region ---')
for i in range(3100,3145):
    if 'testimony' in L[i-1].lower():
        print(i, json.dumps(L[i-1][:110],ensure_ascii=True))
