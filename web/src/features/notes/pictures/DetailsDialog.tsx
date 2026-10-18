// A picture's caption (shown under it) and description (for screen readers and for searching the notes), in the text
// or free on the page.
import { useEffect, useState } from 'react';
import { Button, Modal, TextArea, TextField } from '../../../ui';
import { ALT_MAX, CAPTION_MAX } from './geometry';

export function DetailsDialog({
  open,
  caption: savedCaption,
  alt: savedAlt,
  onSave,
  onClose,
}: {
  open: boolean;
  caption: string;
  alt: string;
  onSave: (v: { caption: string; alt: string }) => void;
  onClose: () => void;
}) {
  const [caption, setCaption] = useState(savedCaption);
  const [alt, setAlt] = useState(savedAlt);
  useEffect(() => {
    if (open) {
      setCaption(savedCaption);
      setAlt(savedAlt);
    }
  }, [open, savedCaption, savedAlt]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Caption and description"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onSave({ caption: caption.trim(), alt: alt.trim() })}
            data-hub="picture-details-save"
          >
            Save
          </Button>
        </>
      }
    >
      <div className="nb-details">
        <TextField
          label="Caption"
          hint="Shown under the picture."
          value={caption}
          maxLength={CAPTION_MAX}
          onChange={(e) => setCaption(e.target.value)}
          data-autofocus
        />
        <TextArea
          label="Description"
          hint="What the picture shows, for screen readers and for searching your notes."
          rows={3}
          value={alt}
          maxLength={ALT_MAX}
          onChange={(e) => setAlt(e.target.value)}
        />
      </div>
    </Modal>
  );
}
