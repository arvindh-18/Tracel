import { Step, TraceEvent, Value } from './schema';

function formatVal(val: Value | undefined): string {
  if (!val) return '?';
  switch (val.k) {
    case 'int':
    case 'float':
      return String(val.v);
    case 'bool':
      return val.v ? 'True' : 'False';
    case 'str':
      return JSON.stringify(val.v.length > 15 ? val.v.slice(0, 12) + '...' : val.v);
    case 'char':
      return `'${String.fromCharCode(val.v)}'`;
    case 'none':
      return 'None';
    case 'uninit':
      return '?';
    case 'fn':
      return `<fn ${val.name}>`;
    case 'ref':
    case 'inline':
      return `ref(${val.id})`;
    case 'ptr':
      return val.address ? `*${val.address}` : 'ptr';
  }
}

export function narrate(step: Step, prevStep?: Step): string {
  if (step.kind === 'end') {
    return 'Program execution finished';
  }
  if (step.kind === 'limit') {
    return 'Execution stopped at step limit';
  }
  if (step.kind === 'exception') {
    const errEv = step.events.find((e) => e.type === 'error');
    if (errEv && errEv.type === 'error') {
      return `Stopped: ${errEv.error.title || errEv.error.kind}`;
    }
    return `Exception raised on line ${step.line}`;
  }

  // Check branch / loop events first
  const branchEv = step.events.find((e) => e.type === 'branch');
  if (branchEv && branchEv.type === 'branch') {
    return `Line ${branchEv.line} ${branchEv.construct}: ${branchEv.taken ? 'true → entering block' : 'false → skipped'}`;
  }

  const loopEv = step.events.find((e) => e.type === 'loop_iter');
  if (loopEv && loopEv.type === 'loop_iter') {
    return `Loop on line ${loopEv.line} · iteration ${loopEv.iteration}`;
  }

  const callEv = step.events.find((e) => e.type === 'call');
  if (callEv && callEv.type === 'call') {
    const args = callEv.args.map(([n, v]) => `${n}=${formatVal(v)}`).join(', ');
    return `Called ${callEv.name}(${args})`;
  }

  const returnEv = step.events.find((e) => e.type === 'return');
  if (returnEv && returnEv.type === 'return') {
    return returnEv.value ? `Returned ${formatVal(returnEv.value)}` : 'Function returned';
  }

  // Data change events
  const changes: string[] = [];
  for (const ev of step.events) {
    if (ev.type === 'var_create') {
      changes.push(`${ev.name} = ${formatVal(ev.value)}`);
    } else if (ev.type === 'var_update') {
      changes.push(`${ev.name} ${formatVal(ev.from)} → ${formatVal(ev.to)}`);
    } else if (ev.type === 'item_set') {
      changes.push(`[${ev.index}] ${formatVal(ev.from)} → ${formatVal(ev.to)}`);
    } else if (ev.type === 'item_swap') {
      changes.push(`swapped index ${ev.i} ↔ ${ev.j}`);
    } else if (ev.type === 'item_insert') {
      if (ev.op === 'push') changes.push(`pushed ${formatVal(ev.value)}`);
      else if (ev.op === 'enqueue') changes.push(`enqueued ${formatVal(ev.value)}`);
      else changes.push(`appended ${formatVal(ev.value)}`);
    } else if (ev.type === 'item_remove') {
      if (ev.op === 'pop') changes.push(`popped ${formatVal(ev.value)}`);
      else if (ev.op === 'dequeue') changes.push(`dequeued ${formatVal(ev.value)}`);
      else changes.push(`removed ${formatVal(ev.value)}`);
    } else if (ev.type === 'output') {
      changes.push(`printed "${ev.text.trim()}"`);
    }
  }

  // A step shows the effect of its own line (see showEffectsOnLine).
  void prevStep;
  const linePrefix = `Line ${step.line}`;

  if (changes.length === 0) {
    return `${linePrefix} ran`;
  }

  if (changes.length <= 2) {
    return `${linePrefix} · ${changes.join(', ')}`;
  }

  return `${linePrefix} · ${changes[0]}, ${changes[1]} (+${changes.length - 2} more)`;
}

