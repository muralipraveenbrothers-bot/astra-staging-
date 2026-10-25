import sys
sys.path.insert(0, 'D:/astra PM/plugins/laya')
import laya
from laya.router import Router
from laya.typed_decisions import questions
print('laya version:', getattr(laya, '__version__', '0.3.x'))
print('Router:', type(Router).__name__)
print('questions present:', bool(questions))
