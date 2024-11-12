from . import views
from django.urls import path
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from os import walk
from django.conf import settings
from django.contrib.sitemaps.views import sitemap
from .sitemaps import StaticSitemap, BlogPosts #import StaticSitemap
from django.views.generic.base import TemplateView

template_dir = settings.TEMPLATE_DIR

# get post filenames for reference
posts = []
for (dirpath,dirnames, filenames) in walk(f'{template_dir}/posts/'):	
	posts.extend(filenames)
	break

# get post names only
post_names = [files[:-5] for files in filenames]

# remove ds.store file if present
for idx, post in enumerate(post_names):
	if post == '.DS_':
		del post_names[idx]

# get views for each post
post_views = views.get_post_views()

posts = [path('%s' %post_name, post_views[idx], name='%s' %post_name) for idx, post_name in enumerate(post_names)]

# config sitemaps
sitemaps = {
    'static': StaticSitemap,
    'blogposts': BlogPosts, 
}


urlpatterns = [
    path('', views.PostList.as_view(), name='home'),
    # path('<slug:slug>/', views.PostDetail.as_view(), name='post_detail'),
    path('about', views.AboutMe, name='about'),
    path('sitemap.xml', sitemap, {'sitemaps': sitemaps}),
    path('robots.txt', TemplateView.as_view(template_name='robots.txt', content_type='text/plain'))
] + posts #+ staticfiles_urlpatterns()




