import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const siteUrl = 'https://atlas.loganreddell.com/';
const description =
  'Explore, build, craft, edit procedural worlds, and break the seal on the Magnetic Fields in this voxel action-adventure.';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const failures = [];

const expectIncludes = (contents, expected, label) => {
  if (!contents.includes(expected)) failures.push(label);
};

const index = read('index.html');
expectIncludes(index, `<link rel="canonical" href="${siteUrl}" />`, 'canonical link');
expectIncludes(index, `<meta name="description" content="${description}" />`, 'meta description');
expectIncludes(index, `<meta property="og:url" content="${siteUrl}" />`, 'Open Graph URL');
expectIncludes(index, 'type="application/ld+json"', 'JSON-LD');
expectIncludes(index, '<h1>Atlas</h1>', 'static Atlas heading');
expectIncludes(index, `<p>${description}</p>`, 'static Atlas description');
expectIncludes(index, "document.documentElement.classList.add('js');", 'pre-paint JavaScript marker');
expectIncludes(index, ':root.js #atlas-static-fallback', 'JavaScript fallback visibility guard');
expectIncludes(index, 'atlas.menu.startupPanoramaPreview.v1', 'startup panorama preview cache key');
expectIncludes(index, '__STARTUP_PREVIEW_VERSION__', 'startup preview build-version placeholder');
expectIncludes(index, "document.documentElement.classList.add('has-startup-preview')", 'pre-paint panorama preview activation');
expectIncludes(index, ':root.has-startup-preview #root::before', 'startup preview image layer');

const panoramaBackground = read('src/components/ui/MenuPanoramaBackground.tsx');
expectIncludes(panoramaBackground, 'startupPreviewId?: string', 'startup preview panorama identity prop');
expectIncludes(panoramaBackground, 'atlas.menu.startupPanoramaPreview.v1', 'runtime startup preview cache key');
expectIncludes(panoramaBackground, '__APP_DISPLAY_VERSION__', 'runtime startup preview version');
expectIncludes(panoramaBackground, "toDataURL('image/webp'", 'compressed startup preview capture');
expectIncludes(panoramaBackground, 'startupPreviewDataUrl', 'cached panorama placeholder state');

const loadingScreen = read('src/components/ui/LoadingScreen.tsx');
expectIncludes(loadingScreen, 'startupPreviewId?: string', 'loading screen startup preview prop');
expectIncludes(loadingScreen, 'startupPreviewId={startupPreviewId}', 'loading screen preview pass-through');

const app = read('src/App.tsx');
expectIncludes(app, "const startupPanoramaPreviewId = menuPanoramaPath ?? 'default';", 'active panorama preview identity');
expectIncludes(app, 'startupPreviewId={startupPanoramaPreviewId}', 'active panorama preview wiring');

const viteConfig = read('vite.config.ts');
expectIncludes(viteConfig, '__STARTUP_PREVIEW_VERSION__', 'startup preview version transform');

const robots = read('public/robots.txt');
expectIncludes(robots, 'User-agent: *', 'robots user-agent');
expectIncludes(robots, 'Allow: /', 'robots allow rule');
expectIncludes(robots, `Sitemap: ${siteUrl}sitemap.xml`, 'robots sitemap URL');

const sitemap = read('public/sitemap.xml');
expectIncludes(sitemap, `<loc>${siteUrl}</loc>`, 'sitemap canonical URL');

if (failures.length > 0) {
  console.error(`SEO check failed: ${failures.join(', ')}`);
  process.exit(1);
}

console.log('SEO check passed.');
