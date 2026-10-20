import { useLocation } from 'react-router-dom';
import { Button, glyph, Icon, Page, PageHeader } from '../../ui';
import { openCommandPalette } from '../search/public';
import './NotFoundPage.css';

export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <Page className="notfound">
      <PageHeader
        section="tools"
        leading={<p className="notfound__code">Error 404</p>}
        title="This page doesn’t exist"
        description={
          <>
            Nothing lives at <code>{pathname}</code>. The link may be old or mistyped. Search for what you need or go
            back home.
          </>
        }
        actions={
          <>
            <Button variant="primary" to="/" leadingIcon={<Icon glyph={glyph.home} />}>
              Go to Home
            </Button>
            <Button leadingIcon={<Icon glyph={glyph.search} />} onClick={() => openCommandPalette()}>
              Search everything
            </Button>
          </>
        }
      />
    </Page>
  );
}
