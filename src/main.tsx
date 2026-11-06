import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { app } from './store/app';
import { shared } from './store/shared';
import { installKeys } from './ui/keys';
import { reconnectPrompt } from './ui/Shell';

installKeys();
shared.onReconnectNeeded = reconnectPrompt;
app.init().then(() => shared.init());

// handy for support: inspect the data from the browser console
(window as unknown as { FMAREA: typeof app }).FMAREA = app;

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// works offline once loaded, and can be installed as an app from Edge or Chrome
if ('serviceWorker' in navigator && import.meta.env.PROD && !import.meta.env.SINGLE) navigator.serviceWorker.register('./sw.js').catch(() => {});
