import { WhatsappLogo } from '@phosphor-icons/react';
import { appUrl } from '../../../lib/share';
import { useCopyLink } from '../../../lib/useCopyLink';
import { Button, cx, glyph, Icon, IconButton, Menu } from '../../../ui';
import { mailUrl, whatsappUrl } from '../lib/links';

export interface ShareActionsProps {
  /** e.g. '/newsletter/launch-edition' */
  route: string;
  /** used in the share text / email subject */
  title: string;
  /** icon-only copy button (narrow headers) */
  compact?: boolean;
  className?: string;
}

/** "Copy link" + a share menu (WhatsApp, email) for an issue route. */
export function ShareActions({ route, title, compact = false, className }: ShareActionsProps) {
  const url = appUrl(route);

  const copyLink = useCopyLink();
  const copy = () => copyLink(url, 'Paste it anywhere to share this issue.');

  return (
    <div className={cx('nl-share', className)}>
      {compact ? (
        <IconButton
          label="Copy link"
          icon={<Icon glyph={glyph.link} />}
          variant="secondary"
          tooltip
          onClick={() => void copy()}
        />
      ) : (
        <Button size="sm" leadingIcon={<Icon glyph={glyph.link} />} onClick={() => void copy()}>
          Copy link
        </Button>
      )}
      <Menu
        align="end"
        label="Share this issue"
        trigger={
          <IconButton
            label="Share"
            icon={<Icon glyph={glyph.share} />}
            variant="secondary"
            size={compact ? 'md' : 'sm'}
            tooltip
          />
        }
        items={[
          {
            id: 'whatsapp',
            label: 'Share on WhatsApp',
            icon: WhatsappLogo,
            href: whatsappUrl(`${title}, from The DSBA Newsletter:`, url),
          },
          {
            id: 'email',
            label: 'Share by email',
            icon: <Icon glyph={glyph.mail} />,
            href: mailUrl(`${title}, from The DSBA Newsletter`, url),
          },
          { divider: true },
          { id: 'copy', label: 'Copy link', icon: <Icon glyph={glyph.link} />, onSelect: () => void copy() },
        ]}
      />
    </div>
  );
}
