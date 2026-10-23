import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('Graphify reconciliation preserves prior concepts, directions and parallel evidence', () => {
  const python = process.env.GRAPHIFY_PYTHON || 'python3';
  const result = JSON.parse(
    execFileSync(
      python,
      [
        '-c',
        `
import importlib.util,json
spec=importlib.util.spec_from_file_location('repair','scripts/reconcile-graphify.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
old={'nodes':[{'id':'a','label':'Old','source_file':'/repo/a.ts'}, {'id':'old','label':'Former'}],
     'links':[{'source':'a','target':'old','relation':'calls'}],
     'hyperedges':[{'id':'prior','nodes':['a','old'],'label':'Earlier flow'}]}
new={'nodes':[{'id':'a','label':'Current','source_file':'/repo/a.ts'}],
     'edges':[{'source':'a','target':'dep','relation':'imports','confidence':'EXTRACTED'},
              {'source':'a','target':'dep','relation':'calls','confidence':'EXTRACTED'},
              {'source':'a','target':'a','relation':'calls','confidence':'EXTRACTED'},
              {'source':'dep','target':'a','relation':'calls','confidence':'EXTRACTED'}]}
result=module.reconcile(old,new,'/repo')
assert old['nodes'][0]['label']=='Old' and new['nodes'][0]['source_file']=='/repo/a.ts'
again=module.reconcile(result,new,'/repo')
assert again==result, 'Reconciliation must be idempotent'
try:
 module.reconcile(old,{'nodes':[], 'edges':[{'source':'a','target':None}]},'/repo')
 raise AssertionError('Invalid endpoint accepted')
except ValueError:
 pass
print(json.dumps(result))
`,
      ],
      { encoding: 'utf8' },
    ),
  );
  assert.equal(result.nodes.find((n) => n.id === 'a').label, 'Current');
  assert.equal(result.nodes.find((n) => n.id === 'a').source_file, 'a.ts');
  assert.equal(result.nodes.find((n) => n.id === 'old').freshness, 'historical');
  assert.equal(result.nodes.find((n) => n.id === 'dep').reference_only, true);
  assert.equal(result.edges.length, 5);
  assert.deepEqual(
    result.edges.filter((e) => e.target === 'dep').map((e) => e.relation),
    ['imports', 'calls'],
  );
  assert.equal(result.hyperedges[0].id, 'prior');
});
