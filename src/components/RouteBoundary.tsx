import { Component, type ReactNode } from 'react'

export default class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div className="route-error" role="alert"><p>Sayfa yüklenemedi. Bağlantını kontrol edip tekrar dene.</p><button type="button" onClick={() => window.location.reload()}>Yeniden yükle</button></div>
    return this.props.children
  }
}
