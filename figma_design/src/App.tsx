import { useCallback, useState } from 'react'
import Landing from './components/Landing'
import Lobby from './components/Lobby'
import Game from './components/Game'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const randomCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

type Screen = 'landing' | 'lobby' | 'game'

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [code, setCode] = useState('')
  const [host, setHost] = useState(false)
  const [names, setNames] = useState<string[]>([])
  const me = 'Nightjar'

  const start = useCallback((n: string[]) => {
    // Game expects the local player first
    setNames([me, ...n.filter((x) => x !== me)])
    setScreen('game')
  }, [])

  return (
    <>
      {screen === 'landing' && (
        <Landing
          onCreate={() => {
            setCode(randomCode())
            setHost(true)
            setScreen('lobby')
          }}
          onJoin={(c) => {
            setCode(c)
            setHost(false)
            setScreen('lobby')
          }}
        />
      )}
      {screen === 'lobby' && (
        <Lobby key={code + host} code={code} isHost={host} me={me} onStart={start} onLeave={() => setScreen('landing')} />
      )}
      {screen === 'game' && <Game names={names} onExit={() => setScreen('lobby')} />}
    </>
  )
}
