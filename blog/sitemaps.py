from django.contrib.sitemaps import Sitemap
from django.urls import reverse
from .models import Post


# dynamic sitemaps
class BlogPosts(Sitemap):
	changefreq = "monthly"
	priority = 1.0
	protocol = 'https'
     
	def items(self):
		return Post.objects.all()
	
	def location(self, obj):
		return f'/{obj.slug}'


class StaticSitemap(Sitemap):
    changefreq = "monthly"
    priority = 1.0
    protocol = 'https'
 
    def items(self):
        return ['home', 'about'] #returning static pages; home and contact us
 
    def location(self, item):
        return reverse(item) #returning the static pages URL; home and contact us





