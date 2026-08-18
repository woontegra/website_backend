export class BuilderPagesError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'BuilderPagesError'
    this.status = status
  }
}

export function isBuilderPagesError(err: unknown): err is BuilderPagesError {
  return err instanceof BuilderPagesError
}
