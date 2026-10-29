"""Boot only the unchanged modules extracted from the exact pinned HWI artifact."""
import sys
import marshal
import types

root = sys._groot_runtime


def runtime_path(name):
    separator = "\\" if sys.platform == "win32" else "/"
    return root + separator + name


sys.frozen = True
sys._MEIPASS = root
sys._pyinstaller_pyz = runtime_path("PYZ-00.pyz")
sys.path.insert(0, sys._pyinstaller_pyz)
for name in ("struct", "pyimod01_archive", "pyimod02_importers", "pyimod03_ctypes"):
    module = types.ModuleType(name)
    module.__file__ = runtime_path(name)
    sys.modules[name] = module
    with open(module.__file__, "rb") as source:
        exec(marshal.loads(source.read()), module.__dict__)
import pyimod02_importers
import pyimod03_ctypes
pyimod02_importers.install()
pyimod03_ctypes.install()
worker = runtime_path("groot-session-worker.py")
with open(worker, "rb") as source:
    exec(compile(source.read(), worker, "exec"), {"__name__": "__main__"})
