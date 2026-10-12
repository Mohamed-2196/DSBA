import { useRef } from 'react';
import { ImageSquare } from '@phosphor-icons/react';
import { Button } from '../../../ui';
import { MAX_IMAGE_MB } from '../lib/uploads';
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
      <Button ref={buttonRef} size="sm" leadingIcon={ImageSquare} onClick={images.pick} data-hub="attach-image">
        {images.cards.length ? 'Attach another image' : 'Attach image'}
      </Button>
      <span className="forum-composer__attach-note">
        A photo of the question or your working. PNG, JPEG, WebP or GIF, up to {MAX_IMAGE_MB} MB. It goes into your post where the cursor is.
      </span>
    </div>
  );
}
