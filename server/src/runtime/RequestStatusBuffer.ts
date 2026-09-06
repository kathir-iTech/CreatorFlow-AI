export type StatusPath = "data_api" | "yt_dlp" | "piped" | "cobalt" | "whisper" | "native_captions" | "cache";
export type StatusEndpoint = "info" | "captions" | "downloads";

export interface StatusEntry {
  timestamp: string;
  endpoint: StatusEndpoint;
  path: StatusPath;
  success: boolean;
}

class RingBuffer<T> {
  private items: T[] = [];
  constructor(private readonly capacity: number) {}
  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.shift();
  }
  list(): T[] {
    return this.items.slice().reverse();
  }
}

const buffer = new RingBuffer<StatusEntry>(20);

export function recordStatus(entry: Omit<StatusEntry, "timestamp">): void {
  buffer.push({ ...entry, timestamp: new Date().toISOString() });
}

export function listStatus(): StatusEntry[] {
  return buffer.list();
}

export function clearStatus(): void {
  // for tests
  (buffer as unknown as { items: StatusEntry[] }).items = [];
}
