import { LanguageAdapter, RunRequest, SupportInfo } from '../types';
import { RawTrace } from '../../../trace/normalize';
import { runClikeInterpreter } from './interpreter';

export class ClikeAdapter implements LanguageAdapter {
  id: 'c' | 'cpp';
  displayName: string;
  engineLabel: string;
  fileExtension: string;

  constructor(lang: 'c' | 'cpp') {
    this.id = lang;
    this.displayName = lang === 'c' ? 'C' : 'C++';
    this.engineLabel =
      lang === 'c'
        ? 'Tracel C interpreter (subset)'
        : 'Tracel C++ interpreter (subset)';
    this.fileExtension = lang === 'c' ? '.c' : '.cpp';
  }

  supportInfo: SupportInfo = {
    supportedFeatures: [
      'Basic types: int, float, double, char, bool, long',
      'Pointers, dereferencing (*p), address-of (&x), pointer arithmetic',
      'Fixed-size arrays (1D and 2D), array sum loops',
      'Structures (struct), C++ classes with member functions',
      'Functions, recursion, pass-by-value, pass-by-pointer, references (&)',
      'Dynamic allocation: malloc/free (C), new/delete (C++)',
      'I/O: printf/scanf, std::cout, std::cin, std::endl',
      'STL containers: std::vector, std::stack, std::queue',
      'Memory safety checks for out-of-bounds and null dereferences',
    ],
    unsupportedFeatures: [
      'User-defined templates (template<typename T>)',
      'Multiple compilation units / file includes beyond stdlib',
      'Inline assembly, goto, bit-fields, unions',
      'Inheritance and virtual functions (in v1)',
    ],
    limitsDescription:
      'Max 5,000 steps. Call stack depth limit 256. Synthetic memory blocks with typed address space.',
  };

  async prepare(): Promise<void> {
    // Parser/interpreter is ready immediately
    return Promise.resolve();
  }

  async run(
    req: RunRequest,
    onProgress?: (stepCount: number) => void
  ): Promise<RawTrace> {
    const startTime = performance.now();
    const rawTrace = runClikeInterpreter(req.source, {
      stepLimit: req.stepLimit,
      stdin: req.stdin,
    });
    rawTrace.language = this.id;
    rawTrace.stats = { durationMs: Math.round(performance.now() - startTime) };
    return Promise.resolve(rawTrace);
  }
}

