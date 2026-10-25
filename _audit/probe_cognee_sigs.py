"""Dump full cognee 1.6.0 signatures for bridge contract verification."""
import inspect

import cognee
from cognee.modules.search.types import SearchType

print("REMEMBER_FULL<<<" + str(inspect.signature(cognee.remember)))
print("RECALL_FULL<<<" + str(inspect.signature(cognee.recall)))
print("FORGET_FULL<<<" + str(inspect.signature(cognee.forget)))
print("IMPROVE_FULL<<<" + str(inspect.signature(cognee.improve)))
print("SEARCHTYPES<<<" + ",".join(m.name for m in SearchType))

# Does remember accept dataset_name explicitly (bridge passes it)?
sig = inspect.signature(cognee.remember)
print("REMEMBER_HAS_DATASET_NAME<<<" + str("dataset_name" in sig.parameters))
print("RECALL_PARAMS<<<" + ",".join(inspect.signature(cognee.recall).parameters))
