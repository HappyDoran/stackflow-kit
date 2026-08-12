import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StackScreen } from '@happydoran/stackflow-kit';
import '@happydoran/stackflow-kit/styles.css';

function App() {
  return <main>{StackScreen.name}</main>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
