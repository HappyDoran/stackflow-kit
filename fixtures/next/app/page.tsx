import { STACK_TRANSITION_DURATION_MS } from '@happydoran/stackflow-kit';
import { ClientProbe } from './client-probe';

export default function Page() {
  return (
    <main>
      <h1>Transition: {STACK_TRANSITION_DURATION_MS}</h1>
      <ClientProbe />
    </main>
  );
}
