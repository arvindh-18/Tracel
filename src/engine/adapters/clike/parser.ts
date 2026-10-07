export interface AstNode {
  type: string;
  line: number;
  col?: number;
  [key: string]: any;
}

export interface ParseResult {
  ast?: AstProgram;
  error?: {
    line: number;
    column: number;
    message: string;
  };
}

export interface AstProgram extends AstNode {
  type: 'Program';
  body: AstNode[];
}

export function parseClike(source: string): ParseResult {
  // Pre-execution validation check for unsupported features
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]!;
    if (lineText.includes('template<') || lineText.includes('template <')) {
      return {
        error: {
          line: i + 1,
          column: lineText.indexOf('template'),
          message:
            "Tracel's C++ engine doesn't support templates you define yourself yet. Supported: std::vector, std::stack, std::queue.",
        },
      };
    }
    if (lineText.trim().startsWith('goto ')) {
      return {
        error: {
          line: i + 1,
          column: 0,
          message: "Tracel's C/C++ engine does not support goto statements.",
        },
      };
    }
  }

  try {
    const program: AstProgram = {
      type: 'Program',
      line: 1,
      body: [],
    };

    // Clean source of #include, using namespace, etc. while keeping line numbers
    const processedLines = lines.map((line, idx) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('#include') ||
        trimmed.startsWith('using namespace') ||
        trimmed.startsWith('#define')
      ) {
        return ' '.repeat(line.length); // replace with whitespace to preserve line numbers
      }
      return line;
    });

    // Basic tokenizer and AST builder for C/C++ subset
    // We parse functions, variables, control flow, structs, etc.
    const fullCode = processedLines.join('\n');

    // Parse top-level declarations and functions
    const funcRegex =
      /(?:(?:void|int|float|double|char|bool|long|size_t|[A-Za-z_]\w*)\s+(?:\*|&)?\s*([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{)/g;
    let match;

    while ((match = funcRegex.exec(fullCode)) !== null) {
      const funcName = match[1]!;
      const paramsRaw = match[2]!;
      const startIdx = match.index;
      const lineNo = fullCode.slice(0, startIdx).split('\n').length;

      // Find matching closing brace
      let braceCount = 1;
      let bodyEnd = -1;
      for (let i = match.index + match[0].length; i < fullCode.length; i++) {
        if (fullCode[i] === '{') braceCount++;
        else if (fullCode[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            bodyEnd = i;
            break;
          }
        }
      }

      if (bodyEnd !== -1) {
        const bodyContent = fullCode.slice(match.index + match[0].length, bodyEnd);
        program.body.push({
          type: 'FunctionDeclaration',
          name: funcName,
          params: parseParams(paramsRaw),
          bodyText: bodyContent,
          line: lineNo,
          startPos: match.index,
          endPos: bodyEnd + 1,
        });
      }
    }

    return { ast: program };
  } catch (err: any) {
    return {
      error: {
        line: 1,
        column: 0,
        message: err.message || 'Syntax error while parsing C/C++',
      },
    };
  }
}

function parseParams(raw: string): Array<{ name: string; type: string; isRef: boolean; isPtr: boolean }> {
  if (!raw.trim()) return [];
  return raw.split(',').map((p) => {
    const parts = p.trim().split(/\s+/);
    const last = parts[parts.length - 1]!;
    const name = last.replace(/[*&]/g, '');
    const isPtr = p.includes('*');
    const isRef = p.includes('&');
    const type = parts.slice(0, -1).join(' ').replace(/[*&]/g, '') || 'int';
    return { name, type, isRef, isPtr };
  });
}

