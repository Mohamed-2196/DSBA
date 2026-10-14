// "Customize Home": show or hide each block and move it up or down, with buttons (no dragging needed). Every change
// shows on Home at once and is saved (to the account, or this browser for a guest).
import { ArrowDown, ArrowUp } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { Button, Divider, IconButton, Modal, Switch } from '../../ui';
import type { useTracking } from '../modules/public';
import { BLOCKS, moveBlock, showBlock, type HomeBlock } from './blocks';
import type { HomeLayout } from './layout';

export function CustomizeHome({ open, onClose, layout, tracking }: { open: boolean; onClose: () => void; layout: HomeLayout; tracking: ReturnType<typeof useTracking> }) {
  const { shown, hidden, custom, save } = layout;
  const [said, setSaid] = useState('');
  const listRef = useRef<HTMLOListElement>(null);

  const move = (block: HomeBlock, by: -1 | 1) => {
    const next = moveBlock(shown, block, by);
    save(next);
    const at = next.indexOf(block);
    setSaid(`${BLOCKS[block].title} moved to ${at + 1} of ${next.length}.`);
    // At the top or the bottom its button turns off: keep focus on the block's other one.
    if (at === 0 || at === next.length - 1) {
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-block="${block}"][data-dir="${at === 0 ? 'down' : 'up'}"]`)?.focus());
    }
  };
  const toggle = (block: HomeBlock, on: boolean) => {
    save(showBlock(shown, block, on));
    setSaid(on ? `${BLOCKS[block].title} shown, at the end.` : `${BLOCKS[block].title} hidden.`);
  };

  const rows = [...shown.map((b) => ({ b, on: true })), ...hidden.map((b) => ({ b, on: false }))];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize Home"
      description="Choose what Home shows and in what order. Some blocks appear only when they have something for you."
      size="md"
      footer={
        <>
          <Button
            variant="ghost"
            disabled={!custom}
            onClick={() => {
              save(null);
              setSaid('Home is back to the default.');
            }}
          >
            Reset to default
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <ol className="home-custom" role="list" ref={listRef} data-hub="home-customize">
        {rows.map(({ b, on }) => {
          const i = shown.indexOf(b);
          return (
            <li key={b} className="home-custom__row">
              <Switch
                className="home-custom__switch"
                label={BLOCKS[b].title}
                description={BLOCKS[b].description}
                checked={on}
                onChange={(next) => toggle(b, next)}
              />
              <span className="home-custom__move">
                <IconButton label={`Move ${BLOCKS[b].title} up`} icon={ArrowUp} size="sm" disabled={!on || i === 0} onClick={() => move(b, -1)} data-block={b} data-dir="up" />
                <IconButton label={`Move ${BLOCKS[b].title} down`} icon={ArrowDown} size="sm" disabled={!on || i === shown.length - 1} onClick={() => move(b, 1)} data-block={b} data-dir="down" />
              </span>
            </li>
          );
        })}
      </ol>
      <Divider />
      <Switch
        className="home-custom__progress"
        label="Track my lesson progress"
        description={tracking.mode === 'account' ? 'Mark lessons as watched and pick up where you left off, on every device.' : 'Mark lessons as watched and pick up where you left off, in this browser.'}
        checked={tracking.on}
        onChange={tracking.set}
      />
      <p className="visually-hidden" role="status" aria-live="polite">
        {said}
      </p>
    </Modal>
  );
}
