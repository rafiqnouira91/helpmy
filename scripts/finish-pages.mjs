import { writeFile, readFile, unlink } from 'node:fs/promises';
// Keep the browser entry separate from TanStack Start's SSR document template.
const html = await readFile('dist-pages/pages.html');
await writeFile('dist-pages/index.html', html);
await writeFile('dist-pages/404.html', html);
await writeFile('dist-pages/.nojekyll', '');
await unlink('dist-pages/pages.html');
