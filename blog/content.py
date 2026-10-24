"""
Everything the site lists, in one place.

Long-form posts are HTML templates in templates/posts/ and are registered in
POSTS below. Shorter writing lives as Markdown in content/notes/ with a small
front matter block; add a file there and it appears under /writing with no
other change. Projects, expertise and the career timeline are plain data the
templates render.
"""
import re
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path

import markdown
from django.conf import settings
from django.utils.safestring import mark_safe


NOTES_DIR = settings.BASE_DIR / 'content' / 'notes'

# Writing is filed under a handful of tags; the first tag of a piece is its
# primary one and is what the feed badges show.
TAGS = {
	'markets': 'Energy markets',
	'trading': 'Algorithmic trading',
	'forecasting': 'Forecasting',
	'ai': 'AI & machine learning',
	'renewables': 'Renewables & storage',
	'building': 'Building',
}


@dataclass(frozen=True)
class Post:
	"""A long-form piece: an HTML template under templates/posts/ (legacy) or a Markdown note."""
	slug: str
	title: str
	subtitle: str
	published: date
	tags: tuple
	kind: str = 'essay'            # essay | note | market
	scene: str | None = None       # animated card in staticfiles/image/thumbnails/<scene>/
	image: str | None = None       # share image, when there is no scene
	body: str = ''                 # rendered HTML for a Markdown note
	minutes: int = 0
	sample: bool = False           # placeholder copy for the mock-up, to be replaced

	@property
	def path(self):
		# legacy HTML posts keep the root URLs they were published under
		return f'/writing/{self.slug}' if self.body else f'/{self.slug}'

	@property
	def tag_names(self):
		return [TAGS[t] for t in self.tags]

	@property
	def primary_tag(self):
		return TAGS[self.tags[0]]


# The three research posts. Their HTML templates still live at the root URLs
# they were published under.
POSTS = [
	Post(
		slug='deep-reinforcement-learning-for-grid-scale-lithium-ion-battery-optimisation-3',
		title='Deep Reinforcement Learning for Grid Scale Lithium-ion Battery Optimisation',
		subtitle='Using model-free DRL to optimise wholesale energy arbitrage for grid-scale batteries, benchmarked against MILP.',
		published=date(2022, 10, 10),
		tags=('renewables', 'ai', 'markets'),
		scene='battery',
		image='/static/Thumbnail_3.jpg',
		minutes=18,
	),
	Post(
		slug='probabilistic-forecasting-of-renewable-generation-and-wholesale-prices-with-quantile-regression-2',
		title='Probabilistic Forecasting of Renewable Generation & Wholesale Prices with Quantile-Regression',
		subtitle='Sequence-to-sequence networks with spatial-temporal attention to forecast day-ahead UK generation and auction prices.',
		published=date(2022, 6, 15),
		tags=('forecasting', 'ai', 'markets'),
		scene='cyclone',
		image='/static/Thumbnail_2.jpg',
		minutes=25,
	),
	Post(
		slug='reinforcement-learning-for-offshore-wind-farm-optimisation-1',
		title='Reinforcement Learning for Offshore Wind Farm Optimisation',
		subtitle='Q-learning applied to static and quasi-dynamic offshore wind farm environments to optimise wake-steering strategies.',
		published=date(2022, 4, 30),
		tags=('renewables', 'ai'),
		scene='wake',
		image='/static/Thumbnail_1.jpg',
		minutes=22,
	),
]


FRONT_MATTER = re.compile(r'\A---\s*\n(.*?)\n---\s*\n', re.S)
MATH = re.compile(r'(\$\$.*?\$\$|(?<!\\)\$[^$\n]+?\$)', re.S)


def _render_markdown(text):
	"""Markdown to HTML, with TeX left exactly as written for MathJax to render in the browser."""
	kept = []

	def stash(m):
		kept.append(m.group(0))
		return f'MATHBLOCK{len(kept) - 1}END'

	html = markdown.markdown(MATH.sub(stash, text), extensions=['fenced_code', 'tables', 'toc', 'attr_list'])
	return re.sub(r'MATHBLOCK(\d+)END', lambda m: kept[int(m.group(1))], html)


def _parse_note(path: Path) -> Post:
	text = path.read_text(encoding='utf-8')
	m = FRONT_MATTER.match(text)
	meta = {}
	if m:
		for line in m.group(1).splitlines():
			key, _, value = line.partition(':')
			meta[key.strip()] = value.strip()
		text = text[m.end():]
	html = _render_markdown(text)
	words = len(re.sub(r'<[^>]+>', ' ', html).split())
	return Post(
		slug=meta.get('slug', path.stem),
		title=meta['title'],
		subtitle=meta.get('summary', ''),
		published=date.fromisoformat(meta['date']),
		tags=tuple(t.strip() for t in meta.get('tags', 'markets').split(',') if t.strip()),
		kind=meta.get('kind', 'note'),
		body=mark_safe(html),
		minutes=max(1, round(words / 220)),
		sample=meta.get('sample', '').lower() in ('true', 'yes', '1'),
	)


@lru_cache(maxsize=None)
def notes():
	"""Every Markdown note, newest first. Cached; restart the server after editing in production."""
	found = [_parse_note(p) for p in sorted(NOTES_DIR.glob('*.md'))]
	return sorted(found, key=lambda n: n.published, reverse=True)


def writing():
	"""Everything written, newest first."""
	return sorted(POSTS + list(notes()), key=lambda p: p.published, reverse=True)


def by_slug(slug):
	for n in notes():
		if n.slug == slug:
			return n
	return None


@dataclass(frozen=True)
class Project:
	name: str
	url: str
	tagline: str
	blurb: str
	role: str
	kind: str                    # energy | beyond
	scene: str | None = None     # animated card, if it has one
	scene_class: str = ''        # the CSS hook its script looks for
	glyph: str = ''              # a small mark for projects without a scene
	stack: tuple = ()


PROJECTS = [
	Project(
		name='ohmera.ai',
		url='https://ohmera.ai',
		tagline='GB power market punditry',
		blurb='Daily commentary on the GB power market, from system price swings to what the stack is doing, with an assistant you can ask about the day. New-age market intelligence, written for people who trade or follow the market.',
		role='Founder & builder',
		kind='energy',
		scene='ohmera',
		scene_class='ohmera-scene',
		stack=('LLM agents', 'market data pipelines', 'Python'),
	),
	Project(
		name='donder',
		url='https://www.donder.co.uk',
		tagline='Journal your hikes and share your adventures',
		blurb='A hill-walking journal for the UK and Ireland: log ascents, track progress across the peaks, and follow what other walkers are climbing.',
		role='Designed & built',
		kind='beyond',
		glyph='▲',
		stack=('Web app', 'maps & elevation data'),
	),
	Project(
		name='officetea',
		url='https://officetea.co/',
		tagline='The truth about where you work',
		blurb='An anonymous platform where people share accounts of workplaces, office politics and layoffs, and rate the companies involved so patterns across employers become visible.',
		role='Designed & built',
		kind='beyond',
		glyph='☕',
		stack=('Web app', 'moderation', 'search'),
	),
]


EXPERTISE = [
	{
		'title': 'Algorithmic trading for power markets',
		'lead': 'Day-ahead and intraday.',
		'text': 'Designing, backtesting and running the strategies that bid into day-ahead auctions and trade the intraday book: signal research, position sizing, execution logic and the monitoring that keeps them honest in production.',
		'points': ['Day-ahead auction strategies', 'Intraday and continuous trading', 'Backtesting, risk and PnL attribution', 'Strategy monitoring in production'],
	},
	{
		'title': 'Forecasting and probabilistic ML',
		'lead': 'Prices, wind, solar, demand.',
		'text': 'Deep learning and statistical models for the quantities a trader actually needs to know with their uncertainty: wholesale prices, renewable output and the system state behind them, from research notebook to a scheduled model in production.',
		'points': ['Quantile and distributional forecasts', 'Sequence models with attention', 'Feature pipelines on weather and market data', 'Model evaluation and drift'],
	},
	{
		'title': 'Energy assets, from development to dispatch',
		'lead': 'Wind, storage, computer vision.',
		'text': 'Years spent on the asset side: early-stage wind farm and co-located storage development, battery dispatch optimisation with reinforcement learning, and productionised computer vision for the physical side of the industry.',
		'points': ['Wind farm and co-located storage development', 'Battery dispatch optimisation', 'Reinforcement learning for control', 'Productionised computer vision'],
	},
]


# Career, newest first. Employer names are left out on purpose; add them if you
# want them public.
TIMELINE = [
	{
		'when': 'Now',
		'title': 'Principal Data Scientist, algorithmic trading',
		'text': 'Leading the research and build of algorithmic trading strategies for day-ahead and intraday power markets: from signal to live strategy, with the forecasting, backtesting and monitoring that sit around it.',
		'tags': ['Day-ahead', 'Intraday', 'Strategy research', 'Production ML'],
	},
	{
		'when': 'Previously',
		'title': 'Data Scientist, applied computer vision',
		'text': 'Took computer vision from prototype to production for the energy sector, owning the data, the models and the deployment.',
		'tags': ['Computer vision', 'MLOps', 'Deployment'],
	},
	{
		'when': '2017 onwards',
		'title': 'Data Scientist, renewables development',
		'text': 'Early-stage wind farm and co-located storage development: site and yield analysis, storage modelling and the data tooling behind investment decisions. Also hydro optimisation and the first applications of ML to the development pipeline.',
		'tags': ['Wind', 'Co-located storage', 'Energy yield', 'Hydro'],
	},
	{
		'when': '2015 to 2016',
		'title': 'MPhil Energy Technologies, University of Cambridge',
		'text': '',
		'tags': [],
	},
	{
		'when': '2010 to 2015',
		'title': 'MEng Architectural Engineering, Heriot-Watt University',
		'text': '',
		'tags': [],
	},
]


COURSES = [
	('2021', 'Generative Adversarial Networks Specialisation', 'DeepLearning.AI', 'https://coursera.org/share/3f12345c2d4cedfb6c254964d8bad99a'),
	('2020', 'Reinforcement Learning Specialisation', 'University of Alberta', 'https://coursera.org/share/d5103d0cecd79ffd154083bfac342599'),
	('2020', 'Deep Learning Specialisation', 'DeepLearning.AI', 'https://coursera.org/share/69b4a99a90e5037d325f6968b15e0c61'),
	('2020', 'Machine Learning', 'Stanford University', 'https://coursera.org/share/e6044f4aa5c1cfdf0561cec932e5430c'),
]
