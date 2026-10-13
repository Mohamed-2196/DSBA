import { PaperPlaneRight } from '@phosphor-icons/react';
import type { UserPublic } from '../../../api/types';
import { Button, Kbd, modKeyLabel } from '../../../ui';
import { AuthorAvatar } from './AuthorAvatar';
import { AuthorFlair } from './ThreadBits';

export interface ComposerFooterProps {
  /** who posts it; null for a guest (they sign in when they post) */
  author: UserPublic | null;
  /** whether someone is signed in isn't known yet */
  checking: boolean;
  posting: boolean;
  onDiscard: () => void;
}

/** The foot of "Start a thread": who posts it, and Discard / Post thread. */
export function ComposerFooter({ author, checking, posting, onDiscard }: ComposerFooterProps) {
  return (
    <div className="forum-composer__footer">
      <span className="forum-composer__as">
        <AuthorAvatar author={author} guest={!author} size="sm" />
        {author ? (
          <span>
            Posting as <strong>{author.displayName}</strong>
            <AuthorFlair author={author} className="forum-composer__flair" />
          </span>
        ) : checking ? (
          <span>Checking your account…</span>
        ) : (
          <span>You’ll sign in when you post. Your draft stays on this device.</span>
        )}
      </span>
      <span className="forum-composer__kbd" aria-hidden="true">
        <Kbd>{modKeyLabel()}</Kbd>
        <Kbd>Enter</Kbd>
      </span>
      <span className="forum-composer__buttons">
        <Button variant="ghost" onClick={onDiscard} disabled={posting}>
          Discard
        </Button>
        <Button type="submit" variant="primary" leadingIcon={PaperPlaneRight} loading={posting} data-hub="post-button">
          Post thread
        </Button>
      </span>
    </div>
  );
}
