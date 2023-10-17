export class Semaphore {
  private tasks: (() => void)[] = [];

  constructor(private count: number) {}

  async acquire() {
    if (this.count > 0) {
      this.count--;
    } else {
      await new Promise<void>((res) => this.tasks.push(res));
    }
  }

  release() {
    if (this.tasks.length > 0) {
      const next = this.tasks.shift();
      if (next) {
        next();
      }
    } else {
      this.count++;
    }
  }
}
