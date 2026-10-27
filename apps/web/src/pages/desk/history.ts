// Lịch sử thao tác cho hoàn tác/làm lại: mỗi mục là một thay đổi (trước/sau) do bên gọi định nghĩa.

export class History<T> {
  private done: T[] = [];
  private undone: T[] = [];

  constructor(private readonly limit = 50) {}

  push(entry: T): void {
    this.done.push(entry);
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
  }

  /** Lấy thay đổi gần nhất để hoàn tác. */
  undo(): T | undefined {
    const entry = this.done.pop();
    if (entry !== undefined) this.undone.push(entry);
    return entry;
  }

  /** Lấy lại thay đổi vừa hoàn tác. */
  redo(): T | undefined {
    const entry = this.undone.pop();
    if (entry !== undefined) this.done.push(entry);
    return entry;
  }

  /** Bước gần nhất (để gộp các thay đổi liên tiếp như gõ chữ vào cùng một bước). */
  peek(): T | undefined {
    return this.done.at(-1);
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  clear(): void {
    this.done = [];
    this.undone = [];
  }
}
