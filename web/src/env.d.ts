// Only the part of Vite's import.meta that this app reads. (vite/client is not included because the
// Magic Patterns entry file declares its own ImportMeta.glob/hot and the two declarations conflict.)
interface ImportMetaEnv {
  readonly BASE_URL: string
  readonly DEV: boolean
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
