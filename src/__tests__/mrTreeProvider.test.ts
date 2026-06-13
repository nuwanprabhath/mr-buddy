import { MrTreeProvider, MrItem } from '../treeProvider';
import { makeMr } from './helpers';

function firstLabel(provider: MrTreeProvider): string {
  const children = provider.getChildren();
  const label = children[0].label;
  return typeof label === 'string' ? label : (label as any).label ?? String(label);
}

describe('MrTreeProvider', () => {
  it('shows loading message while loading', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    p.setLoading();
    expect(firstLabel(p)).toBe('Loading…');
  });

  it('shows error message on error', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    p.setError('connection refused');
    expect(firstLabel(p)).toContain('connection refused');
  });

  it('shows custom empty message when no items', () => {
    const p = new MrTreeProvider('reviewing', 'No MRs here.');
    p.setItems([]);
    expect(firstLabel(p)).toBe('No MRs here.');
  });

  it('returns MrItems after setItems', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    const items = [new MrItem(makeMr({ iid: 7 }), false)];
    p.setItems(items);
    const children = p.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toBe(items[0]);
  });

  it('clears error state after setItems', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    p.setError('oops');
    p.setItems([]);
    expect(firstLabel(p)).toBe('Nothing here.');
  });

  it('clears loading state after setItems', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    p.setLoading();
    p.setItems([]);
    expect(firstLabel(p)).toBe('Nothing here.');
  });

  it('getTreeItem returns the item unchanged', () => {
    const p = new MrTreeProvider('reviewing', '');
    const item = new MrItem(makeMr(), false);
    expect(p.getTreeItem(item)).toBe(item);
  });

  it('exposes the correct bucket id', () => {
    const p = new MrTreeProvider('authored', '');
    expect(p.bucket).toBe('authored');
  });
});
