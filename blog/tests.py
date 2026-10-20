import json
import re
from urllib.parse import urlparse

from django.conf import settings
from django.test import TestCase

from .seo import PAGES, SITE_URL


BATTERY_POST = '/deep-reinforcement-learning-for-grid-scale-lithium-ion-battery-optimisation-3'


class SeoTests(TestCase):

	def test_every_page_returns_200(self):
		for path in PAGES:
			with self.subTest(path=path):
				self.assertEqual(self.client.get(path).status_code, 200)

	def test_every_post_template_has_a_page_entry(self):
		post_paths = {f'/{f.stem}' for f in (settings.TEMPLATE_DIR / 'posts').glob('*.html')}
		article_paths = {page.path for page in PAGES.values() if page.kind == 'article'}
		self.assertEqual(post_paths, article_paths)

	def test_sitemap_lists_exactly_the_pages_and_each_resolves(self):
		xml = self.client.get('/sitemap.xml').content.decode()
		locs = re.findall(r'<loc>(.*?)</loc>', xml)
		self.assertCountEqual(locs, [SITE_URL + path for path in PAGES])
		self.assertIn(
			'<loc>https://richardfindlay.co.uk/probabilistic-forecasting-of-renewable-generation-and-wholesale-prices-with-quantile-regression-2</loc>'
			'<lastmod>2022-06-15</lastmod>',
			xml,
		)
		for loc in locs:
			with self.subTest(loc=loc):
				self.assertEqual(self.client.get(urlparse(loc).path).status_code, 200)

	def test_post_page_renders_its_own_metadata(self):
		html = self.client.get(BATTERY_POST).content.decode()
		self.assertIn(f'<link rel="canonical" href="https://richardfindlay.co.uk{BATTERY_POST}">', html)
		self.assertIn(
			'<meta property="og:title" content="Deep Reinforcement Learning for Grid Scale Lithium-ion Battery Optimisation | Richard Findlay">',
			html,
		)
		self.assertIn('<meta property="article:published_time" content="2022-10-10">', html)
		ld = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S).group(1))
		self.assertEqual(ld['@type'], 'BlogPosting')
		self.assertEqual(ld['headline'], 'Deep Reinforcement Learning for Grid Scale Lithium-ion Battery Optimisation')
		self.assertEqual(ld['datePublished'], '2022-10-10')
		self.assertEqual(ld['url'], f'https://richardfindlay.co.uk{BATTERY_POST}')
		self.assertEqual(ld['image'], 'https://richardfindlay.co.uk/static/Thumbnail_3.jpg')
		self.assertEqual(ld['author']['name'], 'Richard Findlay')

	def test_robots_txt(self):
		response = self.client.get('/robots.txt')
		self.assertEqual(response['Content-Type'], 'text/plain')
		self.assertEqual(
			response.content.decode(),
			'User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: https://richardfindlay.co.uk/sitemap.xml\n',
		)
