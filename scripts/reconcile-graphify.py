"""Retain Graphify node identities and links; keep input snapshots for prior attributes."""
import copy
import json
from pathlib import Path


def reconcile(previous, candidate, root):
    root = Path(root).resolve()

    def relative(value):
        if not value:
            return value
        path = Path(value)
        if path.is_absolute():
            try:
                return str(path.relative_to(root))
            except ValueError:
                return value
        return value

    def normalized(record):
        record = copy.deepcopy(record)
        if 'source_file' in record:
            record['source_file'] = relative(record['source_file'])
        return record

    nodes = {}
    for record in previous['nodes']:
        node = normalized(record)
        if node.get('reference_only'):
            nodes[node['id']] = node
            continue
        node.update(freshness='historical', original_label=node.get('original_label', node.get('label', node['id'])))
        node['label'] = 'Retained · ' + node['original_label']
        nodes[node['id']] = node
    for record in candidate['nodes']:
        node = normalized(record)
        node['freshness'] = 'current'
        nodes[node['id']] = node

    links = {}
    for source, records in [('historical', previous.get('links', previous.get('edges', []))),
                            ('current', candidate.get('edges', candidate.get('links', [])))]:
        for record in records:
            edge = normalized(record)
            # _src/_tgt are Graphify's original direction, before undirected projection.
            if edge.get('_src') is not None and edge.get('_tgt') is not None:
                edge['source'], edge['target'] = edge['_src'], edge['_tgt']
            for field in ('_src', '_tgt', 'key', 'freshness'):
                edge.pop(field, None)
            edge.setdefault('confidence_score', {'EXTRACTED': 1.0, 'INFERRED': 0.55,
                                                'AMBIGUOUS': 0.2}.get(edge.get('confidence'), 1.0))
            key = json.dumps(edge, sort_keys=True, ensure_ascii=False)
            if key not in links or source == 'current':
                links[key] = {**edge, 'freshness': source}
            for endpoint in ('source', 'target'):
                identity = edge.get(endpoint)
                if not isinstance(identity, str) or not identity:
                    raise ValueError('Missing edge endpoint: ' + str(record))
                if identity not in nodes:
                    # A reference records the import, not an invented function definition.
                    label = edge.get('metadata', {}).get('target_fqn') or identity
                    nodes[identity] = {'id': identity, 'label': 'Reference · ' + label,
                                       'file_type': 'concept', '_origin': 'reference',
                                       'reference_only': True, 'freshness': 'reference',
                                       'source_file': None, 'source_location': None}

    hyperedges = {}
    for source, records in [('historical', previous.get('hyperedges', previous.get('graph', {}).get('hyperedges', []))),
                            ('current', candidate.get('hyperedges', []))]:
        for record in records:
            hyper = normalized(record)
            key = json.dumps(hyper, sort_keys=True, ensure_ascii=False)
            hyperedges[key] = {**hyper, 'freshness': source}
            for identity in hyper.get('nodes', []):
                if identity not in nodes:
                    nodes[identity] = {'id': identity, 'label': 'Reference · ' + identity,
                                       'file_type': 'concept', '_origin': 'reference',
                                       'reference_only': True, 'freshness': 'reference',
                                       'source_file': None, 'source_location': None}
    result = {'nodes': list(nodes.values()), 'edges': list(links.values()),
              'hyperedges': list(hyperedges.values()), 'input_tokens': 0, 'output_tokens': 0,
              'token_usage_status': 'Host usage unavailable; zeros are unmeasured placeholders.'}
    assert {n['id'] for n in previous['nodes']} <= set(nodes)
    assert {n['id'] for n in candidate['nodes']} <= set(nodes)
    assert all(e['source'] in nodes and e['target'] in nodes for e in result['edges'])
    return result


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--previous', required=True, type=Path)
    parser.add_argument('--candidate', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--root', default='.', type=Path)
    args = parser.parse_args()
    old = json.loads(args.previous.read_text())
    new = json.loads(args.candidate.read_text())
    result = reconcile(old, new, args.root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False))
    temporary.replace(args.output)
    print(f"Reconciled {len(result['nodes'])} nodes, {len(result['edges'])} evidence links")
