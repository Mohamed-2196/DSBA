import { EnvelopeSimple, LinkSimple, ShareNetwork, WhatsappLogo } from '@phosphor-icons/react';
import { Button, IconButton, Menu, cx } from '../../../ui';
import { useToast } from '../../../state';
import { appUrl, copyText, mailUrl, whatsappUrl } from '../lib/share.js';

/**
 * "Copy link" + a share menu (WhatsApp, email) for an issue route.
 * @param route  e.g. '/newsletter/launch-edition'
 * @param title  used in the share text / email subject
 * @param compact  icon-only copy button (narrow headers)
 */
export function ShareActions({ route, title, compact = false, className }) {
  const { push } = useToast();
  const url = appUrl(route);

  const copy = async () => {
    const ok = await copyText(url);
    if (ok) push({ title: 'Link copied', body: 'Paste it anywhere to share this issue.', tone: 'success' });
    else push({ title: 'Couldn’t copy the link', body: 'Copy it from the address bar instead.', tone: 'alert' });
  };

  return (
    <div className={cx('nl-share', className)}>
      {compact ? (
        <IconButton label="Copy link" icon={LinkSimple} variant="secondary" tooltip onClick={copy} />
      ) : (
        <Button size="sm" leadingIcon={LinkSimple} onClick={copy}>
          Copy link
        </Button>
      )}
      <Menu
        align="end"
        label="Share this issue"
        trigger={<IconButton label="Share" icon={ShareNetwork} variant="secondary" size={compact ? 'md' : 'sm'} tooltip />}
        items={[
          { id: 'whatsapp', label: 'Share on WhatsApp', icon: WhatsappLogo, href: whatsappUrl(`${title}, from The DSBA Newsletter:`, url) },
          { id: 'email', label: 'Share by email', icon: EnvelopeSimple, href: mailUrl(`${title}, from The DSBA Newsletter`, url) },
          { divider: true },
          { id: 'copy', label: 'Copy link', icon: LinkSimple, onSelect: copy },
        ]}
      />
    </div>
  );
}
