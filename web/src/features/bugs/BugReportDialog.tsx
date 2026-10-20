// "Report a bug": what happened, what they expected, and (signed in) a screenshot. The page, the app's version and
// the browser go with it, and the dialog says so. Guests can report too; the API limits how often.
import { useId, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { errorMessage, isApiError } from '../../api/errors';
import { UPLOAD_RULES, checkUpload, uploadErrorMessage, uploadFile } from '../../api/uploads';
import { useAuth } from '../../auth';
import { useToast } from '../../state';
import { Button, glyph, Icon, IconButton, Modal, TextArea } from '../../ui';
import { useReportBug } from './api';
import { browserOf, pageOf } from './context';
import { closeBugReport, useBugReportOpen } from './open';
import './BugReport.css';

const LIMIT = 2000;

interface Shot {
  file: File;
  preview: string;
}

function BugForm({
  id,
  page,
  onDone,
  onSending,
}: {
  id: string;
  page: string;
  onDone: () => void;
  onSending: (sending: boolean) => void;
}) {
  const uid = useId();
  const { status } = useAuth();
  const signedIn = status === 'signed-in';
  const { push } = useToast();
  const report = useReportBug();
  const [what, setWhat] = useState('');
  const [expected, setExpected] = useState('');
  const [shot, setShot] = useState<Shot | null>(null);
  const [errors, setErrors] = useState<{ what?: string; shot?: string; form?: string }>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const browser = browserOf(navigator.userAgent, window.innerWidth, window.innerHeight);

  const pick = (file: File | undefined) => {
    if (!file) return;
    const problem = checkUpload('bug_screenshot', file);
    if (problem) {
      setErrors((e) => ({ ...e, shot: problem }));
      return;
    }
    if (shot) URL.revokeObjectURL(shot.preview);
    setShot({ file, preview: URL.createObjectURL(file) });
    setErrors((e) => ({ ...e, shot: undefined }));
  };
  const dropShot = () => {
    if (shot) URL.revokeObjectURL(shot.preview);
    setShot(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!what.trim()) {
      setErrors({ what: 'Say what happened, in a sentence or two.' });
      return;
    }
    setErrors({});
    onSending(true);
    try {
      let screenshotUploadId: string | null = null;
      if (shot && signedIn) {
        try {
          screenshotUploadId = (await uploadFile('bug_screenshot', shot.file)).uploadId;
        } catch (err) {
          setErrors({ shot: uploadErrorMessage(err, 'bug_screenshot') });
          return;
        }
      }
      await report.mutateAsync({
        whatHappened: what.trim(),
        expected: expected.trim(),
        pageUrl: page,
        appVersion: __APP_VERSION__,
        browser,
        screenshotUploadId,
      });
      if (shot) URL.revokeObjectURL(shot.preview);
      push({
        tone: 'success',
        title: 'Thanks, your report is in',
        body: 'The people who build the Hub will look at it.',
      });
      onDone();
    } catch (err) {
      if (isApiError(err) && err.fields.whatHappened) setErrors({ what: err.fields.whatHappened });
      else setErrors({ form: errorMessage(err, 'Your report wasn’t sent. Try again in a moment.') });
    } finally {
      onSending(false);
    }
  };

  return (
    <form id={id} className="bug-form" onSubmit={(e) => void submit(e)} noValidate>
      <TextArea
        label="What happened?"
        value={what}
        onChange={(e) => setWhat(e.target.value)}
        maxLength={LIMIT}
        rows={4}
        required
        error={errors.what}
        placeholder="I pressed Download on a past paper and nothing opened."
        autoFocus
      />
      <TextArea
        label="What did you expect?"
        hint="Optional"
        value={expected}
        onChange={(e) => setExpected(e.target.value)}
        maxLength={LIMIT}
        rows={2}
        placeholder="The PDF to open in a new tab."
      />
      {signedIn ? (
        <div className="bug-form__shot">
          <span className="bug-form__label" id={`${uid}-shot`}>
            Screenshot <span className="bug-form__optional">Optional</span>
          </span>
          {shot ? (
            <div className="bug-form__preview">
              <img src={shot.preview} alt="Your screenshot" />
              <IconButton
                label="Remove the screenshot"
                icon={<Icon glyph={glyph.close} />}
                size="sm"
                onClick={dropShot}
              />
            </div>
          ) : (
            <Button
              leadingIcon={<Icon glyph={glyph.image} />}
              onClick={() => fileRef.current?.click()}
              aria-describedby={`${uid}-shot ${uid}-shot-hint`}
            >
              Add a screenshot
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={UPLOAD_RULES.bug_screenshot.accept}
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <p className="bug-form__hint" id={`${uid}-shot-hint`}>
            {UPLOAD_RULES.bug_screenshot.summary} Only admins see it.
          </p>
          {errors.shot ? (
            <p className="bug-form__error" role="alert">
              {errors.shot}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="bug-form__sent">
        <p className="bug-form__sent-title">Sent with your report</p>
        <dl>
          <dt>Page</dt>
          <dd className="u-code">{page}</dd>
          <dt>Version</dt>
          <dd className="u-code">{__APP_VERSION__}</dd>
          <dt>Browser</dt>
          <dd>{browser}</dd>
        </dl>
      </div>
      {errors.form ? (
        <p className="bug-form__error" role="alert">
          {errors.form}
        </p>
      ) : null}
    </form>
  );
}

/** Mounted once by the shell; opened with openBugReport(). */
export function BugReportDialog() {
  const open = useBugReportOpen();
  const location = useLocation();
  // The page it was opened on, kept while it's open.
  const [page, setPage] = useState(() => pageOf(location));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPage(pageOf(location));
  }
  const formId = useId();
  const [sending, setSending] = useState(false);
  return (
    <Modal
      open={open}
      onClose={sending ? () => undefined : closeBugReport}
      title="Report a bug"
      description="Tell us what went wrong. A sentence or two is enough."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={closeBugReport} disabled={sending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={sending}>
            Send report
          </Button>
        </>
      }
    >
      {open ? <BugForm key={page} id={formId} page={page} onDone={closeBugReport} onSending={setSending} /> : null}
    </Modal>
  );
}
