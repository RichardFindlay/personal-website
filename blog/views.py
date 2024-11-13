from django.shortcuts import render
from django.views import generic
from .models import Post

import os
from os import walk

# Get posts names
posts = []
for (dirpath,dirnames, filenames) in walk('./templates/posts'):	
	posts.extend(filenames)
	break


# create list of blog posts 
def get_blog_posts():
	posts_ = []
	for (dirpath,dirnames, filenames) in walk('./templates/posts'):	
		posts_.extend(filenames)
		print(posts_)
		break

	post_names = [files[:-5] for files in filenames]

	for idx, post in enumerate(post_names):
		if post == '.DS_':
			del post_names[idx]

	# sort list in descending order - to parallel created sort
	post_names.sort(key=lambda x: int(x[-1]), reverse=True)

	return post_names


# class PostDetail(generic.DetailView):
#     model = Post
#     template_name = 'post_detail.html'


# get list of thumbnail pictures
def get_thumbnails():
	thumbnails = []
	for (dirpath,dirnames, filenames) in walk('./blog/static/image/thumbnails'):	
		thumbnails.extend(filenames)	
		break

	for idx, post in enumerate(thumbnails):
		if post == '.DS_Store':
			del thumbnails[idx]

	thumbnails.sort(key=lambda x: int(x[-5]), reverse=True)

	return thumbnails



# Create your views here.
class PostList(generic.ListView):
	queryset = Post.objects.filter(status=1).order_by('-created_on')
	template_name = 'index.html'

	def get_context_data(self, **kwargs):
		data = super().get_context_data(**kwargs)
		data['blog_post_names'] = get_blog_posts()
		data['thumbnails'] = get_thumbnails()

		return data



def AboutMe(request):
    return render(request, 'about.html')


# function to retrieve 
def get_post_views():
	post_views = []
	# remove ds.store file if present
	for i in range(len(posts)):
		if posts[i] == '.DS_Store':
			continue
		else: 
			def post(request, i = i):
				return render(request, './posts/%s' %posts[i])
			post_views.append(post)

	return post_views


