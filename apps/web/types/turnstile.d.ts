interface Window {
  turnstile?: {
    render: (element: HTMLElement, options: {
      sitekey: string
      callback: (token: string) => void
      theme?: 'light' | 'dark' | 'auto'
    }) => string
    reset: (widgetId: string) => void
  }
}
