export interface LoggerProps {
  readonly type: "info" | "warn" | "error" | "debug" | "trace" | "fatal"
  readonly message: string
  readonly source?: string
  /** Any value safe to pass to `console.dir` / inspection (objects, arrays, primitives, etc.). */
  readonly data?: unknown
}

export const LOG_LEVELS = {
  all: ["trace", "debug", "info", "warn", "error", "fatal"] as const,
  default: ["info", "warn", "error", "fatal"] as const,
  debug: ["debug", "info", "warn", "error", "fatal"] as const,
  minimal: ["info", "error", "fatal"] as const,
} as const

export type LogLevelOption = keyof typeof LOG_LEVELS

function assertNever(value: never): never {
  throw new Error(`Unhandled log type: ${String(value)}`)
}

function isLogLevelOption(value: string): value is LogLevelOption {
  return Object.prototype.hasOwnProperty.call(LOG_LEVELS, value)
}

function getAllowedOptionsText(): string {
  return Object.keys(LOG_LEVELS).join(", ")
}

function parseLogOption(value: string | undefined): LogLevelOption | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    throw new Error(
      `Missing value for --log/-l. Allowed options: ${getAllowedOptionsText()}`,
    )
  }

  if (!isLogLevelOption(normalized)) {
    throw new Error(
      `Invalid log option '${value}'. Allowed options: ${getAllowedOptionsText()}`,
    )
  }

  return normalized
}

function readCliLogOption(): string | undefined {
  if (typeof process === "undefined") {
    return undefined
  }
  const args = process.argv ?? []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === "--log-level" || arg === "-l" || arg === "-L") {
      if (index === args.length - 1 || args[index + 1].startsWith("-")) {
        throw new Error(
          `Missing value for --log/-l. Allowed options: ${getAllowedOptionsText()}`,
        )
      }
      return args[index + 1]
    }

    if (arg.startsWith("--log=")) {
      return arg.slice("--log=".length)
    }

    if (arg.startsWith("-l=")) {
      return arg.slice("-l=".length)
    }
  }

  return undefined
}

function readRootLogTypes(): ReadonlySet<LoggerProps["type"]> {
  const cliRaw = readCliLogOption()
  const envRaw = typeof process !== "undefined" ? process.env.LOG_LEVELS : undefined
  const option = parseLogOption(cliRaw ?? envRaw) ?? "all"
  return new Set<LoggerProps["type"]>(LOG_LEVELS[option])
}

/**
 * Console logger singleton with optional per-call source labels and
 * env/argv-driven filtering. Call {@link Log.ger} with type, message,
 * optional source, and optional data.
 */
export class Log {
  private static instance: Log | undefined
  private static readonly enabledTypes = readRootLogTypes()

  private constructor(private readonly source?: string) { }

  static getInstance(): Log {
    if (!Log.instance) {
      Log.instance = new Log()
    }
    return Log.instance
  }

  /**
   * Backward-compatible helper that returns a source-bound logger instance.
   * Prefer passing `source` directly to `logger.ger(...)` instead.
   */
  forSource(source: string): Log {
    return new Log(source)
  }

  ger({ type, message, data, source }: LoggerProps): void {
    if (!Log.enabledTypes.has(type)) {
      return
    }

    const resolvedSource = source ?? this.source
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
    const sourcePart = resolvedSource ? `[${resolvedSource}] ` : ""

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

/** Root singleton logger. */
export const logger = Log.getInstance()
