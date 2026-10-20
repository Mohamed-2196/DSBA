// "Share with the module" in the note editor (IDEA-29): a copy of this note, as it is now, for everyone who opens its
// module. The note stays private and goes on changing; "Update the shared copy" sends it again. The button says
// whether the note is shared, and whether the copy is behind the note.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../../api/errors';
import type { Note } from '../../../api/types';
import { moduleLabel } from '../../../lib/modules';
import { useToast } from '../../../state';
import { useModules } from '../../../state/modules';
import { Badge, Button, ConfirmDialog, Icon, Modal, Switch, glyph, timeAgo } from '../../../ui';
import { useShareNote, useUnshare } from './api';
import { sharedNotePath } from './words';
import './SharedNote.css';

interface ShareNoteProps {
  note: Note;
  /** the note on screen is saved (a copy of anything else would leave the last changes out) */
  saved: boolean;
  /** the note's module now (it may have changed since the server last answered) */
  moduleId: string | null;
  /** a shorter button, for phones */
  compact?: boolean;
}

export function ShareNote({ note, saved, moduleId, compact = false }: ShareNoteProps) {
  const [open, setOpen] = useState(false);
  const [credited, setCredited] = useState(note.share?.credited ?? true);
  const [stopping, setStopping] = useState(false);
  const share = useShareNote(note.id);
  const unshare = useUnshare();
  const { push } = useToast();
  const { getModule } = useModules();
  const module = getModule(moduleId);
  const name = module ? module.unitCode || module.shortName || module.name : 'the module';
  const copy = note.share;
  const behind = !!copy && !copy.upToDate;

  const onShare = () =>
    share.mutate(credited, {
      onSuccess: () => {
        setOpen(false);
        push({
          title: copy ? 'Shared copy updated' : `Shared with ${name}`,
          body: copy ? 'Students see the note as it is now.' : 'Students see a copy under the module’s notes.',
          tone: 'success',
        });
      },
    });

  const onStop = () => {
    if (!copy) return;
    unshare.mutate(
      { id: copy.id, noteId: note.id },
      {
        onSuccess: () => {
          setStopping(false);
          setOpen(false);
          push({ title: 'No longer shared', body: 'Your note is still here.', tone: 'info' });
        },
      },
    );
  };

  const label = copy ? (compact ? 'Shared' : `Shared with ${name}`) : compact ? 'Share' : 'Share with module';
  return (
    <>
      <Button
        size="sm"
        variant={copy ? 'ghost' : 'secondary'}
        leadingIcon={<Icon glyph={copy ? glyph.people : glyph.share} />}
        onClick={() => {
          share.reset();
          setCredited(copy?.credited ?? true);
          setOpen(true);
        }}
        className="nb-share-btn"
        data-hub="note-share"
      >
        {label}
        {behind ? <span className="nb-share-btn__dot" aria-label="(the shared copy is behind your note)" /> : null}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={copy ? `Shared with ${name}` : `Share with ${name}’s students`}
        footer={
          moduleId && !note.onPdf ? (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={share.isPending}>
                {copy ? 'Close' : 'Cancel'}
              </Button>
              <Button
                variant="primary"
                onClick={onShare}
                loading={share.isPending}
                disabled={!saved}
                data-hub="note-share-confirm"
              >
                {copy ? 'Update the shared copy' : 'Share'}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          )
        }
      >
        <div className="nb-share">
          {!moduleId ? (
            <p>Pick the module this note is about first: a note is shared with its module’s students.</p>
          ) : note.onPdf ? (
            <p>A note written over a PDF can’t be shared. Share a note on paper instead.</p>
          ) : (
            <>
              {copy ? (
                <p className="nb-share__state">
                  {copy.hidden ? (
                    <Badge tone="alert" size="sm">
                      Hidden by a student rep
                    </Badge>
                  ) : behind ? (
                    <Badge tone="warning" size="sm">
                      Behind your note
                    </Badge>
                  ) : (
                    <Badge tone="signal" size="sm">
                      Up to date
                    </Badge>
                  )}
                  <span>
                    Shared {timeAgo(copy.sharedAt)}
                    {copy.updatedAt !== copy.sharedAt ? `, updated ${timeAgo(copy.updatedAt)}` : ''}.
                  </span>
                </p>
              ) : null}
              <p>
                {copy
                  ? behind
                    ? 'You’ve changed the note since. Update the shared copy so students see the changes.'
                    : 'Students see your note as it is now. Later changes stay in your note until you update the copy.'
                  : `Everyone who opens ${module ? moduleLabel(module) : 'the module'} can read a copy of this note as it is now: its text, handwriting and pictures. Your other notes stay private, and later changes stay in your note until you update the copy.`}
              </p>
              {copy?.hidden ? <p>A student rep hid the copy from the module. Only you can see it now.</p> : null}
              <Switch
                checked={credited}
                onChange={setCredited}
                label="Show my name and year"
                description={credited ? 'Shown as “Shared by” you.' : 'Shown as shared by a student.'}
              />
              {!saved ? <p className="nb-share__wait">Saving your note first…</p> : null}
              {share.isError ? (
                <p className="nb-share__error" role="alert">
                  {errorMessage(share.error, 'It wasn’t shared. Try again.')}
                </p>
              ) : null}
              {copy ? (
                <div className="nb-share__more">
                  <Button
                    variant="ghost"
                    size="sm"
                    to={sharedNotePath(copy.id)}
                    leadingIcon={<Icon glyph={glyph.eye} />}
                  >
                    See the shared copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leadingIcon={<Icon glyph={glyph.close} />}
                    onClick={() => setStopping(true)}
                    className="nb-share__stop"
                    data-hub="note-unshare"
                  >
                    Stop sharing
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={stopping}
        title="Stop sharing this note?"
        body={
          <p>
            The copy goes from {name}’s notes. Your note stays as it is. You can share it again later.{' '}
            {copy ? <Link to={sharedNotePath(copy.id)}>See the copy</Link> : null}
          </p>
        }
        confirmLabel="Stop sharing"
        tone="danger"
        busy={unshare.isPending}
        error={unshare.isError ? errorMessage(unshare.error, 'It’s still shared. Try again.') : null}
        onConfirm={onStop}
        onClose={() => setStopping(false)}
      />
    </>
  );
}
