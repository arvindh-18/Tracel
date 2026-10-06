import { HeapId, Value } from '../../../trace/schema';

export interface MemoryBlock {
  id: HeapId;
  region: 'stack' | 'heap' | 'static';
  elemType: string;
  elements: Value[];
  freed: boolean;
  baseAddress: number;
  version: number;
}

export class MemoryModel {
  private blocks = new Map<HeapId, MemoryBlock>();
  private nextStackAddr = 0x7ffe_c000;
  private nextHeapAddr = 0x5580_0000;
  private blockCounter = 0;

  alloc(
    region: 'stack' | 'heap' | 'static',
    elemType: string,
    count: number,
    initialValues?: Value[]
  ): MemoryBlock {
    this.blockCounter++;
    const id = `h${this.blockCounter}`;

    let baseAddress: number;
    if (region === 'stack') {
      baseAddress = this.nextStackAddr;
      this.nextStackAddr -= Math.max(8, count * 8);
    } else {
      baseAddress = this.nextHeapAddr;
      this.nextHeapAddr += Math.max(8, count * 8);
    }

    const elements: Value[] =
      initialValues ??
      Array.from({ length: count }, () => ({ k: 'uninit', t: elemType }));

    const block: MemoryBlock = {
      id,
      region,
      elemType,
      elements,
      freed: false,
      baseAddress,
      version: 0,
    };

    this.blocks.set(id, block);
    return block;
  }

  free(id: HeapId): { success: boolean; error?: string } {
    const block = this.blocks.get(id);
    if (!block) return { success: false, error: 'Invalid address for free' };
    if (block.freed) return { success: false, error: 'DoubleFree: memory block was already freed' };
    if (block.region !== 'heap') {
      return { success: false, error: 'InvalidFree: attempted to free stack or static memory' };
    }

    block.freed = true;
    block.version++;
    return { success: true };
  }

  getBlock(id: HeapId): MemoryBlock | undefined {
    return this.blocks.get(id);
  }

  readPointer(
    id: HeapId | null,
    offset: number
  ): { value?: Value; error?: string } {
    if (!id) {
      return { error: 'NullDereference: attempted to read from null pointer' };
    }
    const block = this.blocks.get(id);
    if (!block) {
      return { error: 'InvalidPointer: dereferencing non-existent memory block' };
    }
    if (block.freed) {
      return { error: 'UseAfterFree: reading from deallocated memory' };
    }
    if (offset < 0 || offset >= block.elements.length) {
      return {
        error: `OutOfBounds: index ${offset} is out of bounds for allocation of size ${block.elements.length}`,
      };
    }
    const val = block.elements[offset]!;
    if (val.k === 'uninit') {
      return { error: 'UninitializedRead: reading uninitialized variable value' };
    }
    return { value: val };
  }

  writePointer(
    id: HeapId | null,
    offset: number,
    val: Value
  ): { success: boolean; error?: string } {
    if (!id) {
      return { success: false, error: 'NullDereference: attempted to write to null pointer' };
    }
    const block = this.blocks.get(id);
    if (!block) {
      return { success: false, error: 'InvalidPointer: writing to non-existent memory block' };
    }
    if (block.freed) {
      return { success: false, error: 'UseAfterFree: writing to deallocated memory' };
    }
    if (offset < 0 || offset >= block.elements.length) {
      return {
        success: false,
        error: `OutOfBounds: index ${offset} is out of bounds for allocation of size ${block.elements.length}`,
      };
    }

    block.elements[offset] = val;
    block.version++;
    return { success: true };
  }

  formatAddress(addr: number): string {
    return '0x' + addr.toString(16).padStart(8, '0');
  }

  getAllBlocks(): Map<HeapId, MemoryBlock> {
    return this.blocks;
  }
}

