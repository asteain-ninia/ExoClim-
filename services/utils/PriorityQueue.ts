
export class PriorityQueue<T> {
  private heap: { priority: number; item: T }[] = [];

  push(item: T, priority: number) {
    this.heap.push({ priority, item });
    this.bubbleUp();
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0 && bottom) {
      this.heap[0] = bottom;
      this.sinkDown();
    }
    return top.item;
  }

  private bubbleUp() {
    let index = this.heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].priority <= this.heap[index].priority) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  private sinkDown() {
    let index = 0;
    const length = this.heap.length;
    while (true) {
      let left = 2 * index + 1;
      let right = 2 * index + 2;
      let swap = null;

      if (left < length) {
        if (this.heap[left].priority < this.heap[index].priority) {
          swap = left;
        }
      }
      if (right < length) {
        if (
          (swap === null && this.heap[right].priority < this.heap[index].priority) ||
          (swap !== null && this.heap[right].priority < this.heap[left].priority)
        ) {
          swap = right;
        }
      }

      if (swap === null) break;
      [this.heap[index], this.heap[swap]] = [this.heap[swap], this.heap[index]];
      index = swap;
    }
  }

  get length() { return this.heap.length; }
}
