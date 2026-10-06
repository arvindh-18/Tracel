import { Frame, HeapObject, TraceEvent, Value } from './schema';

function valuesEqual(a: Value | undefined, b: Value | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'int':
    case 'float':
    case 'str':
    case 'char':
      return a.v === (b as typeof a).v;
    case 'bool':
      return a.v === (b as typeof a).v;
    case 'none':
      return true;
    case 'uninit':
      return (b as typeof a).k === 'uninit' && a.t === (b as typeof a).t;
    case 'fn':
      return a.name === (b as typeof a).name;
    case 'ref':
    case 'inline':
      return a.id === (b as typeof a).id;
    case 'ptr':
      return (
        a.id === (b as typeof a).id &&
        a.offset === (b as typeof a).offset &&
        a.address === (b as typeof a).address
      );
  }
}

export function diffFrames(prevFrames: Frame[], nextFrames: Frame[]): TraceEvent[] {
  const events: TraceEvent[] = [];

  // Check top active frame
  const nextTop = nextFrames[0];
  const prevTop = prevFrames[0];

  if (!nextTop && !prevTop) return events;

  // New frame pushed (call)
  if (nextTop && (!prevTop || nextTop.id !== prevTop.id)) {
    events.push({
      type: 'call',
      frame: nextTop.id,
      name: nextTop.name,
      args: nextTop.locals,
    });
    return events;
  }

  // Frame popped (return)
  if (prevTop && (!nextTop || prevTop.id !== nextTop.id)) {
    events.push({
      type: 'return',
      frame: prevTop.id,
      value: prevTop.returnValue ?? null,
    });
    return events;
  }

  if (prevTop && nextTop && prevTop.id === nextTop.id) {
    const prevLocals = new Map(prevTop.locals);
    const nextLocals = new Map(nextTop.locals);

    // Variable creations & updates
    for (const [name, nextVal] of nextTop.locals) {
      if (!prevLocals.has(name)) {
        events.push({
          type: 'var_create',
          frame: nextTop.id,
          name,
          value: nextVal,
        });
      } else {
        const prevVal = prevLocals.get(name)!;
        if (!valuesEqual(prevVal, nextVal)) {
          events.push({
            type: 'var_update',
            frame: nextTop.id,
            name,
            from: prevVal,
            to: nextVal,
          });
        }
      }
    }

    // Variable deletions
    for (const [name] of prevTop.locals) {
      if (!nextLocals.has(name)) {
        events.push({
          type: 'var_delete',
          frame: nextTop.id,
          name,
        });
      }
    }
  }

  return events;
}

export function diffHeapObject(
  prevObj: HeapObject | undefined,
  nextObj: HeapObject | undefined
): TraceEvent[] {
  const events: TraceEvent[] = [];

  if (!prevObj && nextObj) {
    events.push({ type: 'obj_create', id: nextObj.id });
    return events;
  }
  if (prevObj && !nextObj) {
    events.push({ type: 'obj_free', id: prevObj.id });
    return events;
  }
  if (!prevObj || !nextObj) return events;

  // Check items (arrays, lists, vectors, stacks, queues)
  const prevItems = prevObj.items ?? [];
  const nextItems = nextObj.items ?? [];

  if (prevItems.length === nextItems.length) {
    // Check for 2-element swap
    const changedIndices: number[] = [];
    for (let i = 0; i < prevItems.length; i++) {
      if (!valuesEqual(prevItems[i], nextItems[i])) {
        changedIndices.push(i);
      }
    }

    if (
      changedIndices.length === 2 &&
      valuesEqual(prevItems[changedIndices[0]!], nextItems[changedIndices[1]!]) &&
      valuesEqual(prevItems[changedIndices[1]!], nextItems[changedIndices[0]!])
    ) {
      events.push({
        type: 'item_swap',
        id: nextObj.id,
        i: changedIndices[0]!,
        j: changedIndices[1]!,
      });
    } else {
      // Individual item_sets
      for (const idx of changedIndices) {
        events.push({
          type: 'item_set',
          id: nextObj.id,
          index: idx,
          from: prevItems[idx]!,
          to: nextItems[idx]!,
        });
      }
    }
  } else if (nextItems.length === prevItems.length + 1) {
    // Single insert: check whether appended at end or inserted at front
    if (
      prevItems.every((item, i) => valuesEqual(item, nextItems[i])) &&
      nextItems[nextItems.length - 1]
    ) {
      events.push({
        type: 'item_insert',
        id: nextObj.id,
        index: nextItems.length - 1,
        value: nextItems[nextItems.length - 1]!,
        op: nextObj.kind === 'cpp_stack' ? 'push' : 'append',
      });
    } else if (
      prevItems.every((item, i) => valuesEqual(item, nextItems[i + 1])) &&
      nextItems[0]
    ) {
      events.push({
        type: 'item_insert',
        id: nextObj.id,
        index: 0,
        value: nextItems[0]!,
        op: nextObj.kind === 'deque' || nextObj.kind === 'cpp_queue' ? 'enqueue' : 'push_front',
      });
    } else {
      // General insert
      for (let i = 0; i < nextItems.length; i++) {
        if (i >= prevItems.length || !valuesEqual(prevItems[i], nextItems[i])) {
          events.push({
            type: 'item_insert',
            id: nextObj.id,
            index: i,
            value: nextItems[i]!,
          });
          break;
        }
      }
    }
  } else if (nextItems.length === prevItems.length - 1) {
    // Single remove: check end (pop) vs front (pop_front / dequeue)
    if (
      nextItems.every((item, i) => valuesEqual(item, prevItems[i])) &&
      prevItems[prevItems.length - 1]
    ) {
      events.push({
        type: 'item_remove',
        id: nextObj.id,
        index: prevItems.length - 1,
        value: prevItems[prevItems.length - 1]!,
        op: 'pop',
      });
    } else if (
      nextItems.every((item, i) => valuesEqual(item, prevItems[i + 1])) &&
      prevItems[0]
    ) {
      events.push({
        type: 'item_remove',
        id: nextObj.id,
        index: 0,
        value: prevItems[0]!,
        op: 'dequeue',
      });
    } else {
      events.push({
        type: 'item_remove',
        id: nextObj.id,
        index: 0,
        value: prevItems[0]!,
      });
    }
  }

  // Check fields (struct / instance)
  const prevFields = new Map(prevObj.fields ?? []);
  const nextFields = new Map(nextObj.fields ?? []);
  for (const [field, val] of nextFields) {
    const prevVal = prevFields.get(field);
    if (!prevVal || !valuesEqual(prevVal, val)) {
      events.push({
        type: 'field_set',
        id: nextObj.id,
        field,
        from: prevVal,
        to: val,
      });
    }
  }

  return events;
}

