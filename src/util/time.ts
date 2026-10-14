const STAMP_PATTERN = /^\d{8}T\d{6}Z$/;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Snapshot timestamp: UTC `YYYYMMDDTHHMMSSZ`, sortable and safe in object keys. */
export function formatStamp(date: Date): string {
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export function isStamp(value: string): boolean {
  return STAMP_PATTERN.test(value);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}
