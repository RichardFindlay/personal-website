import json
from dataclasses import dataclass, replace
from datetime import date
from typing import Literal

from django.utils.safestring import mark_safe


SITE_URL = "https://richardfindlay.co.uk"
DEFAULT_IMAGE = "https://raw.githubusercontent.com/RichardFindlay/personal-website/main/social_4.png"


@dataclass(frozen=True)
class Page:
	path: str
	title: str
	description: str
	kind: Literal["website", "profile", "article"]
	image: str
	published: date | None = None


PAGES = {page.path: page for page in [
	Page(
		path="/",
		title="Richard Findlay | AI & Machine Learning for Energy Markets and Renewables",
		description="Richard Findlay on applying AI and machine learning to energy markets and renewables: offshore wind, renewable and power price forecasting, and battery storage.",
		kind="website",
		image=DEFAULT_IMAGE,
	),
	Page(
		path="/about",
		title="About Richard Findlay | Data Scientist in Energy & AI",
		description="Richard Findlay is a data scientist in Perth, Scotland, applying AI and machine learning to renewable energy, battery storage and short-term energy trading.",
		kind="profile",
		image=DEFAULT_IMAGE,
	),
	Page(
		path="/reading",
		title="Reading List: Energy Trading, Finance & AI | Richard Findlay",
		description="Books on energy trading and risk management, quantitative energy finance, algorithmic trading, machine learning, deep reinforcement learning and MLOps.",
		kind="website",
		image=DEFAULT_IMAGE,
	),
	Page(
		path="/reinforcement-learning-for-offshore-wind-farm-optimisation-1",
		title="Reinforcement Learning for Offshore Wind Farm Optimisation | Richard Findlay",
		description="Reinforcement learning, specifically Q-learning, applied to optimise a wake-steering strategy for an offshore wind farm using FLORIS.",
		kind="article",
		image=f"{SITE_URL}/static/Thumbnail_1.jpg",
		published=date(2022, 4, 30),
	),
	Page(
		path="/probabilistic-forecasting-of-renewable-generation-and-wholesale-prices-with-quantile-regression-2",
		title="Probabilistic Forecasting of Renewable Generation & Wholesale Prices with Quantile-Regression | Richard Findlay",
		description="Deep learning for probabilistic forecasting of renewable generation and wholesale prices, using spatial and temporal attention in an encoder-decoder model.",
		kind="article",
		image=f"{SITE_URL}/static/Thumbnail_2.jpg",
		published=date(2022, 6, 15),
	),
	Page(
		path="/deep-reinforcement-learning-for-grid-scale-lithium-ion-battery-optimisation-3",
		title="Deep Reinforcement Learning for Grid Scale Lithium-ion Battery Optimisation | Richard Findlay",
		description="Deep reinforcement learning (DQN) applied to optimise a standalone grid-scale lithium-ion battery, compared with mixed-integer linear programming (MILP).",
		kind="article",
		image=f"{SITE_URL}/static/Thumbnail_3.jpg",
		published=date(2022, 10, 10),
	),
]}

PERSON = {
	"@type": "Person",
	"name": "Richard Findlay",
	"url": f"{SITE_URL}/about",
	"sameAs": [
		"https://x.com/__RichFind__",
		"https://www.linkedin.com/in/richard-findlay-a4a8365a/",
		"https://github.com/RichardFindlay",
	],
	"knowsAbout": [
		"Energy markets",
		"Renewable energy forecasting",
		"Battery optimisation",
		"Reinforcement learning",
		"Machine learning",
	],
}


def json_ld(page):
	url = SITE_URL + page.path
	if page.kind == "article":
		return {
			"@context": "https://schema.org",
			"@type": "BlogPosting",
			"headline": page.title.removesuffix(" | Richard Findlay"),
			"description": page.description,
			"datePublished": page.published.isoformat(),
			"author": PERSON,
			"image": page.image,
			"url": url,
			"mainEntityOfPage": url,
		}
	if page.kind == "profile":
		return {
			"@context": "https://schema.org",
			"@type": "ProfilePage",
			"url": url,
			"mainEntity": PERSON,
		}
	if page.path == "/":
		return {
			"@context": "https://schema.org",
			"@graph": [
				{"@type": "WebSite", "name": "Richard Findlay", "url": url},
				PERSON,
			],
		}
	return None


def seo(request):
	page = PAGES.get(request.path) or replace(PAGES["/"], path=request.path)
	data = json_ld(page)
	# Escaping stops a "</script>" inside a string value from closing the tag.
	script = json.dumps(data).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
	return {
		"seo_page": page,
		"canonical_url": SITE_URL + request.path,
		"json_ld": mark_safe(script) if data else None,
	}
