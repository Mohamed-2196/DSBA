// Rate my CV (feature career.cv): a student uploads their CV and picks a role; the API scores it out of 100 by rules
// (no AI) and says what to fix, and which of the role's skills the CV shows or misses, with the modules that teach
// them. Their CVs are kept for them alone: they open one, rate it for another role, or delete it. Any student can copy
// a message for an AI chat, which asks for their CV if they have one, interviews them and writes one by the same rules.
import { useMemo, useRef, useState } from 'react';
import type { CvCheck, CvReviewOut, ModuleSummary } from '../../api/types';
import { errorMessage } from '../../api/errors';
import { UPLOAD_RULES, uploadFile } from '../../api/uploads';
import { useAuth } from '../../auth';
import { copyText } from '../../lib/share';
import { formatDay } from '../../lib/dates';
import { useModules } from '../../state/modules';
import {
  Badge,
  Button,
  ConfirmDialog,
  glyph,
  Icon,
  IconButton,
  PageSection,
  Panel,
  ProgressRing,
  SectionHeader,
  Select,
  Skeleton,
  cx,
} from '../../ui';
import { cvFileUrl, useDeleteCv, useMyCvs, useRateCv, useRerateCv } from './api';
import { useCareerData } from './context';
import { CV_PROMPT } from './lib/cvPrompt';
import { ModuleLink } from './ModuleLink';
import './CvRater.css';

const RULES = UPLOAD_RULES.cv;

/** A word for the score, so the number reads the same to everyone. */
function verdict(score: number): { label: string; tone: 'signal' | 'cobalt' | 'neutral' } {
  if (score >= 80) return { label: 'Strong', tone: 'signal' };
  if (score >= 60) return { label: 'Good start', tone: 'cobalt' };
  return { label: 'Needs work', tone: 'neutral' };
}

const STATUS_ICON = { pass: glyph.check, warn: glyph.warning, fail: glyph.close } as const;
const STATUS_WORD = { pass: 'Passed', warn: 'Partly', fail: 'Missed' } as const;

function CheckRow({ check }: { check: CvCheck }) {
  return (
    <li className={cx('cv-check', `is-${check.status}`)} data-check-id={check.id}>
      <Icon glyph={STATUS_ICON[check.status]} className="cv-check__icon" />
      <div className="cv-check__body">
        <p className="cv-check__head">
          <span className="cv-check__title">{check.title}</span>
          <span className="cv-check__points">
            <span className="visually-hidden">{`${STATUS_WORD[check.status]}: `}</span>
            {check.earned}/{check.max}
          </span>
        </p>
        <p className="cv-check__found">{check.found}</p>
        {check.tip ? <p className="cv-check__tip">{check.tip}</p> : null}
      </div>
    </li>
  );
}

function Modules({ ids }: { ids: string[] }) {
  const { getModule } = useModules();
  const mods = ids.map((id) => getModule(id)).filter((m): m is ModuleSummary => m !== null);
  if (!mods.length) return null;
  return (
    <span className="cv-skill__mods">
      {mods.map((m) => (
        <ModuleLink key={m.id} module={m} />
      ))}
    </span>
  );
}

function Result({ cv }: { cv: CvReviewOut }) {
  const { roles } = useCareerData();
  const rerate = useRerateCv();
  const v = verdict(cv.score);
  // What to fix first: the checks that lost the most points.
  const checks = useMemo(() => [...cv.checks].sort((a, b) => b.max - b.earned - (a.max - a.earned)), [cv.checks]);
  return (
    <div className="cv-result" data-hub="cv-result">
      <Panel className="cv-score">
        <ProgressRing value={cv.score} size={104} stroke={8} showValue={false} label="CV score" />
        <div className="cv-score__text">
          <p className="cv-score__number">
            <strong>{cv.score}</strong> out of 100
          </p>
          <Badge tone={v.tone}>{v.label}</Badge>
          <p className="cv-score__meta">
            {cv.fileName} · {cv.pages} {cv.pages === 1 ? 'page' : 'pages'} · {cv.words} words
          </p>
        </div>
      </Panel>

      <Panel className="cv-fit" data-hub="cv-fit">
        <div className="cv-fit__head">
          <h3 className="cv-fit__title">
            Fit for {cv.fit.roleTitle}: <span className="cv-fit__percent">{cv.fit.percent}%</span>
          </h3>
          <Select
            label="Check it against another role"
            hideLabel
            value={cv.fit.roleId}
            options={roles.map((r) => ({ value: r.id, label: r.title }))}
            disabled={rerate.isPending}
            onChange={(e) => rerate.mutate({ id: cv.id, roleId: e.currentTarget.value })}
            data-hub="cv-rerate"
          />
        </div>
        {rerate.isError ? (
          <p className="cv-error" role="alert">
            {errorMessage(rerate.error)}
          </p>
        ) : null}
        <p className="cv-fit__lead">
          {cv.fit.found.length} of {cv.fit.found.length + cv.fit.missing.length} skills this role asks for show on your
          CV.
        </p>
        {cv.fit.found.length ? (
          <ul role="list" className="cv-fit__found" aria-label="Skills your CV shows">
            {cv.fit.found.map((s) => (
              <li key={s.id} className="cv-chip">
                <Icon glyph={glyph.check} size={14} />
                {s.name}
              </li>
            ))}
          </ul>
        ) : null}
        {cv.fit.missing.length ? (
          <>
            <h4 className="cv-fit__sub">Not on your CV yet</h4>
            <ul role="list" className="cv-fit__missing">
              {cv.fit.missing.map((s) => (
                <li key={s.id} className="cv-skill">
                  <span className="cv-skill__name">{s.name}</span>
                  <Modules ids={s.modules} />
                </li>
              ))}
            </ul>
            <p className="cv-note">
              If you’ve done one of these in a module or project, name it on your CV, with the tool you used.
            </p>
          </>
        ) : null}
      </Panel>

      <Panel className="cv-checks">
        <h3 className="cv-checks__title">What to fix</h3>
        <ul role="list" className="cv-checks__list">
          {checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function RolePicker({ roleId, onRole }: { roleId: string; onRole: (id: string) => void }) {
  const { roles } = useCareerData();
  return (
    <Select
      label="The role you’re aiming for"
      value={roleId}
      options={roles.map((r) => ({ value: r.id, label: r.title }))}
      onChange={(e) => onRole(e.currentTarget.value)}
    />
  );
}

/** A message to paste into any AI chat: it asks for the student's CV if they have one, interviews them, and writes
 * (or improves) a one-page CV by the rules this page checks. The same for every student. */
function AiCvHelp() {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <Panel tone="inset" className="cv-prompt" data-hub="cv-prompt">
      <h3 className="cv-prompt__title">Write or improve your CV with AI</h3>
      <p className="cv-prompt__text">
        Copy this message into any AI chat (ChatGPT, Claude, Gemini, Copilot). It asks for your CV if you have one, then
        asks you questions and writes a one-page CV that follows the rules this page checks.
      </p>
      <textarea
        className="cv-prompt__box"
        readOnly
        value={CV_PROMPT}
        rows={6}
        aria-label="The message to copy"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button
        variant="secondary"
        leadingIcon={<Icon glyph={copied ? glyph.check : glyph.copy} />}
        onClick={() => void copyText(CV_PROMPT).then(setCopied)}
        data-hub="cv-prompt-copy"
      >
        {copied ? 'Copied' : 'Copy the message'}
      </Button>
      <p className="cv-note" aria-live="polite">
        {copied === false
          ? 'Your browser didn’t let us copy it: select the text above and copy it yourself.'
          : 'Before you paste your CV into a chat, take out your phone number, address and CPR. Add them back afterwards.'}
      </p>
    </Panel>
  );
}

function Upload({
  roleId,
  onRole,
  onRated,
}: {
  roleId: string;
  onRole: (id: string) => void;
  onRated: (id: string) => void;
}) {
  const rate = useRateCv();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!file) return;
    setError(null);
    try {
      setStep('Uploading…');
      const up = await uploadFile('cv', file, {
        onProgress: (p) => setStep(`Uploading… ${Math.round((p.loaded / p.total) * 100)}%`),
        onChecking: () => setStep('Reading your CV…'),
      });
      const cv = await rate.mutateAsync({ uploadId: up.uploadId, roleId });
      setFile(null);
      if (input.current) input.current.value = '';
      onRated(cv.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStep(null);
    }
  };

  return (
    <Panel className="cv-upload" data-hub="cv-upload">
      <RolePicker roleId={roleId} onRole={onRole} />
      <div className="cv-upload__file">
        <input
          ref={input}
          id="cv-file"
          type="file"
          accept={RULES.accept}
          className="visually-hidden"
          onChange={(e) => {
            setError(null);
            setFile(e.currentTarget.files?.[0] ?? null);
          }}
          data-hub="cv-file"
        />
        <Button variant="secondary" leadingIcon={<Icon glyph={glyph.upload} />} onClick={() => input.current?.click()}>
          {file ? 'Choose another file' : 'Choose your CV'}
        </Button>
        <span className="cv-upload__name">{file ? file.name : RULES.summary}</span>
      </div>
      <Button
        variant="primary"
        disabled={!file || step !== null}
        loading={step !== null}
        onClick={() => void send()}
        data-hub="cv-rate"
      >
        Rate my CV
      </Button>
      <p className="cv-upload__status" aria-live="polite">
        {step}
      </p>
      {error ? (
        <p className="cv-error" role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}

function History({ cvs, shown, onShow }: { cvs: CvReviewOut[]; shown: string | null; onShow: (id: string) => void }) {
  const remove = useDeleteCv();
  const [deleting, setDeleting] = useState<CvReviewOut | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (cv: CvReviewOut) => {
    setError(null);
    setOpening(cv.id);
    try {
      window.open(await cvFileUrl(cv.id), '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOpening(null);
    }
  };

  return (
    <Panel className="cv-history" data-hub="cv-history">
      <h3 className="cv-history__title">Your CVs</h3>
      <p className="cv-note">Only you can see these. Delete one and its file goes too.</p>
      <ul role="list" className="cv-history__list">
        {cvs.map((cv) => (
          <li key={cv.id} className={cx('cv-row', shown === cv.id && 'is-shown')}>
            <button type="button" className="cv-row__main" aria-pressed={shown === cv.id} onClick={() => onShow(cv.id)}>
              <span className="cv-row__score">{cv.score}</span>
              <span className="cv-row__text">
                <span className="cv-row__name">{cv.fileName}</span>
                <span className="cv-row__meta">
                  {formatDay(new Date(cv.createdAt), { year: false })} · {cv.fit.roleTitle}
                </span>
              </span>
            </button>
            <IconButton
              label={`Open ${cv.fileName}`}
              icon={glyph.external}
              tooltip
              disabled={opening === cv.id}
              onClick={() => void open(cv)}
            />
            <IconButton label={`Delete ${cv.fileName}`} icon={glyph.trash} tooltip onClick={() => setDeleting(cv)} />
          </li>
        ))}
      </ul>
      {error ? (
        <p className="cv-error" role="alert">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.fileName ?? ''}”?`}
        body="The file and its rating are deleted for good."
        confirmLabel="Delete"
        tone="danger"
        busy={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : null}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
        onClose={() => {
          remove.reset();
          setDeleting(null);
        }}
      />
    </Panel>
  );
}

export function CvRater() {
  const { me, openSignIn } = useAuth();
  const { defaultRoleId } = useCareerData();
  const cvs = useMyCvs(!!me);
  const [roleId, setRoleId] = useState(defaultRoleId);
  const [shownId, setShownId] = useState<string | null>(null);
  const list = cvs.data ?? [];
  const shown = list.find((c) => c.id === shownId) ?? list[0] ?? null;

  return (
    <PageSection id="career-cv" aria-labelledby="career-cv-title" data-hub="career-cv">
      <SectionHeader
        id="career-cv-title"
        title="Rate my CV"
        description="Upload your CV and pick a role. You get a score out of 100, what to fix first, and the role’s skills your CV shows or misses. Rated by fixed rules on the Hub: no AI, and only you see your CVs."
      />
      {!me ? (
        <div className="cv-side">
          <Panel className="cv-signin">
            <p>Sign in to rate your CV. It’s kept for you alone, so you can compare it with the next version.</p>
            <Button variant="primary" onClick={() => openSignIn()}>
              Sign in
            </Button>
          </Panel>
          <AiCvHelp />
        </div>
      ) : (
        <div className="cv-layout">
          <div className="cv-side">
            <Upload roleId={roleId} onRole={setRoleId} onRated={setShownId} />
            {list.length ? <History cvs={list} shown={shown?.id ?? null} onShow={setShownId} /> : null}
            <AiCvHelp />
          </div>
          <div className="cv-main">
            {cvs.isPending ? (
              <Skeleton height={320} radius={16} />
            ) : shown ? (
              <Result cv={shown} />
            ) : (
              <Panel className="cv-empty">
                <Icon glyph={glyph.page} size={28} className="cv-empty__icon" />
                <p>Your rating shows here: the score, what to fix and how well your CV fits the role.</p>
              </Panel>
            )}
          </div>
        </div>
      )}
    </PageSection>
  );
}
