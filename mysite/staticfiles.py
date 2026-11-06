from whitenoise.storage import CompressedManifestStaticFilesStorage


class HashedStaticFilesStorage(CompressedManifestStaticFilesStorage):
    """Static files get content-hashed names, so browsers and the CDN can keep them for a year and a
    deploy never pairs new HTML with stale files. ES module imports inside the files are rewritten to
    the hashed names too. A reference to a file that is missing, from the manifest or from disk, keeps
    its plain name, as the plain storage would, rather than failing the page or `collectstatic`."""

    support_js_module_import_aggregation = True
    manifest_strict = False

    def hashed_name(self, name, content=None, filename=None):
        try:
            return super().hashed_name(name, content, filename)
        except ValueError:
            return name
