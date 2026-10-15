import { Modal } from '../../../ui';
import type { GameInfo } from '../types';

interface HowToModalProps {
  open: boolean;
  onClose: () => void;
  info: GameInfo;
}

export function HowToModal({ open, onClose, info }: HowToModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={`How to Play: ${info.title}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-16)' }}>
        <p style={{ margin: 0, fontSize: 'var(--fs-15)', color: 'var(--ink-2)', fontStyle: 'italic' }}>
          {info.tagline}
        </p>

        <div>
          <h4 style={{ margin: '0 0 var(--sp-8)', fontSize: 'var(--fs-14)', fontWeight: 'var(--fw-bold)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink)' }}>
            Rules
          </h4>
          <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)', fontSize: 'var(--fs-14)', color: 'var(--ink)' }}>
            {info.howTo.map((rule, idx) => (
              <li key={idx}>{rule}</li>
            ))}
          </ul>
        </div>

        <div style={{ padding: 'var(--sp-12) var(--sp-16)', borderRadius: 'var(--r-control)', backgroundColor: 'var(--surface-2)', border: '1px solid var(--line)' }}>
          <h4 style={{ margin: '0 0 var(--sp-4)', fontSize: 'var(--fs-13)', fontWeight: 'var(--fw-bold)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--navy)' }}>
            Scoring
          </h4>
          <p style={{ margin: 0, fontSize: 'var(--fs-13)', color: 'var(--ink-2)', lineHeight: 'var(--lh-sans)' }}>
            {info.scoring}
          </p>
        </div>
      </div>
    </Modal>
  );
}
