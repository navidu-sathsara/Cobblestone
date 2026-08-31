// Base tokens and resets first, then shared primitives: component stylesheets
// are imported afterwards so their rules win at equal specificity.
import './styles/theme.css';
import './styles/ui.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
