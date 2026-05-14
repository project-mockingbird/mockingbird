// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayerRow } from './LayerRow';

describe('<LayerRow>', () => {
  const defaults = {
    layerName: 'authoring',
    effectiveCount: 340,
    color: '#22c55e',
    visible: true,
    onToggle: () => {},
    onRename: () => {},
    onRecolor: () => {},
  };

  it('renders name, count, and color swatch', () => {
    render(<LayerRow {...defaults} />);
    expect(screen.getByText('authoring')).toBeInTheDocument();
    expect(screen.getByText('340')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('toggle checkbox calls onToggle with new value', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<LayerRow {...defaults} onToggle={onToggle} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('ootbSubstrate disables the toggle and rename', () => {
    render(<LayerRow {...defaults} layerName="Sitecore IAR" ootbSubstrate />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.queryByText(/substrate/i)).not.toBeInTheDocument();
  });

  it('rename calls onRename', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(<LayerRow {...defaults} onRename={onRename} />);
    await user.click(screen.getByText('authoring'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'edited{Enter}');
    expect(onRename).toHaveBeenCalledWith('edited');
  });
});

describe('<LayerRow> kebab menu', () => {
  it('renders kebab for user layers', async () => {
    const user = userEvent.setup();
    render(
      <LayerRow
        layerName="authoring"
        effectiveCount={10}
        color="#22c55e"
        visible
        onToggle={() => {}}
        onRename={() => {}}
        onRecolor={() => {}}
        onRemove={() => {}}
        onReplaceSource={() => {}}
        canRemove
      />,
    );
    expect(screen.getByRole('button', { name: /layer actions/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /layer actions/i }));
    expect(screen.getByRole('button', { name: /replace source/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove layer/i })).toBeInTheDocument();
  });

  it('does NOT render the kebab for OOTB substrate row', () => {
    render(
      <LayerRow
        layerName="Sitecore IAR"
        effectiveCount={1000}
        color="#cbd5e1"
        visible
        ootbSubstrate
        onToggle={() => {}}
        onRename={() => {}}
        onRecolor={() => {}}
        onRemove={() => {}}
        onReplaceSource={() => {}}
        canRemove={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /layer actions/i })).not.toBeInTheDocument();
  });

  it('disables Remove layer when canRemove is false', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <LayerRow
        layerName="only-layer"
        effectiveCount={10}
        color="#22c55e"
        visible
        onToggle={() => {}}
        onRename={() => {}}
        onRecolor={() => {}}
        onRemove={onRemove}
        onReplaceSource={() => {}}
        canRemove={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: /layer actions/i }));
    const removeBtn = screen.getByRole('button', { name: /remove layer/i });
    expect(removeBtn).toBeDisabled();
    await user.click(removeBtn);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('Remove layer transforms the row into an inline confirm', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <LayerRow
        layerName="authoring"
        effectiveCount={10}
        color="#22c55e"
        visible
        onToggle={() => {}}
        onRename={() => {}}
        onRecolor={() => {}}
        onRemove={onRemove}
        onReplaceSource={() => {}}
        canRemove
      />,
    );
    await user.click(screen.getByRole('button', { name: /layer actions/i }));
    await user.click(screen.getByRole('button', { name: /remove layer/i }));
    expect(screen.getByText(/remove authoring from this project/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByText(/remove authoring from this project/i)).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /layer actions/i }));
    await user.click(screen.getByRole('button', { name: /remove layer/i }));
    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('Replace source... invokes onReplaceSource', async () => {
    const user = userEvent.setup();
    const onReplaceSource = vi.fn();
    render(
      <LayerRow
        layerName="authoring"
        effectiveCount={10}
        color="#22c55e"
        visible
        onToggle={() => {}}
        onRename={() => {}}
        onRecolor={() => {}}
        onRemove={() => {}}
        onReplaceSource={onReplaceSource}
        canRemove
      />,
    );
    await user.click(screen.getByRole('button', { name: /layer actions/i }));
    await user.click(screen.getByRole('button', { name: /replace source/i }));
    expect(onReplaceSource).toHaveBeenCalledTimes(1);
  });
});
