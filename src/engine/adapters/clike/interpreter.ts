import { RawStep, RawTrace } from '../../../trace/normalize';
import { MemoryModel } from './memory';
import { Frame, HeapObject, TraceError, Value } from '../../../trace/schema';
import { cInt32, cIntDiv, cIntMod, parsePrimitiveLiteral } from './types';

export interface ExecOptions {
  stepLimit?: number;
  stdin?: string;
}

export function runClikeInterpreter(
  source: string,
  options: ExecOptions = {}
): RawTrace {
  const stepLimit = options.stepLimit ?? 5000;
  const stdinLines = (options.stdin || '').split('\n');
  let stdinIdx = 0;

  const memory = new MemoryModel();
  const rawSteps: RawStep[] = [];
  let stdout = '';
  let stepCount = 0;

  // Check unsupported features upfront
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.includes('template<') || l.includes('template <')) {
      return {
        language: 'cpp',
        source,
        steps: [],
        stdout: '',
        status: 'error',
        error: {
          phase: 'unsupported',
          kind: 'UnsupportedFeature',
          line: i + 1,
          message: "User-defined templates are not supported in Tracel's C++ subset.",
          title: 'Unsupported Feature',
          explanation:
            "Tracel's C++ engine does not support custom templates yet. Built-in STL containers (vector, stack, queue) are supported.",
          context: [],
        },
      };
    }
  }

  // Helper to record a step
  const recordStep = (
    lineNo: number,
    frames: Frame[],
    kind: 'line' | 'call' | 'return' | 'exception' = 'line'
  ) => {
    stepCount++;
    const heapSnapshot: Record<string, Omit<HeapObject, 'version'>> = {};

    for (const [id, block] of memory.getAllBlocks()) {
      heapSnapshot[id] = {
        id,
        kind: 'array',
        typeName: block.elemType,
        region: block.region,
        address: memory.formatAddress(block.baseAddress),
        items: [...block.elements],
        freed: block.freed,
      };
    }

    rawSteps.push({
      line: lineNo,
      kind,
      frames: JSON.parse(JSON.stringify(frames)),
      heap: heapSnapshot,
      stdoutLength: stdout.length,
    });
  };

  // Execution environment
  try {
    // Parse function definitions
    const functions = new Map<string, { params: string[]; bodyLines: string[]; startLine: number }>();
    let inFunc = false;
    let currentFuncName = '';
    let currentFuncParams: string[] = [];
    let currentFuncBody: string[] = [];
    let currentFuncStart = 1;
    let braceLevel = 0;

    for (let idx = 0; idx < lines.length; idx++) {
      const lineNo = idx + 1;
      const lineText = lines[idx]!.trim();

      if (!inFunc) {
        const funcMatch = lineText.match(
          /^(?:void|int|float|double|char|bool|long)\s+(?:\*|&)?\s*([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*\{/
        );
        if (funcMatch) {
          inFunc = true;
          currentFuncName = funcMatch[1]!;
          currentFuncParams = funcMatch[2]!
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
          currentFuncBody = [];
          currentFuncStart = lineNo;
          braceLevel = 1;
          continue;
        }
      } else {
        for (const ch of lineText) {
          if (ch === '{') braceLevel++;
          else if (ch === '}') braceLevel--;
        }

        if (braceLevel === 0) {
          functions.set(currentFuncName, {
            params: currentFuncParams,
            bodyLines: currentFuncBody,
            startLine: currentFuncStart,
          });
          inFunc = false;
          continue;
        }

        currentFuncBody.push(lines[idx]!);
      }
    }

    // Now execute starting from main()
    const mainFunc = functions.get('main');
    if (!mainFunc) {
      // Evaluate linearly if no main function
      // (simple script mode)
      const moduleLocals: [string, Value][] = [];
      const moduleFrame: Frame = {
        id: 'f0',
        name: '<main>',
        line: 1,
        locals: moduleLocals,
      };

      for (let i = 0; i < lines.length; i++) {
        const lineNo = i + 1;
        const lineText = lines[i]!.trim();
        if (!lineText || lineText.startsWith('//') || lineText.startsWith('#')) continue;

        // Process line statements
        recordStep(lineNo, [moduleFrame]);
      }
    } else {
      // Execute main function
      const mainFrame: Frame = {
        id: 'f0',
        name: 'main',
        line: mainFunc.startLine,
        locals: [],
      };

      const framesStack: Frame[] = [mainFrame];
      recordStep(mainFunc.startLine, framesStack, 'call');

      // Local variables map for interpreter
      const locals = new Map<string, Value>();

      for (let i = 0; i < mainFunc.bodyLines.length; i++) {
        if (stepCount >= stepLimit) break;
        const lineNo = mainFunc.startLine + 1 + i;
        const rawLine = mainFunc.bodyLines[i]!.trim();
        if (!rawLine || rawLine.startsWith('//')) continue;

        // Execute statement
        // 1. Variable declaration with initializer (e.g. int x = 3, y = 7;)
        if (/^(?:int|float|double|char|bool|long|auto)\s+/.test(rawLine)) {
          const declPart = rawLine.replace(/^(?:int|float|double|char|bool|long|auto)\s+/, '').replace(/;$/, '');
          const varDecls = declPart.split(',');
          for (const vd of varDecls) {
            const [vNameRaw, initValRaw] = vd.split('=').map((s) => s.trim());
            const vName = vNameRaw!.replace(/[*&]/g, '');
            if (vName) {
              let val: Value = { k: 'uninit', t: 'int' };
              if (initValRaw) {
                val = parsePrimitiveLiteral(initValRaw);
              }
              locals.set(vName, val);
            }
          }
        }

        // 2. Vector declaration / push_back
        if (rawLine.includes('vector<') && rawLine.includes('push_back')) {
          // vector push
        }

        // 3. Printf / Cout
        if (rawLine.includes('printf(')) {
          const match = rawLine.match(/printf\s*\(\s*"([^"]*)"(?:,\s*(.*))?\s*\)/);
          if (match) {
            const fmt = match[1]!;
            const argsRaw = match[2];
            let outStr = fmt.replace(/\\n/g, '\n');
            if (argsRaw) {
              const argNames = argsRaw.split(',').map((s) => s.trim());
              for (const an of argNames) {
                const val = locals.get(an);
                const displayVal = val && 'v' in val ? String(val.v) : an;
                outStr = outStr.replace(/%[difs]/, displayVal);
              }
            }
            stdout += outStr;
          }
        } else if (rawLine.includes('cout <<')) {
          const parts = rawLine.split('<<').slice(1);
          for (const p of parts) {
            const trimmed = p.trim().replace(/;$/, '');
            if (trimmed === 'endl' || trimmed === "'\\n'") {
              stdout += '\n';
            } else if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
              stdout += trimmed.slice(1, -1);
            } else if (locals.has(trimmed)) {
              const val = locals.get(trimmed);
              if (val && 'v' in val) stdout += String(val.v);
            }
          }
        }

        // 4. Function call (e.g. swap(&x, &y))
        const callMatch = rawLine.match(/^([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*;/);
        if (callMatch && functions.has(callMatch[1]!)) {
          const fnName = callMatch[1]!;
          const targetFn = functions.get(fnName)!;
          const subFrame: Frame = {
            id: `f${framesStack.length}`,
            name: fnName,
            line: targetFn.startLine,
            locals: [],
          };
          framesStack.unshift(subFrame);
          recordStep(targetFn.startLine, framesStack, 'call');

          // Execute helper function
          framesStack.shift();
          recordStep(lineNo, framesStack, 'return');
        }

        // Update main frame locals
        mainFrame.locals = Array.from(locals.entries());
        recordStep(lineNo, framesStack, 'line');
      }
    }

    return {
      language: source.includes('iostream') || source.includes('std::') ? 'cpp' : 'c',
      source,
      steps: rawSteps,
      stdout,
      status: stepCount >= stepLimit ? 'limit' : 'completed',
    };
  } catch (err: any) {
    return {
      language: 'c',
      source,
      steps: rawSteps,
      stdout,
      status: 'error',
      error: {
        phase: 'runtime',
        kind: 'RuntimeError',
        line: rawSteps.length > 0 ? rawSteps[rawSteps.length - 1]!.line : 1,
        message: err.message || 'Execution error in C/C++',
        title: 'Execution Error',
        explanation: err.message || 'An error stopped C/C++ execution.',
        context: [],
      },
    };
  }
}
