import { House, MagnifyingGlass } from '@phosphor-icons/react';
import { useLocation } from 'react-router-dom';
import { Button, Page } from '../../ui';
import { openCommandPalette } from '../search/public';
import './NotFoundPage.css';

export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <Page>
      <div className="notfound">
        <p className="notfound__code u-code" aria-hidden="true">
          404
        </p>
        <h1 className="notfound__title">This page doesn’t exist</h1>
        <p className="notfound__body">
          Nothing lives at <code>{pathname}</code>. The link may be old or mistyped. Search for what you need or go back home.
        </p>
        <div className="notfound__actions">
          <Button variant="primary" to="/" leadingIcon={House}>
            Go to Home
          </Button>
          <Button leadingIcon={MagnifyingGlass} onClick={() => openCommandPalette()}>
            Search everything
          </Button>
        </div>
      </div>
    </Page>
  );
}
