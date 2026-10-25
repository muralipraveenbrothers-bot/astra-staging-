import inspect

import cognee

r = inspect.signature(cognee.recall)
f = inspect.signature(cognee.forget)
print("ONLY_CONTEXT<<<" + str("only_context" in r.parameters))
print("FORGET_PARAMS<<<" + ",".join(f.parameters))
print("REMEMBER_DATASET_NAME_KIND<<<" + str(r and inspect.signature(cognee.remember).parameters.get("dataset_name")))
print("RECALL_QT_DEFAULT<<<" + str(r.parameters["query_type"].default))
