"""Boot only the unchanged modules extracted from the exact pinned HWI artifact."""
import sys
import marshal
import types

root = sys._groot_runtime
sys.frozen = True
sys._MEIPASS = root
sys._pyinstaller_pyz = root + "/PYZ-00.pyz"
sys.path.insert(0, sys._pyinstaller_pyz)
for name in ("struct", "pyimod01_archive", "pyimod02_importers", "pyimod03_ctypes"):
    module = types.ModuleType(name)
    module.__file__ = root + "/" + name
    sys.modules[name] = module
    with open(module.__file__, "rb") as source:
        exec(marshal.loads(source.read()), module.__dict__)
import pyimod02_importers
import pyimod03_ctypes
pyimod02_importers.install()
pyimod03_ctypes.install()
with open(root + "/groot-session-worker.py", "rb") as source:
    exec(compile(source.read(), root + "/groot-session-worker.py", "exec"), {"__name__": "__main__"})
