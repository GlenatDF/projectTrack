// Route shim — delegates to feature-level components based on route param.
// /projects/new     → AddProject (launchpad)
// /projects/:id/edit → EditProject (track)
import { useParams } from 'react-router-dom';
import { AddProject } from '../features/launchpad/pages/AddProject';
import { EditProject } from '../features/track/pages/EditProject';

export default function AddEditProject() {
  const { id } = useParams<{ id?: string }>();
  return id !== undefined ? <EditProject /> : <AddProject />;
}
