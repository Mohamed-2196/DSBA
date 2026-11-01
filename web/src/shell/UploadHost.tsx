// The upload dialog for the whole shell (upload.ts): opens each time openUpload() is called, or when the address has
// ?upload=1 (which it then takes out). On a module's page the module is chosen for the upload. Loaded after the page,
// with the library's code.
import { useEffect, useRef } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useModules } from '../state/modules';
import { useLibraryUpload } from '../features/library/public';
import { useUploadAsked } from './upload';

export default function UploadHost() {
  const { status } = useAuth();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const { getModule } = useModules();
  const m = getModule(matchPath('/modules/:moduleId/*', pathname)?.params.moduleId ?? null);
  const { start, dialog } = useLibraryUpload({ moduleId: m?.id ?? null, year: m?.year ?? null });
  const asked = useUploadAsked();
  // Starts at 0: a click before this loaded still opens the dialog.
  const answered = useRef(0);

  useEffect(() => {
    if (asked === answered.current || status === 'loading') return;
    answered.current = asked;
    start?.();
  }, [asked, status, start]);

  const linked = new URLSearchParams(search).get('upload') === '1';
  useEffect(() => {
    if (!linked || status === 'loading') return;
    const params = new URLSearchParams(search);
    params.delete('upload');
    const rest = params.toString();
    navigate({ pathname, search: rest ? `?${rest}` : '', hash }, { replace: true });
    start?.();
  }, [linked, status, search, pathname, hash, navigate, start]);

  return dialog;
}
