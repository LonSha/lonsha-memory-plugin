import io, json
s=io.open('index.js',encoding='utf-8').read()
L=s.split('\n')
def seg(a,b): return '\n'.join(L[a-1:b])
# A1 取库口尾部
A1=seg(19961,19963)
print('A1 hits', s.count(A1)); print(json.dumps(A1,ensure_ascii=True)); print()
# A2 出口尾部(perspectiveContrast 之后、_perspectiveCardLine 之前? 用 perspectiveCard 块尾)
for a,b,tag in [(3092,3100,'PC_TAIL')]:
    t=seg(a,b); print(tag,'hits',s.count(t)); print(json.dumps(t,ensure_ascii=True)); print()
# A3 自检行
A3=seg(12370,12371)
print('A3 hits', s.count(A3)); print(json.dumps(A3,ensure_ascii=True)); print()
