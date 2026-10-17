import io
s=io.open('index.js',encoding='utf-8').read()
L=s.split('\n')
for n in range(12366,12374):
    print(n, repr(L[n-1]))
print('--- count tests ---')
print('A_SC1', s.count('                    })(),\n'))
print('A_SC2', s.count('                    // [v3.207] 账本实体契约:回答「六本账有多少条目、多少被替代过、有没有读不出修订号的」。'))
print('joined', s.count('                    })(),\n                    // [v3.207] 账本实体契约:回答「六本账有多少条目、多少被替代过、有没有读不出修订号的」。'))
