// Shares a result: the phone's share sheet where there is one, the clipboard elsewhere, with the outcome on the
// button itself.
import { useEffect, useRef, useState } from 'react';
import { Button, type ButtonSize, type ButtonVariant, glyph, Icon } from '../../../ui';
import { shareResult, type ShareOutcome } from '../lib/share';

const LABEL: Record<ShareOutcome, string> = {
  shared: 'Shared',
  copied: 'Copied',
  cancelled: 'Share result',
  failed: 'Couldn’t copy. Try again',
};

export function ShareButton({
  share,
  variant = 'primary',
  size = 'md',
  fullWidth,
}: {
  share: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    const result = await shareResult(share);
    setOutcome(result);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOutcome(null), 2400);
  };

  const done = outcome === 'copied' || outcome === 'shared';
  return (
    <Button
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      leadingIcon={done ? <Icon glyph={glyph.check} /> : <Icon glyph={glyph.share} />}
      onClick={() => void onClick()}
      aria-live="polite"
    >
      {outcome ? LABEL[outcome] : 'Share result'}
    </Button>
  );
}
