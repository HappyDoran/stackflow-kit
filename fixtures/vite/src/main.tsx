import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StackScreen, browserStackflowRuntimeAdapter } from '@happydoran/stackflow-kit';
import '@happydoran/stackflow-kit/styles.css';

function App() {
  return <main data-adapter={typeof browserStackflowRuntimeAdapter.publishStackState}>{StackScreen.name}</main>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
