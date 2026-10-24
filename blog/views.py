from os import walk

from django.http import Http404
from django.shortcuts import render

from . import content


# Get posts names
posts = []
for (dirpath, dirnames, filenames) in walk('./templates/posts'):
	posts.extend(filenames)
	break


def Home(request):
	return render(request, 'index.html', {
		'posts': content.POSTS,
		'writing': content.writing()[:4],
		'projects': content.PROJECTS,
		'energy_projects': [p for p in content.PROJECTS if p.kind == 'energy'],
		'beyond_projects': [p for p in content.PROJECTS if p.kind == 'beyond'],
		'expertise': content.EXPERTISE,
	})


def Work(request):
	return render(request, 'work.html', {
		'posts': content.POSTS,
		'energy_projects': [p for p in content.PROJECTS if p.kind == 'energy'],
		'beyond_projects': [p for p in content.PROJECTS if p.kind == 'beyond'],
		'timeline': content.TIMELINE,
	})


def Writing(request):
	pieces = content.writing()
	used = [t for t in content.TAGS if any(t in p.tags for p in pieces)]
	return render(request, 'writing.html', {
		'pieces': pieces,
		'tags': [(t, content.TAGS[t]) for t in used],
	})


def Note(request, slug):
	note = content.by_slug(slug)
	if note is None:
		raise Http404(slug)
	others = [p for p in content.writing() if p.slug != slug][:3]
	return render(request, 'note.html', {'note': note, 'others': others})


def AboutMe(request):
	return render(request, 'about.html', {
		'timeline': content.TIMELINE,
		'courses': content.COURSES,
		'expertise': content.EXPERTISE,
	})


def ReadingList(request):
	return render(request, 'reading_list.html')


# function to retrieve
def get_post_views():
	post_views = []
	# remove ds.store file if present
	for i in range(len(posts)):
		if posts[i] == '.DS_Store':
			continue
		else:
			def post(request, i=i):
				return render(request, './posts/%s' % posts[i], {'legacy_post': True})
			post_views.append(post)

	return post_views
