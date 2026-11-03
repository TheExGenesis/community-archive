import json,collections,urllib.request,concurrent.futures,sys
rows=json.load(open('rows.json'))
acc=collections.defaultdict(set)
for r in rows: acc[r['v']].add(r['a'])
vids=[v for v,a in acc.items() if len(a)>=2]
def get(v):
    u='https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v='+v
    for _ in range(3):
        try:
            d=json.load(urllib.request.urlopen(u,timeout=15))
            return v,{'title':d.get('title'),'channel':d.get('author_name'),'channel_url':d.get('author_url')}
        except urllib.error.HTTPError as e:
            if e.code in (400,401,403,404): return v,None
        except Exception: pass
    return v,'err'
out={}
with concurrent.futures.ThreadPoolExecutor(24) as ex:
    for i,(v,m) in enumerate(ex.map(get,vids)):
        out[v]=m
        if i%500==0: print(i,file=sys.stderr,flush=True)
json.dump(out,open('meta.json','w'))
print(sum(1 for m in out.values() if isinstance(m,dict)), sum(1 for m in out.values() if m is None), sum(1 for m in out.values() if m=='err'))
