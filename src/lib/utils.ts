import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface LoggerProps {
  readonly type: "info" | "warn" | "error" | "debug" | "trace" | "fatal"
  readonly message: string
  /** Any value safe to pass to `console.dir` / inspection (objects, arrays, primitives, etc.). */
  readonly data?: unknown
}

function assertNever(value: never): never {
  throw new Error(`Unhandled log type: ${String(value)}`)
}

/**
 * Console logger: use {@link logger} for the root singleton, then
 * {@link Log.forSource} once per module to bind a file/source label. Call
 * {@link Log.ger} with type, message, and optional data.
 */
export class Log {
  private static instance: Log | undefined

  private constructor(private readonly source?: string) { }

  static getInstance(): Log {
    if (!Log.instance) {
      Log.instance = new Log()
    }
    return Log.instance
  }

  /**
   * Returns a logger that prefixes every line with `source` (call once per file,
   * e.g. `logger.forSource(import.meta.url)` or a short path like `"electron/main/index.ts"`).
   */
  forSource(source: string): Log {
    return new Log(source)
  }

  ger({ type, message, data }: LoggerProps): void {
    let colorStart = ""
    const colorEnd = "\x1b[0m"
    const post = colorEnd

    switch (type) {
      case "error":
      case "fatal":
        colorStart = "\x1b[41m"
        break
      case "info":
        colorStart = "\x1b[46m"
        break
      case "debug":
        colorStart = "\x1b[51m"
        break
      case "warn":
        colorStart = "\x1b[43m"
        break
      case "trace":
        colorStart = "\x1b[45m"
        break
      default:
        assertNever(type)
    }

    const timeStamp = `\x1b[1m${new Date().toISOString()}\x1b[0m`
    const sourcePart = this.source ? `[${this.source}] ` : ""

    if (data !== undefined && data !== null) {
      console.dir(data, { depth: null, colors: true })
    }

    const formattedLine = `[${timeStamp}]  \t ${sourcePart}${message} \t`
    const formattedMsg = `${colorStart}${formattedLine}${post}`

    switch (type) {
      case "error":
      case "fatal":
        console.error(formattedMsg)
        break
      case "info":
        console.info(formattedMsg)
        break
      case "debug":
        console.debug(formattedMsg)
        break
      case "warn":
        console.warn(formattedMsg)
        break
      case "trace":
        console.trace(formattedMsg)
        break
      default:
        assertNever(type)
    }
  }
}

/** Root singleton — use {@link Log.forSource} for per-file prefixes. */
export const logger = Log.getInstance()
