import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import {
  PlatformSettingsProvider,
  usePlatformSettings,
} from '@/context/platform-settings-context';
import type { AppearanceMode } from '@/lib/theme-presets';
import { isAppearanceMode } from '@/lib/theme-presets';
import { queryClient } from './lib/query-client';
import './index.css';

const LIGHT_SHELL_APPEARANCES = new Set<AppearanceMode>(['soft', 'light']);

function ThemeAwareToaster(): React.ReactElement {
  const { settings } = usePlatformSettings();
  const raw = settings?.appearanceMode ?? 'dark';
  const appearance: AppearanceMode = isAppearanceMode(raw) ? raw : 'dark';
  const theme = LIGHT_SHELL_APPEARANCES.has(appearance) ? 'light' : 'dark';

  return (
    <Toaster
      position="top-right"
      theme={theme}
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'border border-border',
        },
      }}
    />
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PlatformSettingsProvider>
          <App />
          <ThemeAwareToaster />
        </PlatformSettingsProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
