import { useRef } from 'react';
import { UPLOAD_RULES } from '../../../api/uploads';
import { Button, Icon, glyph } from '../../../ui';
import type { AttachImages } from '../lib/useAttachImages';
import { AttachmentList } from './ImageAttachments';

/** Under the composer's details: the pictures being attached, "Attach image" and what can be attached. */
export function AttachRow({ images }: { images: AttachImages }) {
  const buttonRef = useRef<HTMLElement>(null);
  return (
    <div className="forum-composer__attach">
      <AttachmentList
        uploads={images.cards}
        onRetry={images.retry}
        onRemove={(key) => {
          images.remove(key);
          requestAnimationFrame(() => buttonRef.current?.focus());
        }}
      />
      <Button
        ref={buttonRef}
        size="sm"
        leadingIcon={<Icon glyph={glyph.image} />}
        onClick={images.pick}
        data-hub="attach-image"
      >
        {images.cards.length ? 'Attach another image' : 'Attach image'}
      </Button>
      <span className="forum-composer__attach-note">
        A photo of the question or your working. {UPLOAD_RULES.forum_image.summary} It goes into your post where the
        cursor is.
      </span>
    </div>
  );
}
