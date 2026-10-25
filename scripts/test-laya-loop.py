"""Exercise the real loop handler without loading model checkpoints."""
import ast
import logging
from pathlib import Path

source = Path(__file__).resolve().parents[1] / "server/plugins/astra_laya_server.py"
tree = ast.parse(source.read_text(encoding="utf-8-sig"))
handler = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "handle_loop_exception")
namespace = {"logger": logging.getLogger("test.laya")}
exec(compile(ast.Module(body=[handler], type_ignores=[]), str(source), "exec"), namespace)


class Loop:
    def __init__(self):
        self.unhandled = []

    def default_exception_handler(self, context):
        self.unhandled.append(context)


loop = Loop()
for error in (ConnectionResetError(), ConnectionAbortedError(), BrokenPipeError()):
    namespace["handle_loop_exception"](loop, {"exception": error})
error = OSError()
error.winerror = 64
namespace["handle_loop_exception"](loop, {"exception": error})
assert not loop.unhandled
namespace["handle_loop_exception"](loop, {"exception": RuntimeError("synthetic")})
assert len(loop.unhandled) == 1
print("PASS reset errors ignored; unrelated failure delegated")
