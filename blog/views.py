from dataclasses import dataclass
from datetime import date

from django.shortcuts import render
from django.views import generic
from .models import Post
from .seo import PAGES

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


@dataclass(frozen=True)
class CardArt:
	scene: str
	blurb: str


@dataclass(frozen=True)
class Card:
	title: str
	href: str
	date: date
	blurb: str
	scene: str | None
	thumbnail: str | None


# animated card drawings in staticfiles/image/thumbnails/<scene>/, by post number;
# a post without one falls back to its photo thumbnail and its own content
CARD_ART = {
	1: CardArt('wake', 'Applying Q-learning to static and quasi-dynamic wind farm environments to optimise wake steering'),
	2: CardArt('cyclone', 'Sequence-to-sequence networks with spatial-temporal attention'),
	3: CardArt('battery', 'Using model-free DRL to optimise wholesale energy arbitrage for grid-scale batteries'),
}

SHELF = [
	{'file': 'book_0.jpg', 'title': 'Inside the Black Box: A Simple Guide to Quantitative and High-Frequency Trading', 'url': 'https://www.amazon.co.uk/Inside-Black-Box-Third-High-Frequency/dp/1119931894'},
	{'file': 'book_1.jpg', 'title': 'Quantitative Energy Finance: Modeling, Pricing, and Hedging in Energy and Commodity Markets', 'url': 'https://www.amazon.co.uk/Quantitative-Energy-Finance-Modeling-Commodity/dp/1461472474'},
	{'file': 'book_00.jpg', 'title': 'Python for Algorithmic Trading Cookbook', 'url': 'https://www.amazon.co.uk/Python-Algorithmic-Trading-Cookbook-algorithmic/dp/1835084702'},
	{'file': 'book_2.jpg', 'title': 'Energy Trading and Risk Management: A Practical Approach to Hedging, Trading and Portfolio Diversification', 'url': 'https://www.amazon.co.uk/Energy-Trading-Risk-Management-Diversification/dp/1118339339'},
	{'file': 'book_3.jpg', 'title': 'Quantitative Trading: How to Build Your Own Algorithmic Trading Business', 'url': 'https://www.amazon.co.uk/Quantitative-Trading-Build-Algorithmic-Business/dp/0470284889'},
	{'file': 'book_4.jpg', 'title': 'Energy Trading & Investing: Trading, Risk Management, and Structuring Deals in the Energy Markets', 'url': 'https://www.amazon.co.uk/Energy-Trading-Investing-2E-PB/dp/1265915873'},
	{'file': 'book_5.jpg', 'title': 'Data Science for Wind Energy', 'url': 'https://www.amazon.co.uk/Data-Science-Wind-Energy-Ding/dp/1138590525'},
	{'file': 'book_7.jpg', 'title': 'Machine Learning Design Patterns', 'url': 'https://www.amazon.co.uk/Machine-Learning-Design-Patterns-Preparation/dp/1098115783'},
	{'file': 'book_8.jpg', 'title': 'Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow', 'url': 'https://www.amazon.co.uk/Hands-Machine-Learning-Scikit-Learn-TensorFlow/dp/1492032646'},
]


def build_card(post, name):
	number = int(name[-1])
	href = '/' + name
	art = CARD_ART.get(number)
	return Card(
		title=post.title,
		href=href,
		date=PAGES[href].published,
		blurb=art.blurb if art else post.content[:200],
		scene=art.scene if art else None,
		thumbnail=None if art else f'Thumbnail_{number}.jpg',
	)


# Create your views here.
class PostList(generic.ListView):
	queryset = Post.objects.filter(status=1).order_by('-created_on')
	template_name = 'index.html'

	def get_context_data(self, **kwargs):
		data = super().get_context_data(**kwargs)
		data['cards'] = [build_card(post, name) for post, name in zip(data['post_list'], get_blog_posts())]
		data['shelf'] = SHELF

		return data



def AboutMe(request):
    return render(request, 'about.html')

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
			def post(request, i = i):
				return render(request, './posts/%s' %posts[i])
			post_views.append(post)

	return post_views


