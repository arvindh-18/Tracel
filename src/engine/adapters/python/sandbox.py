# Python Sandbox Initialization for Tracel

SANDBOX_SCRIPT = """
import sys
import builtins
import random

# Seed random for determinism
random.seed(0)

# Import allowlist
ALLOWED_MODULES = {
    'math', 'random', 'collections', 'heapq', 'bisect',
    'itertools', 'functools', 'operator', 'string', 're',
    'dataclasses', 'typing', 'enum', 'copy', 'statistics',
    'fractions', 'decimal', 'array', 'time', 'tracel'
}

BLOCKED_MODULES = {
    'os', 'sys', 'subprocess', 'shutil', 'socket', 'http',
    'urllib', 'requests', 'js', 'pyodide', 'pyodide_js',
    'micropip', 'ctypes'
}

original_import = builtins.__import__

def custom_import(name, globals=None, locals=None, fromlist=(), level=0):
    root_module = name.split('.')[0]
    if root_module in BLOCKED_MODULES:
        raise ImportError(
            f"Tracel's Python sandbox does not allow importing '{name}'. "
            f"Available modules: {', '.join(sorted(ALLOWED_MODULES))}"
        )
    return original_import(name, globals, locals, fromlist, level)

builtins.__import__ = custom_import

# Safe recursion limit
sys.setrecursionlimit(250)
"""

