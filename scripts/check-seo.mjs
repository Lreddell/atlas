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
