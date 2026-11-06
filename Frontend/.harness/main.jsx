// Temporary visual harness: renders the modal alone with the app's styles.
import { createRoot } from 'react-dom/client';
import '../src/styles/index.scss';
import ConnectAgentModal from '../src/features/sandbox/components/ConnectAgentModal.jsx';

if (new URLSearchParams(location.search).get('theme') === 'light') {
  document.documentElement.classList.add('light-theme');
}
document.body.style.margin = '0';
document.body.style.background = 'var(--bg-canvas)';
document.body.style.minHeight = '100vh';

createRoot(document.getElementById('root')).render(
  <ConnectAgentModal projectId="65f0c0ffee0000000000abcd" onClose={() => {}} />,
);
