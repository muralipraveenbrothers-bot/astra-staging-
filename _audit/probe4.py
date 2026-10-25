import uuid

import cognee
from cognee.tasks.ingestion.data_item import DataItem

try:
    item = DataItem(data="hello", data_id=uuid.uuid4())
    print("DATAITEM_BUILD<<<OK " + str(type(item.data_id)))
except Exception as exc:
    print("DATAITEM_BUILD<<<ERR " + repr(exc))

params = __import__("inspect").signature(cognee.remember).parameters
print("REMEMBER_DATA_ANN<<<" + str(params["data"].annotation)[:300])

from cognee.api.v1.recall.recall import RecallResponse as RR

fields = (
    getattr(RR, "model_fields", None)
    or getattr(RR, "__dataclass_fields__", None)
    or getattr(RR, "__annotations__", None)
)
print("RECALLRESP<<<" + str(fields))
r = RR.__new__(RR)
print("RECALLRESP_ATTRS<<<" + ",".join(dir(RR)[:40]))
