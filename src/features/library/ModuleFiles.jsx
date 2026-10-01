// Module page "Files" tab (loaded on demand by public.js). Placeholder while the viewer is built.
import { Files } from '@phosphor-icons/react';
import { Button, EmptyState, Panel } from '../../ui';
import { getFilesForModule } from './data/catalog.js';

export default function ModuleFilesPanel({ moduleId }) {
  const files = getFilesForModule(moduleId);
  return (
    <Panel padding="none">
      <EmptyState icon={Files} title={`${files.length} files`} body="Study guides, notes and past papers." action={<Button to={`/library?module=${moduleId}`}>Open the library</Button>} />
    </Panel>
  );
}
