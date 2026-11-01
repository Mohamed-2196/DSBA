// The library has no page of its own: each module's page lists its files (a file's page is /library/<slug>). Its
// address opens Modules, keeping the query: ?upload=1 still opens the upload dialog (UploadHost), and ?year= the year.
import { Navigate, useLocation } from 'react-router-dom';

export function LibraryToModules() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/modules', search }} replace />;
}
