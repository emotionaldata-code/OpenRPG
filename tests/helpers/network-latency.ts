import type { BrowserContext } from '@playwright/test';

export async function lag(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      private upstream = 0;
      private downstream = 0;
      private counter = 0;
      private delayed = new WeakSet<Event>();
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (!String(url).includes(':2567/')) {
          return;
        }
        this.addEventListener('message', (event) => {
          if (this.delayed.has(event)) {
            return;
          }
          event.stopImmediatePropagation();
          this.downstream = Math.max(performance.now() + this.delay(), this.downstream + 1);
          const replay = new MessageEvent('message', { data: event.data, origin: event.origin });
          this.delayed.add(replay);
          setTimeout(() => {
            if (this.readyState === Native.OPEN) {
              this.dispatchEvent(replay);
            }
          }, this.downstream - performance.now());
        });
      }
      private delay(): number {
        return 75 + Math.sin(++this.counter * 1.73) * 20;
      }
      override send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        if (!this.url.includes(':2567/')) {
          super.send(data);
          return;
        }
        // The SDK reuses encoder buffers, so retain the bytes at send time.
        const copy = ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
          : data instanceof ArrayBuffer
            ? data.slice(0)
            : data;
        this.upstream = Math.max(performance.now() + this.delay(), this.upstream + 1);
        setTimeout(() => {
          if (this.readyState === Native.OPEN) {
            super.send(copy);
          }
        }, this.upstream - performance.now());
      }
    };
  });
}
