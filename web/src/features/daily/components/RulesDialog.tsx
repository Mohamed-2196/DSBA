// How to play: the API's rules and scoring, the game's worked example, and its keyboard shortcuts.
import { typeset } from '../../../api/errors';
import { Button, Kbd, Modal } from '../../../ui';
import { GAMES } from '../games/registry';
import type { GameInfo } from '../types';

export function RulesDialog({ open, onClose, info }: { open: boolean; onClose: () => void; info: GameInfo }) {
  const { Example, keys } = GAMES[info.id];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`How to play ${info.title}`}
      description={typeset(info.tagline)}
      size="sm"
      className="dy dg-rules"
      footer={
        <Button variant="primary" onClick={onClose} fullWidth data-autofocus>
          Play
        </Button>
      }
    >
      <div className="dg-rules__body">
        <ol className="dg-rules__list">
          {info.howTo.map((rule) => (
            <li key={rule}>{typeset(rule)}</li>
          ))}
        </ol>
        <section className="dg-rules__example" aria-label="Example">
          <Example />
        </section>
        <p className="dg-rules__scoring">
          <strong>Points.</strong> {info.scoring}
        </p>
        {keys.length ? (
          <dl className="dg-rules__keys">
            {keys.map(([key, does]) => (
              <div key={key}>
                <dt>
                  <Kbd>{key}</Kbd>
                </dt>
                <dd>{does}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </Modal>
  );
}
