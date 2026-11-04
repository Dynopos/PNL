import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { supabase } from './lib/supabase';
import { ThemeProvider } from './lib/theme';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App client={supabase} />
    </ThemeProvider>
  </StrictMode>,
);
