import { ArrowSquareOut, DownloadSimple, FilePdf, MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button, HubMark, cx } from '../../../ui';
import { downloadHref, openLinkHref, useFileLink } from '../api';
import { FileThumb } from '../components/FileThumb';
import { linkHost, linkPlace } from '../display';
import { formatOf, formatSize, previewKind } from '../kinds';
import type { LibraryItem } from '../types';

/** Which app opens a format, for "Download it to open it in …". */
function opensIn(tag: string | undefined): string {
  switch (tag) {
    case 'DOC':
    case 'DOCX':
      return 'Word or Google Docs';
    case 'XLS':
    case 'XLSX':
      return 'Excel or Google Sheets';
    case 'PPT':
    case 'PPTX':
      return 'PowerPoint or Google Slides';
    case 'IPYNB':
      return 'Jupyter, VS Code or Google Colab';
    case 'R':
      return 'RStudio';
    default:
      return 'the app it was made with';
  }
}

function Loading({ label }: { label: string }) {
  return (
    <div className="lib-preview__loading" role="status">
      <HubMark size={18} animate="loop" tone="current" />
      <span>{label}</span>
    </div>
  );
}

/** Files the browser can't show, and links: the cover, what it is, and the way to open it. */
function NoPreview({ item, problem }: { item: LibraryItem; problem?: boolean }) {
  const fmt = formatOf(item);
  if (item.source === 'link') {
    const place = linkPlace(item);
    const host = linkHost(item.url);
    return (
      <div className="lib-nopreview" data-hub="file-nopreview">
        <FileThumb item={item} size="grid" />
        <div className="lib-nopreview__text">
          <h2 className="lib-nopreview__title">Kept on {place}</h2>
          <p>
            This one lives on {place}, where it was shared before the Hub had its own library.
            {place === 'Google Drive' ? ' Google may ask you to sign in.' : ''}
          </p>
          <Button variant="primary" href={openLinkHref(item)} trailingIcon={ArrowSquareOut}>
            Open in {place}
          </Button>
          {host ? (
            <p className="lib-nopreview__note">
              <ArrowSquareOut aria-hidden="true" /> Opens {host} in a new tab
            </p>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="lib-nopreview" data-hub="file-nopreview">
      <FileThumb item={item} size="grid" />
      <div className="lib-nopreview__text">
        <h2 className="lib-nopreview__title">{problem ? 'The preview didn’t load' : `No preview for ${fmt ? `${fmt.name}s` : 'this file'}`}</h2>
        <p>{problem ? 'You can still download the file.' : `Download it to open it in ${opensIn(fmt?.tag)}.`}</p>
        <Button variant="primary" href={downloadHref(item)} leadingIcon={DownloadSimple}>
          Download{item.sizeBytes ? ` (${[fmt?.tag, formatSize(item.sizeBytes)].filter(Boolean).join(', ')})` : ''}
        </Button>
      </div>
    </div>
  );
}

/** An image at its own size or fitted to the space (click to switch). */
function ImagePreview({ item, src }: { item: LibraryItem; src: string }) {
  const [actual, setActual] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cx('lib-preview__image-wrap', actual && 'is-actual')}>
      {!loaded ? <Loading label="Loading the image" /> : null}
      <button
        type="button"
        className="lib-preview__image-button"
        onClick={() => setActual((a) => !a)}
        aria-label={actual ? 'Fit the image to the window' : 'Show the image at full size'}
      >
        <img
          className={cx('lib-preview__image', loaded && 'is-loaded')}
          src={src}
          alt={item.description || item.title}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          draggable={false}
        />
      </button>
      {loaded ? (
        <span className="lib-preview__zoomhint" aria-hidden="true">
          {actual ? <MagnifyingGlassMinus /> : <MagnifyingGlassPlus />}
          {actual ? 'Click to fit' : 'Click for full size'}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The file itself: PDFs in the browser's PDF viewer and images as they are, both from a short-lived link
 * (GET /library/items/{id}/file); on phones a PDF opens in a new tab instead. Other formats and links show
 * a card with Download or Open.
 */
export function Preview({ item, compact }: { item: LibraryItem; compact: boolean }) {
  const removed = item.status === 'removed';
  const kind = removed ? null : previewKind(item);
  const link = useFileLink(kind ? item.id : null);
  // The viewer keeps the first link it was given: a refreshed one would reload it (and lose the page).
  const [src, setSrc] = useState<string | null>(null);
  if (!src && link.data) setSrc(link.data.url);

  if (removed) {
    // The file left storage when it was removed: nothing to show or download.
    return (
      <div className="lib-nopreview" data-hub="file-nopreview">
        <FileThumb item={item} size="grid" />
        <div className="lib-nopreview__text">
          <h2 className="lib-nopreview__title">This file was removed</h2>
          <p>It’s no longer in the library, and its file has been deleted.</p>
        </div>
      </div>
    );
  }
  if (!kind) return <NoPreview item={item} />;
  if (link.isError && !src) return <NoPreview item={item} problem />;
  if (!src) return <Loading label={kind === 'pdf' ? 'Loading the PDF' : 'Loading the image'} />;

  if (kind === 'image') return <ImagePreview item={item} src={src} />;

  if (compact) {
    // Phone browsers show one page of a PDF in a frame, or nothing: open it in their own viewer instead.
    return (
      <div className="lib-nopreview" data-hub="file-nopreview">
        <FileThumb item={item} size="strip" />
        <div className="lib-nopreview__text">
          <h2 className="lib-nopreview__title">Read the PDF</h2>
          <p>It opens in your phone’s PDF viewer, in a new tab.</p>
          <Button variant="primary" href={link.data?.url ?? src} external leadingIcon={FilePdf}>
            Open the PDF
          </Button>
          <Button variant="ghost" href={downloadHref(item)} leadingIcon={DownloadSimple}>
            Download ({formatSize(item.sizeBytes)})
          </Button>
        </div>
      </div>
    );
  }

  return <iframe className="lib-preview__frame" src={src} title={`${item.title} (PDF)`} referrerPolicy="no-referrer" data-hub="file-preview" />;
}
