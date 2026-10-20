from django.contrib.sitemaps import Sitemap
from .seo import PAGES, SITE_URL


class PageSitemap(Sitemap):
	protocol = 'https'

	def items(self):
		return list(PAGES.values())

	def location(self, page):
		return page.path

	def lastmod(self, page):
		return page.published

	# Pin the domain so each <loc> matches the page's canonical URL whichever host served the request.
	def get_domain(self, site=None):
		return SITE_URL.removeprefix('https://')
