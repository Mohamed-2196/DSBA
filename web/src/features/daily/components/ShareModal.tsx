import { useState } from 'react';
import { Check, ShareNetwork, Trophy } from '@phosphor-icons/react';
import { Button, Modal } from '../../../ui';
import { copyText } from '../../../lib/share';
import { useToast } from '../../../state/hooks';
import type { Play, Theme } from '../types';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  play: Play;
  theme: Theme;
  gameTitle: string;
}

export function ShareModal({ open, onClose, play, theme, gameTitle }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const handleCopy = async () => {
    if (!play.share) return;
    const ok = await copyText(play.share);
    if (ok) {
      setCopied(true);
      toast.push({ tone: 'success', title: 'Result copied to clipboard!' });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isWon = play.status === 'won';

  return (
    <Modal open={open} onClose={onClose} title={`${gameTitle} Result`}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-20)', textAlign: 'center' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: isWon ? 'var(--signal-soft)' : 'var(--surface-2)',
            color: isWon ? 'var(--signal-strong)' : 'var(--ink-2)',
          }}
        >
          <Trophy size={36} weight={isWon ? 'fill' : 'regular'} />
        </div>

        <div>
          <h3 style={{ margin: '0 0 var(--sp-4)', fontSize: 'var(--fs-20)', fontWeight: 'var(--fw-bold)', color: 'var(--ink)' }}>
            {isWon ? 'Puzzle Solved!' : 'Game Over'}
          </h3>
          <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--ink-2)' }}>
            {theme.title} • {play.day}
          </p>
        </div>

        {/* Score Pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: '6px',
            padding: '8px 20px',
            borderRadius: 'var(--r-pill)',
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--line)',
          }}
        >
          <span style={{ fontSize: 'var(--fs-25)', fontWeight: 'var(--fw-bold)', color: 'var(--ink)' }}>
            +{play.points}
          </span>
          <span style={{ fontSize: 'var(--fs-14)', color: 'var(--ink-2)' }}>points</span>
          {!play.scored && (
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginLeft: '4px' }}>
              (practice)
            </span>
          )}
        </div>

        {/* Share Text Box */}
        {play.share && (
          <div
            style={{
              width: '100%',
              padding: 'var(--sp-16)',
              borderRadius: 'var(--r-control)',
              backgroundColor: 'var(--surface-2)',
              border: '1px solid var(--line)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--fs-13)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              textAlign: 'center',
            }}
          >
            {play.share}
          </div>
        )}

        <Button
          variant="primary"
          size="lg"
          onClick={handleCopy}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          {copied ? <Check size={20} /> : <ShareNetwork size={20} />}
          <span>{copied ? 'Copied to clipboard!' : 'Share Result (Copy)'}</span>
        </Button>
      </div>
    </Modal>
  );
}
