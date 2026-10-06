const h=`
import sys
import io
import ast
import json
import random
import builtins
import collections

# --- HELPER MODULE: tracel ---
class TracelModule:
    class Stack:
        def __init__(self):
            self._items = []
        def push(self, item):
            self._items.append(item)
        def pop(self):
            return self._items.pop()
        def peek(self):
            return self._items[-1] if self._items else None
        def is_empty(self):
            return len(self._items) == 0
        def __len__(self):
            return len(self._items)
        def __repr__(self):
            return f"Stack({self._items})"

    class Queue:
        def __init__(self):
            self._items = collections.deque()
        def enqueue(self, item):
            self._items.append(item)
        def dequeue(self):
            return self._items.popleft()
        def peek(self):
            return self._items[0] if self._items else None
        def is_empty(self):
            return len(self._items) == 0
        def __len__(self):
            return len(self._items)
        def __repr__(self):
            return f"Queue({list(self._items)})"

sys.modules['tracel'] = TracelModule()

# --- TRACER & RUNNER ---
def run_tracel(source_code, stdin_text="", step_limit=5000):
    random.seed(0)

    # Prepare AST constructs
    construct_map = {}
    try:
        tree = ast.parse(source_code)
        for node in ast.walk(tree):
            if isinstance(node, ast.If):
                construct_map[node.lineno] = 'if'
            elif isinstance(node, ast.For):
                construct_map[node.lineno] = 'for'
            elif isinstance(node, ast.While):
                construct_map[node.lineno] = 'while'
            elif isinstance(node, ast.FunctionDef):
                construct_map[node.lineno] = 'def'
            elif isinstance(node, ast.Return):
                construct_map[node.lineno] = 'return'
    except SyntaxError as e:
        return json.dumps({
            "status": "error",
            "error": {
                "phase": "parse",
                "kind": "SyntaxError",
                "line": e.lineno or 1,
                "column": e.offset or 0,
                "message": str(e.msg),
                "title": "Syntax Error",
                "explanation": f"Python could not parse this line: {e.msg}",
                "context": []
            },
            "steps": [],
            "stdout": ""
        })

    # Stdout buffer
    stdout_buffer = io.StringIO()
    old_stdout = sys.stdout
    sys.stdout = stdout_buffer

    # Stdin buffer
    stdin_lines = stdin_text.splitlines()
    stdin_idx = 0
    def custom_input(prompt=""):
        nonlocal stdin_idx
        if prompt:
            stdout_buffer.write(str(prompt))
        if stdin_idx < len(stdin_lines):
            val = stdin_lines[stdin_idx]
            stdin_idx += 1
            return val
        raise EOFError("The program asked for input() but the Input box is empty.")

    old_input = builtins.input
    builtins.input = custom_input

    # Object preservation to maintain stable id()
    kept_alive = {}
    heap_cache = {}
    heap_counter = 0

    def get_heap_id(obj):
        nonlocal heap_counter
        raw_id = id(obj)
        if raw_id not in heap_cache:
            heap_counter += 1
            heap_cache[raw_id] = f"h{heap_counter}"
            kept_alive[raw_id] = obj
        return heap_cache[raw_id]

    # Serialization helper
    def serialize_value(v, depth=0):
        if v is None:
            return {"k": "none"}
        if isinstance(v, bool):
            return {"k": "bool", "v": v}
        if isinstance(v, int):
            return {"k": "int", "v": str(v)}
        if isinstance(v, float):
            return {"k": "float", "v": v}
        if isinstance(v, str):
            s = v if len(v) <= 120 else v[:117] + "..."
            return {"k": "str", "v": s}
        if callable(v):
            return {"k": "fn", "name": getattr(v, "__name__", "fn")}

        # Heap collections
        if isinstance(v, (list, tuple, set, dict, collections.deque)) or hasattr(v, '__dict__'):
            hid = get_heap_id(v)
            return {"k": "ref", "id": hid}

        return {"k": "str", "v": repr(v)[:60]}

    def serialize_heap_object(obj, depth=0):
        hid = get_heap_id(obj)

        if isinstance(obj, TracelModule.Stack):
            items = [serialize_value(x, depth + 1) for x in obj._items[:100]]
            return {
                "id": hid,
                "kind": "list",
                "typeName": "Stack",
                "region": "heap",
                "items": items
            }

        if isinstance(obj, TracelModule.Queue):
            items = [serialize_value(x, depth + 1) for x in list(obj._items)[:100]]
            return {
                "id": hid,
                "kind": "deque",
                "typeName": "Queue",
                "region": "heap",
                "items": items
            }

        if isinstance(obj, collections.deque):
            items = [serialize_value(x, depth + 1) for x in list(obj)[:100]]
            return {
                "id": hid,
                "kind": "deque",
                "typeName": "deque",
                "region": "heap",
                "items": items
            }

        if isinstance(obj, list):
            items = [serialize_value(x, depth + 1) for x in obj[:100]]
            return {
                "id": hid,
                "kind": "list",
                "typeName": "list",
                "region": "heap",
                "items": items
            }

        if isinstance(obj, tuple):
            items = [serialize_value(x, depth + 1) for x in obj[:100]]
            return {
                "id": hid,
                "kind": "tuple",
                "typeName": "tuple",
                "region": "heap",
                "items": items
            }

        if isinstance(obj, set):
            items = [serialize_value(x, depth + 1) for x in list(obj)[:100]]
            return {
                "id": hid,
                "kind": "set",
                "typeName": "set",
                "region": "heap",
                "items": items
            }

        if isinstance(obj, dict):
            entries = []
            for k, val in list(obj.items())[:50]:
                entries.append([serialize_value(k, depth + 1), serialize_value(val, depth + 1)])
            return {
                "id": hid,
                "kind": "dict",
                "typeName": "dict",
                "region": "heap",
                "entries": entries
            }

        # User class / instance
        if hasattr(obj, '__dict__'):
            fields = []
            for k, val in obj.__dict__.items():
                if not k.startswith('_'):
                    fields.append([k, serialize_value(val, depth + 1)])
            return {
                "id": hid,
                "kind": "instance",
                "typeName": type(obj).__name__,
                "region": "heap",
                "fields": fields
            }

        return {
            "id": hid,
            "kind": "instance",
            "typeName": type(obj).__name__,
            "region": "heap"
        }

    raw_steps = []
    loop_iter_counts = collections.defaultdict(int)
    step_count = 0
    stopped_by_limit = False

    def trace_hook(frame, event, arg):
        nonlocal step_count, stopped_by_limit
        if frame.f_code.co_filename != "<tracel>":
            return None

        if step_count >= step_limit:
            stopped_by_limit = True
            sys.settrace(None)
            frame.f_trace = None
            return None

        lineno = frame.f_lineno
        kind = 'line'
        if event == 'call':
            kind = 'call'
        elif event == 'return':
            kind = 'return'
        elif event == 'exception':
            kind = 'exception'

        step_count += 1

        # Collect stack frames
        f_cursor = frame
        frames_list = []
        frame_idx = 0
        heap_objects = {}

        while f_cursor and f_cursor.f_code.co_filename == "<tracel>":
            f_name = f_cursor.f_code.co_name
            f_locals = []
            for k, val in f_cursor.f_locals.items():
                if not k.startswith('__') and not k.startswith('.'):
                    f_locals.append([k, serialize_value(val)])
                    if isinstance(val, (list, tuple, set, dict, collections.deque)) or hasattr(val, '__dict__'):
                        hid = get_heap_id(val)
                        if hid not in heap_objects:
                            heap_objects[hid] = serialize_heap_object(val)

            frames_list.append({
                "id": f"f{frame_idx}",
                "name": f_name,
                "line": f_cursor.f_lineno,
                "locals": f_locals,
                "returnValue": serialize_value(arg) if event == 'return' else None
            })
            frame_idx += 1
            f_cursor = f_cursor.f_back

        # Check loop iterations
        explicit_events = []
        if lineno in construct_map:
            c_type = construct_map[lineno]
            if c_type in ('for', 'while'):
                loop_iter_counts[lineno] += 1
                explicit_events.append({
                    "type": "loop_iter",
                    "line": lineno,
                    "iteration": loop_iter_counts[lineno]
                })

        raw_steps.append({
            "line": lineno,
            "kind": kind,
            "frames": frames_list,
            "heap": heap_objects,
            "stdoutLength": len(stdout_buffer.getvalue()),
            "explicitEvents": explicit_events
        })

        return trace_hook

    code_globals = {
        "__name__": "__main__",
        "Stack": TracelModule.Stack,
        "Queue": TracelModule.Queue
    }

    try:
        compiled = compile(source_code, "<tracel>", "exec")
        sys.settrace(trace_hook)
        exec(compiled, code_globals)
        sys.settrace(None)
    except Exception as e:
        sys.settrace(None)
        tb = sys.exc_info()[2]
        err_lineno = 1
        while tb:
            if tb.tb_frame.f_code.co_filename == "<tracel>":
                err_lineno = tb.tb_lineno
            tb = tb.tb_next

        # Restore streams
        sys.stdout = old_stdout
        builtins.input = old_input

        err_type = type(e).__name__
        raw_msg = str(e)
        return json.dumps({
            "status": "error",
            "error": {
                "phase": "runtime",
                "kind": err_type,
                "line": err_lineno,
                "message": raw_msg,
                "title": err_type,
                "explanation": raw_msg,
                "context": []
            },
            "steps": raw_steps,
            "stdout": stdout_buffer.getvalue()
        })
    finally:
        sys.settrace(None)
        sys.stdout = old_stdout
        builtins.input = old_input

    status = "limit" if stopped_by_limit else "completed"
    err_obj = None
    if stopped_by_limit:
        err_obj = {
            "phase": "limit",
            "kind": "StepLimit",
            "line": raw_steps[-1]["line"] if raw_steps else 1,
            "message": f"Step limit of {step_limit} steps exceeded.",
            "title": "Execution Stopped (Step Limit)",
            "explanation": f"Tracel stopped the program after {step_limit} steps. This may be an infinite loop.",
            "context": []
        }

    return json.dumps({
        "status": status,
        "error": err_obj,
        "steps": raw_steps,
        "stdout": stdout_buffer.getvalue()
    })
`;let t=null,s=!1;async function l(){if(t)return t;if(s){for(;s;)await new Promise(n=>setTimeout(n,50));return t}return s=!0,self.postMessage({type:"status",message:"Loading Pyodide runtime…"}),importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js"),t=await loadPyodide({indexURL:"https://cdn.jsdelivr.net/pyodide/v0.26.4/full/"}),await t.runPythonAsync(h),s=!1,self.postMessage({type:"status",message:"Pyodide ready"}),t}self.onmessage=async n=>{const{type:o,id:a,source:r,stdin:_,stepLimit:d}=n.data;if(o==="init"){try{await l(),self.postMessage({type:"ready"})}catch(e){self.postMessage({type:"error",error:e.message})}return}if(o==="run")try{const e=await l(),p=JSON.stringify(r),c=JSON.stringify(_||""),u=`run_tracel(${p}, ${c}, ${d||5e3})`,f=await e.runPythonAsync(u),i=JSON.parse(f),m={language:"python",source:r,steps:i.steps,stdout:i.stdout,status:i.status,error:i.error,stats:{durationMs:0}};self.postMessage({type:"result",id:a,rawTrace:m})}catch(e){self.postMessage({type:"result",id:a,rawTrace:{language:"python",source:r,steps:[],stdout:"",status:"error",error:{phase:"runtime",kind:"PyodideError",line:1,message:e.message||"Worker execution failed",title:"Runtime Error",explanation:e.message||"Failed to execute Python in worker",context:[]}}})}};
