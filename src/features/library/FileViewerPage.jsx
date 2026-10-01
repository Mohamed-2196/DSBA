import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowSquareOut, CaretDown, CaretLeft, CaretRight, Check, DownloadSimple, FileMagnifyingGlass, Info, LinkSimple,
  MagnifyingGlassMinus, MagnifyingGlassPlus, SidebarSimple,
} from '@phosphor-icons/react';
import { Badge, Button, EmptyState, IconButton, Menu, Page, Panel, cx } from '../../ui';
import { BREAKPOINTS, useDocumentTitle, useMediaQuery, useToast } from '../../state';
import { getModule } from '../../data/modules.js';
import { getFile, getRelatedFiles } from './data/catalog.js';
import { FORMATS, KIND_BY_ID, formatSize, pageNoun, pageSizeFor } from './data/kinds.js';
import { useStarred } from './data/useStarred.js';
import { DocPage } from './doc/DocPage.jsx';
import { StarButton } from './components/StarButton.jsx';
import { MetaPanel } from './viewer/MetaPanel.jsx';
import { PageRail } from './viewer/PageRail.jsx';
import { useDocScroll } from './viewer/useDocScroll.js';
import './FileViewerPage.css';

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const ZOOM_MODES = { auto: 'Automatic', width: 'Fit width', page: 'Fit page' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const isTyping = (t) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function FileViewerPage() {
  const { fileId } = useParams();
  const file = getFile(fileId);
  useDocumentTitle(file ? file.title : 'File not found');
  if (!file) {
    return (
      <Page>
        <Panel padding="none">
          <EmptyState
            icon={FileMagnifyingGlass}
            title="We couldn’t find that file"
            body="It may have been renamed or moved. Search the library for it instead."
            action={<Button variant="primary" to="/library">Open the library</Button>}
          />
        </Panel>
      </Page>
    );
  }
  return <Viewer key={file.id} file={file} />;
}

/** Page number field: shows the current page, type a number and press Enter to jump. */
function PageField({ current, count, noun, onGo }) {
  const [draft, setDraft] = useState(null);
  return (
    <span className="lib-pagefield">
      <span className="lib-pagefield__noun">{cap(noun)}</span>
      <input
        className="lib-pagefield__input"
        aria-label={`${cap(noun)} number, ${current + 1} of ${count}`}
        inputMode="numeric"
        value={draft ?? String(current + 1)}
        style={{ width: `${String(count).length + 2}ch` }}
        onFocus={(e) => {
          setDraft(String(current + 1));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const n = Number.parseInt(draft, 10);
            if (n) onGo(n - 1);
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <span className="lib-pagefield__of">of {count}</span>
    </span>
  );
}

function Viewer({ file }) {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const isDesktop = useMediaQuery(BREAKPOINTS.desktop);
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const wide = useMediaQuery('(min-width: 1280px)');
  const { isStarred, toggle } = useStarred();

  const backTo = location.state?.from || '/library';
  const linkState = useMemo(() => ({ from: backTo }), [backTo]);
  const module = getModule(file.moduleId);
  const kind = KIND_BY_ID[file.kind];
  const related = useMemo(() => getRelatedFiles(file, 5), [file]);
  const size = pageSizeFor(file.format);
  const noun = pageNoun(file.format, 1);
  const count = file.pages;

  // ── Layout and zoom ─────────────────────────────────────────────────
  const canvasRef = useRef(null);
  const pagesRef = useRef(null);
  const [canvas, setCanvas] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState('auto');
  const [railOpen, setRailOpen] = useState(true);
  const [metaPref, setMetaPref] = useState(null);
  const metaOpen = isDesktop ? metaPref ?? wide : true;

  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const update = () => setCanvas((c) => (c.w === el.clientWidth && c.h === el.clientHeight ? c : { w: el.clientWidth, h: el.clientHeight }));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isDesktop]);

  const pad = isDesktop ? 32 : 12;
  const gap = isDesktop ? 24 : 12;
  const viewH = isDesktop ? canvas.h : (typeof window === 'undefined' ? 800 : window.innerHeight) - 170;
  const fitWidth = Math.max(160, canvas.w - pad * 2) / size.w;
  const fitPage = Math.min(fitWidth, Math.max(160, viewH - pad * 2) / size.h);
  const raw = zoom === 'auto' ? Math.min(1, fitWidth) : zoom === 'width' ? fitWidth : zoom === 'page' ? fitPage : zoom;
  const scale = canvas.w ? Math.max(0.2, Math.min(3, raw)) : 1;
  const pageW = Math.round(size.w * scale);
  const pageH = Math.round(size.h * scale);
  const stickyOffset = (isMobile ? 56 : 64) + 56;

  const { current, first, last, scrollToPage } = useDocScroll({
    canvasRef, pagesRef, count, pageH, gap, pad, internal: isDesktop, stickyOffset, scale,
  });

  // Rapid key presses count from where we're heading, not where the smooth scroll has got to.
  const target = useRef({ page: 0, t: 0 });
  const goTo = useCallback(
    (i) => {
      const p = Math.max(0, Math.min(count - 1, i));
      target.current = { page: p, t: Date.now() };
      scrollToPage(p);
    },
    [count, scrollToPage],
  );
  const step = useCallback(
    (d) => {
      const base = Date.now() - target.current.t < 700 ? target.current.page : current;
      goTo(base + d);
    },
    [current, goTo],
  );
  const zoomBy = useCallback(
    (dir) => {
      const next = dir > 0 ? ZOOM_STEPS.find((z) => z > scale + 0.005) : [...ZOOM_STEPS].reverse().find((z) => z < scale - 0.005);
      if (next) setZoom(next);
    },
    [scale],
  );

  // ── Actions ─────────────────────────────────────────────────────────
  const download = () => {
    toast.push({
      title: 'Download started',
      body: `${file.fileName}, ${formatSize(file.sizeKB)}`,
      tone: 'success',
    });
  };
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${file.url}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.push({ title: 'Link copied', body: 'Anyone with DSBA Pulse can open this file with it.', tone: 'success' });
    } catch {
      toast.push({ title: 'Couldn’t copy the link', body: url, tone: 'alert' });
    }
  };

  // ── Keyboard: arrows turn pages, + and − zoom, Esc goes back ─────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          step(1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          step(-1);
          break;
        case 'Home':
          goTo(0);
          break;
        case 'End':
          goTo(count - 1);
          break;
        case '+':
        case '=':
          zoomBy(1);
          break;
        case '-':
        case '_':
          zoomBy(-1);
          break;
        case '0':
          setZoom('auto');
          break;
        case 'Escape':
          navigate(backTo);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, goTo, zoomBy, count, navigate, backTo]);

  const zoomItems = [
    ...Object.entries(ZOOM_MODES).map(([id, label]) => ({ id, label, icon: zoom === id ? Check : <span className="lib-tb__blank" />, onSelect: () => setZoom(id) })),
    { divider: true },
    ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => ({ id: String(z), label: `${Math.round(z * 100)}%`, icon: zoom === z ? Check : <span className="lib-tb__blank" />, onSelect: () => setZoom(z) })),
  ];

  const renderFrom = Math.min(first, current) - 1;
  const renderTo = Math.max(last, current) + 1;

  return (
    <div className={cx('lib-viewer', isDesktop ? 'is-app' : 'is-stacked')} data-pulse="file-viewer">
      <header className="lib-viewer__head">
        <nav aria-label="Breadcrumb" className="lib-crumbs">
          <ol>
            <li>
              <Link to={backTo} className="lib-crumbs__back">
                <CaretLeft aria-hidden="true" weight="bold" />
                Library
              </Link>
            </li>
            <li>
              <Link to={`/library?module=${module.id}`}>
                {module.unitCode ? <strong className="u-tabular">{module.unitCode}</strong> : null} {module.unitCode ? module.shortName : module.name}
              </Link>
            </li>
            <li>
              <Link to={`/library?module=${module.id}&type=${file.kind}`}>{kind.plural}</Link>
            </li>
          </ol>
        </nav>
        <div className="lib-viewer__titlerow">
          <h1 className="lib-viewer__title">{file.title}</h1>
          <span className="lib-viewer__badges">
            <Badge tone="outline">{FORMATS[file.format].ext.toUpperCase()}</Badge>
            {file.isNew ? <Badge tone="highlight">New</Badge> : null}
          </span>
        </div>
      </header>

      <div className="lib-viewer__toolbar" role="toolbar" aria-label="Document" data-pulse="file-toolbar">
        <div className="lib-tb__group">
          {isDesktop ? (
            <>
              <IconButton label={railOpen ? 'Hide page thumbnails' : 'Show page thumbnails'} icon={SidebarSimple} toggle active={railOpen} onClick={() => setRailOpen((o) => !o)} tooltip />
              <span className="lib-tb__sep" aria-hidden="true" />
            </>
          ) : null}
          <IconButton label={`Previous ${noun}`} icon={CaretLeft} onClick={() => step(-1)} disabled={current === 0} tooltip={isDesktop} />
          <PageField current={current} count={count} noun={noun} onGo={goTo} />
          <IconButton label={`Next ${noun}`} icon={CaretRight} onClick={() => step(1)} disabled={current === count - 1} tooltip={isDesktop} />
        </div>

        <div className="lib-tb__group lib-tb__zoom">
          <IconButton label="Zoom out" icon={MagnifyingGlassMinus} onClick={() => zoomBy(-1)} disabled={scale <= ZOOM_STEPS[0] + 0.005} tooltip />
          <Menu
            label="Zoom"
            align="start"
            items={zoomItems}
            trigger={
              <Button variant="ghost" size="sm" trailingIcon={CaretDown} className="lib-tb__zoomvalue" aria-label={`Zoom, ${Math.round(scale * 100)}%`}>
                <span className="u-tabular">{Math.round(scale * 100)}%</span>
              </Button>
            }
          />
          <IconButton label="Zoom in" icon={MagnifyingGlassPlus} onClick={() => zoomBy(1)} disabled={scale >= ZOOM_STEPS[ZOOM_STEPS.length - 1] - 0.005} tooltip />
        </div>

        <div className="lib-tb__group lib-tb__actions">
          <StarButton on={isStarred(file.id)} onToggle={() => toggle(file.id)} title={file.title} size="md" tooltip={isDesktop} />
          <IconButton label="Copy link" icon={LinkSimple} onClick={copyLink} tooltip={isDesktop} className="lib-tb__copy" />
          {isMobile ? (
            <IconButton label={`Download ${file.fileName}`} icon={DownloadSimple} onClick={download} />
          ) : (
            <Button variant="ghost" leadingIcon={DownloadSimple} onClick={download} className="lib-tb__download">Download</Button>
          )}
          <Button variant="secondary" size={isMobile ? 'sm' : 'md'} trailingIcon={ArrowSquareOut} href={file.sourceUrl} className="lib-tb__original">
            {isMobile ? 'Original' : 'Open original'}
          </Button>
          {isDesktop ? (
            <>
              <span className="lib-tb__sep" aria-hidden="true" />
              <IconButton label={metaOpen ? 'Hide details' : 'Show details'} icon={Info} toggle active={metaOpen} onClick={() => setMetaPref(!metaOpen)} tooltip tooltipSide="bottom" />
            </>
          ) : null}
        </div>
      </div>

      <div className={cx('lib-viewer__body', isDesktop && railOpen && 'has-rail', isDesktop && metaOpen && 'has-meta')}>
        {isDesktop && railOpen ? <PageRail file={file} current={current} onSelect={goTo} /> : null}
        <div
          ref={canvasRef}
          className="lib-viewer__canvas"
          role="region"
          aria-label={`${file.title}, ${count} ${pageNoun(file.format, count)}`}
          tabIndex={isDesktop ? 0 : undefined}
        >
          <div ref={pagesRef} className="lib-viewer__pages" style={{ padding: pad, gap }}>
            {Array.from({ length: count }, (_, i) => (
              <section
                key={i}
                className={cx('lib-viewer__page', i === current && 'is-current')}
                style={{ width: pageW, height: pageH }}
                aria-label={`${cap(noun)} ${i + 1} of ${count}`}
                data-pulse="file-page"
              >
                <div className="lib-viewer__paper" data-theme="light">
                  {i >= renderFrom && i <= renderTo ? (
                    <div className="lib-viewer__sheet" style={{ transform: `scale(${scale})` }}>
                      <DocPage file={file} index={i} />
                    </div>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </div>
        {metaOpen ? <MetaPanel id="lib-file-meta" file={file} related={related} linkState={linkState} className={isDesktop ? undefined : 'lib-meta--stacked'} /> : null}
      </div>
    </div>
  );
}
