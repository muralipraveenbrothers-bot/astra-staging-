import book_to_skill, os
d = os.path.dirname(book_to_skill.__file__)
print("PKG_DIR=" + d)
print("VERSION=" + str(getattr(book_to_skill, "__version__", "unknown")))
print("EXTRACT_PY=" + os.path.join(os.path.dirname(d), "scripts", "extract.py"))

import docling
import pypdf
import pdfminer
import ebooklib
import bs4
import docx
import striprtf
import trafilatura
print("DEPS_OK")
