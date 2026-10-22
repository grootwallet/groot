// Internal Testnet4 operation worker; loads only the manifest-pinned bundled Python.
#include <dlfcn.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#define LOAD(name, type) type name = (type)dlsym(library, #name); if (!name) return 2
int main(int argc, char **argv) {
    if (argc != 2 || strcmp(argv[1], "--stdin") != 0) return 2;
    char executable[PATH_MAX], root[PATH_MAX], python[PATH_MAX], search[PATH_MAX * 4], script[PATH_MAX];
    uint32_t size = sizeof executable;
    if (_NSGetExecutablePath(executable, &size) || !realpath(executable, root)) return 2;
    char *last = strrchr(root, '/');
    if (!last) return 2;
    *last = 0;
    if (snprintf(python, sizeof python, "%s/Python", root) >= (int)sizeof python ||
        snprintf(search, sizeof search, "%s/base_library.zip:%s:%s/lib-dynload", root, root, root) >= (int)sizeof search ||
        snprintf(script, sizeof script, "%s/groot-session.py", root) >= (int)sizeof script) return 2;
    void *library = dlopen(python, RTLD_NOW | RTLD_GLOBAL);
    if (!library) return 2;
    int *isolated = dlsym(library, "Py_IsolatedFlag"), *no_site = dlsym(library, "Py_NoSiteFlag"),
        *no_environment = dlsym(library, "Py_IgnoreEnvironmentFlag"), *utf8 = dlsym(library, "Py_UTF8Mode"),
        *no_bytecode = dlsym(library, "Py_DontWriteBytecodeFlag");
    if (!isolated || !no_site || !no_environment || !utf8 || !no_bytecode) return 2;
    *isolated = *no_site = *no_environment = *utf8 = *no_bytecode = 1;
    typedef wchar_t *(*Decode)(const char *, size_t *);
    typedef void (*SetWide)(const wchar_t *);
    typedef void (*Initialize)(void);
    typedef void *(*Unicode)(const char *);
    typedef int (*SetSys)(const char *, void *);
    typedef int (*RunFile)(FILE *, const char *, int, void *);
    typedef int (*Finalize)(void);
    LOAD(Py_DecodeLocale, Decode);
    LOAD(Py_SetPythonHome, SetWide);
    LOAD(Py_SetPath, SetWide);
    LOAD(Py_Initialize, Initialize);
    LOAD(PyUnicode_DecodeFSDefault, Unicode);
    LOAD(PySys_SetObject, SetSys);
    LOAD(PyRun_SimpleFileExFlags, RunFile);
    LOAD(Py_FinalizeEx, Finalize);
    wchar_t *home = Py_DecodeLocale(root, NULL), *path = Py_DecodeLocale(search, NULL);
    if (!home || !path) return 2;
    Py_SetPythonHome(home);
    Py_SetPath(path);
    Py_Initialize();
    void *runtime = PyUnicode_DecodeFSDefault(root);
    if (!runtime || PySys_SetObject("_groot_runtime", runtime)) return 2;
    FILE *file = fopen(script, "rb");
    if (!file) return 2;
    int result = PyRun_SimpleFileExFlags(file, script, 1, NULL);
    int final_result = Py_FinalizeEx();
    return result || final_result < 0 ? 2 : 0;
}
