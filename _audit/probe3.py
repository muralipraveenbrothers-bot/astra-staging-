import asyncio
import inspect

import cognee
from cognee.api.v1.recall.recall import RecallResponse as RR

print("REMEMBER_CORO<<<" + str(inspect.iscoroutinefunction(cognee.remember)))
print("RECALL_CORO<<<" + str(inspect.iscoroutinefunction(cognee.recall)))
print("FORGET_CORO<<<" + str(inspect.iscoroutinefunction(cognee.forget)))
print("IMPROVE_CORO<<<" + str(inspect.iscoroutinefunction(cognee.improve)))
try:
    from cognee.tasks.ingestion.data_item import DataItem

    print("DATAITEM_FIELDS<<<" + ",".join(DataItem.__annotations__.keys()))
except Exception as exc:
    print("DATAITEM_FIELDS<<<ERR " + repr(exc))
try:
    print("RECALLRESP_FIELDS<<<" + ",".join(RR.model_fields.keys()))
except Exception:
    print("RECALLRESP_FIELDS<<<" + ",".join(getattr(RR, "__annotations__", {}).keys()))
print("USABLE_IN_LOOP<<<" + str(asyncio.get_event_loop_policy().get_event_loop() is not None))
