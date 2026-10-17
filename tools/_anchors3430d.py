import io
s=io.open('index.js',encoding='utf-8').read()
cands = {
 'c1': '                    })(),\n',
 'c2': '\u8d26\u672c\u5b9e\u4f53\u5951\u7ea6\uff1a\u56de\u7b54',
 'c3': '                    // [v3.207] \u8d26\u672c\u5b9e\u4f53\u5951\u7ea6\uff1a\u56de\u7b54',
 'c4': '                    })(),\n                    // [v3.207] \u8d26\u672c\u5b9e\u4f53\u5951\u7ea6\uff1a\u56de\u7b54',
 'c5': '                    // [v3.207] \u8d26\u672c\u5b9e\u4f53\u5951\u7ea6\uff1a\u56de\u7b54\u300c\u516d\u672c\u8d26',
}
for k,v in cands.items():
    print(k, s.count(v))
