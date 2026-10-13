// "Upload a file" from anywhere in the shell (decision D6: Contribute means upload). Guests sign in first; then the
// library opens its upload dialog (LibraryPage reads ?upload=1). It shows only while uploading can work (showsUpload).
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { showsUpload, useAuth } from '../auth';

export const UPLOAD_PATH = '/library?upload=1';
export const UPLOAD_REASON = 'Sign in to upload a file';

/** "Upload a file" belongs in the shell right now. */
export function useUploadShown(): boolean {
  const { featureOn, mayTry } = useAuth();
  return showsUpload(featureOn, mayTry);
}

/** Start an upload: true when it went ahead now, false when sign-in opened first (it carries on after). */
export function useStartUpload(): () => boolean {
  const navigate = useNavigate();
  const { requireAuth } = useAuth();
  return useCallback(() => {
    const go = () => navigate(UPLOAD_PATH);
    if (!requireAuth(UPLOAD_REASON, go)) return false;
    go();
    return true;
  }, [navigate, requireAuth]);
}
