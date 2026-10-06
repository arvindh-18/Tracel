import { TraceError } from '../../../trace/schema';

export function enhancePythonError(error: TraceError): TraceError {
  const { kind, message, line } = error;

  switch (kind) {
    case 'IndexError':
      return {
        ...error,
        title: 'Index Out of Range',
        explanation:
          'The program tried to access a list element at an index that does not exist.',
        stateNote: 'The program stopped before the variable on this line was modified.',
      };

    case 'ZeroDivisionError':
      return {
        ...error,
        title: 'Division by Zero',
        explanation:
          'A number cannot be divided or moduloed by 0 in mathematics and Python.',
        stateNote: 'The calculation could not complete.',
      };

    case 'KeyError':
      return {
        ...error,
        title: 'Dictionary Key Not Found',
        explanation: `The dictionary does not contain the key ${message}.`,
      };

    case 'NameError':
      return {
        ...error,
        title: 'Undefined Variable Name',
        explanation: `A variable or function name is used before it was defined: ${message}.`,
      };

    case 'TypeError':
      return {
        ...error,
        title: 'Type Mismatch Error',
        explanation: `An operation was performed on incompatible data types: ${message}.`,
      };

    case 'RecursionError':
      return {
        ...error,
        title: 'Maximum Recursion Depth Exceeded',
        explanation:
          'A function called itself too many times without reaching a base case (stack overflow).',
      };

    case 'EOFError':
      return {
        ...error,
        title: 'End of Input',
        explanation:
          'The program requested standard input with input(), but no more input lines were provided.',
      };

    case 'ImportError':
      return {
        ...error,
        title: 'Import Not Permitted',
        explanation: message,
      };

    case 'SyntaxError':
      return {
        ...error,
        title: 'Syntax Error',
        explanation: `Python could not understand this syntax on line ${line}. Check for missing colons, mismatched parentheses, or quotes.`,
      };

    case 'StepLimit':
      return {
        ...error,
        title: 'Step Limit Exceeded',
        explanation:
          'The program ran longer than the configured step limit (possible infinite loop). You can still inspect all steps up to this point.',
      };

    default:
      return {
        ...error,
        title: kind,
        explanation: message || 'An error stopped execution.',
      };
  }
}

