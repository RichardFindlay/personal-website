import json
import re
from datetime import timedelta
from unittest import mock
from urllib.parse import urlparse

from django.conf import settings
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from . import views
from .models import Post
from .seo import PAGES, SITE_URL


BATTERY_POST = '/deep-reinforcement-learning-for-grid-scale-lithium-ion-battery-optimisation-3'
FORECASTING_POST = '/probabilistic-forecasting-of-renewable-generation-and-wholesale-prices-with-quantile-regression-2'
WAKE_POST = '/reinforcement-learning-for-offshore-wind-farm-optimisation-1'


class HomepageTests(TestCase):

	@classmethod
	def setUpTestData(cls):
		author = User.objects.create_user('richard')
		rows = [
			('Reinforcement Learning for Offshore Wind Farm Optimisation', 'wake', 3),
			('Probabilistic Forecasting of Renewable Generation & Wholesale Prices with Quantile-Regression', 'forecasting', 2),
			('Deep Reinforcement Learning for Grid Scale Lithium-ion Battery Optimisation', 'battery', 1),
		]
		for title, slug, days_ago in rows:
			post = Post.objects.create(title=title, slug=slug, author=author, content=f'{slug} content', status=1, date_manual=slug)
			Post.objects.filter(pk=post.pk).update(created_on=timezone.now() - timedelta(days=days_ago))

	def home(self):
		return self.client.get('/').content.decode()

	def test_lists_the_posts_newest_first_with_their_links_and_dates(self):
		html = self.home()
		self.assertEqual(
			re.findall(r'<a class="card bg-\w+" href="(/[^"]*)">', html),
			[BATTERY_POST, FORECASTING_POST, WAKE_POST],
		)
		self.assertEqual(
			re.findall(r'<span class="card-label">([^<]*)</span>', html),
			['OCT 10, 2022', 'JUN 15, 2022', 'APR 30, 2022', 'VENTURE'],
		)
		self.assertEqual(
			re.findall(r'<span class="card-title">([^<]*)</span>', html),
			[
				'Deep Reinforcement Learning for Grid Scale Lithium-ion Battery Optimisation',
				'Probabilistic Forecasting of Renewable Generation &amp; Wholesale Prices with Quantile-Regression',
				'Reinforcement Learning for Offshore Wind Farm Optimisation',
			],
		)
		self.assertIn('Using model-free DRL to optimise wholesale energy arbitrage for grid-scale batteries', html)

	def test_each_post_card_mounts_its_animated_scene(self):
		html = self.home()
		for scene in ['wake', 'cyclone', 'battery']:
			with self.subTest(scene=scene):
				self.assertIn(
					f'<div class="card-scene scene-{scene}" aria-hidden="true"'
					f' data-svg="/static/image/thumbnails/{scene}/scene-colour.svg"'
					f' data-js="/static/image/thumbnails/{scene}/scene-colour.js"></div>',
					html,
				)
		self.assertIn(
			'<div class="card-scene ohmera-scene" aria-hidden="true"'
			' data-svg="/static/image/thumbnails/ohmera/offshore-colour.svg"'
			' data-js="/static/image/thumbnails/ohmera/offshore-colour.js"></div>',
			html,
		)

	def test_a_post_without_art_falls_back_to_its_photo_and_content(self):
		art_without_battery = {n: art for n, art in views.CARD_ART.items() if n != 3}
		with mock.patch.dict(views.CARD_ART, art_without_battery, clear=True):
			html = self.home()
		self.assertIn('<img class="card-photo" src="/static/Thumbnail_3.jpg" alt="">', html)
		self.assertIn('<span class="card-blurb">battery content</span>', html)
		self.assertNotIn('scene-battery', html)

	def test_shelf_has_nine_covers_linking_out_with_alt_text(self):
		html = self.home()
		covers = re.findall(r'<a class="book" href="([^"]*)" target="_blank" rel="noopener"><img class="book-cover" src="/static/image/books/([^"]*)" alt="([^"]*)"', html)
		self.assertEqual(
			[file for _, file, _ in covers],
			['book_0.jpg', 'book_1.jpg', 'book_00.jpg', 'book_2.jpg', 'book_3.jpg', 'book_4.jpg', 'book_5.jpg', 'book_7.jpg', 'book_8.jpg'],
		)
		self.assertEqual(covers[3][0], 'https://www.amazon.co.uk/Energy-Trading-Risk-Management-Diversification/dp/1118339339')
		for url, file, alt in covers:
			with self.subTest(file=file):
				self.assertRegex(url, r'^https://www\.amazon\.co\.uk/[\w-]+/dp/\w+$')
				self.assertNotEqual(alt, '')

	def test_homepage_is_standalone_but_keeps_its_seo_head(self):
		html = self.home()
		self.assertIn('<link rel="canonical" href="https://richardfindlay.co.uk/">', html)
		self.assertIn('<meta property="og:type" content="website">', html)
		self.assertIn('<script type="application/ld+json">', html)
		for legacy in ['bootstrap', 'jquery', 'd3js', 'particles', 'Quicksand']:
			with self.subTest(legacy=legacy):
				self.assertNotIn(legacy, html)

	def test_other_pages_keep_the_old_chrome(self):
		self.assertIn('navbar-brand', self.client.get('/about').content.decode())
		self.assertIn('navbar-brand', self.client.get('/reading').content.decode())

	def test_import_map_pins_three_before_the_module_that_needs_it(self):
		html = self.home()
		import_map = re.search(r'<script type="importmap">(.*?)</script>', html, re.S)
		self.assertEqual(
			json.loads(import_map.group(1)),
			{'imports': {'three': 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js'}},
		)
		self.assertLess(import_map.start(), html.index('<script type="module" src="/static/js/home.js"></script>'))

	def test_turbine_mount_point_keeps_the_svg_fallback_address(self):
		self.assertIn('<div class="stage-figure" data-svg="/static/image/turbine/turbine.svg"></div>', self.home())

	def test_generated_turbine_has_no_unfilled_bindings(self):
		svg = (settings.BASE_DIR / 'staticfiles/image/turbine/turbine.svg').read_text()
		self.assertIn('data-callout="yaw"', svg)
		self.assertNotIn('{{', svg)


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
