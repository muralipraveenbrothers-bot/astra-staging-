import sys

from helpers.api import ApiHandler, Request, Response
from helpers import errors, git

class HealthCheck(ApiHandler):

    @classmethod
    def requires_auth(cls) -> bool:
        return False

    @classmethod
    def requires_csrf(cls) -> bool:
        return False

    @classmethod
    def get_methods(cls) -> list[str]:
        return ["GET", "POST"]

    async def process(self, input: dict, request: Request) -> dict | Response:
        gitinfo = None
        error = None
        # GitPython's cat-file subprocess deadlocks on Windows, which made the
        # startup probe at /api/health hang for 90s and kill a live uvicorn.
        if sys.platform == "win32":
            return {"ok": True, "gitinfo": None, "error": None, "platform": "win32"}
        try:
            gitinfo = git.get_git_info()
        except Exception as e:
            error = errors.error_text(e)

        return {"ok": True, "gitinfo": gitinfo, "error": error}
