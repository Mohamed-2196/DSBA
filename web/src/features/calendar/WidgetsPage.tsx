// /calendar/widgets: Add a widget. The Hub has no app of its own, so its widgets come through apps students already
// have. First the calendar feed (any phone's own calendar widget), then the widget feed (a private JSON link,
// api/app/services/widget.py) read by Scriptable on iPhone and iPad, by iPhone widgets on a Mac's desktop, and by KWGT
// on Android: the free apps that can draw a widget from a link (checked 8 Nov 2026).
import { useState } from 'react';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { copyText } from '../../lib/share';
import { useCopyLink } from '../../lib/useCopyLink';
import { useToast } from '../../state';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  Page,
  PageHeader,
  PageSection,
  Panel,
  SectionHeader,
  SegmentedControl,
  TextField,
  glyph,
} from '../../ui';
import { privateFeedUrl, useWidgetFeed } from './api';
import { SubscribeDialog } from './SubscribeDialog';
import { useMyCalendar } from './useMyCalendar';
import { KWGT_LINES, SCRIPTABLE_SCRIPT, kwgtFormula } from './widgetScript';
import './WidgetsPage.css';

type Device = 'apple' | 'mac' | 'android';

const SCRIPTABLE = 'https://apps.apple.com/app/scriptable/id1405459188';
const KWGT = 'https://play.google.com/store/apps/details?id=org.kustom.widget';
const ICSX5 = 'https://icsx5.bitfire.at/';

export default function WidgetsPage() {
  const my = useMyCalendar();
  const [subscribing, setSubscribing] = useState(false);
  return (
    <Page className="widgets-page">
      <PageHeader
        section="calendar"
        title="Add a widget"
        description="Your dates on your phone’s home screen, through apps you already have."
        actions={
          <Button to="/calendar" leadingIcon={<Icon glyph={glyph.back} />}>
            Calendar
          </Button>
        }
      />
      <div className="widgets-page__routes">
        <PageSection aria-labelledby="widgets-calendar">
          <SectionHeader
            id="widgets-calendar"
            title="Your calendar app’s widget"
            description="The simplest way. Works on every phone, tablet and Mac, with nothing new to install."
          />
          <Panel className="widgets-page__panel">
            <ol className="widgets-page__steps">
              <li>
                Subscribe to your calendar from the Hub. Your exams, your year’s dates and your own events go into your
                calendar app, and stay up to date there.
                <div className="widgets-page__action">
                  <Button
                    variant="primary"
                    leadingIcon={<Icon glyph={glyph.calendarAdd} />}
                    onClick={() => setSubscribing(true)}
                    data-hub="widgets-subscribe"
                  >
                    Subscribe to the calendar
                  </Button>
                </div>
              </li>
              <li>
                Add your calendar app’s widget to your home screen.
                <ul role="list" className="widgets-page__how">
                  <li>
                    <b>iPhone and iPad:</b> the Calendar widget.
                  </li>
                  <li>
                    <b>Android:</b> Google Calendar’s widget (Google keeps a copy of your link), or the widget of the
                    free{' '}
                    <a href={ICSX5} target="_blank" rel="noreferrer">
                      ICSx⁵
                    </a>{' '}
                    app, which keeps it on your phone.
                  </li>
                  <li>
                    <b>Mac:</b> the Calendar widget. Right-click the desktop and choose <i>Edit Widgets</i>.
                  </li>
                </ul>
              </li>
            </ol>
          </Panel>
        </PageSection>
        <PageSection aria-labelledby="widgets-hub">
          <SectionHeader
            id="widgets-hub"
            title="A Hub widget"
            description="Your next exam, today and the lesson to carry on with, in a free widget app."
          />
          {my.signedIn ? <HubWidget /> : <SignInFirst />}
        </PageSection>
      </div>
      <SubscribeDialog open={subscribing} year={null} my={my} fromWidgets onClose={() => setSubscribing(false)} />
    </Page>
  );
}

function SignInFirst() {
  const { openSignIn } = useAuth();
  return (
    <EmptyState
      icon={<Icon glyph={glyph.mobile} />}
      title="Sign in to make your widget link"
      body="The widget shows your own exams, events and lessons, so it needs a link of your own."
      action={
        <Button variant="primary" onClick={() => openSignIn()}>
          Sign in
        </Button>
      }
    />
  );
}

function HubWidget() {
  const my = useMyCalendar();
  const feed = useWidgetFeed();
  const copyLink = useCopyLink();
  const { push } = useToast();
  const [device, setDevice] = useState<Device>('apple');
  const [confirming, setConfirming] = useState<'new' | 'off' | null>(null);
  const path = my.prefs?.widgetPath ?? null;
  const url = path ? privateFeedUrl(path) : null;
  const failed = 'Your widget link didn’t change. Try again.';

  const copyScript = async () => {
    if (await copyText(SCRIPTABLE_SCRIPT))
      push({ tone: 'success', title: 'Script copied', body: 'Paste it into a new script in Scriptable.' });
    else
      push({
        tone: 'alert',
        title: 'Couldn’t copy the script',
        body: 'Try again, or open Show the script and copy it.',
      });
  };

  const replace = (action: 'new' | 'off') =>
    feed.mutate(action, {
      onSuccess: () => {
        setConfirming(null);
        push(
          action === 'new'
            ? {
                tone: 'success',
                title: 'New widget link made',
                body: 'Paste it into your widget: the old one stopped.',
              }
            : { tone: 'success', title: 'Your widget link is off', body: 'Widgets that used it show an error now.' },
        );
      },
    });

  if (my.loading) return <Panel className="widgets-page__panel" aria-busy="true" />;

  return (
    <Panel className="widgets-page__panel">
      <div className="widgets-page__link" data-hub="widgets-link">
        {url ? (
          <>
            <TextField
              label="Your widget link"
              value={url}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              trailing={
                <Button
                  size="sm"
                  variant="ghost"
                  leadingIcon={<Icon glyph={glyph.copy} />}
                  onClick={() => void copyLink(url, 'Paste it into your widget. Keep it to yourself.')}
                >
                  Copy
                </Button>
              }
              hint="It shows your exams, today’s events and your lessons to anyone who has it: keep it to yourself."
            />
            <div className="widgets-page__manage">
              <Button size="sm" variant="ghost" onClick={() => setConfirming('new')} data-hub="widgets-rotate">
                Make a new link
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming('off')} data-hub="widgets-off">
                Turn the link off
              </Button>
            </div>
          </>
        ) : (
          <div className="widgets-page__make">
            <p>First, make your widget link. Your calendar link stays as it is.</p>
            <Button
              variant="primary"
              leadingIcon={<Icon glyph={glyph.key} />}
              loading={feed.isPending}
              onClick={() => feed.mutate('new')}
              data-hub="widgets-new"
            >
              Make my widget link
            </Button>
          </div>
        )}
        {feed.isError && !confirming ? (
          <p className="cal-form__error" role="alert">
            {errorMessage(feed.error, failed)}
          </p>
        ) : null}
      </div>

      <SegmentedControl
        className="widgets-page__devices"
        label="Your device"
        size="sm"
        value={device}
        onChange={(v) => setDevice(v === 'mac' || v === 'android' ? v : 'apple')}
        options={[
          { value: 'apple', label: 'iPhone and iPad' },
          { value: 'mac', label: 'Mac' },
          { value: 'android', label: 'Android' },
        ]}
      />

      {device === 'apple' ? (
        <div className="widgets-page__device" data-hub="widgets-apple">
          <ol className="widgets-page__steps">
            <li>
              Get Scriptable, free from the App Store.
              <div className="widgets-page__action">
                <Button
                  href={SCRIPTABLE}
                  trailingIcon={<Icon glyph={glyph.external} />}
                  data-hub="widgets-get-scriptable"
                >
                  Get Scriptable
                </Button>
              </div>
            </li>
            <li>
              Copy the Hub’s script. In Scriptable, tap <b>+</b>, paste it, and name it <i>DSBA Hub</i>.
              <div className="widgets-page__action">
                <Button
                  leadingIcon={<Icon glyph={glyph.copy} />}
                  onClick={() => void copyScript()}
                  data-hub="widgets-script"
                >
                  Copy the script
                </Button>
              </div>
              <details className="widgets-page__script">
                <summary>Show the script</summary>
                <textarea
                  readOnly
                  aria-label="The Hub’s script for Scriptable"
                  value={SCRIPTABLE_SCRIPT}
                  rows={10}
                  spellCheck={false}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </details>
            </li>
            <li>
              On your home screen, add a Scriptable widget, small or medium. Hold it, tap <i>Edit Widget</i>, choose{' '}
              <i>DSBA Hub</i> as the Script, and paste your widget link as the Parameter.
            </li>
          </ol>
          <p className="widgets-page__note">
            Scriptable hasn’t had an update since September 2024. If a new iOS stops it, your calendar’s widget still
            works.
          </p>
        </div>
      ) : device === 'mac' ? (
        <div className="widgets-page__device" data-hub="widgets-mac">
          <ol className="widgets-page__steps">
            <li>Set up the widget on your iPhone first.</li>
            <li>
              On your Mac (macOS Sonoma or later), open System Settings, Desktop &amp; Dock, and turn on{' '}
              <i>Use iPhone widgets</i>.
            </li>
            <li>
              Right-click the desktop, choose <i>Edit Widgets</i>, and add Scriptable’s widget from your iPhone’s list.
            </li>
          </ol>
          <p className="widgets-page__note">
            Your iPhone needs to be nearby or on the same Wi-Fi. No iPhone? Your Mac’s Calendar widget shows your
            calendar.
          </p>
        </div>
      ) : (
        <div className="widgets-page__device" data-hub="widgets-android">
          <ol className="widgets-page__steps">
            <li>
              Get KWGT, free from Google Play. It shows ads; you don’t need to buy anything for this.
              <div className="widgets-page__action">
                <Button href={KWGT} trailingIcon={<Icon glyph={glyph.external} />} data-hub="widgets-get-kwgt">
                  Get KWGT
                </Button>
              </div>
            </li>
            <li>
              On your home screen, add a KWGT widget, tap it, and choose <i>Create</i>.
            </li>
            <li>
              Add a <i>Text</i> item for each line you want, and paste its formula as the text.
              {url ? (
                <ul role="list" className="widgets-page__formulas">
                  {KWGT_LINES.map((line) => (
                    <li key={line.path}>
                      <span>{line.label}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        leadingIcon={<Icon glyph={glyph.copy} />}
                        onClick={() =>
                          void copyLink(kwgtFormula(url, line.path), 'Paste it as the text. It holds your link.')
                        }
                      >
                        Copy formula
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="widgets-page__note">Make your widget link first: each formula holds it.</p>
              )}
            </li>
          </ol>
          <p className="widgets-page__note">
            The formulas hold your link: keep them to yourself. Your calendar’s widget is simpler and has no ads.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={!!confirming}
        title={confirming === 'off' ? 'Turn your widget link off?' : 'Make a new widget link?'}
        body={
          <p>
            {confirming === 'off'
              ? 'Widgets that use it stop showing your day. Your calendar link stays as it is.'
              : 'Your current widget link stops working. Paste the new one into your widget.'}
          </p>
        }
        confirmLabel={confirming === 'off' ? 'Turn it off' : 'Make a new link'}
        tone="danger"
        busy={feed.isPending}
        error={feed.isError ? errorMessage(feed.error, failed) : null}
        onConfirm={() => {
          if (confirming) replace(confirming);
        }}
        onClose={() => {
          setConfirming(null);
          feed.reset();
        }}
      />
    </Panel>
  );
}
