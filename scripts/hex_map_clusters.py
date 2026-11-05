"""Aggregate signature clusters shared by map snapshot builders."""
import math
import random
import re

def build_clusters(snapshot):
    # Deterministic k-means per country; labels contain only aggregate cell terms.
    rng = random.Random(7)
    cells = snapshot['cells']
    df = {}
    for cell in cells:
        for term in set(cell['terms']):
            df[term] = df.get(term, 0) + 1
    clusters = []
    for region in snapshot['regions']:
        ids = [i for i, cell in enumerate(cells) if cell['region'] == region['id']]
        if not ids:
            continue
        centres = [(cells[i]['x'], cells[i]['y']) for i in rng.sample(ids, max(1, round(len(ids) / 20)))]
        for _ in range(15):
            groups = [[] for _ in centres]
            for i in ids:
                c = cells[i]
                j = min(range(len(centres)), key=lambda j: (centres[j][0]-c['x'])**2 + (centres[j][1]-c['y'])**2)
                groups[j].append(i)
            centres = [(sum(cells[i]['x'] for i in g)/len(g), sum(cells[i]['y'] for i in g)/len(g)) if g else centres[j] for j,g in enumerate(groups)]
        for j, group in enumerate(groups):
            if len(group) < 5:
                continue
            counts, scores = {}, {}
            for i in group:
                for rank, term in enumerate(cells[i]['terms']):
                    counts[term] = counts.get(term, 0) + 1
                    scores[term] = scores.get(term, 0) + math.log(len(cells)/df[term])/(rank+1)
            words = sorted((t for t in counts if counts[t] >= max(2, .12*len(group)) and not re.search(r'\b(fuck\w*|shit\w*|cunt\w*|nigg\w*|bitch\w*|fagg\w*)\b', t, re.I)), key=lambda t: -scores[t]*counts[t])[:2]
            if not words:
                continue
            x,y = centres[j]
            anchor = min(group, key=lambda i: (cells[i]['x']-x)**2+(cells[i]['y']-y)**2)
            clusters.append({'x':cells[anchor]['x'], 'y':cells[anchor]['y'], 'label':' · '.join(words), 'region':region['id'], 'size':len(group)})
    return clusters
