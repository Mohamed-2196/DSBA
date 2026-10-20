// "Can't find it? Ask for it": a link to /requests with "New request" open on a kind, for pages where something
// may be missing (the library). Shows only while requests are on and the person isn't suspended.
import { useAuth } from '../../auth';
import { Button, glyph, Icon } from '../../ui';
import type { RequestKind } from './types';
import { useMayAsk } from './useMayAsk';
import './AskLink.css';

export interface AskLinkProps {
  kind?: RequestKind;
  /** the words before the link */
  lead?: string;
  className?: string;
}

export function AskLink({ kind = 'paper', lead = 'Can’t find it?', className }: AskLinkProps) {
  const { featureOn } = useAuth();
  const mayAsk = useMayAsk();
  if (!featureOn('requests') || mayAsk === 'suspended') return null;
  return (
    <p className={className ?? 'req-ask'} data-hub="ask-link">
      <span>{lead}</span>
      <Button variant="ghost" size="sm" leadingIcon={<Icon glyph={glyph.question} />} to={`/requests?new=${kind}`}>
        Ask for it
      </Button>
    </p>
  );
}
