import contextlib
import json
import sys
from pathlib import Path
from graphify.extract import extract

folder = Path(sys.argv[1])
with contextlib.redirect_stdout(sys.stderr):
    graph = extract(sorted(folder.glob('*.tsx')), root=folder, cache_root=folder, parallel=False)
print(json.dumps(graph))
