import { useEffect } from 'react'

/** Per-page <title> and meta description (the app is a static SPA behind a hash router). */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title
    let m = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!m) {
      m = document.createElement('meta')
      m.name = 'description'
      document.head.appendChild(m)
    }
    m.content = description
  }, [title, description])
}
