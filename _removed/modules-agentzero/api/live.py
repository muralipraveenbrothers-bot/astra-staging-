from helpers.api import ApiHandler, Request, Response

class LiveCheck(ApiHandler):
    @classmethod
    def requires_auth(cls) -> bool:
        return False
    @classmethod
    def requires_csrf(cls) -> bool:
        return False
    @classmethod
    def get_methods(cls) -> list[str]:
        return ["GET"]
    async def process(self, input: dict, request: Request) -> dict | Response:
        return {"ok": True, "service": "agentzero", "status": "HEALTHY"}
