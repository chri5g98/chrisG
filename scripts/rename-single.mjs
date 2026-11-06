// Name the single-file build FMAREA.html so it is obvious in a SharePoint library.
import { renameSync } from 'node:fs';
renameSync('single/index.html', 'single/FMAREA.html');
