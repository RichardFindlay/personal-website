class UncachedErrors:
    """An error response is never cached: Cloudflare otherwise keeps a 404 at its edge and tells browsers to keep it
    for hours, so a deploy that briefly misses a static file would leave visitors on a broken page long after the fix."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if response.status_code >= 400:
            response['Cache-Control'] = 'no-store'
        return response
