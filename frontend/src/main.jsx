// Base tokens and resets first: component stylesheets are imported afterwards so
// their rules win over the shared defaults at equal specificity.
import './styles/theme.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
