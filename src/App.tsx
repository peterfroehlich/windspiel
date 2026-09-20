import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { ChimeScene } from './scene/ChimeScene'
import { Controls } from './ui/Controls'
import { WindLines } from './ui/WindLines'
import { GithubBanner } from './ui/GithubBanner'
import { audio } from './audio/engine'
import { useStore } from './state/store'

export default function App() {
  // Browsers only allow AudioContext after a user gesture — arm it on the
  // first click/keypress so wind-driven strikes are audible afterwards.
  // On init, apply the configured volume (engine default is hardcoded).
  useEffect(() => {
    const arm = () => {
      audio.init()
      audio.setVolume(useStore.getState().config.volume)
      audio.resume()
      // wind (and its strikes) only makes sense once audio can actually play
      useStore.getState().setAudioArmed(true)
    }
    window.addEventListener('pointerdown', arm)
    window.addEventListener('keydown', arm)
    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
    }
  }, [])

  return (
    <div className="app">
      <GithubBanner />
      <WindLines layer="back" />
      <Canvas shadows gl={{ alpha: true, antialias: true }} camera={{ position: [1.4, 1.5, 2.2], fov: 45 }}>
        <ChimeScene />
      </Canvas>
      <WindLines layer="front" />
      <Controls />
    </div>
  )
}